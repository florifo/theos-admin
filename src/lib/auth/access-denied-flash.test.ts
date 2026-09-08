import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

/**
 * Ninguna pantalla puede pintar "Acceso restringido" antes de saber quién es.
 *
 * `can()` y `hasRole()` devuelven false mientras la sesión carga — no porque la
 * persona no tenga permiso, sino porque todavía no hay roles. Una pantalla que
 * decide ahí muestra la pantalla de denegado por un instante en CADA carga y
 * después salta al contenido. Con la fila esperando en un check-in, ver "Acceso
 * restringido" no es un detalle estético.
 *
 * Se detectó porque quedó grabado en el tutorial del check-in (2026-09-08); al
 * revisarlo, pasaba en 7 pantallas.
 *
 * La regla: en el mismo archivo, o el `return <AccessDenied />` va condicionado
 * a `loaded`, o antes hay un corte que espera (`if (!loaded)` / `if (!authLoaded)`).
 */
function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full))
    else if (name.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('la pantalla de acceso restringido no parpadea', () => {
  it('toda pantalla que la muestra espera a que carguen los roles', () => {
    const culpables: string[] = []
    for (const file of [...tsxFiles('src/app'), ...tsxFiles('src/components')]) {
      const src = readFileSync(file, 'utf8')
      if (!src.includes('<AccessDenied')) continue
      // El layout tiene su propio corte explícito y comentado.
      if (file.endsWith(join('(admin)', 'layout.tsx'))) continue
      // Un corte de carga a nivel de página vale para todo el archivo: da igual
      // que la bandera se llame `loaded`, `authLoaded` o `loading`.
      const esperaAntes = /if \((?:!\w*[Ll]oaded|loading)\b/.test(src)
      if (esperaAntes) continue
      // Si no, la condición tiene que estar pegada al return — puede venir en
      // la línea anterior, que es como se escribe cuando el bloque es largo.
      const lineas = src.split('\n')
      const suelto = lineas.some((l, i) =>
        l.includes('<AccessDenied')
        && !lineas.slice(Math.max(0, i - 2), i + 1).some(x => /\bloaded\b/i.test(x)))
      if (suelto) culpables.push(file)
    }
    expect(culpables, `Estas pantallas deciden antes de saber quién es:\n${culpables.join('\n')}`)
      .toEqual([])
  })
})
