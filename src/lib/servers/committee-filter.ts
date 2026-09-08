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

export type ServidorFiltrable = { name: string; status: string }

export function filtrarServidores<T extends ServidorFiltrable>(
  servidores: readonly T[],
  filtros: { search?: string; status?: FiltroEstado },
): T[] {
  const q = (filtros.search ?? '').trim().toLowerCase()
  const estado = filtros.status ?? 'active'
  return servidores.filter(s =>
    (!q || s.name.toLowerCase().includes(q))
    && (estado === 'all' || s.status === estado))
}
