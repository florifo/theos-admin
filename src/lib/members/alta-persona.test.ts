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

// El asistente de /miembros/nuevo acepta DNI/NIE y pasaporte además de cédula.
// Sin el tipo, un pasaporte se rechazaría por "no tiene forma de cédula".
describe('otros tipos de documento', () => {
  const HOY_ = '2026-09-07'
  const b = { first_name: 'Ana', last_name: 'Mora Vargas' }

  it('acepta un DNI español válido y rechaza uno mal escrito', () => {
    expect(validarAltaDePersona({ ...b, document_type: 'dni_nie', cedula: '12345678Z' }, HOY_).ok).toBe(true)
    expect(validarAltaDePersona({ ...b, document_type: 'dni_nie', cedula: '112345678' }, HOY_).ok).toBe(false)
  })

  it('acepta un pasaporte, que no tiene forma de cédula', () => {
    expect(validarAltaDePersona({ ...b, document_type: 'pasaporte', cedula: 'AB123456' }, HOY_).ok).toBe(true)
  })

  it('sin tipo se asume cédula de Costa Rica', () => {
    expect(validarAltaDePersona({ ...b, cedula: '12345678Z' }, HOY_).ok).toBe(false)
  })

  it('el documento también es obligatorio para el adulto con pasaporte', () => {
    const r = validarAltaDePersona({ ...b, document_type: 'pasaporte' }, HOY_)
    expect(r.ok).toBe(false)
    expect(r.errores.cedula).toMatch(/documento es obligatorio/)
  })
})

// El correo hace falta para crearle la cuenta de acceso. Solo se exige donde el
// alta es la única oportunidad de pedirlo (el check-in, con la persona
// enfrente): en gestión se puede completar después.
describe('correo obligatorio para crear la cuenta', () => {
  const HOY_ = '2026-09-07'
  const adulto = { first_name: 'Ana', last_name: 'Mora', cedula: '112345678', birth_date: '1990-01-01' }

  it('sin exigirCorreo no cambia nada', () => {
    const r = validarAltaDePersona(adulto, HOY_)
    expect(r.exigeCorreo).toBe(false)
    expect(r.ok).toBe(true)
  })

  it('con exigirCorreo, el adulto sin correo no pasa', () => {
    const r = validarAltaDePersona({ ...adulto, exigirCorreo: true }, HOY_)
    expect(r.exigeCorreo).toBe(true)
    expect(r.ok).toBe(false)
    expect(r.errores.email).toMatch(/obligatorio/)
  })

  it('con correo válido pasa', () => {
    expect(validarAltaDePersona({ ...adulto, exigirCorreo: true, email: 'ana@correo.com' }, HOY_).ok).toBe(true)
  })

  it('un correo mal escrito se avisa aunque no fuera obligatorio', () => {
    const r = validarAltaDePersona({ ...adulto, email: 'ana@@correo' }, HOY_)
    expect(r.ok).toBe(false)
    expect(r.errores.email).toMatch(/formato/)
  })

  // AUTH-1: por debajo de 12 no se crean cuentas, así que pedir el correo sería
  // pedir un dato que no se va a usar.
  it('a un menor de 12 no se le pide, aunque sí se le pidiera al resto', () => {
    const r = validarAltaDePersona({
      first_name: 'Luis', last_name: 'Mora', birth_date: '2018-01-01', exigirCorreo: true,
    }, HOY_)
    expect(r.exigeCorreo).toBe(false)
    expect(r.errores.email).toBeUndefined()
  })

  // El umbral del correo (12) y el del documento (18) son distintos a propósito.
  it('a un chico de 15 se le pide correo pero no cédula', () => {
    const r = validarAltaDePersona({
      first_name: 'Sofía', last_name: 'Mora', birth_date: '2011-01-01', exigirCorreo: true,
    }, HOY_)
    expect(r.exigeCedula).toBe(false)
    expect(r.exigeCorreo).toBe(true)
  })
})
