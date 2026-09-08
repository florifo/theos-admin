import { describe, it, expect } from 'vitest'
import { puedeCambiarEstado, motivoQueImpide, estadosDestino } from './request-status-change'

const interes = (from: string, to: string) => ({ requestType: 'study_interest', from, to })
const reubic = (from: string, to: string) => ({ requestType: 'relocation', from, to })

describe('a dónde se puede mover', () => {
  it('una solicitud de interés puede ir a cualquiera de los cinco', () => {
    for (const to of ['in_review', 'rejected', 'vencida', 'resolved']) {
      expect(puedeCambiarEstado(interes('open', to)), to).toBe(true)
    }
  })

  // Resolver una reubicación matricula a la persona en el grupo destino. Si se
  // pudiera marcar "resuelta" a mano, la pantalla diría que se resolvió y nadie
  // habría quedado matriculado.
  it('una reubicación NO se puede marcar resuelta a mano', () => {
    expect(puedeCambiarEstado(reubic('open', 'resolved'))).toBe(false)
    expect(motivoQueImpide(reubic('open', 'resolved')))
      .toMatch(/eligiendo el grupo destino/)
  })

  it('pero sí se puede rechazar o vencer', () => {
    expect(puedeCambiarEstado(reubic('open', 'rejected'))).toBe(true)
    expect(puedeCambiarEstado(reubic('in_review', 'vencida'))).toBe(true)
  })
})

describe('desde dónde', () => {
  it('una vencida se puede reabrir', () => {
    expect(puedeCambiarEstado(interes('vencida', 'open'))).toBe(true)
  })

  it('una rechazada también', () => {
    expect(puedeCambiarEstado(interes('rejected', 'open'))).toBe(true)
  })

  // La resolución de una reubicación ya matriculó y transfirió la inscripción
  // anterior: devolverla dejaría los datos diciendo otra cosa.
  it('una resuelta no se mueve, y el motivo lo explica', () => {
    expect(puedeCambiarEstado(interes('resolved', 'open'))).toBe(false)
    expect(motivoQueImpide(reubic('resolved', 'open'))).toMatch(/ya matriculó/)
  })

  it('mover al mismo estado no es un cambio', () => {
    expect(motivoQueImpide(interes('open', 'open'))).toMatch(/ya está en ese estado/)
  })
})

describe('estadosDestino', () => {
  it('la reubicación no ofrece resuelta', () => {
    expect(estadosDestino('relocation')).not.toContain('resolved')
  })
  it('el interés sí', () => {
    expect(estadosDestino('study_interest')).toContain('resolved')
  })
})
