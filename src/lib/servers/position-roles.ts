// Mapeo puesto → rol automático (módulo PURO, sin server). Fuente única de
// verdad: qué puestos de servicio otorgan qué rol del sistema al ocupante.
// Extensible: agregar una regla nueva a POSITION_ROLE_RULES sin tocar el resto
// del sistema (asignar/remover, migración de datos y sync ya son genéricos).
import type { RoleId } from '@/types/auth'

export type PositionContext = {
  title: string
  areaName: string
  areaType: 'area' | 'committee'
  /** Nombre del área padre (null si el área/comité es de nivel raíz). */
  parentAreaName: string | null
}

export type PositionRoleRule = {
  role: RoleId
  /** Explica la regla en la UI de auditoría/reporte. */
  description: string
  matches: (ctx: PositionContext) => boolean
}

/** minúsculas, sin acentos, espacios recortados — para comparar títulos con
 *  variantes de escritura ("Colaborador Bienvenida" / "Colaborador de Bienvenida"). */
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

/** Puestos de una sede que operan el evento: logística, anfitriones, bienvenida
 *  e información. Los títulos salen del catálogo real (verificado 2026-09-07);
 *  las variantes con y sin "de" conviven en la base y por eso están las dos.
 *
 *  Información entra COMPLETA —colaborador y coordinador—: antes solo estaba el
 *  coordinador, así que las 36 personas de la mesa de información no recibían el
 *  rol y su jefe sí. Se incluyen también los títulos "Información/Anuncios", que
 *  son la misma mesa en las sedes que juntaron las dos funciones. */
const SEDE_EVENTOS_TITLES = new Set([
  'logistica',
  'asistente logistica',
  'anfitrion',
  'colaborador bienvenida',
  'colaborador de bienvenida',
  'coordinador bienvenida',
  'colaborador informacion',
  'colaborador de informacion',
  'colaborador informacion/anuncios',
  'colaborador de informacion/anuncios',
  'coordinador informacion',
])

/** Un comité de sede: cuelga del área "Sedes", o se llama "Sede X".
 *
 *  Antes esto exigía que el padre fuera "Área Espiritual" y por eso la regla
 *  NO otorgaba nada: los 14 comités de sede con puestos cuelgan de "Sedes".
 *  Los 92 roles automáticos que hay en producción los puso una migración que
 *  comparaba solo el título; desde entonces, asignar a alguien a uno de esos
 *  puestos no le daba el rol. La segunda condición cubre "Sede Life Este" y
 *  "Sede Life Oeste", que sí cuelgan de "Área Espiritual" (hoy sin puestos). */
function esComiteDeSede(ctx: PositionContext): boolean {
  if (ctx.areaType !== 'committee') return false
  return norm(ctx.parentAreaName ?? '') === 'sedes' || norm(ctx.areaName).startsWith('sede ')
}

export const POSITION_ROLE_RULES: PositionRoleRule[] = [
  {
    role: 'encargado_eventos',
    description:
      'Puestos que operan el evento en los comités de sede: Logística, Asistente Logística, ' +
      'Anfitrión, Colaborador/Coordinador Bienvenida y Coordinador Información.',
    matches: (ctx) => esComiteDeSede(ctx) && SEDE_EVENTOS_TITLES.has(norm(ctx.title)),
  },
  {
    role: 'lider_comite',
    description:
      'Encargado de cualquier comité (título "Encargado" o "Encargado de comité"), de cualquier área. ' +
      'Excluye asistentes/sub-roles ("Asistente Encargado", "Encargado GR", etc.).',
    matches: (ctx) =>
      ctx.areaType === 'committee' &&
      (norm(ctx.title) === 'encargado' || norm(ctx.title) === 'encargado de comite'),
  },
]

/** Roles que otorga un puesto dado su contexto (puede ser más de uno si varias
 *  reglas matchean). [] si el puesto no otorga ningún rol automático. */
export function rolesGrantedByPosition(ctx: PositionContext): RoleId[] {
  return POSITION_ROLE_RULES.filter(r => r.matches(ctx)).map(r => r.role)
}
