// Adapta una fila `DbEventEnriched` (Supabase + relaciones) al tipo de dominio
// `AdminEvent` que consumen las páginas de eventos y calendario.

import type { DbEventEnriched } from '@/lib/supabase/queries/events'
import type { AdminEvent, EventType, AttendanceType } from '@/types/event'

function fullName(m: { first_name: string; last_name: string } | null): string {
  if (!m) return ''
  return `${m.first_name} ${m.last_name}`.trim()
}

export function toDomainEvent(db: DbEventEnriched): AdminEvent {
  return {
    id: db.id,
    name: db.title,
    event_type: db.event_type as EventType,
    description: db.description ?? '',
    start_at: db.starts_at,
    end_at: db.ends_at ?? db.starts_at,
    location: db.location ?? '',
    location_map_url: db.location_url,
    is_virtual: db.is_virtual,
    virtual_url: db.virtual_url ?? null,
    requires_registration: db.requires_registration,
    is_public: db.is_public ?? true,
    max_capacity: db.max_capacity, // null = sin límite
    requires_payment: db.requires_payment,
    payment_amount: db.payment_amount,
    currency: db.currency ?? 'CRC',
    sede_id: db.sede_id ?? null,
    server_price: db.server_price ?? null,
    servers_pay: db.servers_pay ?? true,
    organizing_committee_ids: (db.organizing_committees ?? []).map((c) => c.committee_id),
    requires_survey: db.requires_survey,
    registration_form_id: db.registration_form_id ?? null,
    survey_form_id: db.survey_form_id ?? null,
    survey_template_id: db.survey_template_id ?? null,
    survey_offset_hours: db.survey_offset_hours ?? null,
    survey_send_at: db.survey_send_at ?? null,
    survey_sent_at: db.survey_sent_at ?? null,
    survey_sent_count: db.survey_sent_count ?? 0,
    status: db.status,
    is_recurring: db.is_recurring,
    recurrence_rule: db.recurrence_rule,
    recurrence_end: db.recurrence_end,
    parent_event_id: db.parent_event_id,
    exception_dates: (db.exceptions ?? []).map((e) => e.exception_date),
    flyer_url: db.flyer_url,
    cancellation_reason: db.cancellation_reason,
    is_active: db.is_active,

    sub_events: db.sub_events.map((s) => ({
      id: s.id,
      name: s.name,
      max_capacity: s.max_capacity,
    })),

    registrations: db.registrations.map((r) => ({
      member_id: r.member_id,
      member_name: fullName(r.member),
      payment_status: r.payment_status,
      registered_at: r.registered_at,
      // Solo lo llena el DETALLE (getEventById); en la lista viene undefined.
      // Sin este campo, "pendiente" y "en revisión" no se pueden separar: los
      // dos son payment_status 'pending'.
      payment_in_review: r.payment_in_review ?? false,
      payment_in_review_id: r.payment_in_review_id ?? null,
    })),

    checkins: db.checkins.map((c) => ({
      id: c.id,
      member_id: c.member_id ?? '',
      member_name: fullName(c.member),
      attendance_type: (c.is_volunteer ? 'server' : 'participant') as AttendanceType,
      sub_event_id: c.sub_event_id,
      checked_at: c.checked_in_at,
      member_created_at: c.member?.created_at ?? null,
      member_first_checkin_at: c.member_first_checkin_at,
    })),

    volunteer_bookings: db.volunteers.map((v) => ({
      member_id: v.member_id,
      member_name: fullName(v.member),
      role: v.role ?? '',
      status: v.status,
    })),
  }
}
