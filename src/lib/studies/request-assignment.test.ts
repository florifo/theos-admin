import { describe, it, expect } from 'vitest'
import {
  requestQueueScope, canAssignRequests, canBeAssigned, canWorkRequest, isStudyCommitteeArea,
} from './request-assignment'

describe('requestQueueScope', () => {
  it('los coordinadores ven toda la cola', () => {
    expect(requestQueueScope({ roles: ['coordinador_estudios'] })).toBe('all')
    expect(requestQueueScope({ roles: ['coordinador_dirigentes'] })).toBe('all')
    expect(requestQueueScope({ roles: ['direccion'] })).toBe('all')
    expect(requestQueueScope({ roles: ['admin'] })).toBe('all')
  })

  it('el comité ve solo lo asignado', () => {
    expect(requestQueueScope({ roles: ['miembro'], inStudyCommittee: true })).toBe('assigned')
    // Sin rol alguno: igual entra si está en el comité (es el caso de las 15
    // personas del comité que no tienen rol en el sistema).
    expect(requestQueueScope({ roles: [], inStudyCommittee: true })).toBe('assigned')
  })

  it('coordinador Y comité: gana la cola completa', () => {
    expect(requestQueueScope({ roles: ['coordinador_estudios'], inStudyCommittee: true })).toBe('all')
  })

  it('el resto no entra', () => {
    expect(requestQueueScope({ roles: ['miembro'] })).toBe('none')
    expect(requestQueueScope({ roles: ['dirigente'], inStudyCommittee: false })).toBe('none')
    expect(requestQueueScope({ roles: null })).toBe('none')
  })
})

describe('canAssignRequests', () => {
  it('asignar es de los coordinadores; el comité recibe, no reparte', () => {
    expect(canAssignRequests(['coordinador_estudios'])).toBe(true)
    expect(canAssignRequests(['miembro'])).toBe(false)
    expect(canAssignRequests([])).toBe(false)
  })
})

describe('canBeAssigned', () => {
  it('coordinadores y comité son asignables', () => {
    expect(canBeAssigned({ roles: ['coordinador_dirigentes'] })).toBe(true)
    expect(canBeAssigned({ roles: [], inStudyCommittee: true })).toBe(true)
    expect(canBeAssigned({ roles: ['miembro'] })).toBe(false)
  })
})

describe('canWorkRequest', () => {
  const req = { reviewed_by: 'm1' }

  it('el coordinador trabaja cualquiera', () => {
    expect(canWorkRequest('all', req, 'otro')).toBe(true)
    expect(canWorkRequest('all', { reviewed_by: null }, null)).toBe(true)
  })

  it('el del comité solo la que le asignaron', () => {
    expect(canWorkRequest('assigned', req, 'm1')).toBe(true)
    expect(canWorkRequest('assigned', req, 'm2')).toBe(false)
    expect(canWorkRequest('assigned', { reviewed_by: null }, 'm1')).toBe(false)
  })

  it('sin alcance o sin miembro, nunca', () => {
    expect(canWorkRequest('none', req, 'm1')).toBe(false)
    expect(canWorkRequest('assigned', req, null)).toBe(false)
  })
})

describe('isStudyCommitteeArea', () => {
  it('matchea sin acentos ni mayúsculas', () => {
    expect(isStudyCommitteeArea('Comité de Estudios Bíblicos')).toBe(true)
    expect(isStudyCommitteeArea('comite de estudios biblicos')).toBe(true)
    expect(isStudyCommitteeArea('  Comité de Estudios Bíblicos  ')).toBe(true)
  })

  it('no matchea otra área', () => {
    expect(isStudyCommitteeArea('Comité de Dirigentes')).toBe(false)
    expect(isStudyCommitteeArea(null)).toBe(false)
    expect(isStudyCommitteeArea('')).toBe(false)
  })
})

describe('isStudyCommitteeArea: el nombre real de producción', () => {
  it('reconoce el nombre que de verdad tiene el área', () => {
    // Producción: 'Comité Estudios Bíblicos', SIN el "de". La igualdad exacta
    // contra 'Comité de Estudios Bíblicos' devolvía false y dejaba el comité
    // en cero miembros.
    expect(isStudyCommitteeArea('Comité Estudios Bíblicos')).toBe(true)
  })

  it('reconoce el nombre canónico, con "de"', () => {
    expect(isStudyCommitteeArea('Comité de Estudios Bíblicos')).toBe(true)
  })

  it('da igual el orden, los acentos y las mayúsculas', () => {
    expect(isStudyCommitteeArea('COMITE ESTUDIOS BIBLICOS')).toBe(true)
    expect(isStudyCommitteeArea('Estudios Bíblicos — Comité')).toBe(true)
    expect(isStudyCommitteeArea('Comite de los Estudios Biblicos')).toBe(true)
  })

  it('exige las tres palabras: no se cuela un comité parecido', () => {
    expect(isStudyCommitteeArea('Comité de Estudios')).toBe(false)
    expect(isStudyCommitteeArea('Comité Bíblico')).toBe(false)
    expect(isStudyCommitteeArea('Estudios Bíblicos')).toBe(false)
    expect(isStudyCommitteeArea('Comité Oración')).toBe(false)
  })

  it('nombres vacíos o nulos no matchean', () => {
    expect(isStudyCommitteeArea(null)).toBe(false)
    expect(isStudyCommitteeArea(undefined)).toBe(false)
    expect(isStudyCommitteeArea('')).toBe(false)
    expect(isStudyCommitteeArea('   ')).toBe(false)
  })
})

// El rol explícito (2026-09-08) hace lo mismo que el puesto en el comité. Existe
// porque el flag derivado no se veía en Accesos ni se podía dar a mano.
describe('rol solicitudes_estudio', () => {
  it('da la misma cola que estar en el comité', () => {
    expect(requestQueueScope({ roles: ['solicitudes_estudio'] })).toBe('assigned')
    expect(requestQueueScope({ roles: [], inStudyCommittee: true })).toBe('assigned')
  })

  it('no asciende a coordinador: sigue viendo solo lo asignado', () => {
    expect(requestQueueScope({ roles: ['solicitudes_estudio'] })).not.toBe('all')
    expect(canAssignRequests(['solicitudes_estudio'])).toBe(false)
  })

  it('acompañado de un rol de coordinador, gana el coordinador', () => {
    expect(requestQueueScope({ roles: ['solicitudes_estudio', 'coordinador_estudios'] })).toBe('all')
  })

  it('sin el rol ni el puesto, no entra', () => {
    expect(requestQueueScope({ roles: ['editor_grupos_estudio'] })).toBe('none')
  })
})
