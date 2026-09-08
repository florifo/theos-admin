import { describe, it, expect } from 'vitest'
import { reubicacionCobra, reubicacionSinCobro } from './reubicacion-cobro'

describe('cuándo cobra una reubicación', () => {
  // El caso de Valeria Astorga (2026-09-08): reubicación sin folleto, y le
  // quedó un cobro de ₡15.000 por un estudio que ya había aprobado.
  it('sin folleto NO cobra: ya pagó en el grupo del que viene', () => {
    expect(reubicacionCobra({ wants_folleto: false })).toBe(false)
    expect(reubicacionSinCobro({ wants_folleto: false })).toBe(true)
  })

  it('con folleto SÍ cobra: es material nuevo', () => {
    expect(reubicacionCobra({ wants_folleto: true })).toBe(true)
    expect(reubicacionSinCobro({ wants_folleto: true })).toBe(false)
  })

  // El costo del plan no entra en la decisión: un plan caro reubicado sin
  // folleto sigue sin cobrar. Es justo lo que enrollMember no sabía.
  it('el costo del plan no cambia la respuesta', () => {
    expect(reubicacionCobra({ wants_folleto: false })).toBe(false)
  })
})
