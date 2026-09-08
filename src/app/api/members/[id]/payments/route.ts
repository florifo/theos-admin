import { NextRequest, NextResponse } from 'next/server'
import { requireRoles, canViewMemberProfile } from '@/lib/auth/guard'
import { getPaymentsByMember } from '@/lib/supabase/queries/payments'
import { isUuid } from '@/lib/validate'

// GET: pagos/cobros de un miembro. Lo ve el propio miembro, su FAMILIA (PAG-1,
// /mis-pagos permite pagar por familiares — mismo criterio que el perfil) o el
// staff que revisa pagos. No usa el módulo estudios para no bloquear al miembro.
//
// BUG 2026-09-08: la lista de staff estaba escrita a mano —admin, direccion,
// finanzas— y dejaba fuera a coordinador_estudios, que SÍ tiene el módulo
// revision_pagos con edit. Resultado: la coordinadora abría el perfil de un
// estudiante, la sección "Pagos y cobros" recibía 403 y mostraba "No se
// pudieron cargar los pagos". No podía ver el pendiente ni, por lo tanto,
// adjuntarle el comprobante para cerrarlo. Reportado por Mariana Montoya.
//
// Ahora se pregunta por el PERMISO DE MÓDULO en vez de enumerar roles: así la
// lista no se vuelve a quedar atrás cada vez que se crea un rol nuevo.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireRoles()
    if (auth.res) return auth.res
    const { id } = await params
    if (!isUuid(id)) return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 })
    const { hasModulePermission } = await import('@/lib/auth/roles')
    const isStaff = hasModulePermission(auth.ctx.roles, ['finanzas', 'revision_pagos'], 'view', { beyondOwn: true })
    if (!isStaff && !(await canViewMemberProfile(auth.ctx, id))) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }
    return NextResponse.json(await getPaymentsByMember(id))
  } catch (error) {
    console.error('GET /api/members/[id]/payments:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
