'use client'

import { useAuth } from './useAuth'
import { ROLES } from '@/lib/auth/roles'

type Action = 'view' | 'create' | 'edit' | 'delete' | 'export'
type Scope = 'own' | 'committee' | 'all'

export function usePermissions() {
  const { user, loaded } = useAuth()

  function can(module: string, action: Action): boolean {
    if (!user?.roles?.length) return false

    return user.roles.some(roleId => {
      const role = ROLES.find(r => r.id === roleId)
      if (!role) return false
      return role.permissions.some(
        p => (p.module === 'all' || p.module === module) && p.actions.includes(action)
      )
    })
  }

  function getScope(module: string): Scope | null {
    if (!user?.roles?.length) return null

    const scopes = user.roles.flatMap(roleId => {
      const role = ROLES.find(r => r.id === roleId)
      if (!role) return []
      return role.permissions
        .filter(p => p.module === module || p.module === 'all')
        .map(p => p.scope ?? 'all')
    })

    if (scopes.includes('all')) return 'all'
    if (scopes.includes('committee')) return 'committee'
    if (scopes.includes('own')) return 'own'
    return null
  }

  /**
   * ¿Ya sabemos quién es? Hasta que no cargue la sesión, `can()` devuelve false
   * para todo — no porque no tenga permiso, sino porque todavía no hay roles.
   *
   * Toda pantalla que muestre "Acceso restringido" TIENE que esperar esto. Sin
   * eso, la pantalla se pinta denegada por un instante en CADA carga y después
   * salta al contenido. Se veía hasta en el tutorial grabado del check-in.
   */
  return { can, getScope, loaded }
}
