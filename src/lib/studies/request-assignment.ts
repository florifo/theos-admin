// Quién puede recibir, ver y trabajar una solicitud de estudios (reubicación /
// interés). Decisión 2026-07-31: además de los coordinadores, se puede asignar a
// cualquier miembro con puesto activo en el COMITÉ DE ESTUDIOS BÍBLICOS — y para
// que eso sirva de algo, el asignado entra a la pantalla y ve SOLO lo suyo.
//
// Puro (sin Supabase): lo usan el guard de la API, la pantalla y el listado de
// asignables, así que la regla es una sola.

import type { RoleId } from '@/types/auth'

/** Nombre canónico del comité en `areas` (area_type='committee'). Es solo la
 *  referencia legible: el match real lo hace `isStudyCommitteeArea`, que compara
 *  por palabras y no exige el nombre exacto. */
export const STUDY_COMMITTEE_AREA_NAME = 'Comité de Estudios Bíblicos'

/** Palabras que tiene que traer el nombre del área, en cualquier orden y con o
 *  sin conectores. */
const PALABRAS_DEL_COMITE = ['comite', 'estudios', 'biblicos'] as const

/** Conectores que no aportan: la diferencia entre "Comité de Estudios Bíblicos"
 *  y "Comité Estudios Bíblicos" no debería romper nada. */
const CONECTORES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y'])

/** Roles que ven la cola COMPLETA y pueden asignar. */
export const REQUEST_COORDINATOR_ROLES: RoleId[] = [
  'direccion', 'coordinador_estudios', 'coordinador_dirigentes', 'admin',
]

/** 'all' = toda la cola (coordinadores) · 'assigned' = solo lo asignado a esa
 *  persona (comité) · 'none' = no entra. */
export type RequestQueueScope = 'all' | 'assigned' | 'none'

export function normalizeAreaName(name: string): string {
  return name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

/**
 * ¿Este área es el comité de estudios bíblicos?
 *
 * Se compara por PALABRAS, no por el nombre exacto. Antes era una igualdad
 * contra 'Comité de Estudios Bíblicos' y en producción el área se llama
 * 'Comité Estudios Bíblicos' —sin el "de"— así que no calzaba NADA: el comité
 * devolvía 0 miembros y sus 22 servidores activos no aparecían como asignables
 * ni podían entrar a la cola de solicitudes. La función de asignar al comité
 * (decisión 2026-07-31) nunca llegó a funcionar. Se descubrió el 2026-09-02, al
 * intentar asignarle una reubicación a Luis Sánchez Flores.
 *
 * Con el match por palabras da igual el conector: "Comité Estudios Bíblicos",
 * "Comité de Estudios Bíblicos" y "Comite de los Estudios Biblicos" son la
 * misma cosa. Se exige que estén las TRES palabras, así que un "Comité de
 * Estudios" a secas o un "Comité Bíblico" no se cuelan.
 */
export function isStudyCommitteeArea(name: string | null | undefined): boolean {
  if (!name) return false
  const palabras = new Set(
    normalizeAreaName(name).split(/[^a-z0-9]+/).filter(p => p && !CONECTORES.has(p)),
  )
  return PALABRAS_DEL_COMITE.every(p => palabras.has(p))
}

export function requestQueueScope(input: {
  roles: readonly string[] | null | undefined
  /** ¿Tiene puesto ACTIVO en el comité de estudios bíblicos? */
  inStudyCommittee?: boolean
}): RequestQueueScope {
  const roles = input.roles ?? []
  if (roles.some(r => (REQUEST_COORDINATOR_ROLES as string[]).includes(r))) return 'all'
  // El rol explícito y el puesto en el comité dan lo mismo. El rol se otorga
  // solo con el puesto, así que en la práctica van juntos; se aceptan los dos
  // para poder darlo a mano a alguien que ayuda sin estar en el comité, y para
  // que quitar el rol tenga efecto aunque el puesto siga.
  if (roles.includes('solicitudes_estudio')) return 'assigned'
  if (input.inStudyCommittee) return 'assigned'
  return 'none'
}

/** Asignar (y tomar) sigue siendo de los coordinadores: el comité recibe trabajo,
 *  no lo reparte. */
export function canAssignRequests(roles: readonly string[] | null | undefined): boolean {
  return (roles ?? []).some(r => (REQUEST_COORDINATOR_ROLES as string[]).includes(r))
}

/** ¿A esta persona se le puede asignar una solicitud? */
export function canBeAssigned(input: {
  roles: readonly string[] | null | undefined
  inStudyCommittee?: boolean
}): boolean {
  return requestQueueScope(input) !== 'none'
}

/** ¿Puede trabajar (resolver / rechazar) ESTA solicitud? El del comité, solo la
 *  que le asignaron; el coordinador, cualquiera. */
export function canWorkRequest(
  scope: RequestQueueScope,
  request: { reviewed_by?: string | null },
  memberId: string | null,
): boolean {
  if (scope === 'all') return true
  if (scope === 'none' || !memberId) return false
  return request.reviewed_by === memberId
}
