import { describe, it, expect } from 'vitest'
import { bloqueQueLaAtiende, estaVencida, solicitudesAVencer } from './request-expiry'

// Los bloques reales de 2026.
const BLOQUES = [
  { id: 'b1', nombre: 'Bloque 1 2026', fecha_cierre_matricula: '2026-01-22T06:00:00Z' },
  { id: 'b2', nombre: 'Bloque 2 2026', fecha_cierre_matricula: '2026-05-22T06:00:00Z' },
  { id: 'b3', nombre: 'Bloque 3 2026', fecha_cierre_matricula: '2026-09-13T06:00:00Z' },
]
const abierta = (created_at: string) => ({ id: 's', status: 'open', created_at })

describe('cuál bloque atiende la solicitud', () => {
  it('la hecha dentro de un bloque, ese mismo', () => {
    expect(bloqueQueLaAtiende('2026-09-05T10:00:00Z', BLOQUES)?.nombre).toBe('Bloque 3 2026')
  })

  // El caso que rompe la lectura ingenua: en producción hay solicitudes del 25
  // de agosto, con el Bloque 2 ya cerrado (22 de mayo) y el 3 sin abrir (31 de
  // agosto). Atarlas al bloque anterior las vencería de una.
  it('la hecha ENTRE bloques la atiende el que viene, no el que pasó', () => {
    expect(bloqueQueLaAtiende('2026-08-25T10:00:00Z', BLOQUES)?.nombre).toBe('Bloque 3 2026')
  })

  it('la más nueva que todos los bloques no tiene quién la atienda todavía', () => {
    expect(bloqueQueLaAtiende('2027-01-05T10:00:00Z', BLOQUES)).toBeNull()
  })

  it('los bloques sin fecha de cierre se ignoran', () => {
    expect(bloqueQueLaAtiende('2026-09-05T10:00:00Z',
      [{ id: 'x', nombre: 'Sin fecha', fecha_cierre_matricula: null }])).toBeNull()
  })
})

describe('cuándo vence', () => {
  const antesDelCierre = new Date('2026-09-10T12:00:00Z')
  const despuesDelCierre = new Date('2026-09-14T12:00:00Z')

  it('no vence mientras su bloque siga abierto', () => {
    expect(estaVencida(abierta('2026-08-25T10:00:00Z'), BLOQUES, antesDelCierre)).toBe(false)
  })

  it('vence cuando su bloque cierra la matrícula', () => {
    expect(estaVencida(abierta('2026-08-25T10:00:00Z'), BLOQUES, despuesDelCierre)).toBe(true)
  })

  it('una vieja de un bloque cerrado hace rato ya está vencida', () => {
    expect(estaVencida(abierta('2026-01-10T10:00:00Z'), BLOQUES, antesDelCierre)).toBe(true)
  })

  // Solo vencen las abiertas: 'in_review' la tiene alguien trabajándola.
  it('no toca las que no están abiertas', () => {
    for (const status of ['in_review', 'resolved', 'rejected', 'vencida']) {
      expect(estaVencida({ id: 's', status, created_at: '2026-01-10T10:00:00Z' },
        BLOQUES, despuesDelCierre)).toBe(false)
    }
  })

  it('sin bloque que la atienda, no vence', () => {
    expect(estaVencida(abierta('2027-01-05T10:00:00Z'), BLOQUES, despuesDelCierre)).toBe(false)
  })
})

describe('la tanda del cron', () => {
  it('devuelve cuáles y por qué bloque', () => {
    const r = solicitudesAVencer([
      { id: 'vieja', status: 'open', created_at: '2026-01-10T10:00:00Z' },
      { id: 'del-3', status: 'open', created_at: '2026-08-25T10:00:00Z' },
      { id: 'tomada', status: 'in_review', created_at: '2026-01-10T10:00:00Z' },
    ], BLOQUES, new Date('2026-09-14T12:00:00Z'))
    expect(r).toEqual([
      { id: 'vieja', bloque: 'Bloque 1 2026' },
      { id: 'del-3', bloque: 'Bloque 3 2026' },
    ])
  })

  it('sin nada que vencer devuelve vacío', () => {
    expect(solicitudesAVencer([], BLOQUES)).toEqual([])
  })
})
