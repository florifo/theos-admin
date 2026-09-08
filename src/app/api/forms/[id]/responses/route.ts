import { NextRequest, NextResponse } from 'next/server'
import { esCampoCalculado, textoEstudiosAprobados } from '@/lib/forms/computed-fields'
import { requireRoles, getAuthContext } from '@/lib/auth/guard'
import { rateLimit } from '@/lib/rate-limit'
import {
  getFormResponses, submitResponse, hasMemberResponded, hasFormAccessGrant, estudiosAprobadosDe,
} from '@/lib/supabase/queries/forms'
import { formViewerScope, hasFormsModule } from '@/lib/auth/forms-scope'
import { resolveOnBehalf, FORM_ON_BEHALF_ROLES } from '@/lib/auth/on-behalf'
import type { RoleId } from '@/types/auth'
import { memberFormFillAccess } from '@/lib/supabase/queries/form-fill-access'
import { isManagerOfFormEvent } from '@/lib/supabase/queries/events'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    // ?mine=1 → SOLO un booleano: ¿esta sesión ya respondió? Lo usa el llenado
    // para el dedupe (una respuesta por persona), así que lo puede consultar
    // cualquier sesión — no expone ninguna respuesta.
    if (req.nextUrl.searchParams.get('mine') === '1') {
      const self = await requireRoles()
      if (self.res) return self.res
      if (!self.ctx.memberId) return NextResponse.json({ answered: false })
      return NextResponse.json({ answered: await hasMemberResponded(id, self.ctx.memberId) })
    }
    // Las respuestas las lee el módulo formularios o quien tenga un acceso
    // puntual a ESTE formulario (form_access_grants). Regla pura: formViewerScope.
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const scope = formViewerScope({
      roles: ctx.roles,
      memberId: ctx.memberId,
      form: { id },
      hasGrant: await hasFormAccessGrant(id, ctx.memberId),
      // FRM-1 B: si el formulario cuelga de un evento, su encargado lo ve.
      isEventManager: await isManagerOfFormEvent(id, ctx.memberId),
    })
    if (scope === 'none') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    return NextResponse.json(await getFormResponses(id))
  } catch (error) {
    console.error('GET /api/forms/[id]/responses:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// POST: registra una respuesta. Body: { member_id?, guest_name?, guest_email?, answers }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Cualquier usuario con sesión puede responder un formulario; los de rol
    // siguen pudiendo hacerlo. Si algún día hay formularios públicos (invitados
    // sin sesión), este guard hay que repensarlo con rate limiting.
    const auth = await requireRoles()
    if (auth.res) return auth.res
    if (!rateLimit(`form-response:${auth.ctx.userId}`, 5, 60_000)) {
      return NextResponse.json({ error: 'Demasiados envíos seguidos; esperá un minuto.' }, { status: 429 })
    }
    const { id } = await params
    const body = await req.json()

    // Anti-suplantación (auditoría S2): solo los roles habilitados registran
    // respuestas a nombre de OTRO miembro; el resto queda en su propio perfil (o
    // invitado si su sesión no tiene miembro vinculado). El constraint
    // response_member_or_guest exige member_id O guest_email.
    //
    // FRM-4: además del gate por rol, entra el acceso PUNTUAL a este formulario
    // (form_access_grants) — se resuelve por formulario y no por rol, así que no
    // puede vivir en FORM_ON_BEHALF_ROLES. Y se guarda `recordedBy`: quién lo
    // digitó, para que nadie confunda esto con una respuesta directa.
    const conGrant = await hasFormAccessGrant(id, auth.ctx.memberId)
    const rolesPorOtro = conGrant
      ? [...FORM_ON_BEHALF_ROLES, ...(auth.ctx.roles as RoleId[])]  // el grant habilita a esta sesión
      : FORM_ON_BEHALF_ROLES
    const { memberId, recordedBy, denegado } = resolveOnBehalf(auth.ctx, body?.member_id, rolesPorOtro)
    if (denegado) {
      return NextResponse.json(
        { error: 'No tenés permiso para registrar a otra persona.', code: 'sin_permiso_por_otro' },
        { status: 403 },
      )
    }

    if (typeof body?.member_id === 'string' && body.member_id && body.member_id !== memberId) {
      return NextResponse.json(
        { error: 'No podés registrar respuestas a nombre de otro miembro' },
        { status: 403 },
      )
    }
    const guestEmail = typeof body?.guest_email === 'string' ? body.guest_email.trim() : ''
    if (!memberId && !EMAIL_RE.test(guestEmail)) {
      return NextResponse.json(
        { error: 'Se requiere un correo electrónico para enviar el formulario' },
        { status: 400 },
      )
    }

    // Ventana de vigencia: fuera de ella (o inactivo) NO se aceptan respuestas
    // — así el cierre por fecha es automático, sin cron (estado derivado).
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { formWindowStatus, FORM_WINDOW_BLOCKED } = await import('@/lib/forms/active-window')
    const { data: fw } = await createAdminClient()
      .from('forms').select('is_active, starts_at, ends_at').eq('id', id).maybeSingle()
    if (!fw) return NextResponse.json({ error: 'Formulario no encontrado' }, { status: 404 })
    const ventana = formWindowStatus(fw as { is_active: boolean; starts_at: string | null; ends_at: string | null })
    if (ventana !== 'activo') {
      return NextResponse.json({ error: FORM_WINDOW_BLOCKED[ventana], code: 'formulario_cerrado' }, { status: 403 })
    }

    // Solo puede enviar quien fue convocado (decisión 2026-08-06). Antes
    // alcanzaba con tener sesión y el link: alguien no recomendado podía
    // preinscribirse a CDEB igual. La regla vive en @/lib/forms/fill-access.
    const acceso = await memberFormFillAccess({
      formId: id,
      memberId,
      isStaff: hasFormsModule(auth.ctx.roles) || await hasFormAccessGrant(id, auth.ctx.memberId),
    })
    if (!acceso.allowed) {
      return NextResponse.json({ error: acceso.reason, code: 'formulario_no_asignado' }, { status: 403 })
    }

    /**
     * CAMPOS CALCULADOS: los llena el servidor, no el navegador.
     *
     * Hoy es uno solo, "estudios aprobados", que existe para el comité que
     * revisa las respuestas y no se le muestra a quien contesta. Se resuelve
     * acá y no en el cliente por la razón obvia: mandarlo desde el navegador
     * sería dejar que quien responde decida qué estudios dice tener.
     *
     * Best-effort: si la consulta falla, la respuesta se guarda igual sin ese
     * dato. Perder una columna del export no puede costar el formulario entero.
     */
    const answers = { ...(body?.answers ?? {}) } as Record<string, unknown>
    try {
      const { data: campos } = await createAdminClient()
        .from('form_fields').select('id, field_type').eq('form_id', id)
      const calculados = ((campos ?? []) as Array<{ id: string; field_type: string }>)
        .filter(f => esCampoCalculado(f.field_type))
      if (calculados.length > 0 && memberId) {
        const estudios = await estudiosAprobadosDe(memberId)
        const texto = textoEstudiosAprobados(estudios)
        for (const c of calculados) answers[c.id] = texto
      }
    } catch (e) {
      console.warn('no se pudieron calcular los campos del formulario:', e)
    }

    /**
     * UNA RESPUESTA POR PERSONA, salvo que el formulario diga lo contrario.
     *
     * `hasMemberResponded` ya existía pero solo se usaba en el GET ?mine=1,
     * o sea para que la pantalla mostrara "ya respondiste". El POST no lo
     * miraba, así que un doble clic guardaba dos veces: el botón tampoco se
     * deshabilitaba mientras enviaba.
     *
     * Medido el 2026-09-03: 7 de 61 respuestas eran duplicados, TODOS con 0 o
     * 1 segundo de diferencia. No era gente respondiendo dos veces — era el
     * mismo envío contado doble.
     *
     * La validación va en el servidor y no solo en el cliente porque el
     * cliente se puede saltar; el que decide es este.
     */
    if (memberId) {
      const { data: form } = await createAdminClient()
        .from('forms').select('allow_multiple_responses').eq('id', id).maybeSingle()
      const permiteVarias = (form as { allow_multiple_responses: boolean } | null)?.allow_multiple_responses === true
      if (!permiteVarias && await hasMemberResponded(id, memberId)) {
        return NextResponse.json(
          { error: 'Ya enviaste una respuesta a este formulario.', code: 'ya_respondido' },
          { status: 409 },
        )
      }
    }

    const res = await submitResponse(id, {
      ...body, answers, member_id: memberId, recorded_by: recordedBy,
      guest_email: memberId ? body.guest_email ?? null : guestEmail,
    })
    return NextResponse.json(res, { status: 201 })
  } catch (error) {
    console.error('POST /api/forms/[id]/responses:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
