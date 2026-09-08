/**
 * Qué servidores del comité se muestran — y, por lo tanto, cuáles se exportan.
 *
 * Vive acá y no suelto en la página porque el export y la tabla TIENEN que usar
 * la misma lista. Cuando eran dos expresiones distintas se separaron: la tabla
 * filtraba y el archivo bajaba el comité entero, así que en Sede Meridiano
 * Martes el encabezado decía 67 y el CSV traía 84 filas (los 67 activos más 17
 * inactivos). Con una sola función no se pueden volver a desalinear.
 */
export type EstadoServidor = 'active' | 'inactive'
export type FiltroEstado = EstadoServidor | 'all'

export type ServidorFiltrable = { name: string; status: string; position?: string | null }

/** Valor del filtro de puesto: 'all' o el título exacto del puesto. */
export const TODOS_LOS_PUESTOS = 'all'

export function filtrarServidores<T extends ServidorFiltrable>(
  servidores: readonly T[],
  filtros: { search?: string; status?: FiltroEstado; position?: string },
): T[] {
  const q = (filtros.search ?? '').trim().toLowerCase()
  const estado = filtros.status ?? 'active'
  const puesto = filtros.position ?? TODOS_LOS_PUESTOS
  return servidores.filter(s =>
    (!q || s.name.toLowerCase().includes(q))
    && (estado === 'all' || s.status === estado)
    && (puesto === TODOS_LOS_PUESTOS || (s.position ?? '') === puesto))
}

/**
 * Los puestos que hay para ofrecer en el filtro.
 *
 * Salen de la gente que está en el comité, no de un catálogo: un comité tiene
 * decenas de puestos definidos y casi todos vacíos —en Comité Estudios Bíblicos
 * hay 15 títulos y solo 5 con gente—, así que listarlos todos sería un
 * desplegable lleno de opciones que no filtran nada.
 *
 * Se miran TODOS los servidores, no los ya filtrados: si dependiera del filtro
 * de estado, elegir un puesto que solo tienen inactivos lo haría desaparecer de
 * la lista y no habría cómo volver.
 */
export function puestosDisponibles<T extends ServidorFiltrable>(servidores: readonly T[]): string[] {
  const vistos = new Set<string>()
  for (const s of servidores) {
    const p = (s.position ?? '').trim()
    if (p) vistos.add(p)
  }
  return [...vistos].sort((a, b) => a.localeCompare(b, 'es'))
}
