import { describe, it, expect } from 'vitest'
import { filtrarServidores } from './committee-filter'

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
