import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient, type Insertable, type Updatable } from '@/lib/supabase/admin'
import type { EventType, EventStatus, EventPaymentStatus, AttendanceType } from '@/types/event'

// NOTA: usamos createAdminClient (service role key) porque la app todavía
// corre con mock auth — sin JWT de Supabase, RLS bloquearía todas las reads.
// Cuando migremos a Supabase Auth real, cambiar a createClient de server.ts.

// ── Tipos ──────────────────────────────────────────────────

/** Fila cruda de `events` + relaciones, tal como las devuelve Supabase.
 *  Convertir a `AdminEvent` con `toDomainEvent()` en `@/lib/events/adapter`. */
export type DbEventEnriched = {
  id: string
  title: string
  description: string | null
  event_type: string
  location: string | null
  location_url: string | null
  starts_at: string
  ends_at: string | null
  is_recurring: boolean
  recurrence_rule: string | null
  recurrence_end: string | null
  parent_event_id: string | null
  max_capacity: number | null
  flyer_url: string | null
  is_virtual: boolean
  virtual_url: string | null
  requires_registration: boolean
  /** false = interno: no se lista en el calendario público ni en el de los
   *  miembros. Se sigue pudiendo compartir por su link directo. */
  is_public: boolean
  requires_payment: boolean
  payment_amount: number | null
  /** INT-2: moneda de payment_amount/server_price (CRC/USD/EUR). */
  currency: string
  /** INT-3: sede del evento; propone la moneda del cobro. */
  sede_id: string | null
  server_price: number | null
  servers_pay: boolean
  requires_survey: boolean
  /** EVE-4 · Formulario de inscripción y encuesta de satisfacción. */
  registration_form_id: string | null
  survey_form_id: string | null
  survey_template_id: string | null
  survey_offset_hours: number | null
  survey_send_at: string | null
  survey_sent_at: string | null
  survey_sent_count: number
  status: EventStatus
  cancellation_reason: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  exceptions: Array<{ exception_date: string; override_event_id: string | null }>
  organizing_committees: Array<{ committee_id: string }>
  sub_events: Array<{ id: string; name: string; max_capacity: number }>
  registrations: Array<{
    // `id` hace falta para poder volver a abrir el modal del comprobante desde
    // la tarjeta del evento: sin él, quien cerraba el modal con "Más tarde" no
    // tenía NINGUNA forma de subirlo después.
    id: string
    member_id: string
    payment_status: EventPaymentStatus
    registered_at: string
    member: { first_name: string; last_name: string } | null
    /** Su comprobante está subido esperando a finanzas. Solo lo llena
     *  getEventById (el detalle); en la LISTA de eventos viene undefined, para
     *  no pagar una consulta de pagos por cada evento del calendario.
     *  payment_status no puede decir esto: se queda en 'pending' hasta que
     *  finanzas aprueba, así que "no subió comprobante" y "está en revisión"
     *  son el mismo valor. */
    payment_in_review?: boolean
    /** Id del pago en revisión, para pedir la URL firmada del comprobante
     *  (/api/payments/[id]/receipt). Sin esto la lista sabe que hay comprobante
     *  pero no puede mostrarlo, que es justo lo que finanzas necesita. */
    payment_in_review_id?: string | null
  }>
  checkins: Array<{
    id: string
    member_id: string | null
    sub_event_id: string | null
    checked_in_at: string
    /** `created_at` de la ficha: con él se cuenta a quién se le creó el perfil
     *  el mismo día del evento (personas nuevas, en el tab de Reportes). */
    member: { first_name: string; last_name: string; created_at: string | null } | null
    is_volunteer: boolean
  }>
  volunteers: Array<{
    member_id: string
    role: string | null
    status: 'confirmed' | 'pending' | 'cancelled'
    member: { first_name: string; last_name: string } | null
  }>
}

export type EventFilters = {
  search?: string
  event_type?: EventType
  status?: EventStatus
  /** 'all' = activos e inactivos (históricos importados). */
  is_active?: boolean | 'all'
  /** Sin relaciones (registrations/checkins/volunteers): para calendario y
   *  listados grandes — los ~840 históricos con 28k check-ins embebidos
   *  serían megas de payload. */
  light?: boolean
  page?: number
  pageSize?: number
}

const SELECT = `
  *,
  exceptions:event_exceptions!event_exceptions_parent_event_id_fkey(exception_date, override_event_id),
  organizing_committees:event_organizing_committees(committee_id),
  sub_events(id, name, max_capacity),
  registrations:event_registrations(
    id,
    member_id,
    payment_status,
    registered_at,
    member:members!event_registrations_member_id_fkey(first_name, last_name)
  ),
  checkins:event_checkins(
    id,
    member_id,
    sub_event_id,
    checked_in_at,
    member:members(first_name, last_name, created_at)
  ),
  volunteers:event_volunteers(
    member_id,
    role,
    status,
    member:members(first_name, last_name)
  )
`

/** Normaliza una fila cruda de Supabase a `DbEventEnriched`, marcando qué
 *  checkins corresponden a voluntarios del mismo evento (no hay FK directa). */
function normalize(row: Record<string, unknown>): DbEventEnriched {
  const volunteers = (row.volunteers ?? []) as DbEventEnriched['volunteers']
  const volunteerIds = new Set(volunteers.map((v) => v.member_id))

  const checkins = ((row.checkins ?? []) as Array<Record<string, unknown>>).map((c) => ({
    id: c.id as string,
    member_id: (c.member_id as string) ?? null,
    sub_event_id: (c.sub_event_id as string) ?? null,
    checked_in_at: c.checked_in_at as string,
    member: (c.member as DbEventEnriched['checkins'][number]['member']) ?? null,
    is_volunteer: c.member_id ? volunteerIds.has(c.member_id as string) : false,
  }))

  return {
    ...(row as DbEventEnriched),
    exceptions: (row.exceptions ?? []) as DbEventEnriched['exceptions'],
    organizing_committees: (row.organizing_committees ?? []) as DbEventEnriched['organizing_committees'],
    sub_events: (row.sub_events ?? []) as DbEventEnriched['sub_events'],
    registrations: (row.registrations ?? []) as DbEventEnriched['registrations'],
    volunteers,
    checkins,
  }
}

