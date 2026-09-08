import { NextRequest, NextResponse } from 'next/server'
import { requireRoles, requireModuleView } from '@/lib/auth/guard'
import { resolveOnBehalf, FINANCE_ON_BEHALF_ROLES } from '@/lib/auth/on-behalf'
import {
  getFinanceRequests, countOpenFinanceRequests, createFinanceRequest, notifyFinanceRolesOfRequest,
} from '@/lib/supabase/queries/finance-requests'
import type { FinanceRequestStatus, FinanceRequestType } from '@/types/finance'

const TYPES = new Set(['scholarship', 'refund'])
const STATUSES = new Set(['open', 'in_review', 'resolved', 'rejected'])

// GET: el propio perfil se consulta sin permiso extra (?member_id=propio, p.ej.
// "Mis becas"); cualquier otra consulta exige módulo finanzas o becas (según
// pantalla: /finanzas/solicitudes ve todo, /finanzas/becas solo scholarship).
export async function GET(req: NextRequest) {
  try {
    const auth = await requireRoles() // solo exige sesión
    if (auth.res) return auth.res
    const { searchParams } = req.nextUrl
    const memberIdParam = searchParams.get('member_id')
    const isOwnProfile = !!memberIdParam && memberIdParam === auth.ctx.memberId
    if (!isOwnProfile) {
      const finanzas = await requireModuleView('finanzas')
      if (finanzas.res) {
        const becas = await requireModuleView('becas')
        if (becas.res) return becas.res
      }
    }
    if (searchParams.get('count') === 'open') {
      return NextResponse.json({ count: await countOpenFinanceRequests() })
    }
    const status = searchParams.get('status') ?? undefined
    const type = searchParams.get('type') ?? undefined
    return NextResponse.json(await getFinanceRequests({
      status: status && STATUSES.has(status) ? (status as FinanceRequestStatus) : undefined,
      type: type && TYPES.has(type) ? (type as FinanceRequestType) : undefined,
      member_id: searchParams.get('member_id') ?? undefined,
    }))
  } catch (error) {
    console.error('GET /api/finance/requests:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// POST: crea una solicitud. Cualquier autenticado, pero solo finanzas/dirección
// (y admin) pueden crearla a nombre de OTRO miembro; el resto queda forzado a
// su propio perfil (anti-suplantación, auditoría S2).
export async function POST(req: NextRequest) {
  try {
    const auth = await requireRoles()
    if (auth.res) return auth.res
    const body = await req.json()
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
    // FRM-4: quién la digitó, si no fue la propia persona.
    const { memberId, recordedBy, denegado } = resolveOnBehalf(auth.ctx, body?.member_id, FINANCE_ON_BEHALF_ROLES)
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
    if (reason.length < 20) {
      return NextResponse.json({ error: 'La razón debe tener al menos 20 caracteres' }, { status: 400 })
    }
    if (body.request_type === 'refund' && !body.payment_id) {
      return NextResponse.json({ error: 'Se requiere el pago a devolver' }, { status: 400 })
    }
    if (body.request_type === 'scholarship') {
      const entityType = body.entity_type
      if (entityType !== 'study_plan' && entityType !== 'event') {
        return NextResponse.json({ error: 'Se requiere indicar si es para un estudio o un evento' }, { status: 400 })
      }
      if (entityType === 'study_plan' && !body.plan_id) {
        return NextResponse.json({ error: 'Se requiere el estudio' }, { status: 400 })
      }
      if (entityType === 'event' && !body.event_id) {
        return NextResponse.json({ error: 'Se requiere el evento' }, { status: 400 })
      }
    }

    const request = await createFinanceRequest({
      recorded_by: recordedBy,
      member_id: memberId,
      request_type: body.request_type,
      study_group_id: body.study_group_id ?? null,
      payment_id: body.payment_id ?? null,
      amount: typeof body.amount === 'number' && body.amount > 0 ? body.amount : null,
      reason,
      entity_type: body.request_type === 'scholarship' ? body.entity_type : null,
      plan_id: body.plan_id ?? null,
      event_id: body.event_id ?? null,
    })

    try { await notifyFinanceRolesOfRequest(request) } catch (e) {
      console.warn('POST /api/finance/requests: notificaciones fallaron:', e)
    }

    return NextResponse.json(request, { status: 201 })
  } catch (error) {
    console.error('POST /api/finance/requests:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
