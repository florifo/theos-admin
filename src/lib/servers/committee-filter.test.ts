import { describe, it, expect } from 'vitest'
import { filtrarServidores, puestosDisponibles } from './committee-filter'

const gente = [
  { name: 'Ana Mora', status: 'active' },
  { name: 'Beto Solís', status: 'active' },
  { name: 'Carla Mora', status: 'inactive' },
  { name: 'Dina Rojas', status: 'inactive' },
]

describe('el export baja lo mismo que muestra la tabla', () => {
  it('con el filtro en Activos, solo los activos', () => {
    expect(filtrarServidores(gente, { status: 'active' }).map(x => x.name))
      .toEqual(['Ana Mora', 'Beto Solís'])
  })

  it('con el filtro en Inactivos, solo los inactivos', () => {
    expect(filtrarServidores(gente, { status: 'inactive' }).map(x => x.name))
      .toEqual(['Carla Mora', 'Dina Rojas'])
  })

  it('con Todos, los dos grupos', () => {
    expect(filtrarServidores(gente, { status: 'all' })).toHaveLength(4)
  })

  it('sin decir nada, el default es Activos — el mismo de la pantalla', () => {
    expect(filtrarServidores(gente, {})).toHaveLength(2)
  })

  it('la búsqueda se suma al estado, no lo reemplaza', () => {
    expect(filtrarServidores(gente, { search: 'mora', status: 'active' }).map(x => x.name))
      .toEqual(['Ana Mora'])
    expect(filtrarServidores(gente, { search: 'mora', status: 'all' }).map(x => x.name))
      .toEqual(['Ana Mora', 'Carla Mora'])
  })

  it('la búsqueda no distingue mayúsculas ni espacios de más', () => {
    expect(filtrarServidores(gente, { search: '  BETO ', status: 'all' })).toHaveLength(1)
  })

  // El caso que originó todo: 67 activos + 17 inactivos. Con el filtro por
  // defecto el archivo tiene que traer 67, no 84.
  it('el default nunca arrastra a los inactivos', () => {
    const muchos = [
      ...Array.from({ length: 67 }, (_, i) => ({ name: `Activo ${i}`, status: 'active' })),
      ...Array.from({ length: 17 }, (_, i) => ({ name: `Inactivo ${i}`, status: 'inactive' })),
    ]
    expect(filtrarServidores(muchos, {})).toHaveLength(67)
    expect(filtrarServidores(muchos, { status: 'all' })).toHaveLength(84)
  })
})

// El filtro por puesto (2026-09-08): un comité grande tiene decenas de personas
// repartidas en una docena de puestos y no había cómo mirar uno solo.
describe('filtro por puesto', () => {
  const comite = [
    { name: 'Ana Mora', status: 'active', position: 'Colaborador Bienvenida' },
    { name: 'Beto Solís', status: 'active', position: 'Colaborador Comida' },
    { name: 'Carla Mora', status: 'active', position: 'Colaborador Bienvenida' },
    { name: 'Dina Rojas', status: 'inactive', position: 'Anfitrión' },
    { name: 'Elena Paz', status: 'active', position: null },
  ]

  it('deja solo el puesto elegido', () => {
    expect(filtrarServidores(comite, { position: 'Colaborador Bienvenida' }).map(x => x.name))
      .toEqual(['Ana Mora', 'Carla Mora'])
  })

  it('«todos» no filtra nada', () => {
    expect(filtrarServidores(comite, { position: 'all', status: 'all' })).toHaveLength(5)
  })

  it('se combina con el estado y la búsqueda, no los reemplaza', () => {
    expect(filtrarServidores(comite, { position: 'Anfitrión', status: 'active' })).toHaveLength(0)
    expect(filtrarServidores(comite, { position: 'Anfitrión', status: 'all' }).map(x => x.name))
      .toEqual(['Dina Rojas'])
    expect(filtrarServidores(comite, { position: 'Colaborador Bienvenida', search: 'carla' }).map(x => x.name))
      .toEqual(['Carla Mora'])
  })

  it('quien no tiene puesto no aparece al filtrar por uno', () => {
    expect(filtrarServidores(comite, { position: 'Colaborador Comida' }).map(x => x.name))
      .toEqual(['Beto Solís'])
  })
})

describe('puestosDisponibles', () => {
  const comite = [
    { name: 'A', status: 'active', position: 'Colaborador Comida' },
    { name: 'B', status: 'inactive', position: 'Anfitrión' },
    { name: 'C', status: 'active', position: 'Colaborador Comida' },
    { name: 'D', status: 'active', position: null },
    { name: 'E', status: 'active', position: '  ' },
  ]

  it('sin repetidos y en orden alfabético', () => {
    expect(puestosDisponibles(comite)).toEqual(['Anfitrión', 'Colaborador Comida'])
  })

  // Si dependiera del filtro de estado, elegir un puesto que solo tienen los
  // inactivos lo haría desaparecer del desplegable y no habría cómo volver.
  it('incluye los puestos de los inactivos', () => {
    expect(puestosDisponibles(comite)).toContain('Anfitrión')
  })

  it('ignora los vacíos', () => {
    expect(puestosDisponibles(comite)).not.toContain('')
  })
})
