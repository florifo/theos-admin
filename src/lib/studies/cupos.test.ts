import { describe, it, expect } from 'vitest'
import { textoCupos, porcentajeOcupado } from './cupos'

describe('textoCupos', () => {
  // El caso del reporte: "8/10" se leía como 8 ocupados cuando eran 8 libres.
  it('dice cuántos quedan, con todas las letras', () => {
    expect(textoCupos(8, 10)).toBe('Quedan 8 de 10')
    expect(textoCupos(2, 10)).toBe('Quedan 2 de 10')
  })

  it('el singular no dice "Quedan 1"', () => {
    expect(textoCupos(1, 10)).toBe('Queda 1 de 10')
  })

  it('sin campo lo dice, no muestra un cero suelto', () => {
    expect(textoCupos(0, 10)).toBe('Sin campo')
    expect(textoCupos(-3, 10)).toBe('Sin campo')
  })

  it('un grupo sin tope no inventa una fracción', () => {
    expect(textoCupos(5, 0)).toBe('Sin límite')
    expect(textoCupos(5, NaN)).toBe('Sin límite')
  })

  it('no promete más campo del que cabe', () => {
    expect(textoCupos(99, 10)).toBe('Quedan 10 de 10')
  })
})

describe('porcentajeOcupado', () => {
  // La barra pinta lo OCUPADO: llena = sin campo. Antes convivía con un número
  // que decía lo disponible, y cada una reforzaba la lectura contraria.
  it('va con lo ocupado, no con lo libre', () => {
    expect(porcentajeOcupado(8, 10)).toBe(80)
    expect(porcentajeOcupado(0, 10)).toBe(0)
    expect(porcentajeOcupado(10, 10)).toBe(100)
  })

  it('no se pasa de 100 ni baja de 0', () => {
    expect(porcentajeOcupado(15, 10)).toBe(100)
    expect(porcentajeOcupado(-2, 10)).toBe(0)
  })

  it('sin tope no hay barra que llenar', () => {
    expect(porcentajeOcupado(5, 0)).toBe(0)
  })
})
