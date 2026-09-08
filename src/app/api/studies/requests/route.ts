import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/auth/guard'
import { resolveOnBehalf } from '@/lib/auth/on-behalf'
import {
  getStudyRequests, countOpenStudyRequests, createStudyRequest, notifyRecipientsOfRequest, hasOpenStudyInterest,
  isStudyCommitteeMember,
} from '@/lib/supabase/queries/study-requests'
import { requestQueueScope } from '@/lib/studies/request-assignment'
import { isRelocationCode, textoFalta } from '@/lib/studies/relocation'
import type { StudyRequestStatus, StudyRequestType } from '@/types/study'

const TYPES = new Set(['relocation', 'study_interest'])
const STATUSES = new Set(['open', 'in_review', 'resolved', 'rejected'])
const CLASS_OPTIONS = new Set([...Array.from({ length: 12 }, (_, i) => String(i + 1)), 'no_recuerda'])

// GET: la cola. Coordinadores/dirección/admin ven TODO; el comité de estudios
// bíblicos ve SOLO lo que le asignaron (decisión 2026-07-31). ?count=open
// devuelve el conteo del alcance de quien pregunta.
export async function GET(req: NextRequest) {
  try {
    const auth = await requireRoles()
    if (auth.res) return auth.res

    const scope = requestQueueScope({
      roles: auth.ctx.roles,
      inStudyCommittee: await isStudyCommitteeMember(auth.ctx.memberId),
    })
    if (scope === 'none') {
      return NextResponse.json({ error: 'No tenés acceso a las solicitudes de estudios' }, { status: 403 })
    }
    // Alcance acotado: todo lo que se lea va filtrado por el asignado.
    const assignedTo = scope === 'assigned' ? (auth.ctx.memberId ?? '') : undefined

    const { searchParams } = req.nextUrl
    const count = searchParams.get('count')
    if (count === 'open') {
      return NextResponse.json({
        count: scope === 'all'
          ? await countOpenStudyRequests()
          : (await getStudyRequests({ assigned_to: assignedTo })).filter(r => r.status !== 'resolved' && r.status !== 'rejected').length,
      })
    }
    // REU-2: conteo SOLO de reubicaciones pendientes. El conteo 'open' mezcla
    // reubicaciones con intereses, y los intereses son informativos (EST-6): un
    // badge que los junta no dice cuánta gente está esperando un cambio de grupo.
    if (count === 'relocation') {
      const abiertas = (await getStudyRequests({ type: 'relocation', assigned_to: assignedTo }))
        .filter(r => r.status !== 'resolved' && r.status !== 'rejected')
      return NextResponse.json({ count: abiertas.length })
    }
    const status = searchParams.get('status') ?? undefined
    const type = searchParams.get('type') ?? undefined
    const member_id = searchParams.get('member_id') ?? undefined
    const result = await getStudyRequests({
      status: status && STATUSES.has(status) ? (status as StudyRequestStatus) : undefined,
      type: type && TYPES.has(type) ? (type as StudyRequestType) : undefined,
      member_id,
      assigned_to: assignedTo,
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('GET /api/studies/requests:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// POST: crea una solicitud. Cualquier autenticado (incluso rol miembro), pero
// solo coordinadores (y admin) pueden crearla a nombre de OTRO miembro; el
// resto queda forzado a su propio perfil (anti-suplantación, auditoría S2).
export async function POST(req: NextRequest) {
  try {
    const auth = await requireRoles()
    if (auth.res) return auth.res

    const body = await req.json()
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
    // FRM-4: además de a nombre de quién, se guarda QUIÉN la digitó. Esto ya
    // se podía hacer desde la pantalla de solicitudes y no dejaba rastro.
    const { memberId, recordedBy, denegado } = resolveOnBehalf(auth.ctx, body?.member_id, ['coordinador_estudios', 'coordinador_dirigentes'])
    if (denegado) {
      return NextResponse.json(
        { error: 'No tenés permiso para registrar a otra persona.', code: 'sin_permiso_por_otro' },
        { status: 403 },
      )
    }

    if (typeof body?.member_id === 'string' && body.member_id && body.member_id !== memberId) {
      return NextResponse.json(
        { error: 'No podés crear solicitudes a nombre de otro miembro' },
        { status: 403 },
      )
    }
    if (!memberId || !TYPES.has(body?.request_type)) {
      return NextResponse.json({ error: 'Se requiere member_id y request_type válido' }, { status: 400 })
    }

    // Interés de estudio v2: máximo 1 solicitud abierta por miembro + campos
    // estructurados (día(s) hasta 2, horario) y elegibilidad capturada. La razón
    // ya no se pide para este tipo.
    const DAYS = new Set(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'])
    const TIMES = new Set(['mañana', 'tarde', 'noche'])
    let proposedDays: string[] = []
    let proposedTime: string | null = null
    let proposedZones: string[] = []
    let wasEligible: boolean | null = null
    let eligibilityNote: string | null = null
    if (body.request_type === 'study_interest') {
      if (await hasOpenStudyInterest(memberId)) {
        return NextResponse.json({ error: 'Ya tenés una solicitud de estudio abierta. Podés tener una a la vez.', code: 'solicitud_abierta' }, { status: 409 })
      }
      if (!body?.plan_id) {
        return NextResponse.json({ error: 'Seleccioná el estudio de interés.' }, { status: 400 })
      }
      proposedDays = Array.isArray(body?.proposed_days) ? body.proposed_days.filter((d: unknown) => typeof d === 'string' && DAYS.has(d)).slice(0, 2) : []
      proposedTime = TIMES.has(body?.proposed_time) ? body.proposed_time : null
      wasEligible = typeof body?.was_eligible === 'boolean' ? body.was_eligible : null
      eligibilityNote = typeof body?.eligibility_note === 'string' ? (body.eligibility_note.trim().slice(0, 500) || null) : null
    }

    // Campos propios de reubicación: obligatorios solo para ese tipo.
    let neededStudyCode: string | null = null
    let lastClassAttended: string | null = null
    let lastLeaderName: string | null = null
    let wantsFolleto = false
    if (body.request_type === 'relocation') {
      // REU-1: días y zonas con selección múltiple (horario single, consistente
      // con el form de interés). Zonas = nombres de sede o "Cualquiera",
      // saneadas y topeadas server-side.
      proposedDays = Array.isArray(body?.proposed_days)
        ? ([...new Set(body.proposed_days.filter((d: unknown) => typeof d === 'string' && DAYS.has(d)))] as string[])
        : []
      proposedTime = TIMES.has(body?.proposed_time) ? body.proposed_time : null
      proposedZones = Array.isArray(body?.proposed_zones)
        ? ([...new Set(body.proposed_zones
            .filter((z: unknown) => typeof z === 'string')
            .map((z: string) => z.trim().slice(0, 60))
            .filter(Boolean))] as string[]).slice(0, 10)
        : []
      if (reason.length < 20) {
        return NextResponse.json({ error: 'La razón debe tener al menos 20 caracteres' }, { status: 400 })
      }
      if (!isRelocationCode(body?.needed_study_code)) {
        return NextResponse.json({ error: 'Seleccioná el estudio que necesitás (N2, N3, N4, Discípulos 2 o Discípulos 3)' }, { status: 400 })
      }
      /**
       * Los COMPROMISOS de la etapa se validan acá, no solo en la pantalla
       * (pedido 2026-08-27: "que la de Disc. solo le permita a la gente con los
       * compromisos"). En la práctica solo restringe la cadena Discípulos:
       * N2/N3/N4 son etapa "niveles" y no piden nada.
       *
       * Tiene que estar en el servidor: el <option> deshabilitado del dropdown
       * es una cortesía, no un control — un POST directo se lo salta.
       */
      const { getEligibleStudiesForMember } = await import('@/lib/supabase/queries/studies-eligibility')
      const elig = await getEligibleStudiesForMember(memberId)
      const opcion = elig.relocation_options.find(o => o.code === body.needed_study_code)
      if (opcion && !opcion.is_eligible) {
        return NextResponse.json({
          error: textoFalta(opcion.name, opcion.missing),
          code: 'compromisos_incompletos',
          missing: opcion.missing,
        }, { status: 422 })
      }
      if (!CLASS_OPTIONS.has(body?.last_class_attended)) {
        return NextResponse.json({ error: 'Seleccioná en cuál clase quedaste' }, { status: 400 })
      }
      lastLeaderName = typeof body?.last_leader_name === 'string' ? body.last_leader_name.trim() : ''
      if (!lastLeaderName) {
        return NextResponse.json({ error: 'Indicá tu último dirigente' }, { status: 400 })
      }
      neededStudyCode = body.needed_study_code
      lastClassAttended = body.last_class_attended
      wantsFolleto = body?.wants_folleto === true
    }

    const request = await createStudyRequest({
      recorded_by: recordedBy,
      member_id: memberId,
      request_type: body.request_type,
      plan_id: body.plan_id ?? null,
      existing_group_id: body.existing_group_id ?? null,
      current_group_id: body.current_group_id ?? null,
      proposed_location: body.proposed_location?.trim() || null,
      proposed_schedule: body.proposed_schedule?.trim() || null,
      reason: body.request_type === 'relocation' ? reason : null,
      needed_study_code: neededStudyCode,
      last_class_attended: lastClassAttended,
      last_leader_name: lastLeaderName,
      wants_folleto: wantsFolleto,
      proposed_days: proposedDays,
      proposed_time: proposedTime,
      proposed_zones: proposedZones,
      was_eligible: wasEligible,
      eligibility_note: eligibilityNote,
    })

    // Notificaciones internas a los coordinadores configurados (best-effort:
    // si falla no bloquea la creación de la solicitud).
    try { await notifyRecipientsOfRequest(request) } catch (e) {
      console.warn('POST /api/studies/requests: notificaciones fallaron:', e)
    }

    return NextResponse.json(request, { status: 201 })
  } catch (error) {
    console.error('POST /api/studies/requests:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
