import { describe, it, expect } from 'vitest'
import { rolesGrantedByPosition, type PositionContext } from './position-roles'

/** Un puesto de comité de sede tal como vive en el catálogo real: los 14
 *  comités con puestos cuelgan del área "Sedes". */
function enSede(title: string, areaName = 'Sede Pedregal Jueves'): PositionContext {
  return { title, areaName, areaType: 'committee', parentAreaName: 'Sedes' }
}

describe('encargado_eventos por puesto de sede', () => {
  it('lo dan logística y anfitrión, que es lo que se pidió', () => {
    for (const t of ['Logística', 'Asistente Logística', 'Anfitrión']) {
      expect(rolesGrantedByPosition(enSede(t))).toContain('encargado_eventos')
    }
  })

  it('lo siguen dando bienvenida e información', () => {
    for (const t of ['Colaborador Bienvenida', 'Colaborador de Bienvenida',
                     'Coordinador Bienvenida', 'Coordinador Información']) {
      expect(rolesGrantedByPosition(enSede(t))).toContain('encargado_eventos')
    }
  })

  // La regla exigía que el comité colgara de "Área Espiritual". Ninguno de los
  // 14 comités de sede con puestos cuelga de ahí —cuelgan de "Sedes"—, así que
  // la regla no otorgaba nada al asignar a alguien. Este test fija el arreglo.
  it('el comité de sede cuelga de "Sedes", no de "Área Espiritual"', () => {
    const ctx = enSede('Logística')
    expect(ctx.parentAreaName).toBe('Sedes')
    expect(rolesGrantedByPosition(ctx)).toEqual(['encargado_eventos'])
  })

  it('también vale un comité que se llama "Sede X" colgando de otra área', () => {
    expect(rolesGrantedByPosition({
      title: 'Logística', areaName: 'Sede Life Este',
      areaType: 'committee', parentAreaName: 'Area Espiritual',
    })).toContain('encargado_eventos')
  })

  it('no lo dan los otros puestos de la misma sede', () => {
    for (const t of ['Colaborador Comida', 'Colaborador Finanzas', 'Colaborador Montaje',
                     'Colaborador Información', 'Coordinador Comida']) {
      expect(rolesGrantedByPosition(enSede(t))).not.toContain('encargado_eventos')
    }
  })

  it('no lo da un puesto de logística fuera de una sede', () => {
    expect(rolesGrantedByPosition({
      title: 'Colaborador producción logistica', areaName: 'Comité Experiencia',
      areaType: 'committee', parentAreaName: 'Área Operaciones',
    })).not.toContain('encargado_eventos')
    expect(rolesGrantedByPosition({
      title: 'Colaborador Mujeres Logistica', areaName: 'Comité de Mujeres',
      areaType: 'committee', parentAreaName: 'Area Espiritual',
    })).not.toContain('encargado_eventos')
  })

  it('los acentos y el "de" no cambian el resultado', () => {
    expect(rolesGrantedByPosition(enSede('LOGISTICA'))).toContain('encargado_eventos')
    expect(rolesGrantedByPosition(enSede('  Anfitrion  '))).toContain('encargado_eventos')
  })
})

describe('lider_comite', () => {
  it('lo da el encargado de un comité, de cualquier área', () => {
    expect(rolesGrantedByPosition(enSede('Encargado'))).toContain('lider_comite')
    expect(rolesGrantedByPosition({
      title: 'Encargado de comité', areaName: 'Comité Experiencia',
      areaType: 'committee', parentAreaName: 'Área Operaciones',
    })).toContain('lider_comite')
  })

  it('no lo dan los sub-roles', () => {
    for (const t of ['Asistente Encargado', 'Encargado GR', 'Ayudante de Encargado Place Heredia']) {
      expect(rolesGrantedByPosition(enSede(t))).not.toContain('lider_comite')
    }
  })
})
