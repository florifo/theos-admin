// Mapea el payload del form de eventos (nuevo/editar) a columnas DB + sub-eventos.

import type { EventWriteInput } from '@/lib/supabase/queries/events'
import { paredAIso, zonaValida } from './timezone'
import { computeSurveySendAt } from '@/lib/events/survey-schedule'

/** Combina fecha (YYYY-MM-DD) + hora (HH:mm) en un ISO timestamptz, o null.
 *
 *  La zona va EXPLÍCITA (-06:00, Costa Rica, que no tiene horario de verano).
 *  Antes se hacía `new Date("2026-08-27T10:00")`, sin zona: eso lo interpreta
 *  como hora LOCAL DEL SERVIDOR. En la máquina de desarrollo el servidor está
 *  en CR y salía bien; en Vercel corre en UTC, así que un evento puesto a las
 *  10:00 quedaba guardado como 10:00Z = 4:00 a.m. de Costa Rica. SEIS HORAS
 *  ANTES.
 *
 *  Y no era solo la hora mostrada: la inscripción se cierra cuando el evento
 *  empieza, así que se cerraba seis horas antes de lo que la gente esperaba —
 *  el evento desaparecía de la lista de elegibilidad y el botón "Inscribirme"
 *  no hacía nada. Por eso el bug era invisible en local y en los tests: solo
 *  se manifiesta cuando el servidor no está en la zona de Costa Rica.
 *
 *  El hermano `endOfDayCR` de abajo ya lo hacía bien; esta función se había
 *  quedado atrás. */
/* La hora que se teclea en el formulario es la hora LOCAL DEL EVENTO, no la de
 * quien la escribe: una charla de Madrid se define en hora de Madrid. Antes esto
 * era el literal '-06:00', que para Costa Rica es exacto y para España se corre
 * una hora medio año. */
function combineDateTime(zona: string, date?: string, time?: string): string | null {
  if (!date) return null
  return paredAIso(zona, date, time ?? '00:00')
}

/** Fin de la recurrencia: último día completo en que aplica (23:59:59 hora del
 *  evento), para que la ocurrencia de ese día no quede excluida. */
function endOfDay(zona: string, date?: string): string | null {
  if (!date) return null
  return paredAIso(zona, date, '23:59')
}

const num = (v: unknown) => (v === '' || v == null ? null : Number(v))

/** Ids de comités organizadores (m2m). El form envía `organizing_committee_ids`. */
export function formToOrganizingCommittees(body: Record<string, unknown>): string[] {
  return Array.isArray(body.organizing_committee_ids)
    ? (body.organizing_committee_ids as unknown[]).filter((x): x is string => typeof x === 'string')
    : []
}

export function formToSubEvents(body: Record<string, unknown>): { name: string; max_capacity: number }[] {
  return Array.isArray(body.sub_events)
    ? (body.sub_events as Array<{ name: string; max_capacity: unknown }>).map((s) => ({
        name: s.name,
        max_capacity: Number(s.max_capacity) || 0,
      }))
    : []
}

/** Payload completo para crear. */
export function formToWriteInput(body: Record<string, unknown>): EventWriteInput {
  const zona = zonaValida(body.timezone as string)
  return {
    title: String(body.name ?? ''),
    event_type: String(body.event_type ?? ''),
    description: (body.description as string) || null,
    timezone: zona,
    starts_at: combineDateTime(zona, body.start_date as string, body.start_time as string) ?? new Date().toISOString(),
    ends_at: combineDateTime(zona, body.end_date as string, body.end_time as string),
    location: (body.location as string) || null,
    location_url: (body.location_map_url as string) || null,
    is_virtual: Boolean(body.is_virtual),
    virtual_url: (body.virtual_link as string) || null,
    is_recurring: Boolean(body.is_recurring),
    recurrence_rule: (body.recurrence_rule as string) || null,
    recurrence_end: endOfDay(zona, body.recurrence_end as string),
    requires_registration: Boolean(body.requires_registration),
    // Sin el campo en el body se asume PÚBLICO, que es el default de la columna
    // y lo que hacían todos los eventos hasta ahora.
    is_public: body.is_public === undefined ? true : Boolean(body.is_public),
    max_capacity: num(body.max_capacity),
    requires_payment: Boolean(body.requires_payment),
    payment_amount: num(body.payment_amount),
    // INT-2: moneda del costo; valores fuera del CHECK caen a CRC.
    currency: ['CRC', 'USD', 'EUR'].includes(body.currency as string) ? (body.currency as string) : 'CRC',
    // INT-3: sede del evento (propone la moneda en el formulario).
    sede_id: (body.sede_id as string) || null,
    server_price: num(body.server_price),
    servers_pay: body.servers_pay === undefined ? true : Boolean(body.servers_pay),
    requires_survey: Boolean(body.has_satisfaction_survey),
    flyer_url: (body.flyer as string) || null,
    status: 'upcoming',
    ...formToSurvey(body),
  }
}