// ── Queries ────────────────────────────────────────────────

/** Lista de eventos con sus relaciones (sub-eventos, inscripciones, checkins, voluntarios). */
export async function getEvents(filters: EventFilters = {}): Promise<{ events: DbEventEnriched[]; total: number }> {
  const supabase = createAdminClient()
  const {
    search,
    event_type,
    status,
    is_active = true,
    page = 1,
    pageSize = 100,
  } = filters

  // select como string plano: el parser de tipos de supabase-js no soporta el ternario
  const select: string = filters.light
    ? '*, exceptions:event_exceptions!event_exceptions_parent_event_id_fkey(exception_date, override_event_id), organizing_committees:event_organizing_committees(committee_id), sub_events(id, name, max_capacity)'
    : SELECT
  let query = supabase
    .from('events')
    .select(select, { count: 'exact' })
    .order('starts_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (is_active !== 'all') query = query.eq('is_active', is_active)

  if (search) query = query.ilike('title', `%${search}%`)
  if (event_type) query = query.eq('event_type', event_type)
  if (status) query = query.eq('status', status)

  const { data, error, count } = await query
  if (error) throw error

  return {
    events: (data ?? []).map((row) => normalize(row as unknown as Record<string, unknown>)),
    total: count ?? 0,
  }
}

/** member_ids distintos que hicieron check-in a un evento (asistentes reales).
 *  Para comunicaciones: la audiencia de un evento es quien ASISTIÓ (event_checkins),
 *  no event_registrations (esa tabla no se usa). Paginado. */
export async function getEventAttendeeIds(eventId: string): Promise<string[]> {
  const supabase = createAdminClient()
  const ids = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('event_checkins')
      .select('member_id')
      .eq('event_id', eventId)
      .not('member_id', 'is', null)
      .order('member_id')
      .range(from, from + 999)
    if (error) throw error
    const batch = (data ?? []) as Array<{ member_id: string | null }>
    for (const r of batch) if (r.member_id) ids.add(r.member_id)
    if (batch.length < 1000) break
  }
  return [...ids]
}

/** member_ids inscritos (event_registrations) a un evento. */
export async function getEventRegistrationIds(eventId: string): Promise<string[]> {
  const supabase = createAdminClient()
  const ids = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('event_registrations')
      .select('member_id')
      .eq('event_id', eventId)
      .not('member_id', 'is', null)
      .order('member_id')
      .range(from, from + 999)
    if (error) throw error
    const batch = (data ?? []) as Array<{ member_id: string | null }>
    for (const r of batch) if (r.member_id) ids.add(r.member_id)
    if (batch.length < 1000) break
  }
  return [...ids]
}

/** Un evento por id, con todas sus relaciones. */
export async function getEventById(id: string): Promise<DbEventEnriched | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('events')
    .select(SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  const ev = normalize(data as Record<string, unknown>)

  // Cuáles inscripciones tienen comprobante esperando a finanzas. Va como
  // consulta APARTE y no como embed en SELECT: SELECT lo comparte la lista de
  // eventos (miles de filas) y, sobre todo, agregar un embed más entre estas
  // tablas es cómo se rompió antes la lista de miembros — dos FK hacia la misma
  // tabla y PostgREST deja de resolver el embed, en las dos direcciones.
  const ids = ev.registrations.map(r => r.id).filter(Boolean)
  if (ids.length > 0) {
    const { data: pagos } = await supabase
      .from('payments')
      .select('id, event_registration_id')
      .in('event_registration_id', ids)
      .eq('concept', 'evento')
      .eq('review_status', 'en_revision')
    const enRevision = new Map(
      ((pagos ?? []) as Array<{ id: string; event_registration_id: string | null }>)
        .filter(p => !!p.event_registration_id)
        .map(p => [p.event_registration_id as string, p.id]),
    )
    for (const r of ev.registrations) {
      r.payment_in_review = enRevision.has(r.id)
      r.payment_in_review_id = enRevision.get(r.id) ?? null
    }
  }
  return ev
}

// ── Mutaciones ─────────────────────────────────────────────

/** Campos escribibles de un evento (nombres de columna DB). */
export type EventWriteInput = {
  title: string
  /** INT-3: sede del evento; propone la moneda del cobro en el formulario. */
  sede_id?: string | null
  description?: string | null
  event_type: string
  location?: string | null
  location_url?: string | null
  starts_at: string
  ends_at?: string | null
  is_recurring?: boolean
  recurrence_rule?: string | null
  recurrence_end?: string | null
  parent_event_id?: string | null
  max_capacity?: number | null
  flyer_url?: string | null
  is_virtual?: boolean
  virtual_url?: string | null
  requires_registration?: boolean
  is_public?: boolean
  requires_payment?: boolean
  payment_amount?: number | null
  currency?: string
  server_price?: number | null
  servers_pay?: boolean
  requires_survey?: boolean
  /** EVE-4 · Formulario de inscripción y programación de la encuesta. */
  registration_form_id?: string | null
  survey_form_id?: string | null
  survey_template_id?: string | null
  survey_offset_hours?: number | null
  survey_send_at?: string | null
  status?: EventStatus
  cancellation_reason?: string | null
}

type SubEventInput = { name: string; max_capacity: number }

/** Reemplaza el set de comités organizadores (m2m) de un evento. */
async function setOrganizingCommittees(
  supabase: ReturnType<typeof createAdminClient>,
  eventId: string,
  committeeIds: string[],
): Promise<void> {
  await supabase.from('event_organizing_committees').delete().eq('event_id', eventId)
  const ids = Array.from(new Set(committeeIds.filter(Boolean)))
  if (ids.length > 0) {
    const { error } = await supabase
      .from('event_organizing_committees')
      .insert(ids.map((committee_id) => ({ event_id: eventId, committee_id })))
    if (error) throw error
  }
}

/** Crea un evento, sus sub-eventos y comités organizadores. Devuelve el evento enriquecido.
 *  `createdBy` = id de auth del usuario (events.created_by → auth.users.id). */
