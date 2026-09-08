/**
 * Cuántas de las personas que hicieron check-in son NUEVAS: su ficha se creó el
 * mismo día del evento.
 *
 * SON DOS CONDICIONES, no una:
 *
 *   1. La ficha se creó el mismo día del evento.
 *   2. Este evento es el PRIMER check-in de esa persona.
 *
 * La segunda no sobra. Hay días con varias charlas a la vez —los miércoles hay
 * seis—, y una persona puede pasar por dos el mismo día. Si a alguien se le crea
 * el perfil en Cartago y esa misma noche aparece en Meridiano, con la primera
 * condición sola LAS DOS lo cuentan como persona nueva. Con la segunda, solo lo
 * cuenta la charla donde de verdad llegó primero. Medido en producción: 520
 * casos de gente con check-in en dos eventos el mismo día.
 *
 * POR QUÉ EL MISMO DÍA Y NO "hace poco". En una charla, a la persona que llega
 * por primera vez se le crea la ficha ahí mismo, desde el propio check-in
 * ("Agregar persona nueva"). No mide "gente nueva de la iglesia" en general.
 *
 * EL DÍA ES EL DE COSTA RICA, no el UTC. Una charla que arranca a las 7:00pm CR
 * cae en el día siguiente en UTC, así que comparar por UTC pondría el evento y
 * la ficha en días distintos y el conteo daría 0. La comparación se hace sobre
 * la fecha civil de Costa Rica de los dos lados.
 */

/** Costa Rica es UTC-6 fijo. Mismo criterio que expand-recurrence. */
const CR_OFFSET_MS = 6 * 60 * 60 * 1000

/** La fecha civil (YYYY-MM-DD) de un instante, en hora de Costa Rica. */
export function diaCR(iso: string): string | null {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return new Date(t - CR_OFFSET_MS).toISOString().slice(0, 10)
}

export type CheckinParaConteo = {
  member_id: string
  /** Cuándo ocurrió ESTE check-in. */
  checked_at?: string | null
  /** created_at de la ficha. null cuando el check-in es de un invitado sin ficha. */
  member_created_at?: string | null
  /**
   * El primer check-in de esa persona en TODO el sistema (RPC
   * members_first_checkin). Solo lo llena el detalle del evento.
   *
   * Si viene `undefined` —una pantalla que no lo pidió— la condición no se
   * aplica y queda solo la de la fecha. Es explícito a propósito: preferimos
   * degradar al conteo viejo antes que dar 0 en silencio.
   */
  member_first_checkin_at?: string | null
}

export type ConteoNuevos = {
  /** Personas distintas con ficha creada el día del evento. */
  nuevas: number
  /** Personas distintas con check-in y ficha (el denominador del porcentaje). */
  conFicha: number
  /** Porcentaje redondeado; 0 si no hay nadie con ficha. */
  porcentaje: number
}

/**
 * ¿Este check-in es el de una persona que vino por primera vez?
 *
 * `dia` es la fecha civil CR del evento. Los instantes se comparan en epoch, no
 * como texto: el mismo instante puede venir escrito distinto (`+00:00` contra
 * `Z`, o con otra precisión de milisegundos) según de dónde salga.
 */
function esPersonaNueva(c: CheckinParaConteo, dia: string | null): boolean {
  if (!dia || !c.member_created_at) return false
  if (diaCR(c.member_created_at) !== dia) return false
  if (c.member_first_checkin_at === undefined) return true // la pantalla no trajo el dato
  if (!c.member_first_checkin_at || !c.checked_at) return false
  return Date.parse(c.member_first_checkin_at) === Date.parse(c.checked_at)
}

/**
 * `referencia` es el instante del evento (starts_at). Se usa su día en Costa
 * Rica, no "hoy": así el número de un evento pasado no cambia con el tiempo.
 *
 * Cuenta PERSONAS, no filas: alguien registrado en el evento general y en un
 * subevento tendría dos check-ins pero es una sola persona nueva. (Hoy la base
 * lo impide con UNIQUE(member_id, event_id), pero el conteo no depende de eso.)
 */
export function contarPersonasNuevas(
  checkins: CheckinParaConteo[],
  referencia: string,
): ConteoNuevos {
  const dia = diaCR(referencia)
  const conFicha = new Set<string>()
  const nuevas = new Set<string>()
  for (const c of checkins) {
    if (!c.member_id || !c.member_created_at) continue
    conFicha.add(c.member_id)
    if (esPersonaNueva(c, dia)) nuevas.add(c.member_id)
  }
  return {
    nuevas: nuevas.size,
    conFicha: conFicha.size,
    porcentaje: conFicha.size === 0 ? 0 : Math.round((nuevas.size / conFicha.size) * 100),
  }
}
