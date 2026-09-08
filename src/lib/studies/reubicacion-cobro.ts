/**
 * ¿Una reubicación genera cobro?
 *
 * LA REGLA (confirmada 2026-09-08): NO. Cambiar de grupo no es matricularse de
 * nuevo — la persona ya pagó su matrícula en el grupo del que viene. El único
 * caso con cobro es que necesite OTRO FOLLETO, y para eso está la casilla
 * "Ocupo folleto" de la solicitud: ese camino ya crea su propio cobro y su
 * tiquete de impresión.
 *
 * EL BUG QUE ARREGLA. La resolución sin folleto llamaba a enrollMember pelado,
 * y enrollMember cobra siempre que el plan tenga costo — no sabe que viene de
 * una reubicación. Caso real: Valeria Astorga Calvo pidió reubicación el 3 de
 * setiembre, se resolvió a DIS1 — Este SJ, y le quedó un cobro de ₡15.000 por
 * un estudio que YA había aprobado en junio. Además la matrícula nacía
 * 'pendiente_de_pago', así que la reubicación quedaba a medias y la pantalla le
 * bloqueaba matricular cualquier otra cosa por "deuda".
 */

/** Lo que se sabe de la solicitud al resolverla. */
export type ReubicacionParaCobro = {
  /** Marcó "Ocupo folleto" al pedir la reubicación. */
  wants_folleto: boolean
}

/** ¿Hay que cobrarle algo al reubicar? */
export function reubicacionCobra(req: ReubicacionParaCobro): boolean {
  return req.wants_folleto === true
}

/** El inverso, para leerlo bien en el llamado a enrollMember. */
export function reubicacionSinCobro(req: ReubicacionParaCobro): boolean {
  return !reubicacionCobra(req)
}
