import { describe, it, expect } from 'vitest'
import {
  desfaseMs, ymdEnZona, hhmmEnZona, paredAIso, horaEnDosZonas,
  zonaValida, etiquetaZona, ZONA_CR,
} from './timezone'

const MADRID = 'Europe/Madrid'
const H = 3600_000

describe('desfase real, no constante', () => {
  it('Costa Rica es siempre UTC-6, en cualquier fecha', () => {
    for (const iso of ['2026-01-15T12:00:00Z', '2026-07-15T12:00:00Z', '2027-03-30T12:00:00Z']) {
      expect(desfaseMs(ZONA_CR, new Date(iso))).toBe(-6 * H)
    }
  })

  // Esta es la razón de todo el módulo: en Madrid el desfase CAMBIA, y con un
  // -6h fijo los eventos de allá se corren una hora dos veces al año.
  it('Madrid es +2h en verano y +1h en invierno', () => {
    expect(desfaseMs(MADRID, new Date('2026-07-15T12:00:00Z'))).toBe(2 * H)
    expect(desfaseMs(MADRID, new Date('2026-01-15T12:00:00Z'))).toBe(1 * H)
  })

  it('la diferencia Madrid–Costa Rica es de 8 horas en julio y 7 en enero', () => {
    const dif = (iso: string) =>
      (desfaseMs(MADRID, new Date(iso)) - desfaseMs(ZONA_CR, new Date(iso))) / H
    expect(dif('2026-07-15T12:00:00Z')).toBe(8)
    expect(dif('2026-01-15T12:00:00Z')).toBe(7)
  })
})

describe('hora de pared → instante y vuelta', () => {
  it('un domingo a las 12:00 de Madrid, en verano, son las 10:00 UTC y 4:00am en CR', () => {
    const iso = paredAIso(MADRID, '2026-09-13', '12:00')!
    expect(iso).toBe('2026-09-13T10:00:00.000Z')
    expect(hhmmEnZona(ZONA_CR, new Date(iso))).toBe('04:00')
  })

  it('el mismo domingo a las 12:00 pero en enero cae a las 5:00am en CR', () => {
    const iso = paredAIso(MADRID, '2027-01-17', '12:00')!
    expect(iso).toBe('2027-01-17T11:00:00.000Z')
    expect(hhmmEnZona(ZONA_CR, new Date(iso))).toBe('05:00')
  })

  it('ida y vuelta no pierde nada, a un lado y al otro del cambio de horario', () => {
    for (const [fecha, hora] of [['2026-09-13', '12:00'], ['2027-01-17', '12:00'], ['2026-10-25', '03:30']]) {
      const iso = paredAIso(MADRID, fecha, hora)!
      expect(ymdEnZona(MADRID, new Date(iso))).toBe(fecha)
      expect(hhmmEnZona(MADRID, new Date(iso))).toBe(hora)
    }
  })

  it('en Costa Rica las 19:30 son las 01:30 UTC del día siguiente', () => {
    expect(paredAIso(ZONA_CR, '2026-09-09', '19:30')).toBe('2026-09-10T01:30:00.000Z')
  })

  it('el día en Costa Rica no se corre: a las 7:30pm sigue siendo el mismo día', () => {
    expect(ymdEnZona(ZONA_CR, new Date('2026-09-10T01:30:00Z'))).toBe('2026-09-09')
  })

  it('una fecha inválida devuelve null en vez de reventar', () => {
    expect(paredAIso(MADRID, '13/09/2026', '12:00')).toBeNull()
  })
})

describe('cómo se muestra', () => {
  it('un evento de Costa Rica no necesita aclaración', () => {
    expect(horaEnDosZonas(ZONA_CR, new Date('2026-09-09T01:30:00Z'))).toBeNull()
  })

  it('uno de Madrid muestra las dos horas', () => {
    expect(horaEnDosZonas(MADRID, new Date('2026-09-13T10:00:00Z')))
      .toEqual({ propia: '12:00', cr: '04:00' })
  })

  it('una zona desconocida cae a Costa Rica en vez de romper', () => {
    expect(zonaValida('Marte/Olympus')).toBe(ZONA_CR)
    expect(zonaValida(null)).toBe(ZONA_CR)
    expect(etiquetaZona('Marte/Olympus')).toBe(ZONA_CR)
  })
})
