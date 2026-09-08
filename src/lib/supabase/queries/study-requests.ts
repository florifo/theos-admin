/**
 * Solicitudes de estudios + destinatarios de notificaciones + notificaciones
 * internas. SQL en supabase/migrations/041_study_requests.sql y el historial
 * de estados en 047_request_status_history.sql (correr con
 * `npx supabase db push` o en el SQL Editor):
 *
 *   CREATE TABLE study_request_status_history (
 *     id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *     request_id  UUID NOT NULL REFERENCES study_requests(id) ON DELETE CASCADE,
 *     from_status TEXT,
 *     to_status   TEXT NOT NULL,
 *     changed_by  UUID REFERENCES members(id) ON DELETE SET NULL,
 *     notes       TEXT,
 *     created_at  TIMESTAMPTZ DEFAULT NOW()
 *   );
 *
 * Como el resto de queries, corre server-side con service role; la
 * autorización vive en requireRoles() de cada ruta API.
 */
import { requestZones } from '@/lib/studies/request-prefs'
import { reubicacionSinCobro } from '@/lib/studies/reubicacion-cobro'
import { isStudyCommitteeArea } from '@/lib/studies/request-assignment'
import {
  STUDY_REQUEST_NOTIFY_ROLES, selectStudyRequestRecipients,
} from '@/lib/studies/request-notifications'
import { requestDeepLink } from '@/lib/studies/request-deeplink'
import { toCurrency } from '@/lib/money'
import { createAdminClient, type Updatable } from '@/lib/supabase/admin'
import type {
  StudyRequest, StudyRequestWriteInput, StudyRequestStatus, StudyRequestType,
} from '@/types/study'
import type { InternalNotification, InternalNotificationType } from '@/types/notification'

// ── Solicitudes ──────────────────────────────────────────────────────────────

const REQUEST_SELECT = `
  id, member_id, request_type, plan_id, existing_group_id, current_group_id,
  proposed_location, proposed_schedule, reason, status,
  reviewed_by, reviewed_at, review_notes, created_at, updated_at,
  needed_study_code, last_class_attended, last_leader_name, wants_folleto,
  proposed_days, proposed_time, proposed_zones, was_eligible, eligibility_note,
  resolved_group_id, resulting_enrollment_id, resulting_folleto_request_id,
  member:members!study_requests_member_id_fkey(first_name, last_name),
  reviewer:members!study_requests_reviewed_by_fkey(first_name, last_name),
  plan:study_plans(name),
  existing_group:study_groups!study_requests_existing_group_id_fkey(name),
  current_group:study_groups!study_requests_current_group_id_fkey(name),
  resolved_group:study_groups!study_requests_resolved_group_id_fkey(name),
  history:study_request_status_history(from_status, to_status, notes, created_at, actor:members(first_name, last_name))
`

type DbRequestRow = {
  id: string
  member_id: string
  request_type: StudyRequestType
  plan_id: string | null
  existing_group_id: string | null
  current_group_id: string | null
  proposed_location: string | null
  proposed_schedule: string | null
  reason: string | null
  status: StudyRequestStatus
  reviewed_by: string | null
  reviewed_at: string | null
  review_notes: string | null
  created_at: string
  updated_at: string
  needed_study_code: string | null
  last_class_attended: string | null
  last_leader_name: string | null
  wants_folleto: boolean
  proposed_days: string[] | null
  proposed_time: string | null
  proposed_zones: string[] | null
  was_eligible: boolean | null
  eligibility_note: string | null
  resolved_group_id: string | null
  resulting_enrollment_id: string | null
  resulting_folleto_request_id: string | null
  member: { first_name: string | null; last_name: string | null } | null
  reviewer: { first_name: string | null; last_name: string | null } | null
  plan: { name: string | null } | null
  existing_group: { name: string | null } | null
  current_group: { name: string | null } | null
  resolved_group: { name: string | null } | null
  history: Array<{
    from_status: string | null
    to_status: string
    notes: string | null
    created_at: string
    actor: { first_name: string | null; last_name: string | null } | null
  }> | null
}

function fullName(p: { first_name: string | null; last_name: string | null } | null): string {
  return [p?.first_name, p?.last_name].filter(Boolean).join(' ') || '—'
}

