/**
 * Cómo se dice cuánto campo le queda a un grupo.
 *
 * POR QUÉ NO UNA FRACCIÓN. La pantalla de matrícula mostraba "8/10" con la
 * etiqueta "Cupos", y todo el mundo lo leía como "8 ocupados, quedan 2". Era al
 * revés: 8 DISPONIBLES de 10. Peor todavía, la barrita de al lado sí pintaba lo
 * ocupado, así que una barra casi llena convivía con un "8/10" que significaba
 * casi vacío — cada una reforzaba la lectura contraria de la otra.
 *
 * Y el listado de grupos usa la MISMA notación para lo opuesto (matriculados
 * sobre el total). Dos pantallas con el mismo formato y significados invertidos
 * no se arreglan eligiendo cuál gana: se arregla no usando una fracción donde
 * se puede escribir la palabra.
 */

/** Lo que se muestra bajo "Cupos" en la tarjeta de un grupo de matrícula. */
export function textoCupos(disponibles: number, total: number): string {
  if (!Number.isFinite(total) || total <= 0) return 'Sin límite'
  const libres = Math.max(0, Math.min(disponibles, total))
  if (libres === 0) return 'Sin campo'
  if (libres === 1) return `Queda 1 de ${total}`
  return `Quedan ${libres} de ${total}`
}

/** Qué tan lleno está, para la barra: 0-100. Es lo OCUPADO, que es lo que la
 *  barra representa — llena = sin campo. */
export function porcentajeOcupado(ocupados: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  return Math.round((Math.max(0, Math.min(ocupados, total)) / total) * 100)
}
