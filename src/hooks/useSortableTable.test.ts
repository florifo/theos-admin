import { describe, it, expect } from 'vitest'
import { getSortValue } from './useSortableTable'

/**
 * La clave con la que se ordena cada columna. Se prueba la función y no el
 * hook porque el bug del 2026-09-08 fue justamente que devolvía la misma clave
 * para todas las filas: con todo empatado, el orden no cambiaba y parecía que
 * el clic en el encabezado no hacía nada.
 */
describe('ordenar por nombre', () => {
  it('las filas del padrón se ordenan por APELLIDO', () => {
    const a = getSortValue({ first_name: 'Ana', last_name: 'Zúñiga' }, 'name')
    const b = getSortValue({ first_name: 'Zoe', last_name: 'Alfaro' }, 'name')
    expect(b < a).toBe(true)
  })

  // Las filas de servidores traen un solo campo `name`. Antes la clave salía
  // " " para todas y el ordenamiento no movía nada.
  it('las filas con un solo campo `name` también ordenan', () => {
    const a = getSortValue({ name: 'Ana Mora' }, 'name')
    const b = getSortValue({ name: 'Beto Solís' }, 'name')
    expect(a).not.toBe(b)
    expect(a < b).toBe(true)
  })

  it('ninguna clave sale vacía teniendo nombre', () => {
    expect(getSortValue({ name: 'Dina Zamora Vargas' }, 'name').trim()).not.toBe('')
  })

  it('los acentos no mandan a nadie al final', () => {
    const angel = getSortValue({ name: 'Ángel Rojas' }, 'name')
    const beto = getSortValue({ name: 'Beto Rojas' }, 'name')
    expect(angel < beto).toBe(true)
  })

  it('sin nombre de ningún tipo, clave vacía y no revienta', () => {
    expect(getSortValue({}, 'name')).toBe('')
  })
})

describe('las otras columnas de la tabla de un comité', () => {
  it('puesto ordena por su texto', () => {
    expect(getSortValue({ position: 'Anfitrión' }, 'position'))
      .not.toBe(getSortValue({ position: 'Logística' }, 'position'))
  })

  it('estado pone a los activos primero', () => {
    expect(getSortValue({ status: 'active' }, 'status'))
      .toBe('0')
    expect(getSortValue({ status: 'inactive' }, 'status')).toBe('1')
  })

  it('antigüedad ordena por la fecha de inicio', () => {
    const viejo = getSortValue({ start_date: '2020-01-01' }, 'seniority')
    const nuevo = getSortValue({ start_date: '2026-01-01' }, 'seniority')
    expect(viejo < nuevo).toBe(true)
  })
})
