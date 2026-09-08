// FRM-4 · Actuar A NOMBRE DE otra persona, dejando rastro de quién lo hizo.
//
// El caso real: alguien contesta por teléfono o en papel y el staff lo registra.
// La respuesta es de esa persona, pero quién la digitó importa — si después hay
// una duda ("yo nunca dije eso"), sin el rastro no se puede reconstruir nada.
//
// LA CONVENCIÓN, y es la decisión que simplifica todo lo demás: `recordedBy` es
// NULL cuando la persona lo hizo ella misma. Solo se llena cuando el actor es
// distinto del miembro. Así `recorded_by IS NOT NULL` responde exactamente la
// pregunta de la pantalla —"¿esto lo registró el staff?"— sin comparar columnas.

import type { AuthContext } from '@/lib/auth/guard'
import type { RoleId } from '@/types/auth'

export type OnBehalfResult = {
  /** De quién es el registro. */
  memberId: string | null
  /** Quién lo digitó, si NO fue la propia persona. NULL en el caso normal. */
  recordedBy: string | null
  /** true si el actor está registrando por otro. */
  esPorOtro: boolean
  /**
   * Pidieron registrar a OTRA persona y el actor no tiene el rol para hacerlo.
   * El caller DEBE cortar con 403 en vez de seguir.
   *
   * Antes esto no existía y la función simplemente devolvía al actor. Suena
   * defensivo, pero convierte un problema de permisos en datos equivocados:
   * caso real del 2026-09-08, Karina Padilla —que tiene editor_grupos_estudio,
   * el rol hecho para administrar grupos— elegía a una persona en "Añadir
   * miembro" y el sistema LA MATRICULABA A ELLA, sin ningún error. Pasó dos
   * veces (8 de setiembre y 31 de agosto) y hubo que cancelar las matrículas a
   * mano. Sustituir a la persona en silencio nunca es la respuesta correcta.
   */
  denegado: boolean
}

/**
 * Resuelve a nombre de quién se está actuando y quién lo digita.
 *
 * Espejo de `resolveTargetMemberId` (misma regla anti-suplantación: sin el rol,
 * el `requested` se ignora y queda el propio), pero además devuelve el rastro.
 * Se hizo aparte y no dentro de resolveTargetMemberId para no cambiar la firma
 * de una función que usan cinco endpoints.
 */
export function resolveOnBehalf(
  ctx: AuthContext,
  requested: unknown,
  privilegedRoles: readonly RoleId[],
): OnBehalfResult {
  const propio = ctx.memberId ?? null
  const puede = ctx.roles.includes('admin') || privilegedRoles.some(r => ctx.roles.includes(r))
  const pedido = typeof requested === 'string' && requested ? requested : null

  // Pidieron a otro y el actor no puede: NO se sustituye, se deniega.
  if (pedido && pedido !== propio && !puede) {
    return { memberId: null, recordedBy: null, esPorOtro: false, denegado: true }
  }
  if (!puede || !pedido || pedido === propio) {
    return { memberId: pedido && puede ? pedido : propio, recordedBy: null, esPorOtro: false, denegado: false }
  }
  return { memberId: pedido, recordedBy: propio, esPorOtro: true, denegado: false }
}

/** Quién puede llenar un FORMULARIO a nombre de otro (FRM-4 punto 2).
 *  El acceso puntual a UN formulario (form_access_grants) se suma aparte: se
 *  resuelve por formulario, no por rol, así que no puede vivir en esta lista. */
export const FORM_ON_BEHALF_ROLES: RoleId[] = ['forms', 'comunicaciones', 'direccion']

/** Quién puede INSCRIBIR a otro en un evento.
 *  Estaba duplicado en dos rutas con contenidos distintos —una incluía 'admin' y
 *  la otra no— así que se centralizó acá al agregarle la UI (FRM-4). `admin` no
 *  va en la lista: resolveOnBehalf ya lo trata aparte, como en el resto. */
export const EVENT_ON_BEHALF_ROLES: RoleId[] = ['direccion', 'encargado_staff', 'comunicaciones']

/** Quién puede crear una SOLICITUD financiera a nombre de otro. */
export const FINANCE_ON_BEHALF_ROLES: RoleId[] = ['finanzas', 'direccion']

/** Etiqueta para la respuesta registrada por alguien más. Se usa en la vista de
 *  respuestas y en el export: la misma frase en los dos lados, para que nadie la
 *  confunda con una respuesta directa. */
export function recordedByLabel(nombre: string | null | undefined): string {
  return `Registrada por ${nombre?.trim() || 'el staff'}`
}