export async function createEvent(
  input: EventWriteInput,
  subEvents: SubEventInput[] = [],
  createdBy?: string | null,
  organizingCommitteeIds?: string[],
): Promise<DbEventEnriched> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('events')
    .insert({ ...input, is_active: true, created_by: createdBy ?? null } as Insertable<'events'>)
    .select('id')
    .single()
  if (error) throw error

  const eventId = (data as { id: string }).id

  if (subEvents.length > 0) {
    const { error: subErr } = await supabase
      .from('sub_events')
      .insert(subEvents.map((s) => ({ ...s, event_id: eventId })))
    if (subErr) throw subErr
  }

  if (organizingCommitteeIds) await setOrganizingCommittees(supabase, eventId, organizingCommitteeIds)

  const created = await getEventById(eventId)
  if (!created) throw new Error('No se pudo cargar el evento recién creado')
  return created
}

/** Actualiza los campos de un evento. Si se pasa `subEvents`, reemplaza el set
 *  completo de sub-eventos (borra los existentes e inserta los nuevos). */
export async function updateEvent(
  id: string,
  input: Partial<EventWriteInput>,
  subEvents?: SubEventInput[],
  organizingCommitteeIds?: string[],
): Promise<DbEventEnriched> {
  const supabase = createAdminClient()

  const { error } = await supabase.from('events').update(input as Updatable<'events'>).eq('id', id)
  if (error) throw error

  if (organizingCommitteeIds) await setOrganizingCommittees(supabase, id, organizingCommitteeIds)

  if (subEvents) {
    const { error: delErr } = await supabase.from('sub_events').delete().eq('event_id', id)
    if (delErr) throw delErr
    if (subEvents.length > 0) {
      const { error: insErr } = await supabase
        .from('sub_events')
        .insert(subEvents.map((s) => ({ ...s, event_id: id })))
      if (insErr) throw insErr
    }
  }

  const updated = await getEventById(id)
  if (!updated) throw new Error('Evento no encontrado tras actualizar')
  return updated
}

type PaymentStatus = 'pending' | 'paid' | 'exempted' | 'expired'

/**
 * Precio aplicable y exención para inscribir a un miembro:
 *  - Si el miembro es servidor activo de un comité organizador y el evento exime
 *    a servidores (servers_pay=false) → exento.
 *  - Si es servidor y server_price está definido → ese precio; si no, payment_amount.
 *  - Caso normal → payment_amount.
 */
export async function registrationPricing(
  eventId: string,
  memberId: string,
): Promise<{ requiresPayment: boolean; isServer: boolean; exempt: boolean; price: number; currency: string }> {
  const supabase = createAdminClient()
  const { data: ev } = await supabase
    .from('events')
    .select('requires_payment, payment_amount, server_price, servers_pay, currency')
    .eq('id', eventId).maybeSingle()
  const e = (ev ?? {}) as { requires_payment?: boolean; payment_amount?: number | null; server_price?: number | null; servers_pay?: boolean; currency?: string | null }
  const requiresPayment = !!e.requires_payment
  // INT-2: los cobros del evento heredan su moneda.
  const currency = e.currency ?? 'CRC'
  if (!requiresPayment) return { requiresPayment: false, isServer: false, exempt: false, price: 0, currency }

  const committeeIds = await eventOrganizingCommitteeIds(eventId)
  // Solo evaluamos "servidor" si hay comités (sin comités no hay servidores que distinguir).
  const isServer = committeeIds.length > 0 ? await memberServesAnyCommittee(memberId, committeeIds) : false
  const serversExempt = e.servers_pay === false
  if (isServer && serversExempt) return { requiresPayment, isServer, exempt: true, price: 0, currency }
  const base = e.payment_amount ?? 0
  const price = isServer && e.server_price != null ? e.server_price : base
  return { requiresPayment, isServer, exempt: false, price, currency }
}

export class EventFullError extends Error {
  constructor() { super('El evento ya alcanzó su capacidad máxima.') }
}
export class AlreadyRegisteredError extends Error {
  constructor() { super('El miembro ya está inscrito en este evento.') }
}

/** Inscribe a un miembro en un evento. UNIQUE(event_id, member_id) evita duplicados
 *  (se traduce a AlreadyRegisteredError). Controla cupo contra max_capacity.
 *  Si el evento es pago, exige pago completado (paid) o exención; los servidores
 *  exentos se inscriben como 'exempted' automáticamente.
 *
 *  Si el caller FUERZA payment_status a 'paid'/'exempted' (staff registrando una
 *  excepción manual), o el evento no requiere pago, o el miembro está exento:
 *  insert directo, como siempre. Si el evento requiere pago, no hay exención, y
 *  el caller no fuerza nada (autoservicio): la inscripción se RESERVA vía el RPC
 *  transaccional register_for_event (migración 121) — payment_status='pending',
 *  pendiente de comprobante, sin condición de carrera en el conteo de cupo. */
