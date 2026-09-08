import { describe, it, expect } from 'vitest'
import { landsOnProfile, tieneDashboard, DASHBOARD_ROLES } from './home-route'
import { ROLES } from './roles'
import type { RoleId } from '@/types/auth'

describe('quién tiene dashboard (regla 2026-09-08)', () => {
  it('solo reportes, dirección y admin', () => {
    for (const r of ['reportes', 'direccion', 'admin'] as RoleId[]) {
      expect(tieneDashboard([r])).toBe(true)
      expect(landsOnProfile([r])).toBe(false)
    }
  })

  // Antes lo veían por descarte: la regla vieja listaba a quienes NO lo tenían
  // y todo lo demás lo heredaba.
  it('los roles administrativos que antes lo veían por descarte, ya no', () => {
    for (const r of ['finanzas', 'comunicaciones', 'coordinador_estudios',
                     'coordinador_dirigentes', 'coordinador_servidores',
                     'encargado_staff', 'encargado_eventos', 'folletos', 'becas',
                     'revision_pagos', 'editor_perfiles', 'editor_grupos_estudio',
                     'forms', 'evaluaciones', 'gestor_accesos'] as RoleId[]) {
      expect(landsOnProfile([r])).toBe(true)
    }
  })

  it('miembro, dirigente y líder de comité siguen sin dashboard', () => {
    expect(landsOnProfile(['miembro'])).toBe(true)
    expect(landsOnProfile(['dirigente'])).toBe(true)
    expect(landsOnProfile(['lider_comite'])).toBe(true)
    expect(landsOnProfile([])).toBe(true) // sin roles = miembro default
  })

  it('basta UNO de los tres para tenerlo, aunque venga acompañado', () => {
    expect(tieneDashboard(['miembro', 'reportes'])).toBe(true)
    expect(tieneDashboard(['dirigente', 'direccion'])).toBe(true)
    expect(tieneDashboard(['finanzas', 'admin'])).toBe(true)
  })

  it('varios roles sin ninguno de los tres tampoco lo tienen', () => {
    expect(landsOnProfile(['finanzas', 'comunicaciones', 'folletos'])).toBe(true)
  })

  // El punto de invertir la lista: un rol nuevo no nace viendo el dashboard.
  it('todo rol que no esté en DASHBOARD_ROLES queda fuera, hoy y mañana', () => {
    const conDashboard = ROLES.map(r => r.id).filter(id => tieneDashboard([id]))
    expect([...conDashboard].sort()).toEqual([...DASHBOARD_ROLES].sort())
  })
})
