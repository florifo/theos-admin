import { describe, it, expect } from 'vitest'
import { contarPersonasNuevas, diaCR } from './personas-nuevas'

// Una charla del lunes 7 de setiembre a las 7:00pm de Costa Rica. En UTC ya es
// el día 8 — ese desfase es justo lo que este módulo tiene que resolver.
const CHARLA = '2026-09-08T01:00:00.000Z'

describe('diaCR', () => {
  it('las 7:00pm CR siguen siendo el día 7, aunque en UTC sea el 8', () => {
    expect(diaCR(CHARLA)).toBe('2026-09-07')
  })

  it('la medianoche UTC ya es el día anterior en Costa Rica', () => {
    expect(diaCR('2026-09-08T00:00:00.000Z')).toBe('2026-09-07')
  })

  it('una fecha inválida no revienta', () => {
    expect(diaCR('vaya cosa')).toBeNull()
  })
})

describe('contarPersonasNuevas', () => {
  it('cuenta a quien tiene la ficha creada el mismo día del evento', () => {
    const r = contarPersonasNuevas([
      { member_id: 'a', member_created_at: '2026-09-07T23:40:00.000Z' }, // 5:40pm CR del 7
      { member_id: 'b', member_created_at: '2024-03-01T12:00:00.000Z' },
      { member_id: 'c', member_created_at: '2026-09-08T02:10:00.000Z' }, // 8:10pm CR del 7
    ], CHARLA)
    expect(r).toEqual({ nuevas: 2, conFicha: 3, porcentaje: 67 })
  })

  // El error clásico: comparar en UTC. Ahí el evento cae el día 8 y la ficha
  // creada a las 5:40pm CR cae el 7, así que no coincidirían y daría 0.
  it('no se le escapa nadie por el desfase de Costa Rica', () => {
    const r = contarPersonasNuevas(
      [{ member_id: 'a', member_created_at: '2026-09-07T23:40:00.000Z' }],
      CHARLA,
    )
    expect(r.nuevas).toBe(1)
  })

  it('una persona con dos check-ins cuenta una vez', () => {
    const r = contarPersonasNuevas([
      { member_id: 'a', member_created_at: '2026-09-07T23:40:00.000Z' },
      { member_id: 'a', member_created_at: '2026-09-07T23:40:00.000Z' },
    ], CHARLA)
    expect(r).toEqual({ nuevas: 1, conFicha: 1, porcentaje: 100 })
  })

  it('los invitados sin ficha no entran ni arriba ni abajo', () => {
    const r = contarPersonasNuevas([
      { member_id: '', member_created_at: null },
      { member_id: 'a', member_created_at: null },
      { member_id: 'b', member_created_at: '2026-09-07T20:00:00.000Z' },
    ], CHARLA)
    expect(r).toEqual({ nuevas: 1, conFicha: 1, porcentaje: 100 })
  })

  it('sin check-ins da cero, sin dividir por cero', () => {
    expect(contarPersonasNuevas([], CHARLA)).toEqual({ nuevas: 0, conFicha: 0, porcentaje: 0 })
  })

  it('la víspera y el día siguiente no cuentan', () => {
    const r = contarPersonasNuevas([
      { member_id: 'a', member_created_at: '2026-09-07T05:00:00.000Z' }, // 6 de set, 11:00pm CR
      { member_id: 'b', member_created_at: '2026-09-09T06:00:00.000Z' }, // 9 de set, 12:00am CR
    ], CHARLA)
    expect(r.nuevas).toBe(0)
  })
})
