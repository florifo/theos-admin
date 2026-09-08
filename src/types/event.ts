// Events domain types.

export type EventType = 'charla' | 'campamento' | 'social' | 'capacitacion'
export type EventStatus = 'upcoming' | 'in_progress' | 'finished' | 'cancelled' | 'archived'

/**
 * Payment status for event registrations.
 * Note: different from the finance PaymentStatus in @/types/finance.
 */
export type EventPaymentStatus = 'pending' | 'paid' | 'exempted' | 'expired'

export type AttendanceType = 'participant' | 'server'

export type SubEvent = {
  id: string
  name: string
  max_capacity: number
}

export type EventRegistration = {
  member_id: string
  member_name: string
  payment_status: EventPaymentStatus
  registered_at: string
  /**
   * El comprobante está subido esperando a finanzas. Solo lo llena el DETALLE
   * de un evento; en la lista viene false.
   *
   * No se puede deducir de payment_status: ese se queda en 'pending' desde que
   * la persona se inscribe hasta que finanzas aprueba, así que "no subió
   * comprobante" y "ya lo subió" son el mismo valor. Mostrar "Pendiente" en los
   * dos casos fue un reclamo real (2026-08-27).
   */
  payment_in_review: boolean
  /** Id del pago en revisión, para abrir su comprobante. null si no hay. */
  payment_in_review_id: string | null
}

export type EventCheckin = {
  id: string
  member_id: string
  member_name: string
  attendance_type: AttendanceType
  sub_event_id: string | null
  checked_at: string
  /** Cuándo se creó la ficha de la persona. Sirve para contar a quien vino por
   *  primera vez (ficha creada el mismo día del evento). null en invitados sin
   *  ficha, y en la LISTA de eventos, que no trae este dato. */
  member_created_at?: string | null
}

export type VolunteerBooking = {
  member_id: string
  member_name: string
  role: string
  status: 'confirmed' | 'pending' | 'cancelled'
}

// Antes se llamaba MockEvent: es el evento REAL del dominio admin (el nombre
// era un residuo de la era de mocks y confundía).
export type AdminEvent = {
  id: string
  name: string
  event_type: EventType
  description: string
  start_at: string
  end_at: string
  location: string
  location_map_url: string | null
  is_virtual: boolean
  virtual_url: string | null
  requires_registration: boolean
  /** false = interno: solo por link directo o para quien gestiona eventos. */
  is_public: boolean
  /** null = sin límite de cupo (default). */
  max_capacity: number | null
  requires_payment: boolean
  payment_amount: number | null
  /** INT-2: moneda de payment_amount/server_price (CRC/USD/EUR). */
  currency: string
  /** INT-3: sede del evento (uuid); propone la moneda del cobro. */
  sede_id: string | null
  /** Precio para servidores de los comités organizadores. null = igual al normal. */
  server_price: number | null
  /** false = servidores del comité organizador exentos de pago. */
  servers_pay: boolean
  /** Ids de áreas-comité organizadoras (m2m). */
  organizing_committee_ids: string[]
  requires_survey: boolean
  /** EVE-4 · Formulario que se llena al inscribirse (null = sin formulario). */
  registration_form_id: string | null
  /** EVE-4 · Encuesta de satisfacción: destino, momento y sello del envío. */
  survey_form_id: string | null
  survey_template_id: string | null
  survey_offset_hours: number | null
  survey_send_at: string | null
  survey_sent_at: string | null
  survey_sent_count: number
  status: EventStatus
  is_recurring: boolean
  recurrence_rule: string | null
  recurrence_end: string | null
  parent_event_id: string | null
  /** Fechas (YYYY-MM-DD, hora CR) de ocurrencias exceptuadas de la serie: se
   *  excluyen de la expansión (canceladas o reemplazadas por un override). */
  exception_dates: string[]
  sub_events: SubEvent[]
  registrations: EventRegistration[]
  checkins: EventCheckin[]
  volunteer_bookings: VolunteerBooking[]
  cancellation_reason: string | null
  flyer_url: string | null
  /** false = evento de import histórico; va al calendario y a "Realizados", no a "Próximos". */
  is_active?: boolean
}

export type EventTypeEntry = {
  id: string
  name: string
  color: string
  icon: string
  description: string
  is_active: boolean
}
