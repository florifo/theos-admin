/**
 * Otorga `encargado_eventos` a quien YA ocupa un puesto de sede que ahora lo
 * mapea (logística, asistente de logística y anfitrión), usando el mismo RPC
 * transaccional que usa el sistema al asignar a alguien a un puesto.
 *
 *   dry-run:  NODE_OPTIONS="--conditions=react-server" npx tsx scripts/roles-sede-2026-09/otorgar-eventos-a-sedes.ts
 *   aplicar:  ... --aplicar
 *
 * POR QUÉ HACE FALTA UN BACKFILL. El mapeo puesto→rol solo corre cuando se
 * asigna o se remueve a alguien de un puesto. Las personas que ya estaban en
 * el puesto antes del cambio de regla no vuelven a pasar por ahí.
 *
 * SE USA grant_position_role, no un INSERT: ese RPC deja el rol con
 * origen='automatico' Y registra el respaldo en member_role_position_grants,
 * que es lo que hace que el rol se retire solo cuando la persona sale del
 * puesto. Un INSERT a mano daría el rol pero sin forma de quitarlo.
 */
import { Client } from 'pg'
import { readFileSync } from 'fs'
import { rolesGrantedByPosition } from '../../src/lib/servers/position-roles'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const APLICAR = process.argv.includes('--aplicar')

type Fila = {
  member_id: string; nombre: string; position_id: string
  title: string; area: string; parent: string | null; ya_lo_tiene: boolean
}

async function main() {
  const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').match(/https:\/\/([a-z0-9]+)\./)![1]
  const c = new Client({
    connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD!)}@aws-1-us-east-2.pooler.supabase.com:6543/postgres`,
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  console.log(APLICAR ? '⚠️  APLICANDO\n' : '🔍 DRY-RUN — no otorga nada\n')

  // Se traen TODOS los puestos activos de comité y se filtra con la regla del
  // sistema, no con un SQL paralelo: así el backfill y el sync no se pueden
  // desalinear.
  const { rows } = await c.query<Fila>(`
    select distinct v.member_id,
           trim(m.first_name || ' ' || m.last_name) nombre,
           sp.id position_id, sp.title, a.name area, p.name parent,
           exists (
             select 1 from member_role_position_grants g
             where g.member_id = v.member_id and g.role = 'encargado_eventos'
               and g.position_id = sp.id
           ) ya_lo_tiene
    from volunteers v
    join members m on m.id = v.member_id
    join service_positions sp on sp.id = v.position_id
    join areas a on a.id = sp.area_id and a.area_type = 'committee'
    left join areas p on p.id = a.parent_id
    where v.status = 'active'
    order by 2`)

  const aplican = rows.filter(r => rolesGrantedByPosition({
    title: r.title, areaName: r.area, areaType: 'committee', parentAreaName: r.parent,
  }).includes('encargado_eventos'))

  const faltan = aplican.filter(r => !r.ya_lo_tiene)
  const porTitulo = new Map<string, number>()
  for (const r of faltan) porTitulo.set(r.title, (porTitulo.get(r.title) ?? 0) + 1)

  console.log(`  ${aplican.length} puestos activos otorgan el rol; ${aplican.length - faltan.length} ya tienen respaldo.`)
  console.log(`  Faltan ${faltan.length}, en ${new Set(faltan.map(f => f.member_id)).size} personas:\n`)
  for (const [t, n] of [...porTitulo].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(3)}  ${t}`)
  }
  console.log()
  for (const f of faltan) console.log(`    ${f.nombre.padEnd(34)} ${f.title.padEnd(22)} ${f.area}`)

  if (!APLICAR) { console.log('\n(dry-run) Correlo con --aplicar.'); await c.end(); return }

  let ok = 0
  for (const f of faltan) {
    try {
      await c.query(`select grant_position_role($1::uuid, $2::text, $3::uuid)`,
        [f.member_id, 'encargado_eventos', f.position_id])
      ok++
    } catch (e) {
      console.error(`  ❌ ${f.nombre} · ${f.title}:`, e instanceof Error ? e.message : e)
    }
  }
  console.log(`\n  ✅ ${ok} de ${faltan.length} respaldos creados`)
  await c.end()
}

main().catch(e => { console.error('FALLO:', e.message); process.exit(1) })