export async function createRegistration(
  eventId: string,
  input: {
    member_id: string; payment_status?: PaymentStatus; scholarship_id?: string; coupon_code?: string
    /** FRM-4: quién inscribió, si no fue la propia persona. NULL en el caso normal. */
    recorded_by?: string | null
  },
): Promise<{ id: string; amount: number }> {
  const supabase = createAdminClient()
  const pricing = await registrationPricing(eventId, input.member_id)

  const forced = input.payment_status === 'paid' || input.payment_status === 'exempted'
  const hasScholarshipInput = !!(input.scholarship_id || input.coupon_code)

  // FIN-4: con un TRACTO VENCIDO impago no se puede inscribir a un evento PAGO
  // (los gratuitos no se bloquean). Antes de FIN-4 los eventos no tenían ningún
  // guard de deuda. Se salta cuando el staff fuerza 'paid'/'exempted': ahí la
  // decisión de cobro ya la tomó una persona.
  if (!forced && pricing.requiresPayment && !pricing.exempt) {
    const { getOverdueInstallments } = await import('./payment-plans')
    const { overdueBlockMessage } = await import('@/lib/finance/installments')
    const { ymdCR } = await import('@/lib/format')
    const vencidos = await getOverdueInstallments(input.member_id, ymdCR())
    if (vencidos.length > 0) throw new Error(`TRACTO_VENCIDO:${overdueBlockMessage(vencidos)}`)
  }

  // Beca/cupón (opcional): recalcula el precio ANTES de reservar/insertar. Se
  // consume incluso si el resultado queda en ₡0 (mismo criterio que matrícula).
  let appliedScholarship: { id: string; kind: 'asignada' | 'generica' } | null = null
  let finalAmount = pricing.price
  if (!forced && pricing.requiresPayment && !pricing.exempt && hasScholarshipInput) {
    const { resolveScholarshipForApplication, computeDiscountedAmount } = await import('./scholarships')
    const resolved = await resolveScholarshipForApplication(input.member_id, 'event', eventId, input)
    finalAmount = computeDiscountedAmount(pricing.price, resolved.discount_type, resolved.discount_value)
    appliedScholarship = { id: resolved.id, kind: resolved.kind }
  }

  if (appliedScholarship && finalAmount === 0) {
    // Descuento total: inscripción directa, sin comprobante ni reserva RPC.
    const { data, error } = await supabase
      .from('event_registrations')
      .insert({ event_id: eventId, member_id: input.member_id, payment_status: 'paid', recorded_by: input.recorded_by ?? null })
      .select('id').single()
    if (error) {
      if ((error as { code?: string }).code === '23505') throw new AlreadyRegisteredError()
      throw error
    }
    const { consumeScholarship } = await import('./scholarships')
    await consumeScholarship(appliedScholarship, input.member_id, 0, { eventRegistrationId: (data as { id: string }).id })
    return { id: (data as { id: string }).id, amount: 0 }
  }

  if (!forced && pricing.requiresPayment && !pricing.exempt) {
    const { data, error } = await supabase.rpc('register_for_event', {
      p_event_id: eventId, p_member_id: input.member_id,
    })
    if (error) throw error
    const result = data as { code: string; id?: string }
    if (result.code === 'event_full') throw new EventFullError()
    if (result.code === 'already_registered') throw new AlreadyRegisteredError()
    if (result.code === 'event_not_found') throw new Error('Evento no encontrado')
    const registrationId = result.id!

    if (appliedScholarship) {
      // El monto con descuento debe quedar fijo desde el registro (a diferencia
      // del camino sin beca, que crea el payment recién al subir el comprobante).
      await supabase.from('payments').insert({
        member_id: input.member_id, amount: finalAmount, currency: pricing.currency, payment_method: 'comprobante',
        concept: 'evento', event_registration_id: registrationId, entity_type: 'event',
        status: 'pending', scholarship_id: appliedScholarship.id,
      })
      const { consumeScholarship } = await import('./scholarships')
      await consumeScholarship(appliedScholarship, input.member_id, finalAmount, { eventRegistrationId: registrationId })
    }
    return { id: registrationId, amount: finalAmount }
  }

  let status: PaymentStatus = input.payment_status ?? 'pending'
  if (pricing.requiresPayment) {
    if (pricing.exempt) {
      status = 'exempted' // servidor exento del comité organizador
    } else if (status !== 'paid' && status !== 'exempted') {
      // Evento pago: la inscripción no se completa sin pago/exención.
      throw new PaymentRequiredError()
    }
  }

  // Control de cupo (best-effort: check-then-insert; sin constraint en BD una
  // carrera exacta puede pasarse por 1, pero cierra el caso normal de overbooking).
  // Excluye 'expired' (cupo liberado tras rechazo sin resubir, migración 121).
  const { data: ev } = await supabase
    .from('events').select('max_capacity').eq('id', eventId).maybeSingle()
  const maxCapacity = (ev as { max_capacity: number | null } | null)?.max_capacity
  if (maxCapacity != null && maxCapacity > 0) {
    const { count } = await supabase
      .from('event_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .in('payment_status', ['pending', 'paid', 'exempted'])
    if ((count ?? 0) >= maxCapacity) throw new EventFullError()
  }

  const { data, error } = await supabase
    .from('event_registrations')
    .insert({ event_id: eventId, member_id: input.member_id, payment_status: status, recorded_by: input.recorded_by ?? null })
    .select('id')
    .single()
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new AlreadyRegisteredError()
    throw error
  }
  return { id: (data as { id: string }).id, amount: pricing.price }
}

/** Cambia el estado de pago de una inscripción. */
export async function updateRegistrationPayment(
  eventId: string,
  memberId: string,
  paymentStatus: PaymentStatus,
): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('event_registrations')
    .update({ payment_status: paymentStatus })
    .eq('event_id', eventId)
    .eq('member_id', memberId)
  if (error) throw error
}

/** Elimina la inscripción de un miembro en un evento. */
export async function deleteRegistration(eventId: string, memberId: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('event_registrations')
    .delete()
    .eq('event_id', eventId)
    .eq('member_id', memberId)
  if (error) throw error
}

/** Libera cupos "atascados": inscripciones a evento con pago rechazado hace más
 *  de 72h que no resubieron. Para el cron de expiración (espejo de
 *  expirePendingStudyEnrollments en studies.ts). */
export async function expirePendingEventRegistrations(): Promise<{ expired: number }> {
  const supabase = createAdminClient()
  const cutoff = new Date(Date.now() - 72 * 3600 * 1000).toISOString()

  const { data: candidates } = await supabase
    .from('payments')
    .select('event_registration_id')
    .eq('concept', 'evento').eq('review_status', 'rechazado')
    .lt('reviewed_at', cutoff)
    .not('event_registration_id', 'is', null)
  const regIds = [...new Set(
    (candidates ?? [])
      .map((p: { event_registration_id: string | null }) => p.event_registration_id)
      .filter((rid): rid is string => !!rid),
  )]
  if (regIds.length === 0) return { expired: 0 }

  // Excluir las que ya tienen un comprobante MÁS NUEVO en revisión (resubieron a tiempo).
  const { data: reReviewed } = await supabase
    .from('payments').select('event_registration_id')
    .in('event_registration_id', regIds).eq('review_status', 'en_revision')
  const reReviewedIds = new Set(
    (reReviewed ?? [])
      .map((r: { event_registration_id: string | null }) => r.event_registration_id)
      .filter((rid): rid is string => !!rid),
  )
  const stillPending = regIds.filter(id => !reReviewedIds.has(id))
  if (stillPending.length === 0) return { expired: 0 }

  const { data, error } = await supabase
    .from('event_registrations')
    .update({ payment_status: 'expired' })
    .in('id', stillPending)
    .eq('payment_status', 'pending')
    .select('id')
  if (error) throw error
  return { expired: (data ?? []).length }
}