function toDomain(r: DbRequestRow): StudyRequest {
  return {
    id: r.id,
    member_id: r.member_id,
    member_name: fullName(r.member),
    request_type: r.request_type,
    plan_id: r.plan_id,
    plan_name: r.plan?.name ?? null,
    existing_group_id: r.existing_group_id,
    existing_group_name: r.existing_group?.name ?? null,
    current_group_id: r.current_group_id,
    current_group_name: r.current_group?.name ?? null,
    proposed_location: r.proposed_location,
    proposed_schedule: r.proposed_schedule,
    reason: r.reason,
    status: r.status,
    reviewed_by: r.reviewed_by,
    reviewed_by_name: r.reviewer ? fullName(r.reviewer) : null,
    reviewed_at: r.reviewed_at,
    review_notes: r.review_notes,
    created_at: r.created_at,
    updated_at: r.updated_at,
    needed_study_code: r.needed_study_code,
    last_class_attended: r.last_class_attended,
    last_leader_name: r.last_leader_name,
    wants_folleto: r.wants_folleto,
    proposed_days: r.proposed_days ?? [],
    proposed_time: r.proposed_time,
    // REU-1: zonas múltiples; las viejas tenían UNA en proposed_location.
    proposed_zones: requestZones(r),
    was_eligible: r.was_eligible,
    eligibility_note: r.eligibility_note,
    resolved_group_id: r.resolved_group_id,
    resolved_group_name: r.resolved_group?.name ?? null,
    resulting_enrollment_id: r.resulting_enrollment_id,
    resulting_folleto_request_id: r.resulting_folleto_request_id,
    history: (r.history ?? [])
      .map(h => ({
        from_status: h.from_status as StudyRequestStatus | null,
        to_status: h.to_status as StudyRequestStatus,
        notes: h.notes,
        changed_by_name: h.actor ? fullName(h.actor) : null,
        created_at: h.created_at,
      }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }
}

export async function getStudyRequests(filters?: {
  status?: StudyRequestStatus
  type?: StudyRequestType
  member_id?: string
  /** Alcance 'assigned' (comité de estudios): solo las asignadas a esta persona. */
  assigned_to?: string
}): Promise<StudyRequest[]> {
  const supabase = createAdminClient()
  let q = supabase
    .from('study_requests')
    .select(REQUEST_SELECT)
    .order('created_at', { ascending: false })
    .limit(500)
  if (filters?.status) q = q.eq('status', filters.status)
  if (filters?.type) q = q.eq('request_type', filters.type)
  if (filters?.member_id) q = q.eq('member_id', filters.member_id)
  if (filters?.assigned_to) q = q.eq('reviewed_by', filters.assigned_to)
  const { data, error } = await q
  if (error) throw error
  return ((data ?? []) as DbRequestRow[]).map(toDomain)
}

export async function countOpenStudyRequests(): Promise<number> {
  const supabase = createAdminClient()
  const { count, error } = await supabase
    .from('study_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open')
  if (error) throw error
  return count ?? 0
}

export async function createStudyRequest(input: StudyRequestWriteInput): Promise<StudyRequest> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('study_requests')
    .insert({
      member_id: input.member_id,
      recorded_by: input.recorded_by ?? null,
      request_type: input.request_type,
      plan_id: input.plan_id ?? null,
      existing_group_id: input.existing_group_id ?? null,
      current_group_id: input.current_group_id ?? null,
      proposed_location: input.proposed_location ?? null,
      proposed_schedule: input.proposed_schedule ?? null,
      reason: input.reason ?? null,
      needed_study_code: input.needed_study_code ?? null,
      last_class_attended: input.last_class_attended ?? null,
      last_leader_name: input.last_leader_name ?? null,
      wants_folleto: input.wants_folleto ?? false,
      proposed_days: input.proposed_days ?? [],
      proposed_time: input.proposed_time ?? null,
      proposed_zones: input.proposed_zones ?? [],
      was_eligible: input.was_eligible ?? null,
      eligibility_note: input.eligibility_note ?? null,
    })
    .select(REQUEST_SELECT)
    .single()
  if (error) throw error
  return toDomain(data as DbRequestRow)
}

/** ¿El miembro ya tiene una solicitud de INTERÉS de estudio abierta (open/in_review)?
 *  Regla: máximo 1 abierta por miembro (validación server, espejo de la UI). */
export async function hasOpenStudyInterest(memberId: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('study_requests')
    .select('id')
    .eq('member_id', memberId)
    .eq('request_type', 'study_interest')
    .in('status', ['open', 'in_review'])
    .limit(1)
  if (error) throw error
  return (data ?? []).length > 0
}

export async function updateStudyRequestStatus(
  id: string,
  status: StudyRequestStatus,
  reviewedBy: string,
  reviewNotes?: string | null,
  /** Desde qué estados se acepta la transición. Por defecto solo los abiertos
   *  —una resuelta no se re-toma—; el cambio de estado a mano del coordinador
   *  pasa una lista más amplia (ver request-status-change.ts). */
  desde: readonly StudyRequestStatus[] = ['open', 'in_review'],
): Promise<StudyRequest> {
  const supabase = createAdminClient()

  // Estado anterior, para el historial.
  const { data: before } = await supabase
    .from('study_requests').select('status').eq('id', id).maybeSingle()
  const fromStatus = (before as { status: StudyRequestStatus } | null)?.status ?? null

  const patch: Record<string, unknown> = {
    status,
    reviewed_by: reviewedBy,
    updated_at: new Date().toISOString(),
  }
  // "Tomar" (in_review) no es resolución: marca quién la tiene, sin sellar fecha.
  if (status === 'resolved' || status === 'rejected') {
    patch.reviewed_at = new Date().toISOString()
    patch.review_notes = reviewNotes ?? null
  }
  // QA 2026-07-17: solo transiciona desde estados abiertos — una solicitud
  // resuelta/rechazada no se puede re-tomar ni re-rechazar (la resolución de
  // una reubicación ya matriculó gente). Condicional en el UPDATE (no solo en
  // la lectura de arriba) para que dos revisores simultáneos no la pisen.
  const { data, error } = await supabase
    .from('study_requests')
    .update(patch as Updatable<'study_requests'>)
    .eq('id', id)
    .in('status', desde as string[])
    .select(REQUEST_SELECT)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('YA_RESUELTA')

  // Historial de cambios (best-effort: no bloquea la acción si falla).
  const { error: hErr } = await supabase.from('study_request_status_history').insert({
    request_id: id,
    from_status: fromStatus,
    to_status: status,
    changed_by: reviewedBy,
    notes: reviewNotes ?? null,
  })
  if (hErr) console.warn('updateStudyRequestStatus: historial falló:', hErr.message)

  const result = toDomain(data as DbRequestRow)
  // El select corrió antes del insert del historial: reflejarlo en la respuesta.
  result.history = [...result.history, {
    from_status: fromStatus,
    to_status: status,
    notes: reviewNotes ?? null,
    changed_by_name: result.reviewed_by_name,
    created_at: new Date().toISOString(),
  }]
  return result
}

const TYPE_LABEL_NOTIF: Record<StudyRequestType, string> = {
  relocation: 'reubicación',
  study_interest: 'interés en estudio',
}

/** Asigna la solicitud a un coordinador (de dirigentes o de estudios): pasa a
 *  in_review con reviewed_by = el ASIGNADO (no quien asigna); el historial
 *  registra quién asignó, y el asignado recibe una notificación interna. */
export async function assignStudyRequest(
  id: string,
  assigneeMemberId: string,
  assignedByMemberId: string,
): Promise<StudyRequest> {
  const supabase = createAdminClient()

  // El asignado debe ser coordinador de estudios/dirigentes O tener puesto
  // activo en el comité de estudios bíblicos (decisión 2026-07-31: el comité
  // trabaja solicitudes; ve solo las suyas).
  const assignable = await getAssignableForRequests()
  const target = assignable.find(a => a.member_id === assigneeMemberId)
  if (!target) {
    throw new Error('La persona asignada debe ser coordinador de estudios/dirigentes o estar en el comité de estudios bíblicos')
  }
  const assigneeName = target.member_name

  // Estado anterior, para el historial.
  const { data: before } = await supabase
    .from('study_requests').select('status').eq('id', id).maybeSingle()
  const fromStatus = (before as { status: StudyRequestStatus } | null)?.status ?? null

  // QA 2026-07-17: no se puede asignar una solicitud ya resuelta/rechazada —
  // la regresaría a in_review. Condicional en el UPDATE (anti-carrera).
  const { data, error } = await supabase
    .from('study_requests')
    .update({ status: 'in_review', reviewed_by: assigneeMemberId, updated_at: new Date().toISOString() })
    .eq('id', id)
    .in('status', ['open', 'in_review'])
    .select(REQUEST_SELECT)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('YA_RESUELTA')

  // Historial (best-effort): "Abierta → En revisión · por [asignador] — Asignada a [nombre]".
  const { error: hErr } = await supabase.from('study_request_status_history').insert({
    request_id: id,
    from_status: fromStatus,
    to_status: 'in_review',
    changed_by: assignedByMemberId,
    notes: `Asignada a ${assigneeName}`,
  })
  if (hErr) console.warn('assignStudyRequest: historial falló:', hErr.message)

  const result = toDomain(data as DbRequestRow)

  // Notificación interna al coordinador asignado (best-effort).
  const { error: nErr } = await supabase.from('internal_notifications').insert({
    recipient_member_id: assigneeMemberId,
    type: 'study_request_assigned',
    title: 'Te asignaron una solicitud',
    body: `Te asignaron una solicitud de ${TYPE_LABEL_NOTIF[result.request_type]} de ${result.member_name}`,
    link: requestDeepLink(result.request_type, result.id),
  })
  if (nErr) console.warn('assignStudyRequest: notificación falló:', nErr.message)

  // Y correo (2026-08-20): la campana sola no alcanza — la gente no entra al
  // sistema. Best-effort: si falla, la asignación ya quedó hecha.
  try {
    const { data: asignado } = await supabase
      .from('members').select('email, first_name, last_name').eq('id', assigneeMemberId).maybeSingle()
    const a = asignado as { email: string | null; first_name: string; last_name: string } | null
    if (a?.email) {
      const { sendSystemEmail } = await import('@/lib/email/system-templates')
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://admin.theosplace.org'
      await sendSystemEmail({
        systemKey: 'solicitud_asignada',
        to: { email: a.email, name: `${a.first_name} ${a.last_name}`.trim() },
        data: {
          nombre: a.first_name,
          tipo_solicitud: TYPE_LABEL_NOTIF[result.request_type],
          nombre_solicitante: result.member_name ?? 'un miembro',
          link_solicitud: `${siteUrl}${requestDeepLink(result.request_type, result.id)}`,
        },
      })
    }
  } catch (e) {
    console.warn('assignStudyRequest: correo falló:', e)
  }

  // El select corrió antes del insert del historial: reflejarlo en la respuesta.
  result.history = [...result.history, {
    from_status: fromStatus,
    to_status: 'in_review',
    notes: `Asignada a ${assigneeName}`,
    changed_by_name: null,
    created_at: new Date().toISOString(),
  }]
  return result
}

/**
 * Resuelve una solicitud. Para 'study_interest' es solo un cambio de estado
 * (comportamiento histórico). Para 'relocation' es una ACCIÓN real: matricula
 * al miembro en el grupo elegido por el encargado (`target_group_id`,
 * obligatorio), transfiere la inscripción anterior si había una activa, y —
 * si marcó "Ocupo folleto" al pedir la reubicación — le crea el pago pendiente
 * del folleto (costo = study_plans.cost del plan destino, el mismo campo que
 * usa la matrícula normal) y el tiquete en la cola existente (mismo flujo de
 * impresión/entrega que los folletos de cierre de grupo).
 *
 * 2026-08-04: la matrícula queda EFECTIVA en los dos caminos. Antes, la del
 * camino con folleto nacía 'pendiente_de_pago' y la persona quedaba reubicada a
 * medias hasta que alguien aprobara el comprobante.
 */
export async function resolveStudyRequest(
  id: string,
  resolverMemberId: string,
  opts: { target_group_id?: string | null; review_notes?: string | null },
): Promise<StudyRequest> {
  const supabase = createAdminClient()

  const { data: reqRow, error: reqErr } = await supabase
    .from('study_requests')
    .select('request_type, member_id, current_group_id, wants_folleto, status')
    .eq('id', id).maybeSingle()
  if (reqErr) throw reqErr
  const row = reqRow as {
    request_type: StudyRequestType
    member_id: string
    current_group_id: string | null
    wants_folleto: boolean
    status: StudyRequestStatus
  } | null
  if (!row) throw new Error('NOT_FOUND')
  if (row.status === 'resolved' || row.status === 'rejected') throw new Error('YA_RESUELTA')

  // study_interest: sin acción de matrícula, solo el flujo de estado de siempre.
  if (row.request_type !== 'relocation') {
    return updateStudyRequestStatus(id, 'resolved', resolverMemberId, opts.review_notes)
  }

  const targetGroupId = opts.target_group_id
  if (!targetGroupId) throw new Error('GRUPO_REQUERIDO')

  // QA 2026-07-17: guard del DESTINO antes de tocar nada — mismos guards que
  // enrollMember. Sin esto, el upsert del camino con folleto resucitaba una
  // inscripción 'completed' (pisando el registro académico).
  const { data: destEnr } = await supabase
    .from('study_enrollments')
    .select('id, status')
    .eq('group_id', targetGroupId)
    .eq('member_id', row.member_id)
    .maybeSingle()
  const prevDest = destEnr as { id: string; status: string } | null
  if (prevDest?.status === 'completed') throw new Error('YA_COMPLETADO')
  if (prevDest?.status === 'enrolled' || prevDest?.status === 'pendiente_de_pago') {
    throw new Error('YA_MATRICULADO')
  }

  // Transfiere la inscripción actual (si había una activa) al grupo destino.
  // QA 2026-07-17: si esta escritura falla hay que abortar ANTES de matricular
  // — seguir dejaba al miembro activo en dos grupos a la vez.
  if (row.current_group_id) {
    const { error: trErr } = await supabase
      .from('study_enrollments')
      .update({ status: 'transferred', transferred_to: targetGroupId, updated_at: new Date().toISOString() })
      .eq('group_id', row.current_group_id)
      .eq('member_id', row.member_id)
      .in('status', ['enrolled', 'pendiente_de_pago', 'waitlist'])
    if (trErr) throw trErr
  }

  let enrollmentId: string
  let folletoRequestId: string | null = null

  if (row.wants_folleto) {
    const { data: g } = await supabase
      .from('study_groups')
      .select('plan:study_plans!study_groups_plan_id_fkey(id, code, cost, currency)')
      .eq('id', targetGroupId).maybeSingle()
    const plan = (g as { plan: { id: string; code: string | null; cost: number; currency: string | null } | null } | null)?.plan
    const amount = Number(plan?.cost ?? 0)

    // Mismo patrón de upsert que enrollMember: re-activa una fila existente
    // (group,member) legítimamente (ej. reincorporación tras dropped).
    const { data: enr, error: enrErr } = await supabase
      .from('study_enrollments')
      .upsert({
        member_id: row.member_id, group_id: targetGroupId, plan_id: plan?.id ?? null,
        status: 'enrolled', enrolled_at: new Date().toISOString(),
      }, { onConflict: 'group_id,member_id' })
      .select('id').single()
    if (enrErr) throw enrErr
    enrollmentId = (enr as { id: string }).id

    // QA 2026-07-17: si el pago no se pudo crear, revertir la inscripción — el
    // folleto sin su cobro es invisible para finanzas y la API habría
    // respondido éxito igual.
    const { error: payErr } = await supabase.from('payments').insert({
      // INT-3: el folleto se cobra en la moneda del plan, no en colones fijos.
      member_id: row.member_id, amount, currency: toCurrency(plan?.currency), payment_method: 'comprobante',
      concept: 'folletos', enrollment_id: enrollmentId, study_group_id: targetGroupId,
      status: 'pending',
    })
    if (payErr) {
      if (prevDest) {
        await supabase.from('study_enrollments').update({ status: prevDest.status }).eq('id', enrollmentId)
      } else {
        await supabase.from('study_enrollments').delete().eq('id', enrollmentId)
      }
      throw payErr
    }

    const { getSedeForGroup } = await import('./folletos')
    const sede = await getSedeForGroup(targetGroupId)
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica' }).format(new Date())
    const { data: fr, error: frErr } = await supabase
      .from('folleto_requests')
      .insert({
        target_level_code: plan?.code ?? null,
        quantity: 1,
        sede,
        close_date: today,
        available_at: today,
        tipo: 'reubicacion',
        confirmed_by: resolverMemberId,
      })
      .select('id').single()
    if (frErr) throw frErr
    folletoRequestId = (fr as { id: string }).id
  } else {
    // Reubicación SIN folleto: no se cobra nada. Cambiar de grupo no es
    // matricularse de nuevo — ya pagó en el grupo del que viene. enrollMember
    // no puede saberlo (solo ve el plan y su costo), por eso se le dice.
    //
    // Sin esto le nacía un cobro de matrícula completo y la reubicación quedaba
    // en 'pendiente_de_pago', o sea a medias, bloqueándole matricular otra cosa
    // por "deuda". Le pasó a Valeria Astorga Calvo con un estudio que ya había
    // aprobado (2026-09-08).
    const { enrollMember } = await import('./studies')
    const result = await enrollMember(targetGroupId, row.member_id, undefined, {
      sinCobro: reubicacionSinCobro({ wants_folleto: row.wants_folleto }),
    })
    enrollmentId = result.enrollment_id
  }

  // Solo se avisa si de verdad hubo matrícula: cuando la reubicación se
  // resuelve con folleto no se matricula a nadie. (Antes esto se colaba pasando
  // 'pendiente_de_pago' como estado para que el correo se callara; el parámetro
  // desapareció con la regla de matrícula inmediata.)
  if (enrollmentId) {
    try {
      const { notifyEnrollment } = await import('@/lib/email/enrollment-notify')
      await notifyEnrollment(targetGroupId, row.member_id)
    } catch (e) {
      console.warn('resolveStudyRequest: notifyEnrollment falló:', e)
    }
  }

  const { data: before } = await supabase.from('study_requests').select('status').eq('id', id).maybeSingle()
  const fromStatus = (before as { status: StudyRequestStatus } | null)?.status ?? null

  const { data, error } = await supabase
    .from('study_requests')
    .update({
      status: 'resolved',
      reviewed_by: resolverMemberId,
      reviewed_at: new Date().toISOString(),
      review_notes: opts.review_notes ?? null,
      resolved_group_id: targetGroupId,
      resulting_enrollment_id: enrollmentId,
      resulting_folleto_request_id: folletoRequestId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(REQUEST_SELECT)
    .single()
  if (error) throw error

  const { error: hErr } = await supabase.from('study_request_status_history').insert({
    request_id: id,
    from_status: fromStatus,
    to_status: 'resolved',
    changed_by: resolverMemberId,
    notes: opts.review_notes ?? (row.wants_folleto ? 'Matriculado con folleto pendiente de pago' : 'Matriculado'),
  })
  if (hErr) console.warn('resolveStudyRequest: historial falló:', hErr.message)

  const result = toDomain(data as DbRequestRow)
  result.history = [...result.history, {
    from_status: fromStatus,
    to_status: 'resolved',
    notes: opts.review_notes ?? null,
    changed_by_name: null,
    created_at: new Date().toISOString(),
  }]
  return result
}

// ── Destinatarios de notificaciones ─────────────────────────────────────────

/** member_id de los miembros ACTIVOS con rol ACTIVO de la allowlist
 *  (coordinación de estudios/dirigentes, dirección, admin). Deduplicado.
 *  Es la audiencia automática de las notificaciones de solicitudes de estudio.
 *  La regla vive en selectStudyRequestRecipients (pura y testeada): acá solo
 *  se traen las filas. `excludeMemberId` saca al solicitante, que no necesita
 *  el aviso de su propia solicitud aunque sea coordinador. */
export async function getStudyNotificationRecipients(
  opts: { excludeMemberId?: string | null } = {},
): Promise<string[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('member_roles')
    .select('member_id, role, is_active, member:members!member_roles_member_id_fkey(is_active)')
    .in('role', STUDY_REQUEST_NOTIFY_ROLES as unknown as string[])
    .eq('is_active', true)
  if (error) throw error
  const rows = ((data ?? []) as Array<{
    member_id: string; role: string; is_active: boolean; member: { is_active: boolean } | null
  }>).map(r => ({
    member_id: r.member_id,
    role: r.role,
    role_active: r.is_active !== false,
    member_active: r.member?.is_active === true,
  }))
  return selectStudyRequestRecipients(rows, opts)
}

/** Miembros elegibles como destinatarios: con rol activo de coordinación/admin. */
/** Ids de miembros ACTIVOS con puesto activo en el comité de estudios bíblicos.
 *  Se resuelve por NOMBRE del área (no por uuid) para no clavar un id de
 *  producción en el código; ver STUDY_COMMITTEE_AREA_NAME. */
export async function getStudyCommitteeMembers(): Promise<Array<{ member_id: string; member_name: string }>> {
  const supabase = createAdminClient()
  const { data: areas, error: aErr } = await supabase
    .from('areas').select('id, name').eq('area_type', 'committee').eq('is_active', true)
  if (aErr) throw aErr
  const areaIds = ((areas ?? []) as Array<{ id: string; name: string }>)
    .filter(a => isStudyCommitteeArea(a.name)).map(a => a.id)
  if (areaIds.length === 0) return []

  const { data: positions, error: pErr } = await supabase
    .from('service_positions').select('id').in('area_id', areaIds)
  if (pErr) throw pErr
  const positionIds = ((positions ?? []) as Array<{ id: string }>).map(p => p.id)
  if (positionIds.length === 0) return []

  const byMember = new Map<string, string>()
  for (let i = 0; i < positionIds.length; i += 200) {
    const { data, error } = await supabase
      .from('volunteers')
      .select('member_id, member:members!volunteers_member_id_fkey(first_name, last_name, is_active)')
      .in('position_id', positionIds.slice(i, i + 200))
      .eq('status', 'active')
    if (error) throw error
    for (const v of (data ?? []) as unknown as Array<{
      member_id: string
      member: { first_name: string | null; last_name: string | null; is_active: boolean } | null
    }>) {
      if (!v.member?.is_active || byMember.has(v.member_id)) continue
      byMember.set(v.member_id, fullName(v.member))
    }
  }
  return [...byMember].map(([member_id, member_name]) => ({ member_id, member_name }))
}

/** ¿Esta persona está en el comité? (gate de la pantalla y de la API). */
export async function isStudyCommitteeMember(memberId: string | null): Promise<boolean> {
  if (!memberId) return false
  const all = await getStudyCommitteeMembers()
  return all.some(m => m.member_id === memberId)
}

/** Asignables: coordinadores de estudios/dirigentes + comité de estudios
 *  bíblicos, deduplicados y ordenados por nombre. */
export async function getAssignableForRequests(): Promise<Array<{
  member_id: string; member_name: string; roles: string[]; in_committee: boolean
}>> {
  const [coords, committee] = await Promise.all([getEligibleCoordinators(), getStudyCommitteeMembers()])
  const byId = new Map<string, { member_id: string; member_name: string; roles: string[]; in_committee: boolean }>()
  for (const c of coords) {
    if (!c.roles.includes('coordinador_estudios') && !c.roles.includes('coordinador_dirigentes')) continue
    byId.set(c.member_id, { ...c, in_committee: false })
  }
  for (const m of committee) {
    const cur = byId.get(m.member_id)
    if (cur) cur.in_committee = true
    else byId.set(m.member_id, { ...m, roles: [], in_committee: true })
  }
  return [...byId.values()].sort((a, b) => a.member_name.localeCompare(b.member_name, 'es'))
}

export async function getEligibleCoordinators(): Promise<Array<{ member_id: string; member_name: string; roles: string[] }>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('member_roles')
    .select('member_id, role, member:members!member_roles_member_id_fkey(first_name, last_name, is_active)')
    .in('role', ['admin', 'coordinador_estudios', 'coordinador_dirigentes'])
    .eq('is_active', true)
  if (error) throw error
  const byMember = new Map<string, { member_id: string; member_name: string; roles: string[] }>()
  for (const r of (data ?? []) as Array<{
    member_id: string; role: string
    member: { first_name: string | null; last_name: string | null; is_active: boolean } | null
  }>) {
    if (!r.member?.is_active) continue
    const cur = byMember.get(r.member_id)
    if (cur) cur.roles.push(r.role)
    else byMember.set(r.member_id, { member_id: r.member_id, member_name: fullName(r.member), roles: [r.role] })
  }
  return Array.from(byMember.values()).sort((a, b) => a.member_name.localeCompare(b.member_name))
}

// ── Notificaciones internas ──────────────────────────────────────────────────

const NOTIF_META: Record<StudyRequestType, { type: InternalNotificationType; title: string }> = {
  relocation: { type: 'study_relocation_request', title: 'Nueva solicitud de reubicación' },
  study_interest: { type: 'study_interest_request', title: 'Nuevo interés en estudio' },
}

/** Crea una notificación por cada destinatario. Audiencia automática: TODOS los
 *  miembros con rol activo coordinador_estudios / coordinador_dirigentes / admin
 *  (deduplicados). Best-effort. */
export async function notifyRecipientsOfRequest(req: StudyRequest): Promise<void> {
  const supabase = createAdminClient()
  const memberIds = await getStudyNotificationRecipients({ excludeMemberId: req.member_id })
  if (memberIds.length === 0) return
  const meta = NOTIF_META[req.request_type]
  const rows = memberIds.map(memberId => ({
    recipient_member_id: memberId,
    type: meta.type,
    title: meta.title,
    body: `${req.member_name} envió una solicitud.${req.reason ? ` Motivo: ${req.reason.slice(0, 140)}` : req.plan_name ? ` Interés: ${req.plan_name}` : ''}`,
    link: requestDeepLink(req.request_type, req.id),
  }))
  const { error } = await supabase.from('internal_notifications').insert(rows)
  if (error) console.warn('notifyRecipientsOfRequest:', error.message)
}

export async function getInternalNotifications(memberId: string): Promise<InternalNotification[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('internal_notifications')
    .select('*')
    .eq('recipient_member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []) as InternalNotification[]
}

/** Marca como leída, verificando que pertenece al miembro. */
export async function markNotificationRead(id: string, memberId: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('internal_notifications')
    .update({ read: true })
    .eq('id', id)
    .eq('recipient_member_id', memberId)
  if (error) throw error
}

/** Marca un conjunto de notificaciones (por id) del miembro como leídas. */
export async function markNotificationsRead(ids: string[], memberId: string): Promise<void> {
  if (ids.length === 0) return
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('internal_notifications')
    .update({ read: true })
    .in('id', ids)
    .eq('recipient_member_id', memberId)
  if (error) throw error
}

/** Marca TODAS las notificaciones no leídas del miembro como leídas. */
export async function markAllNotificationsRead(memberId: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('internal_notifications')
    .update({ read: true })
    .eq('recipient_member_id', memberId)
    .eq('read', false)
  if (error) throw error
}

/** Elimina notificaciones (por id) del miembro. Verifica pertenencia. */
export async function deleteNotifications(ids: string[], memberId: string): Promise<void> {
  if (ids.length === 0) return
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('internal_notifications')
    .delete()
    .in('id', ids)
    .eq('recipient_member_id', memberId)
  if (error) throw error
}

// ── Alerta: dirigente inasistente ────────────────────────────────────────────

const ABSENCE_WEEKS = 4

/** Dirigentes con grupo activo (en_matricula/en_curso) y más de ABSENCE_WEEKS
 *  semanas sin check-in de charla → notificación interna a los coordinadores
 *  de dirigentes. Anti-duplicado: máximo una notificación por dirigente por
 *  semana (se identifica por el link, que lleva el member_id del dirigente).
 *  Pensada para correrse a diario desde la edge function process-email-queue. */
export async function notifyAbsentLeaders(): Promise<{ checked: number; notified: number }> {
  const supabase = createAdminClient()

  // 1. Dirigentes y co-dirigentes de grupos activos.
  const { data: groups, error: gErr } = await supabase
    .from('study_groups')
    .select('leader_id, co_leader_id')
    .in('status', ['en_matricula', 'en_curso'])
  if (gErr) throw gErr
  const leaderIds = Array.from(new Set(
    (groups ?? []).flatMap(g => [g.leader_id, g.co_leader_id]).filter(Boolean) as string[],
  ))
  if (leaderIds.length === 0) return { checked: 0, notified: 0 }

  // 2. Último check-in de CHARLA de cada dirigente en la ventana.
  const cutoff = new Date(Date.now() - ABSENCE_WEEKS * 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recent, error: cErr } = await supabase
    .from('event_checkins')
    .select('member_id, events!inner(event_type)')
    .in('member_id', leaderIds)
    .eq('events.event_type', 'charla')
    .gte('checked_in_at', cutoff)
  if (cErr) throw cErr
  const activeSet = new Set((recent ?? []).map(r => (r as { member_id: string }).member_id))
  const absentIds = leaderIds.filter(id => !activeSet.has(id))
  if (absentIds.length === 0) return { checked: leaderIds.length, notified: 0 }

  // 3. Destinatarios: coordinadores de dirigentes con rol activo.
  const { data: coordRoles, error: rErr } = await supabase
    .from('member_roles')
    .select('member_id')
    .eq('role', 'coordinador_dirigentes')
    .eq('is_active', true)
  if (rErr) throw rErr
  const recipientIds = Array.from(new Set((coordRoles ?? []).map(r => r.member_id as string)))
  if (recipientIds.length === 0) return { checked: leaderIds.length, notified: 0 }

  // 4. Anti-duplicado: notificaciones de este tipo en los últimos 7 días.
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentNotifs, error: nErr } = await supabase
    .from('internal_notifications')
    .select('link')
    .eq('type', 'leader_absent_alert')
    .gte('created_at', weekAgo)
  if (nErr) throw nErr
  const alreadyNotified = new Set((recentNotifs ?? []).map(n => n.link as string | null))

  // 5. Nombres de los dirigentes ausentes.
  const { data: memberRows, error: mErr } = await supabase
    .from('members')
    .select('id, first_name, last_name')
    .in('id', absentIds)
  if (mErr) throw mErr
  const nameOf = new Map((memberRows ?? []).map(m => [
    m.id as string,
    [m.first_name, m.last_name].filter(Boolean).join(' '),
  ]))

  const rows = absentIds
    .map(id => ({ id, link: `/estudios/dirigentes?dirigente=${id}` }))
    .filter(({ link }) => !alreadyNotified.has(link))
    .flatMap(({ id, link }) => recipientIds.map(recipientId => ({
      recipient_member_id: recipientId,
      type: 'leader_absent_alert',
      title: 'Dirigente sin asistencia a charlas',
      body: `${nameOf.get(id) ?? 'Un dirigente'} tiene un grupo activo y lleva más de ${ABSENCE_WEEKS} semanas sin asistir a charla`,
      link,
    })))
  if (rows.length === 0) return { checked: leaderIds.length, notified: 0 }

  const { error: insErr } = await supabase.from('internal_notifications').insert(rows)
  if (insErr) throw insErr
  return { checked: leaderIds.length, notified: rows.length }
}