/** EVE-4 · Formulario de inscripción y programación de la encuesta.
 *
 *  El MOMENTO se guarda calculado (survey_send_at), no solo la regla: es lo que
 *  mira el cron y así el envío es predecible. La regla (survey_offset_hours)
 *  también se guarda, para poder mostrarla y recalcular si mueven el evento. */
export function formToSurvey(body: Record<string, unknown>): Pick<EventWriteInput,
  'registration_form_id' | 'survey_form_id' | 'survey_template_id' | 'survey_offset_hours' | 'survey_send_at'> {
  const id = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const requiere = Boolean(body.has_satisfaction_survey)
  if (!requiere) {
    // Sin encuesta se limpia todo: si la apagaron, no debe quedar un envío
    // programado esperando en la base.
    return {
      registration_form_id: id(body.registration_form_id),
      survey_form_id: null, survey_template_id: null,
      survey_offset_hours: null, survey_send_at: null,
    }
  }
  const endsAt = combineDateTime(zonaValida(body.timezone as string), body.end_date as string, body.end_time as string)
  const offset = body.survey_offset_hours == null || body.survey_offset_hours === ''
    ? null
    : Number(body.survey_offset_hours)
  const sendAt = offset != null && Number.isFinite(offset)
    ? computeSurveySendAt(endsAt, offset)
    : id(body.survey_send_at)
  return {
    registration_form_id: id(body.registration_form_id),
    // El CHECK de la BD no permite los dos: gana el formulario.
    survey_form_id: id(body.survey_form_id),
    survey_template_id: id(body.survey_form_id) ? null : id(body.survey_template_id),
    survey_offset_hours: offset != null && Number.isFinite(offset) ? offset : null,
    survey_send_at: sendAt,
  }
}

/** Payload parcial para actualizar: solo incluye las claves presentes en el body. */
export function formToPartialWriteInput(body: Record<string, unknown>): Partial<EventWriteInput> {
  const full = formToWriteInput(body)
  const out: Partial<EventWriteInput> = {}
  const map: Record<string, keyof EventWriteInput> = {
    name: 'title', event_type: 'event_type', description: 'description',
    location: 'location', location_map_url: 'location_url', is_virtual: 'is_virtual',
    virtual_link: 'virtual_url',
    is_recurring: 'is_recurring', recurrence_rule: 'recurrence_rule', recurrence_end: 'recurrence_end',
    requires_registration: 'requires_registration', max_capacity: 'max_capacity',
    is_public: 'is_public',
    requires_payment: 'requires_payment', payment_amount: 'payment_amount',
    currency: 'currency', sede_id: 'sede_id', timezone: 'timezone',
    server_price: 'server_price', servers_pay: 'servers_pay',
    has_satisfaction_survey: 'requires_survey', flyer: 'flyer_url', status: 'status',
  }
  for (const [formKey, dbKey] of Object.entries(map)) {
    if (formKey in body) (out as Record<string, unknown>)[dbKey] = full[dbKey]
  }
  // fechas: si vienen, recomputar starts_at/ends_at
  if ('start_date' in body) out.starts_at = full.starts_at
  if ('end_date' in body) out.ends_at = full.ends_at
  // OJO: cambiar la zona SIN reenviar la fecha y la hora deja el instante como
  // estaba. El formulario de edición siempre manda las dos cosas juntas, así
  // que en la práctica no pasa; recomputar acá sería peor, porque
  // `recurrence_end` se recalcula desde el body y un body sin ese campo lo
  // dejaría en null — borrando el fin de la serie.

  // EVE-4 · La encuesta se recalcula EN BLOQUE si el body toca cualquiera de
  // sus piezas —o si movieron el fin del evento, porque el momento guardado
  // depende de él—. Media programación guardada es peor que ninguna.
  const tocaEncuesta = ['has_satisfaction_survey', 'survey_form_id', 'survey_template_id',
    'survey_offset_hours', 'survey_send_at', 'end_date', 'end_time'].some(k => k in body)
  if (tocaEncuesta) Object.assign(out, formToSurvey(body))
  else if ('registration_form_id' in body) out.registration_form_id = full.registration_form_id
  return out
}
