import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/auth/guard'
import {
  updateStudyRequestStatus, assignStudyRequest, resolveStudyRequest, isStudyCommitteeMember,
} from '@/lib/supabase/queries/study-requests'
import { requestQueueScope, canAssignRequests, canWorkRequest } from '@/lib/studies/request-assignment'
import { motivoQueImpide, ESTADOS_MOVIBLES } from '@/lib/studies/request-status-change'
import { createAdminClient } from '@/lib/supabase/admin'
import type { StudyRequestStatus } from '@/types/study'

const ACTIONS: Record<string, 'in_review' | 'rejected'> = {
  take: 'in_review',
  reject: 'rejected',
}

// PATCH: { action: 'take' | 'assign' | 'resolve' | 'reject', review_notes?, ... }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireRoles()
    if (auth.res) return auth.res
    if (!auth.ctx.memberId) {
      return NextResponse.json({ error: 'Tu usuario no está vinculado a un perfil de miembro' }, { status: 409 })
    }

    const scope = requestQueueScope({
      roles: auth.ctx.roles,
      inStudyCommittee: await isStudyCommitteeMember(auth.ctx.memberId),
    })
    if (scope === 'none') {
      return NextResponse.json({ error: 'No tenés acceso a las solicitudes de estudios' }, { status: 403 })
    }

    const { id } = await params
    const body = await req.json()

    // EST-6 (decisión confirmada): las solicitudes de INTERÉS son datos de
    // demanda de solo lectura — sin tomar/asignar/resolver/rechazar. Solo las
    // de reubicación mantienen el flujo de gestión.
    {
      const supabase = (await import('@/lib/supabase/admin')).createAdminClient()
      const { data: reqRow } = await supabase
        .from('study_requests').select('request_type').eq('id', id).maybeSingle()
      if ((reqRow as { request_type?: string } | null)?.request_type === 'study_interest') {
        return NextResponse.json(
          { error: 'Las solicitudes de interés son informativas (datos de demanda) y no se gestionan.', code: 'solo_lectura' },
          { status: 400 },
        )
      }
    }

    // El del comité solo puede trabajar LA SUYA (la que le asignaron); el
    // coordinador, cualquiera. Se chequea con el estado actual de la solicitud.
    if (scope !== 'all') {
      const supabase = (await import('@/lib/supabase/admin')).createAdminClient()
      const { data: own } = await supabase
        .from('study_requests').select('reviewed_by').eq('id', id).maybeSingle()
      if (!canWorkRequest(scope, (own ?? {}) as { reviewed_by?: string | null }, auth.ctx.memberId)) {
        return NextResponse.json(
          { error: 'Solo podés trabajar las solicitudes que te asignaron' }, { status: 403 },
        )
      }
    }

    // assign y take son de los coordinadores: el comité recibe trabajo, no lo reparte.
    if ((body?.action === 'assign' || body?.action === 'take') && !canAssignRequests(auth.ctx.roles)) {
      return NextResponse.json(
        { error: 'Solo un coordinador de estudios o de dirigentes puede asignar o tomar solicitudes' },
        { status: 403 },
      )
    }

    // assign: pasa a in_review con reviewed_by = el ASIGNADO.
    if (body?.action === 'assign') {
      if (typeof body?.assignee_member_id !== 'string' || !body.assignee_member_id) {
        return NextResponse.json({ error: 'Se requiere assignee_member_id' }, { status: 400 })
      }
      const updated = await assignStudyRequest(id, body.assignee_member_id, auth.ctx.memberId)
      return NextResponse.json(updated)
    }

    // resolve: en 'relocation' es una acción real (matricula en target_group_id,
    // con folleto+pago pendiente si aplica); en 'study_interest' sigue siendo
    // solo un cambio de estado.
    if (body?.action === 'resolve') {
      try {
        const updated = await resolveStudyRequest(id, auth.ctx.memberId, {
          target_group_id: typeof body?.target_group_id === 'string' ? body.target_group_id : null,
          review_notes: typeof body?.review_notes === 'string' ? body.review_notes.trim() || null : null,
        })
        return NextResponse.json(updated)
      } catch (error) {
        if (error instanceof Error && error.message === 'GRUPO_REQUERIDO') {
          return NextResponse.json({ error: 'Elegí el grupo destino para reubicar a la persona.' }, { status: 400 })
        }
        if (error instanceof Error && error.message === 'NOT_FOUND') {
          return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
        }
        if (error instanceof Error && error.message === 'YA_RESUELTA') {
          return NextResponse.json({ error: 'Esta solicitud ya fue resuelta o rechazada.' }, { status: 409 })
        }
        if (error instanceof Error && error.message === 'YA_COMPLETADO') {
          return NextResponse.json({ error: 'El miembro ya completó este estudio en ese grupo.' }, { status: 409 })
        }
        if (error instanceof Error && error.message === 'PAGO_PENDIENTE') {
          return NextResponse.json({ error: 'El miembro ya tiene una matrícula pendiente de pago para este estudio.' }, { status: 409 })
        }
        if (error instanceof Error && error.message === 'YA_MATRICULADO') {
          return NextResponse.json({ error: 'El miembro ya está matriculado en ese grupo.' }, { status: 409 })
        }
        // Guards de enrollMember (la resolución matricula de verdad): antes
        // caían al catch final como "Error interno" (2026-08-20).
        if (error instanceof Error && error.message.startsWith('PAGO_ESTUDIOS_PENDIENTE')) {
          return NextResponse.json({ error: 'El miembro tiene pagos de estudios pendientes; hay que resolverlos antes de matricularlo.' }, { status: 409 })
        }
        if (error instanceof Error && error.message.startsWith('CUPO_LLENO')) {
          return NextResponse.json({ error: 'El grupo destino ya está lleno.' }, { status: 409 })
        }
        if (error instanceof Error && error.message.startsWith('RESTRICCION_GRUPO')) {
          return NextResponse.json({ error: error.message.split(':').slice(1).join(':') || 'El miembro no cumple la restricción de audiencia del grupo destino.' }, { status: 409 })
        }
        throw error
      }
    }

    // Cambio de estado A MANO. Solo coordinación (decisión 2026-09-08): el
    // comité trabaja lo suyo con las acciones de arriba. Existe porque una
    // solicitud de interés nacía 'open' y no había cómo cerrarla ni reabrirla.
    if (body?.action === 'set_status') {
      if (!canAssignRequests(auth.ctx.roles)) {
        return NextResponse.json(
          { error: 'Solo la coordinación puede cambiar el estado a mano.' }, { status: 403 },
        )
      }
      const { data: actual } = await createAdminClient()
        .from('study_requests').select('status, request_type').eq('id', id).maybeSingle()
      const fila = actual as { status: string; request_type: string } | null
      if (!fila) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })

      const motivo = motivoQueImpide({
        requestType: fila.request_type, from: fila.status, to: String(body?.status ?? ''),
      })
      if (motivo) return NextResponse.json({ error: motivo, code: 'transicion_invalida' }, { status: 409 })

      const updated = await updateStudyRequestStatus(
        id, body.status as StudyRequestStatus, auth.ctx.memberId,
        typeof body?.review_notes === 'string' ? body.review_notes.trim() || null : null,
        ESTADOS_MOVIBLES,
      )
      return NextResponse.json(updated)
    }

    const status = ACTIONS[body?.action as string]
    if (!status) {
      return NextResponse.json({ error: 'action debe ser take, assign, resolve, reject o set_status' }, { status: 400 })
    }

    const updated = await updateStudyRequestStatus(
      id, status, auth.ctx.memberId,
      typeof body?.review_notes === 'string' ? body.review_notes.trim() || null : null,
    )
    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof Error && error.message === 'YA_RESUELTA') {
      return NextResponse.json({ error: 'Esta solicitud ya fue resuelta o rechazada; refrescá la página.' }, { status: 409 })
    }
    console.error('PATCH /api/studies/requests/[id]:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
