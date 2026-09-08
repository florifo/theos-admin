/**
 * Otorga `solicitudes_estudio` a quien YA tiene un puesto activo en el comité
 * de estudios bíblicos.
 *
 *   dry-run:  NODE_OPTIONS="--conditions=react-server" npx tsx scripts/roles-comite-2026-09/otorgar-solicitudes-estudio.ts
 *   aplicar:  ... --aplicar
 *
 * El mapeo puesto→rol solo corre al asignar o remover a alguien de un puesto,
 * así que quien ya estaba adentro no vuelve a pasar por ahí. Igual que el
 * backfill de encargado_eventos.
 *
 * Usa grant_position_role, el mismo RPC del sistema: además del rol registra el
 * respaldo en member_role_position_grants, que es lo que hace que el rol se
 * retire solo cuando la persona sale del comité. Un INSERT a mano lo dejaría
 * pegado para siempre.
 */
import { Client } from 'pg'
import { readFileSync } from 'fs'
import { rolesGrantedByPosition } from '../../src/lib/servers/position-roles'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const APLICAR = process.argv.includes('--aplicar')
const ROL = 'solicitudes_estudio'

async function main() {
  const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').match(/https:\/\/([a-z0-9]+)\./)![1]
  const c = new Client({
    connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD!)}@aws-1-us-east-2.pooler.supabase.com:6543/postgres`,
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  console.log(APLICAR ? '⚠️  APLICANDO\n' : '🔍 DRY-RUN — no otorga nada\n')

  const { rows } = await c.query<{
    member_id: string; nombre: string; position_id: string
    title: string; area: string; parent: string | null; ya: boolean
  }>(`
    select v.member_id, trim(m.first_name||' '||m.last_name) nombre,
           sp.id position_id, sp.title, a.name area, p.name parent,
           exists (select 1 from member_role_position_grants g
                   where g.member_id=v.member_id and g.role=$1 and g.position_id=sp.id) ya
    from volunteers v
    join members m on m.id = v.member_id
    join service_positions sp on sp.id = v.position_id
    join areas a on a.id = sp.area_id and a.area_type = 'committee'
    left join areas p on p.id = a.parent_id
    where v.status = 'active'
    order by 2`, [ROL])

  // Se filtra con la REGLA del sistema, no con un SQL paralelo: así el backfill
  // y el sync automático no se pueden desalinear.
  const aplican = rows.filter(r => rolesGrantedByPosition({
    title: r.title, areaName: r.area, areaType: 'committee', parentAreaName: r.parent,
  }).includes(ROL))
  const faltan = aplican.filter(r => !r.ya)

  console.log(`  ${aplican.length} puestos del comité otorgan el rol; ${aplican.length - faltan.length} ya lo tienen.`)
  console.log(`  Faltan ${faltan.length}, en ${new Set(faltan.map(f => f.member_id)).size} personas:\n`)
  for (const f of faltan) console.log(`    ${f.nombre.padEnd(34)} ${f.title}`)

  if (!APLICAR) { console.log('\n(dry-run) Correlo con --aplicar.'); await c.end(); return }

  let ok = 0
  for (const f of faltan) {
    try {
      await c.query(`select grant_position_role($1::uuid, $2::text, $3::uuid)`, [f.member_id, ROL, f.position_id])
      ok++
    } catch (e) {
      console.error(`  ❌ ${f.nombre}:`, e instanceof Error ? e.message : e)
    }
  }
  console.log(`\n  ✅ ${ok} de ${faltan.length} otorgados`)
  await c.end()
}

main().catch(e => { console.error('FALLO:', e.message); process.exit(1) })
