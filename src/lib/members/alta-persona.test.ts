import { describe, it, expect } from 'vitest'
import { edadEnAnios, esMenorDeEdad, validarAltaDePersona, hoyCR } from './alta-persona'

const HOY = '2026-09-07'
const base = { first_name: 'Ana', last_name: 'Mora Vargas' }

describe('edadEnAnios', () => {
  it('cuenta años cumplidos, no diferencia de años', () => {
    expect(edadEnAnios('2008-09-08', HOY)).toBe(17) // cumple mañana
    expect(edadEnAnios('2008-09-07', HOY)).toBe(18) // cumple hoy
    expect(edadEnAnios('2008-09-06', HOY)).toBe(18)
  })

  // new Date('2008-09-07') es medianoche UTC = 6pm del 6 en Costa Rica; quien
  // cumple años hoy saldría con un año menos si se comparara con objetos Date.
  it('quien cumple años hoy ya es mayor', () => {
    expect(esMenorDeEdad('2008-09-07', HOY)).toBe(false)
  })

  it('descarta lo que no sirve', () => {
    expect(edadEnAnios('', HOY)).toBeNull()
    expect(edadEnAnios('07/09/2008', HOY)).toBeNull()
    expect(edadEnAnios('2030-01-01', HOY)).toBeNull() // futuro
  })
})

describe('a quién se le exige cédula', () => {
  it('al adulto sí', () => {
    const r = validarAltaDePersona({ ...base, birth_date: '1990-04-02' }, HOY)
    expect(r.exigeCedula).toBe(true)
    expect(r.ok).toBe(false)
    expect(r.errores.cedula).toMatch(/obligatoria/)
  })

  it('al menor no', () => {
    const r = validarAltaDePersona({ ...base, birth_date: '2015-04-02' }, HOY)
    expect(r.exigeCedula).toBe(false)
    expect(r.ok).toBe(true)
  })

  // "No sé la edad" no puede ser la puerta que vacíe la regla.
  it('sin fecha de nacimiento se pide igual', () => {
    expect(validarAltaDePersona(base, HOY).exigeCedula).toBe(true)
    expect(validarAltaDePersona({ ...base, birth_date: '' }, HOY).ok).toBe(false)
  })
})

describe('formato de la cédula', () => {
  it('acepta nacional y DIMEX, con guiones o sin ellos', () => {
    for (const c of ['1-1234-5678', '112345678', '155812345678']) {
      expect(validarAltaDePersona({ ...base, cedula: c }, HOY).ok).toBe(true)
    }
  })

  it('rechaza lo que no tiene forma de cédula', () => {
    const r = validarAltaDePersona({ ...base, cedula: '123' }, HOY)
    expect(r.ok).toBe(false)
    expect(r.errores.cedula).toMatch(/9 dígitos/)
  })

  // Un menor puede no tener cédula, pero si le ponen una, tiene que servir.
  it('al menor con cédula mal escrita también se le avisa', () => {
    const r = validarAltaDePersona({ ...base, cedula: 'abc', birth_date: '2015-04-02' }, HOY)
    expect(r.ok).toBe(false)
    expect(r.errores.cedula).toBeTruthy()
  })
})

describe('nombre y apellidos', () => {
  it('los dos hacen falta', () => {
    const r = validarAltaDePersona({ first_name: '  ', last_name: '', cedula: '112345678' }, HOY)
    expect(r.errores.first_name).toBeTruthy()
    expect(r.errores.last_name).toBeTruthy()
  })
})

describe('hoyCR', () => {
  it('a las 8pm CR el día todavía no cambió, aunque en UTC ya sea el siguiente', () => {
    expect(hoyCR(new Date('2026-09-08T02:00:00Z'))).toBe('2026-09-07')
  })
})
