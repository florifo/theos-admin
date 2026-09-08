import { describe, it, expect } from 'vitest'
import { resolveOnBehalf, recordedByLabel, FORM_ON_BEHALF_ROLES } from './on-behalf'
import type { AuthContext } from '@/lib/auth/guard'

const ctx = (roles: string[], memberId: string | null = 'yo'): AuthContext =>
  ({ roles, memberId } as unknown as AuthContext)

describe('resolveOnBehalf', () => {
  // El caso normal: nadie está actuando por nadie, y no se ensucia la fila.
  it('sin pedir a otro, no deja rastro', () => {
    const r = resolveOnBehalf(ctx(['comunicaciones']), undefined, FORM_ON_BEHALF_ROLES)
    expect(r).toEqual({ memberId: 'yo', recordedBy: null, esPorOtro: false, denegado: false })
  })

  it('con rol y pidiendo a otro, deja el rastro', () => {
    const r = resolveOnBehalf(ctx(['comunicaciones']), 'otra-persona', FORM_ON_BEHALF_ROLES)
    expect(r).toEqual({ memberId: 'otra-persona', recordedBy: 'yo', esPorOtro: true, denegado: false })
  })

  // Anti-suplantación. OJO: hasta el 2026-09-08 esta prueba decía "el pedido se
  // ignora y queda el propio", y eso era justamente el bug — el sistema seguía
  // adelante con la persona equivocada. Ahora se deniega.
  it('sin rol, pedir a otro se deniega', () => {
    const r = resolveOnBehalf(ctx(['miembro']), 'otra-persona', FORM_ON_BEHALF_ROLES)
    expect(r).toEqual({ memberId: null, recordedBy: null, esPorOtro: false, denegado: true })
  })

  it('admin siempre puede', () => {
    const r = resolveOnBehalf(ctx(['admin']), 'otra-persona', FORM_ON_BEHALF_ROLES)
    expect(r.esPorOtro).toBe(true)
    expect(r.recordedBy).toBe('yo')
  })

  // Pedirse a uno mismo NO es actuar por otro: si no, cada envío del staff
  // quedaría marcado como "registrado por el staff" sin razón.
  it('pedirse a sí mismo no deja rastro', () => {
    const r = resolveOnBehalf(ctx(['comunicaciones']), 'yo', FORM_ON_BEHALF_ROLES)
    expect(r).toEqual({ memberId: 'yo', recordedBy: null, esPorOtro: false, denegado: false })
  })

  it('un pedido vacío se trata como no pedido', () => {
    for (const v of ['', null, undefined, 42, {}]) {
      const r = resolveOnBehalf(ctx(['comunicaciones']), v, FORM_ON_BEHALF_ROLES)
      expect(r.memberId).toBe('yo')
      expect(r.recordedBy).toBeNull()
    }
  })

  it('una sesión sin perfil de miembro no queda como quien digitó', () => {
    const r = resolveOnBehalf(ctx(['admin'], null), 'otra-persona', FORM_ON_BEHALF_ROLES)
    expect(r.memberId).toBe('otra-persona')
    expect(r.recordedBy).toBeNull()
    // esPorOtro sigue siendo true: la fila es de otro, solo no se sabe de quién
    // es la mano. Mejor eso que inventar un autor.
    expect(r.esPorOtro).toBe(true)
  })
})

describe('recordedByLabel', () => {
  it('nombra a quien la digitó', () => {
    expect(recordedByLabel('Floriana Fonseca')).toBe('Registrada por Floriana Fonseca')
  })

  it('sin nombre no queda una frase colgando', () => {
    for (const v of [null, undefined, '', '   ']) {
      expect(recordedByLabel(v)).toBe('Registrada por el staff')
    }
  })
})

describe('quién puede llenar por otro', () => {
  it('incluye el rol forms, que la ficha pedía sumar', () => {
    expect(FORM_ON_BEHALF_ROLES).toContain('forms')
  })

  it('no incluye al miembro ni a solo_lectura', () => {
    expect(FORM_ON_BEHALF_ROLES).not.toContain('miembro')
    expect(FORM_ON_BEHALF_ROLES).not.toContain('solo_lectura')
  })
})

// Regresión del 2026-09-08. Karina Padilla tiene editor_grupos_estudio —el rol
// hecho para administrar grupos— y el botón "Añadir miembro" se le mostraba con
// esa lista, pero la API validaba con otra. Resultado: elegía a una persona y
// el sistema LA MATRICULABA A ELLA. Pasó dos veces antes de que se reportara.
describe('nunca sustituir a la persona en silencio', () => {
  it('sin el rol, pedir por otro se DENIEGA — no se cambia por el actor', () => {
    const r = resolveOnBehalf(ctx(['editor_grupos_estudio']), 'la-otra-persona', ['coordinador_estudios'])
    expect(r.denegado).toBe(true)
    expect(r.memberId).toBeNull()
    expect(r.memberId).not.toBe('yo')
  })

  it('con el rol correcto, sí registra por la otra persona y deja el rastro', () => {
    const r = resolveOnBehalf(ctx(['editor_grupos_estudio']), 'la-otra-persona', ['editor_grupos_estudio'])
    expect(r).toEqual({ memberId: 'la-otra-persona', recordedBy: 'yo', esPorOtro: true, denegado: false })
  })

  it('el autoservicio no se ve afectado: sin member_id, es uno mismo', () => {
    const r = resolveOnBehalf(ctx(['miembro']), undefined, ['coordinador_estudios'])
    expect(r.denegado).toBe(false)
    expect(r.memberId).toBe('yo')
  })

  it('mandar el propio member_id tampoco se deniega', () => {
    const r = resolveOnBehalf(ctx(['miembro']), 'yo', ['coordinador_estudios'])
    expect(r.denegado).toBe(false)
    expect(r.memberId).toBe('yo')
  })
})
