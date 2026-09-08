/**
 * Zonas horarias de verdad, sin desfases hardcodeados.
 *
 * POR QUÉ EXISTE. Todo el sistema asumía Costa Rica = UTC-6 fijo, y para Costa
 * Rica eso es exacto: no tiene horario de verano, el desfase es una constante.
 * Pero hay sedes en España, y ahí la constante se rompe: medido contra la base,
 * la diferencia entre Madrid y Costa Rica es de 8 horas en setiembre y de 7 en
 * enero. Un `- 6 * 3600_000` genérico desalinea esos eventos dos veces al año.
 *
 * La conversión sale de `Intl`, que ya trae la tabla IANA con todos los cambios
 * de horario. No se guarda ningún desfase: se pregunta para el instante que
 * corresponde.
 *
 * QUÉ SE GUARDA EN LA BASE: el instante real (UTC), como siempre. La zona dice
 * cómo INTERPRETAR y cómo MOSTRAR ese instante, no lo cambia.
 */

/** Zona por defecto de todo el sistema. */
export const ZONA_CR = 'America/Costa_Rica'

/** Zonas que el sistema ofrece hoy. Se agregan a mano: son las sedes que hay. */
export const ZONAS = [
  { id: ZONA_CR, label: 'Costa Rica' },
  { id: 'Europe/Madrid', label: 'Madrid, España' },
] as const

export type ZonaId = (typeof ZONAS)[number]['id']

export function esZonaConocida(z: string | null | undefined): boolean {
  return !!z && ZONAS.some(x => x.id === z)
}

/** Etiqueta corta para mostrar junto a una hora. */
export function etiquetaZona(zona: string | null | undefined): string {
  return ZONAS.find(z => z.id === zona)?.label ?? ZONA_CR
}

/** Normaliza: cualquier cosa desconocida cae a Costa Rica. */
export function zonaValida(zona: string | null | undefined): string {
  return esZonaConocida(zona) ? (zona as string) : ZONA_CR
}

/**
 * Desfase de `zona` respecto a UTC, en milisegundos, EN ESE INSTANTE.
 *
 * Positivo al este de Greenwich (Madrid en verano: +2h). Costa Rica devuelve
 * siempre -6h. Se calcula formateando el instante en la zona y restando: es el
 * truco estándar, y es exacto porque Intl conoce los cambios de horario.
 */
export function desfaseMs(zona: string, instante: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: zonaValida(zona), hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = Object.fromEntries(dtf.formatToParts(instante).map(x => [x.type, x.value]))
  // hour puede venir "24" a medianoche en el ciclo h23/h24 de algunos runtimes.
  const hora = Number(p.hour) % 24
  const comoUTC = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    hora, Number(p.minute), Number(p.second),
  )
  return comoUTC - instante.getTime()
}

/** La hora de pared (los componentes que vería un reloj en esa zona) de un
 *  instante, expresada como un Date cuyos componentes UTC son esa hora.
 *  Es un Date "falso": sirve para iterar y comparar, no es un instante real. */
export function aParedUTC(zona: string, instante: Date): Date {
  return new Date(instante.getTime() + desfaseMs(zona, instante))
}

/**
 * El inverso: una hora de pared → el instante real.
 *
 * Se resuelve en dos pasos porque el desfase depende del instante que estamos
 * buscando: se estima con el desfase de la hora de pared tomada como UTC y se
 * corrige. Dos pasos alcanzan salvo en la hora que se salta o se repite el día
 * del cambio de horario, donde cualquier respuesta es discutible.
 */
export function deParedUTC(zona: string, pared: Date): Date {
  const z = zonaValida(zona)
  let instante = new Date(pared.getTime() - desfaseMs(z, pared))
  instante = new Date(pared.getTime() - desfaseMs(z, instante))
  return instante
}

/** 'YYYY-MM-DD' de un instante, en la zona dada. */
export function ymdEnZona(zona: string, instante: Date): string {
  return aParedUTC(zona, instante).toISOString().slice(0, 10)
}

/** 'HH:mm' de un instante, en la zona dada. */
export function hhmmEnZona(zona: string, instante: Date): string {
  return aParedUTC(zona, instante).toISOString().slice(11, 16)
}

/** Fecha y hora de pared ('YYYY-MM-DD', 'HH:mm') → instante real (ISO). */
export function paredAIso(zona: string, fecha: string, hora: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
  const hhmm = /^\d{2}:\d{2}/.test(hora) ? hora.slice(0, 5) : '00:00'
  const pared = new Date(`${fecha}T${hhmm}:00.000Z`)
  if (Number.isNaN(pared.getTime())) return null
  return deParedUTC(zona, pared).toISOString()
}

/**
 * Cómo se dice la hora de un evento cuando su zona NO es la de acá.
 *
 * Devuelve null si la zona es Costa Rica: en el 99% de los eventos no hay nada
 * que aclarar y agregar "· hora de Costa Rica" a todo sería ruido.
 */
export function horaEnDosZonas(zona: string, instante: Date): { propia: string; cr: string } | null {
  const z = zonaValida(zona)
  if (z === ZONA_CR) return null
  return { propia: hhmmEnZona(z, instante), cr: hhmmEnZona(ZONA_CR, instante) }
}

/** La fecha larga de un instante, en la zona del evento. */
export function fechaLargaEnZona(zona: string, iso: string): string {
  return new Date(iso).toLocaleDateString('es-CR', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: zonaValida(zona),
  })
}

/** La hora de un instante, en la zona del evento. */
export function horaEnZona(zona: string, iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CR', {
    hour: '2-digit', minute: '2-digit', timeZone: zonaValida(zona),
  })
}

/**
 * El texto que se agrega al lado de la hora cuando el evento NO es de Costa
 * Rica: "· 12:00 Madrid (4:00 a. m. en Costa Rica)". Null si es de acá, para no
 * llenar de aclaraciones los 3.500 eventos que no las necesitan.
 */
export function aclaracionDeZona(zona: string | null | undefined, iso: string): string | null {
  const z = zonaValida(zona)
  if (z === ZONA_CR) return null
  return `hora de ${etiquetaZona(z)} · ${horaEnZona(ZONA_CR, iso)} en Costa Rica`
}
