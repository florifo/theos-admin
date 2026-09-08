// Quién tiene DASHBOARD y quién aterriza en su perfil.
//
// REGLA (2026-09-08): el dashboard es solo para reportes, dirección y admin.
// Es una pantalla de números de toda la organización — matrículas, ingresos,
// actividad reciente— y para el resto de los perfiles no es su trabajo: sus
// herramientas viven en el sidebar y su página de inicio es su propio perfil.
//
// Antes era al revés: una lista de roles SIN dashboard (miembro, dirigente,
// líder de comité) y todo lo demás lo tenía por descarte. Con eso, cada rol
// nuevo nacía viendo el dashboard salvo que alguien se acordara de agregarlo a
// la lista — así terminaron viéndolo finanzas, comunicaciones, folletos,
// becas, los coordinadores y los encargados de eventos. Una lista de quién SÍ
// falla del lado seguro: el rol nuevo no ve nada hasta que se decida.
import type { RoleId } from '@/types/auth'

/** Los únicos roles con dashboard. */
export const DASHBOARD_ROLES: readonly RoleId[] = ['reportes', 'direccion', 'admin']

/** true = esta sesión no tiene dashboard: /dashboard la redirige a su perfil.
 *  Sin roles (default 'miembro') también aterriza en el perfil. */
export function landsOnProfile(roles: RoleId[]): boolean {
  return !roles.some(r => (DASHBOARD_ROLES as readonly string[]).includes(r))
}

/** El inverso, para leerlo derecho donde se decide qué mostrar. */
export function tieneDashboard(roles: RoleId[]): boolean {
  return !landsOnProfile(roles)
}
