import { STUDY_CATALOG } from '@/data/study-catalog'
import { claveAlfabetica } from '@/lib/utils'
import { useState, useMemo } from 'react'

export type SortDirection = 'asc' | 'desc'

// T is unconstrained so it works with both `type` aliases and `interface` shapes
// (interfaces don't implicitly satisfy Record<string, unknown>).
export function useSortableTable<T>(data: T[]) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDirection>('asc')

  const sorted = useMemo(() => {
    if (!sortKey) return data
    return [...data].sort((a, b) => {
      const av = getSortValue(a as Record<string, unknown>, sortKey)
      const bv = getSortValue(b as Record<string, unknown>, sortKey)
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [data, sortKey, sortDir])

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  return { sorted, sortKey, sortDir, toggleSort }
}

/** código → nombre del estudio, para ordenar por lo que la gente lee. */
const NOMBRE_POR_CODIGO: Record<string, string> = Object.fromEntries(
  STUDY_CATALOG.map(s => [s.code, s.name]),
)

export function getSortValue(row: Record<string, unknown>, key: string): string {
  switch (key) {
    case 'name': {
      // Dos formas de fila conviven: las del padrón traen first_name/last_name
      // y se ordenan por APELLIDO, que es como se busca a alguien en una lista;
      // las de servidores traen un solo campo `name` ya armado.
      //
      // BUG 2026-09-08: solo estaba la primera. En la tabla de un comité —donde
      // las filas son `name`— la clave salía " " para TODAS, así que todas
      // empataban y hacer clic en "Nombre" no movía nada. Se veía como que el
      // ordenamiento no funcionaba, y no funcionaba.
      const porApellido = `${row.last_name ?? ''} ${row.first_name ?? ''}`.trim()
      return claveAlfabetica(porApellido || String(row.name ?? ''))
    }
    case 'age':
      return typeof row.birth_date === 'string'
        ? String(new Date().getFullYear() - new Date(row.birth_date).getFullYear()).padStart(3, '0')
        : 'zzz'
    case 'status':
      return row.status === 'active' ? '0' : '1'
    case 'member_name':
      return String(row.member_name ?? '').toLowerCase()
    case 'position_name':
      return String(row.position_name ?? '').toLowerCase()
    case 'committee_name':
      return String(row.committee_name ?? '').toLowerCase()
    case 'contract_type':
      return row.contract_type === 'planilla' ? '0' : '1'
    case 'is_donor':
      return row.is_donor ? 'si' : 'no'
    case 'service_committee':
      return (row.service_history as { status: string; to: string | null; committee?: string }[] | undefined)
        ?.find(s => s.status === 'activo' && s.to === null)?.committee?.toLowerCase() ?? 'zzz'
    case 'service_position':
      return (row.service_history as { status: string; to: string | null; position?: string }[] | undefined)
        ?.find(s => s.status === 'activo' && s.to === null)?.position?.toLowerCase() ?? 'zzz'
    case 'service_area':
      return (row.service_history as { status: string; to: string | null; area?: string }[] | undefined)
        ?.find(s => s.status === 'activo' && s.to === null)?.area?.toLowerCase() ?? 'zzz'
    case 'startYear':
      // Historial de estudios: ordenar SOLO por año (sin mes/día). Desempate
      // alfabético por nombre del estudio → determinístico, los estudios del
      // mismo año no saltan de posición entre renders.
      return `${String(row.startYear ?? 0).padStart(4, '0')}|${String(row.name ?? '').toLowerCase()}`
    case 'current_study':
      return String(row.current_study ?? 'zzz').toLowerCase()
    case 'seniority':
      // sort by start_date: earlier date = more seniority = comes first on asc
      return String(row.start_date ?? '')
    case 'participants_count':
      return String(
        (row.participants as { status: string }[] | undefined)?.filter(p => p.status !== 'withdrawn').length ?? 0
      ).padStart(6, '0')
    case 'leader_name':
      return String(row.leader_name ?? 'zzz').toLowerCase()
    case 'zone':
      return String(row.zone ?? '').toLowerCase()
    case 'study_type_id': {
      // Ordena por el NOMBRE del estudio, no por el código. Con el código,
      // "Apocalipsis" (APO) cae antes que "Amor sin Fronteras" (ASF) y la lista
      // se lee desordenada — quien ordena está buscando por nombre. El código
      // queda de desempate para los que no están en el catálogo (planes viejos
      // que solo viven en la BD).
      const code = String(row.study_type_id ?? '')
      return `${claveAlfabetica(NOMBRE_POR_CODIGO[code] ?? code)}|${code.toLowerCase()}`
    }
    default:
      return String(row[key] ?? '').toLowerCase()
  }
}
