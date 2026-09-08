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

// Los miércoles hay seis charlas a la vez. A alguien se le puede crear el perfil
// en una y aparecer esa misma noche en otra: sin la segunda condición, las dos
// se la anotarían como persona nueva.
describe('varias charlas el mismo día', () => {
  const FICHA = '2026-09-07T23:30:00.000Z'      // 5:30pm CR, en Cartago
  const EN_CARTAGO = '2026-09-07T23:35:00.000Z' // su primer check-in
  const EN_MERIDIANO = '2026-09-08T02:00:00.000Z' // 8:00pm CR, la segunda charla

  it('la cuenta la charla donde llegó primero', () => {
    expect(contarPersonasNuevas([{
      member_id: 'a', member_created_at: FICHA,
      checked_at: EN_CARTAGO, member_first_checkin_at: EN_CARTAGO,
    }], CHARLA).nuevas).toBe(1)
  })

  it('NO la cuenta la segunda charla del mismo día', () => {
    expect(contarPersonasNuevas([{
      member_id: 'a', member_created_at: FICHA,
      checked_at: EN_MERIDIANO, member_first_checkin_at: EN_CARTAGO,
    }], CHARLA).nuevas).toBe(0)
  })

  it('sigue en el denominador aunque no cuente como nueva', () => {
    const r = contarPersonasNuevas([{
      member_id: 'a', member_created_at: FICHA,
      checked_at: EN_MERIDIANO, member_first_checkin_at: EN_CARTAGO,
    }], CHARLA)
    expect(r).toEqual({ nuevas: 0, conFicha: 1, porcentaje: 0 })
  })

  it('quien ya venía de antes tampoco cuenta, aunque la ficha sea de hoy', () => {
    expect(contarPersonasNuevas([{
      member_id: 'a', member_created_at: FICHA,
      checked_at: EN_CARTAGO, member_first_checkin_at: '2024-01-10T23:00:00.000Z',
    }], CHARLA).nuevas).toBe(0)
  })

  it('el mismo instante escrito distinto sigue siendo el mismo instante', () => {
    expect(contarPersonasNuevas([{
      member_id: 'a', member_created_at: FICHA,
      checked_at: '2026-09-07T23:35:00.000Z',
      member_first_checkin_at: '2026-09-07T23:35:00+00:00',
    }], CHARLA).nuevas).toBe(1)
  })

  // Degradación explícita: una pantalla que no pida el dato vuelve al conteo
  // viejo en vez de dar 0 en silencio.
  it('sin el dato del primer check-in, queda solo la regla de la fecha', () => {
    expect(contarPersonasNuevas(
      [{ member_id: 'a', member_created_at: FICHA }], CHARLA,
    ).nuevas).toBe(1)
  })
})
