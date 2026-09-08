/**
 * Qué se le exige a una ficha de persona creada a mano: desde el check-in de un
 * evento, o al agregar un integrante de familia. Una sola regla para los dos,
 * porque son la misma decisión.
 *
 * LA CÉDULA ES OBLIGATORIA para personas mayores de edad. Es la única llave
 * confiable para no terminar con la misma persona dos y tres veces en el padrón
 * —el nombre no sirve: se escribe distinto cada vez, con y sin tildes, con uno
 * o dos apellidos—, y sin ella la persona después no se puede matricular en un
 * estudio (la matrícula la exige) ni se le puede cobrar.
 *
 * A LOS MENORES NO. Muchos no tienen documento todavía, y trabar la fila de un
 * miércoles por un niño no tiene sentido.
 *
 * SIN FECHA DE NACIMIENTO SE PIDE. No es un descuido: "no sé la edad" no puede
 * ser la puerta de escape que vacíe la regla. Quien está registrando a un menor
 * pone la fecha —que además es un dato que se quiere tener— y el campo deja de
 * ser obligatorio solo.
 */
import {
  isValidDocument, normalizeCedula, documentFormatMessage,
  isDocumentType, type DocumentType,
} from '@/lib/cedula'

/** Mayoría de edad en Costa Rica. Es el umbral del DOCUMENTO. */
export const MAYORIA_DE_EDAD = 18

/** AUTH-1: por debajo de esta edad no se crean cuentas de acceso, así que
 *  tampoco se les exige correo. Es un umbral DISTINTO al del documento y no es
 *  un descuido: un chico de 15 puede tener correo y cuenta, y no tener cédula. */
export const EDAD_MINIMA_PARA_CUENTA = 12

/** Costa Rica es UTC-6 fijo. */
const CR_OFFSET_MS = 6 * 60 * 60 * 1000

/** Hoy en Costa Rica, como YYYY-MM-DD. */
export function hoyCR(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() - CR_OFFSET_MS).toISOString().slice(0, 10)
}

/**
 * Años cumplidos a la fecha `hoy` (YYYY-MM-DD las dos). null si la fecha no
 * sirve — vacía, mal escrita o en el futuro.
 *
 * Se compara texto YYYY-MM-DD y no objetos Date a propósito: `new Date('2010-05-03')`
 * es medianoche UTC, o sea las 6pm del día ANTERIOR en Costa Rica, y quien
 * cumple años hoy saldría con un año menos.
 */
export function edadEnAnios(nacimiento: string, hoy: string = hoyCR()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nacimiento) || nacimiento > hoy) return null
  const [ay, am, ad] = nacimiento.split('-').map(Number)
  const [hy, hm, hd] = hoy.split('-').map(Number)
  let edad = hy - ay
  if (hm < am || (hm === am && hd < ad)) edad--
  return edad < 0 || edad > 130 ? null : edad
}

/** ¿La fecha dice que la persona tiene menos de `anios`? Sin fecha usable: NO
 *  —no se asume que es menor para saltarse un campo obligatorio. */
export function esMenorDe(anios: number, nacimiento: string | null | undefined, hoy: string = hoyCR()): boolean {
  if (!nacimiento) return false
  const edad = edadEnAnios(nacimiento, hoy)
  return edad !== null && edad < anios
}

export function esMenorDeEdad(nacimiento: string | null | undefined, hoy: string = hoyCR()): boolean {
  return esMenorDe(MAYORIA_DE_EDAD, nacimiento, hoy)
}

/** Demasiado chico para tener cuenta de acceso (AUTH-1). */
export function noLlevaCuenta(nacimiento: string | null | undefined, hoy: string = hoyCR()): boolean {
  return esMenorDe(EDAD_MINIMA_PARA_CUENTA, nacimiento, hoy)
}

export type AltaDePersona = {
  first_name: string
  last_name: string
  cedula?: string | null
  email?: string | null
  birth_date?: string | null
  /**
   * Exigir correo para poder crearle la cuenta de acceso. Se pide donde el alta
   * es la única oportunidad de capturarlo —el check-in, con la persona
   * enfrente—; en pantallas de gestión se puede completar después.
   */
  exigirCorreo?: boolean
  /** INT-1: cedula | dni_nie | pasaporte | otro. Sin esto, el alta de alguien
   *  con pasaporte se rechazaría por "no tiene forma de cédula". Default:
   *  cédula de Costa Rica. */
  document_type?: string | null
}

export type ResultadoAlta = {
  ok: boolean
  /** Mensaje por campo; la UI lo pinta debajo del input que corresponde. */
  errores: Partial<Record<'first_name' | 'last_name' | 'cedula' | 'email', string>>
  /** true cuando a esta persona sí se le exige documento. */
  exigeCedula: boolean
  /** true cuando a esta persona sí se le exige correo (para crearle cuenta). */
  exigeCorreo: boolean
}

// Mismo criterio de formato que /recuperar y que account-creation-rules.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validarAltaDePersona(p: AltaDePersona, hoy: string = hoyCR()): ResultadoAlta {
  const errores: ResultadoAlta['errores'] = {}
  if (!p.first_name?.trim()) errores.first_name = 'Falta el nombre.'
  if (!p.last_name?.trim()) errores.last_name = 'Faltan los apellidos.'

  const tipo: DocumentType =
    p.document_type && isDocumentType(p.document_type) ? p.document_type : 'cedula'

  const exigeCedula = !esMenorDeEdad(p.birth_date, hoy)
  const cedula = normalizeCedula(p.cedula ?? '')
  if (!cedula) {
    if (exigeCedula) {
      errores.cedula = tipo === 'cedula'
        ? 'La cédula es obligatoria. Si es menor de edad, poné la fecha de nacimiento.'
        : 'El documento es obligatorio. Si es menor de edad, poné la fecha de nacimiento.'
    }
  } else if (!isValidDocument(tipo, cedula)) {
    errores.cedula = documentFormatMessage(tipo)
  }

  const exigeCorreo = !!p.exigirCorreo && !noLlevaCuenta(p.birth_date, hoy)
  const email = (p.email ?? '').trim()
  if (!email) {
    if (exigeCorreo) {
      errores.email = 'El correo es obligatorio: con él se le crea la cuenta de acceso.'
    }
  } else if (!EMAIL_RE.test(email)) {
    errores.email = 'El correo no tiene un formato válido.'
  }

  return { ok: Object.keys(errores).length === 0, errores, exigeCedula, exigeCorreo }
}