// ── Tipos de evento (catálogo event_types) ─────────────────

export type DbEventType = {
  id: string
  name: string
  color: string
  icon: string
  description: string | null
  is_active: boolean
}

export async function getEventTypes(): Promise<DbEventType[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('event_types')
    .select('id, name, color, icon, description, is_active')
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as DbEventType[]
}

export async function createEventType(input: {
  id: string; name: string; color?: string; icon?: string; description?: string | null; is_active?: boolean
}): Promise<DbEventType> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('event_types')
    .insert({
      id: input.id,
      name: input.name,
      color: input.color ?? '#161440',
      icon: input.icon ?? 'calendar',
      description: input.description ?? null,
      is_active: input.is_active ?? true,
    })
    .select('id, name, color, icon, description, is_active')
    .single()
  if (error) throw error
  return data as DbEventType
}

export async function updateEventType(
  id: string,
  patch: Partial<Omit<DbEventType, 'id'>>,
): Promise<DbEventType> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('event_types')
    .update(patch)
    .eq('id', id)
    .select('id, name, color, icon, description, is_active')
    .single()
  if (error) throw error
  return data as DbEventType
}

type VolunteerStatus = 'confirmed' | 'pending' | 'cancelled'

/** Asigna un servidor (voluntario) a un evento. UNIQUE(event_id, member_id). */
/**
 * ¿El miembro es servidor ACTIVO del comité (o de una sub-área del comité)?
 * `committee` viene de la relación m2m `event_organizing_committees` (id de área,
 * vía eventOrganizingCommitteeIds). Se acepta también un nombre de área por
 * compatibilidad. Si no se resuelve a ningún área no se puede validar → se
 * permite (regla permisiva).
 */
export async function memberServesCommittee(memberId: string, committee: string): Promise<boolean> {
  const supabase = createAdminClient()
  // `committee` normalmente es el id del área-comité; se acepta también el nombre.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(committee)
  let committeeAreaId: string | null = isUuid ? committee : null
  if (!committeeAreaId) {
    const { data: area } = await supabase.from('areas').select('id').eq('name', committee).maybeSingle()
    committeeAreaId = (area as { id: string } | null)?.id ?? null
  }
  if (!committeeAreaId) return true // no resoluble → no validable → permisivo

  const { data, error } = await supabase
    .from('volunteers')
    .select('id, position:service_positions!inner(area:areas!service_positions_area_id_fkey!inner(id, parent_id))')
    .eq('member_id', memberId)
    .eq('status', 'active')
  if (error) throw error
  return ((data ?? []) as Array<{ position: { area: { id: string; parent_id: string | null } | null } | null }>)
    .some(v => { const a = v.position?.area; return !!a && (a.id === committeeAreaId || a.parent_id === committeeAreaId) })
}

/** ¿El miembro sirve en ALGUNO de los comités dados? Sin comités → permisivo (true). */
export async function memberServesAnyCommittee(memberId: string, committeeIds: string[]): Promise<boolean> {
  const ids = committeeIds.filter(Boolean)
  if (ids.length === 0) return true // evento sin comités organizadores → permisivo
  for (const c of ids) {
    if (await memberServesCommittee(memberId, c)) return true
  }
  return false
}

/** Ids de los comités organizadores de un evento (m2m). */
export async function eventOrganizingCommitteeIds(eventId: string): Promise<string[]> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('event_organizing_committees').select('committee_id').eq('event_id', eventId)
  return ((data ?? []) as Array<{ committee_id: string }>).map((r) => r.committee_id)
}

/** Error de validación: la persona no pertenece a ningún comité organizador. */
export class NotCommitteeServerError extends Error {
  constructor(msg = 'La persona no es servidora activa de ningún comité organizador del evento.') { super(msg); this.name = 'NotCommitteeServerError' }
}

/** Error: el evento es pago y la inscripción no completó el pago. */
export class PaymentRequiredError extends Error {
  constructor(msg = 'Este evento requiere pago: la inscripción solo se completa marcándola como pagada o exenta.') { super(msg); this.name = 'PaymentRequiredError' }
}

export async function createVolunteer(
  eventId: string,
  input: { member_id: string; role?: string | null; status?: VolunteerStatus },
): Promise<{ id: string }> {
  const supabase = createAdminClient()
  // Validación 2: solo servidores activos de los comités organizadores. Eventos
  // sin comités organizadores → sin restricción (permisivo).
  const committeeIds = await eventOrganizingCommitteeIds(eventId)
  if (!(await memberServesAnyCommittee(input.member_id, committeeIds))) {
    throw new NotCommitteeServerError()
  }
  const { data, error } = await supabase
    .from('event_volunteers')
    .insert({ event_id: eventId, member_id: input.member_id, role: input.role ?? null, status: input.status ?? 'pending' })
    .select('id')
    .single()
  if (error) throw error
  return data as { id: string }
}

/** Quita la asignación de un servidor en un evento. */
export async function deleteVolunteer(eventId: string, memberId: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('event_volunteers')
    .delete()
    .eq('event_id', eventId)
    .eq('member_id', memberId)
  if (error) throw error
}

/** Registra un check-in en un evento. attendance_type NO se persiste: se deriva
 *  al leer (es "server" si el miembro es voluntario del evento). */
export class NotRegisteredError extends Error {
  constructor() { super('Este evento es pago: la persona debe estar inscrita antes del check-in.') }
}

export async function createCheckin(
  eventId: string,
  input: { member_id?: string | null; guest_name?: string | null; sub_event_id?: string | null; method?: 'manual' | 'qr' | 'smart_link' },
): Promise<{ id: string }> {
  const supabase = createAdminClient()

  // Gate ÚNICO server-side (Fase 1): en un evento PAGO el check-in exige que la
  // persona ya tenga inscripción (cualquier payment_status). Antes esto vivía
  // solo en el cliente y los caminos divergían (QR bloqueaba, familia no) — el
  // servidor no lo validaba. Ahora es la fuente de verdad para los 3 métodos.
  if (input.member_id) {
    const { data: ev } = await supabase
      .from('events').select('requires_payment').eq('id', eventId).maybeSingle()
    if ((ev as { requires_payment?: boolean } | null)?.requires_payment) {
      const { data: reg } = await supabase
        .from('event_registrations').select('id')
        .eq('event_id', eventId).eq('member_id', input.member_id).limit(1).maybeSingle()
      if (!reg) throw new NotRegisteredError()
    }
  }

  const { data, error } = await supabase
    .from('event_checkins')
    .insert({
      event_id: eventId,
      member_id: input.member_id ?? null,
      guest_name: input.guest_name ?? null,
      sub_event_id: input.sub_event_id ?? null,
      method: input.method ?? 'manual',
    })
    .select('id')
    .single()
  if (error) throw error
  return data as { id: string }
}

