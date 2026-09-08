import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/auth/guard'
import { DASHBOARD_ROLES } from '@/lib/auth/home-route'
import { getRecentActivity } from '@/lib/supabase/queries/dashboard'

// SEC-1: el audit_log (aunque sea resumido) es información de gestión — antes
// lo recibía cualquier sesión.
//
// 2026-09-08: pasa a los mismos tres roles del dashboard, que es la única
// pantalla que lo muestra. Con el criterio anterior —cualquier módulo
// administrativo— lo seguía recibiendo quien ya no ve el dashboard.
export async function GET() {
  try {
    const auth = await requireRoles(...DASHBOARD_ROLES)
    if (auth.res) return auth.res
    return NextResponse.json(await getRecentActivity())
  } catch (error) {
    console.error('GET /api/dashboard/activity:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
