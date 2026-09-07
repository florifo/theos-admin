/**
 * Dos charlas DE PRUEBA para hoy, para probar el check-in: una con subevento
 * de Youth y otra sin. No son públicas, no son recurrentes y llevan [PRUEBA] en
 * el título para poder encontrarlas y borrarlas después.
 *
 *   dry-run:  NODE_OPTIONS="--conditions=react-server" npx tsx scripts/pruebas/charlas-de-prueba.ts
 *   aplicar:  ... --aplicar
 *   borrar:   ... --borrar
 *
 * Arrancan hoy a las 6:00pm y terminan a las 8:00pm, hora de Costa Rica.
 */
import { Client } from 'pg'
import { readFileSync } from 'fs'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const APLICAR = process.argv.includes('--aplicar')
const BORRAR = process.argv.includes('--borrar')

const MARCA = '[PRUEBA]'
const TITULOS = [`${MARCA} Charla con Youth`, `${MARCA} Charla sin Youth`]
const CUPO_YOUTH = 50

async function main() {
  const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').match(/https:\/\/([a-z0-9]+)\./)![1]
  const c = new Client({
    connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD!)}@aws-1-us-east-2.pooler.supabase.com:6543/postgres`,
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()

  if (BORRAR) {
    const { rows } = await c.query<{ id: string; title: string }>(
      `select id, title from events where title = any($1)`, [TITULOS])
    if (rows.length === 0) { console.log('No hay charlas de prueba que borrar.'); await c.end(); return }
    for (const r of rows) {
      const { rows: ch } = await c.query(`select count(*)::int n from event_checkins where event_id = $1`, [r.id])
      console.log(`  - ${r.title} (${ch[0].n} check-ins)`)
    }
    if (!APLICAR) { console.log('\n(dry-run) Correlo con --borrar --aplicar.'); await c.end(); return }
    await c.query('begin')
    try {
      const ids = rows.map(r => r.id)
      await c.query(`delete from event_checkins where event_id = any($1)`, [ids])
      await c.query(`delete from sub_events where event_id = any($1)`, [ids])
      await c.query(`delete from event_registrations where event_id = any($1)`, [ids])
      await c.query(`delete from events where id = any($1)`, [ids])
      await c.query('commit')
      console.log(`\n  ✅ ${ids.length} charla(s) de prueba borradas`)
    } catch (e) {
      await c.query('rollback'); console.error('❌ rollback:', e instanceof Error ? e.message : e); process.exit(1)
    }
    await c.end(); return
  }

  // Hoy en Costa Rica, 6:00pm–8:00pm. El día se saca del reloj CR, no del UTC:
  // pasadas las 6pm CR en UTC ya es mañana y el evento caería fuera del día.
  const hoyCR = new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10)
  // 18:00 CR = 24:00 UTC del mismo día, que no es una hora válida: hay que dejar
  // que Date.UTC ruede al día siguiente en vez de armar la cadena a mano.
  const enUTC = (horaCR: number) => new Date(Date.UTC(
    Number(hoyCR.slice(0, 4)), Number(hoyCR.slice(5, 7)) - 1, Number(hoyCR.slice(8, 10)),
    horaCR + 6, 0, 0,
  )).toISOString()
  const inicio = enUTC(18)
  const fin = enUTC(20)
  const { rows: sede } = await c.query<{ id: string; name: string }>(
    `select id, name from sedes where code = 'pedregal-miercoles' limit 1`)

  console.log(APLICAR ? '⚠️  APLICANDO\n' : '🔍 DRY-RUN — no crea nada\n')
  console.log(`  inicio ${inicio}  fin ${fin}`)
  console.log(`  sede   ${sede[0]?.name ?? '(sin sede)'}`)
  for (const t of TITULOS) console.log(`  + ${t}${t.includes('con Youth') ? ' (+ subevento Youth)' : ''}`)

  const { rows: ya } = await c.query<{ title: string }>(
    `select title from events where title = any($1)`, [TITULOS])
  if (ya.length > 0) {
    console.log(`\n⚠️  ya existen y NO se duplican: ${ya.map(y => y.title).join(', ')}`)
    console.log('   Borralas primero con --borrar --aplicar.')
  }
  if (!APLICAR) { console.log('\n(dry-run) Correlo con --aplicar.'); await c.end(); return }

  const yaSet = new Set(ya.map(y => y.title))
  await c.query('begin')
  try {
    for (const titulo of TITULOS) {
      if (yaSet.has(titulo)) continue
      const conYouth = titulo.includes('con Youth')
      const { rows } = await c.query<{ id: string }>(
        `insert into events (
           title, description, event_type, starts_at, ends_at,
           sede_id, currency, requires_checkin,
           is_recurring, is_public, is_active, status, is_virtual,
           requires_registration, requires_payment
         ) values ($1,$2,'charla',$3,$4, $5,'CRC', true,
                   false, false, true,'upcoming', false, false, false)
         returning id`,
        [titulo,
         `Evento de prueba para el check-in${conYouth ? ', con subevento de Youth' : ', sin subeventos'}. Se borra después.`,
         inicio, fin, sede[0]?.id ?? null])
      if (conYouth) {
        await c.query(`insert into sub_events (event_id, name, max_capacity) values ($1,'Youth',$2)`,
          [rows[0].id, CUPO_YOUTH])
      }
      console.log(`  ✓ ${titulo} → ${rows[0].id}`)
    }
    await c.query('commit')
    console.log('\n  ✅ listas para el check-in')
  } catch (e) {
    await c.query('rollback'); console.error('❌ rollback:', e instanceof Error ? e.message : e); process.exit(1)
  }
  await c.end()
}

main().catch(e => { console.error('FALLO:', e.message); process.exit(1) })
