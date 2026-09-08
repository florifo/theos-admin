import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import fixture from './merge-members-fks.json'

/**
 * merge_members tiene que tocar TODAS las columnas que apuntan a members.
 *
 * POR QUÉ ES UN TEST. La función reasigna y después BORRA la ficha perdedora, y
 * casi todas esas FK son ON DELETE CASCADE. Una columna olvidada no da error:
 * borra datos en silencio. Así se perdían member_spiritual_data (361 filas),
 * member_admin_data —incluido el permiso de estudios virtuales— y el respaldo
 * de los roles automáticos, en CADA fusión, hasta el 2026-09-08.
 *
 * La lista de columnas es una foto de la base (merge-members-fks.json), no se
 * deduce del SQL: parsear las migraciones con expresiones regulares encontraba
 * 21 de 84 y además daba falsos positivos. Al agregar una tabla con member_id
 * hay que regenerar la foto, y ahí es donde uno se acuerda de la función.
 */
const DIR = 'supabase/migrations'

/** La definición vigente: la última migración que redefine merge_members. */
function definicionVigente(): string {
  const archivos = readdirSync(DIR).sort().filter(f => f.endsWith('.sql'))
  for (const file of [...archivos].reverse()) {
    const sql = readFileSync(join(DIR, file), 'utf8')
    if (/create\s+or\s+replace\s+function\s+(?:public\.)?merge_members/i.test(sql)) return sql
  }
  throw new Error('no se encontró ninguna migración que defina merge_members')
}

// No llevan `SET col = keep_id` porque se resuelven con otra estrategia, que
// está documentada en la propia migración.
const RESUELTAS_APARTE = new Set([
  // Una fila por persona: merge_one_to_one rellena los huecos de la que queda
  // en vez de tirar la del duplicado.
  'member_admin_data.member_id',
  'member_spiritual_data.member_id',
  'member_notification_prefs.member_id',
  // El par (a,b) se colapsa: se reasigna y después se limpian los que quedaron
  // apuntándose a sí mismos o repetidos.
  'duplicate_dismissals.member_a',
  'duplicate_dismissals.member_b',
])

describe('merge_members no puede olvidarse de una columna', () => {
  const def = definicionVigente()
  const columnas = fixture.columnas as string[]

  it('la foto de la base tiene las 84 columnas que había al arreglarlo', () => {
    expect(columnas.length).toBe(84)
  })

  it('cada columna que apunta a members se reasigna, o se resuelve aparte', () => {
    const sinCubrir = columnas.filter(ref => {
      if (RESUELTAS_APARTE.has(ref)) return false
      const [tabla, col] = ref.split('.')
      return !new RegExp(`UPDATE\\s+${tabla}\\s+SET\\s+${col}\\s*=\\s*keep_id`, 'i').test(def)
    })
    expect(sinCubrir,
      'Estas columnas apuntan a members y la fusión no las toca. Como el FK es '
      + 'CASCADE, sus filas se borran sin aviso al eliminar el duplicado.')
      .toEqual([])
  })

  it('las tablas de una fila por persona pasan por merge_one_to_one', () => {
    for (const t of ['member_admin_data', 'member_spiritual_data', 'member_notification_prefs']) {
      expect(def).toContain(`merge_one_to_one('${t}'`)
    }
  })

  it('frena si las dos fichas son la pareja de un prematrimonial', () => {
    // Fusionarlas dejaría a alguien casándose consigo mismo; eso lo resuelve una
    // persona, no la función.
    expect(def).toMatch(/RAISE EXCEPTION 'Estas dos fichas son la pareja/i)
  })
})