export type OnsiteChargeMode = 'pending' | 'verified'

/** Fase 2 — Cobro en sitio + check-in para eventos pagos.
 *  Cuando alguien llega al evento SIN inscripción previa, el encargado cobra en
 *  el momento y hace el check-in sin bloquear la fila. Dos caminos:
 *   - 'pending'  → "Enviar cobro a la persona": inscribe con payment_status
 *     'pending' + crea el pago pendiente por comprobante (cae en la cola de
 *     finanzas como pendiente). El check-in queda hecho; el pago se concilia
 *     después cuando la persona sube el comprobante y finanzas lo aprueba.
 *   - 'verified' → "Marcar pago verificado en sitio": el encargado YA vio el
 *     comprobante en el celular de la persona. Inscribe con payment_status
 *     'paid' + pago aprobado, con traza de quién (recorded_by/reviewed_by) y
 *     cuándo. NO es un check-in gratis: el pago queda reflejado como aprobado.
 *  Ambos caminos hacen el check-in de una vez y usan el método actual
 *  (comprobante); dejar `payment_method` como parámetro deja lista la estructura
 *  para sumar otro método (Tilopay) sin rehacer. Servidor exento o evento sin
 *  costo → se inscribe/hace check-in sin cobro. Idempotente: si la persona ya
 *  estaba inscrita, reutiliza su inscripción y no duplica el pago. */
export async function onsiteChargeAndCheckin(
  eventId: string,
  input: {
    member_id: string
    mode: OnsiteChargeMode
    method?: 'manual' | 'qr' | 'smart_link'
    sub_event_id?: string | null
    actor_member_id?: string | null
  },
): Promise<{
  checkin_id: string
  registration_id: string | null
  amount: number
  exempt: boolean
  charged: boolean
  mode: OnsiteChargeMode
}> {
  const supabase = createAdminClient()
  const { member_id, mode } = input
  const actor = input.actor_member_id ?? null
  const now = new Date().toISOString()

  const pricing = await registrationPricing(eventId, member_id)

  // ¿Ya estaba inscrita? (idempotencia: el gate solo debería mandar aquí a NO
  // inscritos, pero si por carrera ya existe, la reutilizamos sin duplicar).
  const { data: existing } = await supabase
    .from('event_registrations').select('id')
    .eq('event_id', eventId).eq('member_id', member_id).limit(1).maybeSingle()
  let registrationId: string | null = (existing as { id: string } | null)?.id ?? null

  // Evento sin costo real (gratis o servidor exento): inscribe (exento cuando
  // aplica) y hace check-in, SIN generar cobro.
  const noCharge = !pricing.requiresPayment || pricing.exempt

  if (!registrationId) {
    if (noCharge) {
      if (pricing.requiresPayment) {
        // Servidor exento de un evento pago → inscripción 'exempted'.
        const r = await createRegistration(eventId, { member_id, payment_status: 'exempted' })
        registrationId = r.id
      }
      // Evento gratis: no hace falta inscripción para el check-in (no hay gate).
    } else if (mode === 'verified') {
      const r = await createRegistration(eventId, { member_id, payment_status: 'paid' })
      registrationId = r.id
    } else {
      // 'pending': reserva la inscripción vía RPC (payment_status='pending').
      const r = await createRegistration(eventId, { member_id })
      registrationId = r.id
    }
  }

  // Pago (solo si hay costo real). Evita duplicar si ya hay un pago para la
  // inscripción (misma lógica que auto-matrícula).
  let charged = false
  if (!noCharge && registrationId) {
    const { data: existingPay } = await supabase
      .from('payments').select('id')
      .eq('event_registration_id', registrationId).limit(1).maybeSingle()
    if (!existingPay) {
      const base = {
        member_id,
        amount: pricing.price,
        currency: pricing.currency,
        // Único método por ahora; cuando entre Tilopay, este valor pasa a venir
        // del camino elegido (comprobante | tilopay) sin tocar el resto del flujo.
        payment_method: 'comprobante',
        concept: 'evento',
        entity_type: 'event',
        event_registration_id: registrationId,
        recorded_by: actor,
      }
      const row = mode === 'verified'
        ? {
            ...base,
            status: 'paid',
            review_status: 'aprobado',
            reviewed_by: actor,
            reviewed_at: now,
            paid_at: now,
            description: 'Cobro verificado en sitio (check-in de evento)',
          }
        : {
            ...base,
            status: 'pending',
            description: 'Cobro en sitio pendiente de comprobante (check-in de evento)',
          }
      const { error: payErr } = await supabase.from('payments').insert(row)
      if (payErr) {
        // Sin pago no puede quedar la inscripción pagada/pendiente huérfana en
        // 'verified' (desbalancea finanzas): revertimos la inscripción que
        // creamos aquí y propagamos el error (no check-in silencioso).
        if (!existing) await supabase.from('event_registrations').delete().eq('id', registrationId)
        throw payErr
      }
      charged = true
    }
  }

  const checkin = await createCheckin(eventId, {
    member_id,
    sub_event_id: input.sub_event_id ?? null,
    method: input.method ?? 'manual',
  })

  return {
    checkin_id: checkin.id,
    registration_id: registrationId,
    amount: noCharge ? 0 : pricing.price,
    exempt: pricing.exempt,
    charged,
    mode,
  }
}

/** Deshace un check-in: borra la fila de event_checkins. Borrado duro — el
 *  check-in no requiere auditoría (se puede volver a registrar). Acotado al
 *  evento para evitar borrar de otro evento por un id ajeno. */
