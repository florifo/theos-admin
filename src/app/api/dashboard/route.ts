import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/auth/guard'
import { hasModulePermission } from '@/lib/auth/roles'
import { DASHBOARD_ROLES } from '@/lib/auth/home-route'
import { getDashboardStats, type DashboardStats } from '@/lib/supabase/queries/dashboard'

// SEC-1: los KPIs del dashboard exponen datos de TODOS los módulos (incluidos
// montos de finanzas). El payload se recorta por permiso: cada bloque exige
// view del módulo con alcance más allá de 'own' (mismo criterio que usa la
// página para pintarlo). Sin ningún bloque permitido → 403 (el dashboard de
// miembro no llama a este endpoint).
const BLOCK_MODULE: Record<keyof DashboardStats, string> = {
  members: 'miembros',
  studies: 'estudios',
  events: 'eventos',
  servers: 'servidores',
  finance: 'finanzas',
  communications: 'comunicaciones',
}

export async function GET() {
  try {
    // El dashboard es de reportes, dirección y admin (regla 2026-09-08). El
    // recorte por módulo de abajo sigue, pero ya no alcanza por sí solo: antes
    // cualquier rol con UN módulo administrativo se traía sus KPIs, y eso es
    // justo lo que se quiso cerrar. Cerrar solo la pantalla no sirve — el
    // endpoint se llama igual.
    const auth = await requireRoles(...DASHBOARD_ROLES)
    if (auth.res) return auth.res
    const allowed = (Object.keys(BLOCK_MODULE) as Array<keyof DashboardStats>)
      .filter(block => hasModulePermission(auth.ctx.roles, BLOCK_MODULE[block], 'view', { beyondOwn: true }))
    if (allowed.length === 0) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }
    const stats = await getDashboardStats()
    const trimmed = Object.fromEntries(allowed.map(block => [block, stats[block]]))
    return NextResponse.json(trimmed)
  } catch (error) {
    console.error('GET /api/dashboard:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
