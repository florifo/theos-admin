// Los badges del sidebar se piden a endpoints que exigen rol. La condición que
// decide si se PIDEN tiene que cubrir todos los casos donde se DIBUJAN, o
// alguien se queda sin badge en silencio.
//
// Pasó al gatearlos el 2026-08-24: la primera versión miraba solo el alcance del
// módulo estudios, y el comité de estudios bíblicos (in_study_committee) tiene
// alcance 'own' — le apagaba el badge. Se encontró revisando los tres sitios que
// usan openRequests, no escribiendo la condición.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const SIDEBAR = readFileSync('src/components/layout/Sidebar.tsx', 'utf8')

describe('los badges se piden solo si pueden verse', () => {
  it('no se piden sin condición: un miembro no debe generar 403', () => {
    // El fetch va DENTRO de un if. Antes se llamaba siempre y el 403 se comía
    // en silencio: dos por navegación, por cada una de las ~18 mil cuentas.
    for (const url of ['/api/studies/requests?count=open', '/api/finance/requests?count=open']) {
      const i = SIDEBAR.indexOf(url)
      expect(i, `${url} ya no está en el sidebar`).toBeGreaterThan(-1)
      const antes = SIDEBAR.slice(Math.max(0, i - 400), i)
      expect(antes, `${url} se pide sin gatear`).toMatch(/if \(puedeVer(Estudios|Finanzas)\) \{/)
    }
  })

  it('la condición de estudios incluye al comité, que tiene alcance own', () => {
    const cond = SIDEBAR.slice(
      SIDEBAR.indexOf('const puedeVerEstudios'),
      SIDEBAR.indexOf('const puedeVerFinanzas'),
    )
    // 2026-09-08: las dos formas de tener cola —el puesto en el comité y el rol
    // solicitudes_estudio— se unificaron en `tieneColaSolicitudes`, que se
    // define justo arriba. La condición tiene que apoyarse en esa variable.
    expect(cond).toContain('tieneColaSolicitudes')
    const decl = SIDEBAR.slice(
      SIDEBAR.indexOf('const tieneColaSolicitudes'),
      SIDEBAR.indexOf('const puedeVerEstudios'),
    )
    expect(decl).toContain('in_study_committee')
    expect(decl).toContain('solicitudes_estudio')
  })

  it('el ítem de solicitudes se arma UNA vez y detrás de esa condición', () => {
    // Antes había tres copias del ítem repartidas por las ramas del submenú, y
    // este test contaba que fueran tres. Al agregar el rol se descubrió el
    // problema de fondo: la rama de "solo grupos" no tenía copia, así que quien
    // estaba en el comité Y tenía editor_grupos_estudio se quedaba sin el
    // enlace. Ahora el ítem es uno solo y se reparte a todas las ramas.
    // Dos usos, y son distintos a propósito: el ítem del COMITÉ (una sola
    // definición, SOLICITUDES_ASIGNADAS) y el badge que se le pega al ítem que
    // ESTUDIOS_SUB ya trae para quien tiene el módulo completo. Si aparece un
    // tercero, alguien volvió a copiar el ítem.
    const usos = [...SIDEBAR.matchAll(/badge: openRequests/g)].length
    expect(usos, 'el ítem volvió a duplicarse: revisá SOLICITUDES_ASIGNADAS').toBe(2)
    const decl = SIDEBAR.slice(
      SIDEBAR.indexOf('const SOLICITUDES_ASIGNADAS'),
      SIDEBAR.indexOf('const SOLICITUDES_ASIGNADAS') + 300,
    )
    expect(decl).toContain('tieneColaSolicitudes')
    // Y se reparte a las tres ramas que NO son la del módulo completo (esa ya
    // trae el ítem desde ESTUDIOS_SUB): solo-grupos, dirigente y sin rol.
    // La de solo-grupos es la que faltaba y dejaba a Luis sin el enlace.
    const ramas = [...SIDEBAR.matchAll(/\.\.\.SOLICITUDES_ASIGNADAS/g)].length
    expect(ramas, 'alguna rama del submenú se quedó sin el ítem').toBe(3)
  })
})
