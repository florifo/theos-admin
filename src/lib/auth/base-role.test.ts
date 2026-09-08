// El rol MÍNIMO de cualquier persona con ficha. Verificado en navegador el
// 2026-08-24 con una cuenta de roles vacíos: aterriza en su perfil, ve el tab
// de Familia, abre el perfil de su pariente y entra a /estudios/plan; el padrón
// le queda denegado.
//
// Por qué existe este archivo: el default vivía COPIADO en getAuthContext() y en
// /api/auth/me, sin ningún test. Los dos tienen que dar el mismo resultado — si
// el servidor cree que no hay rol y el cliente cree que sí, la pantalla se
// deniega con datos que sí llegaron. Acá se fija el invariante y se verifica que
// no vuelva a haber una segunda copia.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { withBaseRole, hasModulePermission, moduleScope, hasManagementRole, ROLES } from './roles'
import { landsOnProfile } from './home-route'

describe('withBaseRole', () => {
  it('sin roles da miembro', () => {
    expect(withBaseRole([])).toEqual(['miembro'])
    expect(withBaseRole(null)).toEqual(['miembro'])
    expect(withBaseRole(undefined)).toEqual(['miembro'])
  })

  it('con roles explícitos TAMBIÉN agrega miembro', () => {
    // Cambió el 2026-08-29. Antes el rol base solo aplicaba a quien no tenía
    // ninguno, y un rol operativo que no declara el módulo `miembros` dejaba a
    // la persona sin su propio perfil (72 casos reales, casi todos
    // encargado_eventos). Un rol se suma a lo que sos; no reemplaza el piso.
    expect(withBaseRole(['admin'])).toEqual(['admin', 'miembro'])
    expect(withBaseRole(['dirigente', 'finanzas'])).toEqual(['dirigente', 'finanzas', 'miembro'])
  })

  it('no duplica miembro si ya venía escrito en la base', () => {
    expect(withBaseRole(['miembro'])).toEqual(['miembro'])
    expect(withBaseRole(['miembro', 'dirigente'])).toEqual(['miembro', 'dirigente'])
  })

  it('TODO rol conserva el acceso a su propio perfil', () => {
    // El invariante que se rompió. Se comprueba contra la lista completa de
    // roles, no contra una muestra: un rol nuevo que no declare `miembros`
    // vuelve a romperlo en silencio si no se mira acá.
    for (const rol of ROLES.map(r => r.id)) {
      const efectivos = withBaseRole([rol])
      expect(hasModulePermission(efectivos, 'miembros', 'view'), `rol ${rol}`).toBe(true)
    }
  })

  it('el rol base no le quita el dashboard a quien lo tiene', () => {
    // Esto probaba que agregar 'miembro' por debajo no tumbara el dashboard.
    // Sigue siendo cierto, pero la lista cambió el 2026-09-08: ahora el
    // dashboard es SOLO de reportes, dirección y admin, así que
    // encargado_eventos —que antes lo tenía por descarte— ya no.
    expect(landsOnProfile(withBaseRole(['admin']))).toBe(false)
    expect(landsOnProfile(withBaseRole(['direccion']))).toBe(false)
    expect(landsOnProfile(withBaseRole(['reportes']))).toBe(false)
    expect(landsOnProfile(withBaseRole(['encargado_eventos']))).toBe(true)
    expect(landsOnProfile(withBaseRole(['dirigente']))).toBe(true)
  })

  it('el rol base no convierte a nadie en gestión, ni al revés', () => {
    expect(hasManagementRole(withBaseRole([]))).toBe(false)
    expect(hasManagementRole(withBaseRole(['encargado_eventos']))).toBe(true)
  })

  it('no muta el arreglo que recibe', () => {
    const entrada: never[] = []
    withBaseRole(entrada)
    expect(entrada).toEqual([])
  })
})

describe('lo que el rol base habilita, y lo que no', () => {
  const base = withBaseRole([])

  it('ve su propio perfil, con alcance own', () => {
    expect(hasModulePermission(base, 'miembros', 'view')).toBe(true)
    expect(moduleScope(base, 'miembros')).toBe('own')
  })

  it('NO ve el padrón: eso exige alcance all', () => {
    expect(moduleScope(base, 'miembros')).not.toBe('all')
  })

  it('no puede editar ni exportar', () => {
    for (const accion of ['create', 'edit', 'delete', 'export']) {
      expect(hasModulePermission(base, 'miembros', accion)).toBe(false)
    }
  })

  it('aterriza en su perfil, no en el dashboard', () => {
    expect(landsOnProfile(base)).toBe(true)
  })

  it('no cuenta como rol de gestión', () => {
    expect(hasManagementRole(base)).toBe(false)
  })
})

// El invariante se rompe si alguien vuelve a escribir el default a mano en vez
// de llamar a withBaseRole. Esto lo caza.
describe('el default no está duplicado', () => {
  it("nadie escribe el fallback ['miembro'] a mano", () => {
    const archivos = execSync(
      "grep -rl \"'miembro'\" src --include='*.ts' --include='*.tsx'",
      { encoding: 'utf8' },
    ).trim().split('\n').filter(Boolean)
    const copias: string[] = []
    for (const f of archivos) {
      // roles.ts es DONDE VIVE el default (dentro de withBaseRole): es la
      // única copia legítima. Este test busca las copias de más.
      if (f.endsWith('base-role.test.ts') || f.endsWith('auth/roles.ts')) continue
      const txt = readFileSync(f, 'utf8')
      // El patrón exacto que había duplicado: `… ? … : ['miembro']`
      for (const m of txt.matchAll(/\?[^\n]*:\s*\[\s*'miembro'\s*\]/g)) {
        copias.push(`${f}:${txt.slice(0, m.index!).split('\n').length}`)
      }
    }
    expect(copias).toEqual([])
  })

  it('withBaseRole es lo que usan los dos lectores de roles', () => {
    for (const f of ['src/lib/auth/guard.ts', 'src/app/api/auth/me/route.ts']) {
      expect(readFileSync(f, 'utf8')).toContain('withBaseRole(')
    }
  })
})