export async function deleteCheckin(eventId: string, checkinId: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.from('event_checkins').delete().eq('id', checkinId).eq('event_id', eventId)
  if (error) throw error
}

/** Cancela un evento: status='cancelled' + motivo. No borra (conserva inscritos/check-ins). */
export async function cancelEvent(id: string, reason: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.from('events').update({ status: 'cancelled', cancellation_reason: reason || null }).eq('id', id)
  if (error) throw error
}

/** Borrado lógico: marca is_active=false. El borrado duro lo hace el cascade. */
export async function deleteEvent(id: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.from('events').update({ is_active: false }).eq('id', id)
  if (error) throw error
}

// ── Recurrentes: edición/eliminación por alcance (estilo Google Calendar) ──────

export type EventScope = 'all' | 'future' | 'single'

/** Datos de la ocurrencia sobre la que se actúa. `date` = YYYY-MM-DD en hora CR
 *  (lo calcula el cliente, que conoce la zona); `start` = ISO de su inicio real. */
export type OccurrenceRef = { date: string; start: string }

export class EventHasAttendanceError extends Error {
  constructor(msg = 'No se puede eliminar un evento que tiene check-ins o inscripciones registrados. Cancelalo en su lugar.') {
    super(msg); this.name = 'EventHasAttendanceError'
  }
}

/** ¿Cuántos check-ins + inscripciones tiene un evento (fila real)? */
async function countAttendance(
  supabase: ReturnType<typeof createAdminClient>,
  eventId: string,
): Promise<number> {
  const [ch, rg] = await Promise.all([
    supabase.from('event_checkins').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
    supabase.from('event_registrations').select('member_id', { count: 'exact', head: true }).eq('event_id', eventId),
  ])
  return (ch.count ?? 0) + (rg.count ?? 0)
}

/** Snapshot de un evento (DB) a campos escribibles, para clonar overrides / nuevos padres. */
function toWriteInput(e: DbEventEnriched): EventWriteInput {
  return {
    title: e.title,
    description: e.description,
    event_type: e.event_type,
    location: e.location,
    location_url: e.location_url,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    is_recurring: e.is_recurring,
    recurrence_rule: e.recurrence_rule,
    recurrence_end: e.recurrence_end,
    max_capacity: e.max_capacity,
    flyer_url: e.flyer_url,
    is_virtual: e.is_virtual,
    virtual_url: e.virtual_url,
    requires_registration: e.requires_registration,
    is_public: e.is_public ?? true,
    requires_payment: e.requires_payment,
    payment_amount: e.payment_amount,
    currency: e.currency,
    sede_id: e.sede_id,
    server_price: e.server_price,
    servers_pay: e.servers_pay,
    requires_survey: e.requires_survey,
    status: e.status,
  }
}

function parentSubEvents(e: DbEventEnriched): SubEventInput[] {
  return e.sub_events.map((s) => ({ name: s.name, max_capacity: s.max_capacity }))
}

function parentCommitteeIds(e: DbEventEnriched): string[] {
  return e.organizing_committees.map((c) => c.committee_id)
}

/**
 * Edita un evento recurrente según el alcance:
 *  - all: actualiza el padre (toda la serie).
 *  - future: pone UNTIL en el padre (termina antes de la ocurrencia) y crea un
 *    nuevo padre desde esa fecha con la misma RRULE + los cambios.
 *  - single: crea un evento puntual override con los cambios y registra la
 *    excepción (override_event_id) para esa fecha.
 */
export async function updateEventScoped(
  id: string,
  scope: EventScope,
  input: Partial<EventWriteInput>,
  subEvents: SubEventInput[] | undefined,
  occurrence: OccurrenceRef | null,
  createdBy?: string | null,
  organizingCommitteeIds?: string[],
): Promise<DbEventEnriched> {
  if (scope === 'all' || !occurrence) return updateEvent(id, input, subEvents, organizingCommitteeIds)

  const supabase = createAdminClient()
  const parent = await getEventById(id)
  if (!parent) throw new Error('Evento no encontrado')
  const base = toWriteInput(parent)
  const subs = subEvents ?? parentSubEvents(parent)
  const committees = organizingCommitteeIds ?? parentCommitteeIds(parent)

  if (scope === 'single') {
    const overrideInput: EventWriteInput = {
      ...base, ...input,
      is_recurring: false, recurrence_rule: null, recurrence_end: null,
      parent_event_id: id,
    }
    const override = await createEvent(overrideInput, subs, createdBy, committees)
    const { error } = await supabase.from('event_exceptions').upsert(
      { parent_event_id: id, exception_date: occurrence.date, override_event_id: override.id },
      { onConflict: 'parent_event_id,exception_date' },
    )
    if (error) {
      // A15: sin la excepción, la ocurrencia original sigue visible y el
      // override queda suelto → evento duplicado en el calendario. Compensar
      // borrando el override recién creado.
      await supabase.from('events').delete().eq('id', override.id)
      throw error
    }
    return override
  }

  // scope === 'future': crear el NUEVO padre PRIMERO y truncar el viejo
  // después — si el create falla, la serie original queda intacta (antes se
  // truncaba primero y un fallo amputaba las ocurrencias futuras sin
  // reemplazo). Si lo que falla es el truncado, se revierte el nuevo padre.
  const until = new Date(new Date(occurrence.start).getTime() - 1000).toISOString()
  const newParentInput: EventWriteInput = {
    ...base, ...input,
    is_recurring: true,
    recurrence_rule: input.recurrence_rule ?? parent.recurrence_rule,
    recurrence_end: parent.recurrence_end ?? null, // conserva el fin original de la serie
    parent_event_id: null,
  }
  const newParent = await createEvent(newParentInput, subs, createdBy, committees)
  const { error: upErr } = await supabase.from('events').update({ recurrence_end: until }).eq('id', id)
  if (upErr) {
    await supabase.from('events').delete().eq('id', newParent.id)
    throw upErr
  }
  return newParent
}

/**
 * Elimina un evento recurrente según el alcance:
 *  - all: borra el evento (cascade limpia hijos y excepciones). También borra
 *    sus overrides. Bloquea si hay check-ins/inscripciones.
 *  - future: pone UNTIL en el padre (sin crear nuevo padre).
 *  - single: registra la excepción cancelada (override_event_id null); si había
 *    un override, lo borra (bloquea si tenía asistencia).
 * Para eventos no recurrentes usar scope 'all'.
 */
