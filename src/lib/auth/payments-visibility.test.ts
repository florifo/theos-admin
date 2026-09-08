import { describe, it, expect } from 'vitest'
import { hasModulePermission } from './roles'
import type { RoleId } from '@/types/auth'

/**
 * Quién puede ver los pagos de OTRA persona (GET /api/members/[id]/payments) y,
 * por lo tanto, adjuntarle el comprobante de un pendiente.
 *
 * Regresión del 2026-09-08: el endpoint traía la lista escrita a mano
 * ['admin','direccion','finanzas'] y dejaba fuera a coordinador_estudios, que
 * tiene revision_pagos con edit. La coordinadora abría el perfil del estudiante
 * y la sección de pagos respondía 403 — no veía el pendiente ni podía cerrarlo.
 */
const ve = (roles: string[]) =>
  hasModulePermission(roles as RoleId[], ['finanzas', 'revision_pagos'], 'view', { beyondOwn: true })

describe('quién ve los pagos de otra persona', () => {
  it('los roles que revisan pagos, sí', () => {
    for (const r of ['finanzas', 'revision_pagos', 'admin', 'direccion']) {
      expect(ve([r, 'miembro'])).toBe(true)
    }
  })

  it('coordinador_estudios también — tiene revision_pagos', () => {
    expect(ve(['coordinador_estudios', 'miembro'])).toBe(true)
  })

  it('el dirigente no: ve a su grupo, no la plata de su gente', () => {
    expect(ve(['dirigente', 'miembro'])).toBe(false)
  })

  it('un miembro sin más roles tampoco (los suyos los ve por otro camino)', () => {
    expect(ve(['miembro'])).toBe(false)
  })

  it('un rol de otro módulo no alcanza', () => {
    for (const r of ['encargado_eventos', 'comunicaciones', 'editor_perfiles', 'becas']) {
      expect(ve([r, 'miembro'])).toBe(false)
    }
  })

  // No es un descuido: el rol 'folletos' trae revision_pagos con edit en su
  // definición, porque ese equipo también cierra pagos. Queda anotado para que
  // nadie lo lea como una fuga.
  it('folletos sí ve, porque su rol incluye revision_pagos', () => {
    expect(ve(['folletos', 'miembro'])).toBe(true)
  })
})
