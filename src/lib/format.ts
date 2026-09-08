// Helpers de formato compartidos (fechas e iniciales). Antes había ~19 copias
// de formatDate y ~18 de initials regadas por las páginas (auditoría 2026-06-11).

const LOCALE = 'es-CR'

const CR_TZ = 'America/Costa_Rica'

/** Fecha calendario (YYYY-MM-DD) de un Date en zona Costa Rica (UTC-6). El runtime
 *  (Vercel) corre en UTC, así que `new Date().toISOString().split('T')[0]` da el
 *  día equivocado entre las 18:00 y medianoche CR. `en-CA` formatea como YYYY-MM-DD. */
export function ymdCR(date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA', { timeZone: CR_TZ })
}

/** "Hoy" en zona Costa Rica como YYYY-MM-DD. Ver [[ymdCR]]. */
export function todayCR(): string {
  return ymdCR()
}

/** Fecha calendario (YYYY-MM-DD) de un Date en hora LOCAL del navegador. Para
 *  inputs/comparaciones de fecha en componentes cliente (en CR, local = CR).
 *  Para lógica server-side usá [[ymdCR]], que fuerza la zona CR. */
export function toYmdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Un timestamp guardado → la fecha y la hora que hay que MOSTRAR EN LOS INPUTS
 *  del formulario, en hora de Costa Rica.
 *
 *  Es el espejo de combineDateTime (events/form-mapper): ahí se guarda
 *  interpretando los inputs como hora CR, así que acá hay que devolverlos a CR.
 *  Antes la pantalla de editar hacía `start_at.split('T')`, que parte la cadena
 *  CRUDA: un evento guardado como 2026-08-28T04:00Z se mostraba como "28 de
 *  agosto, 04:00" cuando en CR ese instante es el 27 a las 22:00. Y al guardar
 *  mandaba de vuelta esos valores, que se reinterpretan como CR — así que el
 *  evento se CORRÍA SEIS HORAS cada vez que alguien lo abría y guardaba. Los dos
 *  lados tienen que hablar la misma zona o el error se acumula.
 */
export function crFormParts(
  iso: string | null | undefined,
  /** Zona del evento. Ausente = Costa Rica, que es lo que era antes y lo que
   *  sigue siendo para todo lo que no es una sede de España. */
  zona: string = CR_TZ,
): { date: string; time: string } {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  if (isNaN(d.getTime())) return { date: '', time: '' }
  return {
    // en-CA formatea como YYYY-MM-DD, que es lo que espera un <input type="date">.
    date: d.toLocaleDateString('en-CA', { timeZone: zona }),
    // en-GB da 24h ("22:00"), que es lo que espera un <input type="time">.
    time: d.toLocaleTimeString('en-GB', { timeZone: zona, hour: '2-digit', minute: '2-digit', hour12: false }),
  }
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Parsea una fecha respetando las fechas PURAS (YYYY-MM-DD, columnas `date`) como
 *  locales — `new Date('1990-05-15')` las interpreta como medianoche UTC y en CR
 *  (UTC-6) retroceden un día. Los timestamps con hora se parsean normal. */
function parseFlexibleDate(d: string): Date {
  if (DATE_ONLY_RE.test(d)) {
    return new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))
  }
  return new Date(d)
}

/** Edad en años cumplidos a partir de la fecha de nacimiento. 0 si falta/ inválida. */
export function calcAge(birthDate: string | null | undefined): number {
  if (!birthDate) return 0
  const nac = parseFlexibleDate(birthDate)
  if (isNaN(nac.getTime())) return 0
  const hoy = new Date()
  let edad = hoy.getFullYear() - nac.getFullYear()
  const m = hoy.getMonth() - nac.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--
  return edad
}

/** Fecha corta: "5 may 2026". null/inválida → '—'. */
export function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  const date = parseFlexibleDate(d)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Fecha con mes completo: "5 de mayo de 2026" (es-CR usa "5 de mayo de 2026"). null → '—'. */
export function formatDateLong(d: string | null | undefined): string {
  if (!d) return '—'
  const date = parseFlexibleDate(d)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Fecha numérica: "05/05/2026". null → '—'. */
export function formatDateNumeric(d: string | null | undefined): string {
  if (!d) return '—'
  const date = parseFlexibleDate(d)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Fecha y hora: "5 may 2026, 02:30 p. m.". null → '—'. */
export function formatDateTime(d: string | null | undefined): string {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(LOCALE, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/** Iniciales a partir de un nombre completo: "Ana María Soto" → "AM". */
export function getInitials(name: string | null | undefined): string {
  return (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
}

/** Iniciales a partir de nombre y apellido por separado. */
export function initialsFromParts(first: string | null | undefined, last: string | null | undefined): string {
  return ((first?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase()
}

/** Monto en colones sin decimales: "₡50 000" (es-CR usa espacio de miles).
 *  QA 2026-07-17: fuente única — antes había 2 copias locales + ~30 template
 *  strings inline con el mismo patrón. */
export function formatCRC(amount: number): string {
  return formatMoney(amount, 'CRC')
}

/** INT-2: monedas soportadas por las tablas de dinero (CHECK en BD). */
export const CURRENCIES = ['CRC', 'USD', 'EUR'] as const
export type Currency = (typeof CURRENCIES)[number]

const CURRENCY_SYMBOL: Record<Currency, string> = { CRC: '₡', USD: '$', EUR: '€' }

/** INT-3: decimales de cada moneda. El colón no usa céntimos en la práctica;
 *  el euro y el dólar sí, y sin esto €25,50 se mostraba "€25,5". */
const CURRENCY_DECIMALS: Record<Currency, number> = { CRC: 0, USD: 2, EUR: 2 }

/** Cuántos decimales lleva la moneda. Sirve para los inputs de monto: el `step`
 *  tiene que dejar escribir céntimos donde los hay y no donde no. */
export function currencyDecimals(currency: string | null | undefined): number {
  return CURRENCY_DECIMALS[(currency ?? 'CRC') as Currency] ?? 2
}

/** `step` del input de monto según la moneda: '1' en colones, '0.01' en euros. */
export function amountStep(currency: string | null | undefined): string {
  return currencyDecimals(currency) === 0 ? '1' : '0.01'
}

/** Símbolo de la moneda ("₡"/"$"/"€"); moneda desconocida → el código mismo. */
export function currencySymbol(currency: string | null | undefined): string {
  return CURRENCY_SYMBOL[(currency ?? 'CRC') as Currency] ?? String(currency)
}

/** INT-2/INT-3: formateo por moneda en un helper único, con los decimales que
 *  le corresponden a cada una. Default CRC (todo lo histórico es en colones);
 *  moneda desconocida → se antepone el código. */
export function formatMoney(amount: number, currency: string | null | undefined = 'CRC'): string {
  const cur = (currency ?? 'CRC') as Currency
  const symbol = CURRENCY_SYMBOL[cur]
  const d = currencyDecimals(cur)
  const n = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: d, maximumFractionDigits: d,
  }).format(amount)
  return symbol ? `${symbol}${n}` : `${currency} ${n}`
}