export async function deleteEventScoped(
  id: string,
  scope: EventScope,
  occurrence: OccurrenceRef | null,
): Promise<void> {
  const supabase = createAdminClient()

  if (scope === 'single' && occurrence) {
    const { data: existing } = await supabase
      .from('event_exceptions').select('override_event_id')
      .eq('parent_event_id', id).eq('exception_date', occurrence.date).maybeSingle()
    const prevOverride = (existing as { override_event_id: string | null } | null)?.override_event_id
    if (prevOverride) {
      if (await countAttendance(supabase, prevOverride) > 0) throw new EventHasAttendanceError()
      await supabase.from('events').delete().eq('id', prevOverride)
    }
    const { error } = await supabase.from('event_exceptions').upsert(
      { parent_event_id: id, exception_date: occurrence.date, override_event_id: null },
      { onConflict: 'parent_event_id,exception_date' },
    )
    if (error) throw error
    return
  }

  if (scope === 'future' && occurrence) {
    const until = new Date(new Date(occurrence.start).getTime() - 1000).toISOString()
    const { error } = await supabase.from('events').update({ recurrence_end: until }).eq('id', id)
    if (error) throw error
    return
  }

  // scope === 'all' (o evento no recurrente): borrado duro con guard de asistencia.
  if (await countAttendance(supabase, id) > 0) throw new EventHasAttendanceError()
  // Overrides de la serie (eventos puntuales hijos): borrarlos también, con guard.
  const { data: overrides } = await supabase.from('events').select('id').eq('parent_event_id', id)
  for (const o of ((overrides ?? []) as Array<{ id: string }>)) {
    if (await countAttendance(supabase, o.id) > 0) throw new EventHasAttendanceError()
  }
  if (overrides && overrides.length > 0) {
    await supabase.from('events').delete().in('id', (overrides as Array<{ id: string }>).map((o) => o.id))
  }
  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) throw error
}

// Re-exportamos tipos de dominio usados por el adapter
export type { AttendanceType }

// ── Encargados de un evento (FRM-1 parte B, 2026-08-06) ─────────────────────
// Permiso sobre UN evento, no un rol: la decisión de autorización vive en
// src/lib/auth/events-scope.ts (pura); acá solo se leen y escriben las filas.

export type EventManager = {
  id: string
  event_id: string
  member_id: string
  member_name: string
  member_email: string | null
  granted_by_name: string | null
  granted_at: string
}

/** ¿Esta persona es encargada de ESTE evento? */
export async function isEventManager(eventId: string, memberId: string | null): Promise<boolean> {
  if (!memberId) return false
  const supabase = createAdminClient() as unknown as SupabaseClient
  const { data, error } = await supabase
    .from('event_managers').select('id')
    .eq('event_id', eventId).eq('member_id', memberId).maybeSingle()
  if (error) { console.warn('isEventManager:', error.message); return false }
  return !!data
}

/** Eventos que esta persona tiene a cargo (para acotar listados y el menú). */
export async function getManagedEventIds(memberId: string | null): Promise<string[]> {
  if (!memberId) return []
  const supabase = createAdminClient() as unknown as SupabaseClient
  const { data, error } = await supabase
    .from('event_managers').select('event_id').eq('member_id', memberId)
  if (error) { console.warn('getManagedEventIds:', error.message); return [] }
  return ((data ?? []) as Array<{ event_id: string }>).map(r => r.event_id)
}

/** ¿Es encargada del evento AL QUE PERTENECE este formulario? Es la herencia:
 *  el formulario de un evento lo ve y lo edita quien tiene el evento a cargo. */
export async function isManagerOfFormEvent(formId: string, memberId: string | null): Promise<boolean> {
  if (!memberId) return false
  const supabase = createAdminClient() as unknown as SupabaseClient
  const { data } = await supabase
    .from('forms').select('entity_type, entity_id').eq('id', formId).maybeSingle()
  const f = data as { entity_type: string | null; entity_id: string | null } | null
  if (f?.entity_type !== 'event' || !f.entity_id) return false
  return isEventManager(f.entity_id, memberId)
}

export async function getEventManagers(eventId: string): Promise<EventManager[]> {
  const supabase = createAdminClient() as unknown as SupabaseClient
  const { data, error } = await supabase
    .from('event_managers')
    .select(`
      id, event_id, member_id, granted_at,
      member:members!event_managers_member_id_fkey(first_name, last_name, email),
      granter:members!event_managers_granted_by_fkey(first_name, last_name)
    `)
    .eq('event_id', eventId).order('granted_at', { ascending: true })
  if (error) throw error
  type Row = {
    id: string; event_id: string; member_id: string; granted_at: string
    member: { first_name: string; last_name: string; email: string | null } | null
    granter: { first_name: string; last_name: string } | null
  }
  return ((data ?? []) as unknown as Row[]).map(r => ({
    id: r.id,
    event_id: r.event_id,
    member_id: r.member_id,
    member_name: [r.member?.first_name, r.member?.last_name].filter(Boolean).join(' ') || '—',
    member_email: r.member?.email ?? null,
    granted_by_name: r.granter ? [r.granter.first_name, r.granter.last_name].filter(Boolean).join(' ') : null,
    granted_at: r.granted_at,
  }))
}

/** Alta idempotente: repetir el mismo encargado no falla ni duplica (UNIQUE). */
export async function grantEventManager(
  eventId: string, memberId: string, grantedBy: string | null,
): Promise<void> {
  const supabase = createAdminClient() as unknown as SupabaseClient
  const { error } = await supabase.from('event_managers')
    .upsert({ event_id: eventId, member_id: memberId, granted_by: grantedBy },
      { onConflict: 'event_id,member_id', ignoreDuplicates: true })
  if (error) throw error
}

export async function revokeEventManager(eventId: string, memberId: string): Promise<void> {
  const supabase = createAdminClient() as unknown as SupabaseClient
  const { error } = await supabase.from('event_managers')
    .delete().eq('event_id', eventId).eq('member_id', memberId)
  if (error) throw error
}
