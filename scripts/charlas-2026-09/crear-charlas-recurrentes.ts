/**
 * Crea las charlas semanales como series recurrentes, a partir del 2026-09-07.
 *
 *   dry-run:  NODE_OPTIONS="--conditions=react-server" npx tsx scripts/charlas-2026-09/crear-charlas-recurrentes.ts
 *   aplicar:  ... --aplicar
 *
 * CONTEXTO. Había 3.506 charlas en la base, todas como instancias sueltas (una
 * fila por fecha, sin recurrencia) y la última es del 16 de agosto: dejaron de
 * generarse. Estas 14 son series de verdad — una fila, ocurrencias calculadas
 * por expand-recurrence — con fin en diciembre de 2030.
 *
 * NO SON PÚBLICAS (is_public = false): no salen en el calendario público.
 *
 * LA HORA. Las charlas históricas tienen TODAS las 12:00 en hora de Costa Rica,
 * sin importar la sede: la importación nunca trajo la hora real. Estas son las
 * primeras con hora de verdad.
 *
 * Las dos de Madrid se guardan con su hora en el marco de Costa Rica, no como
 * el instante real de España. Suena raro, pero es lo correcto acá:
 * expand-recurrence asume `CR_OFFSET_MS` fijo y no sabe de otras zonas, así que
 * guardar el instante español haría que la ocurrencia caiga en otro día y que
 * la pantalla muestre una hora absurda. El sistema, hoy, no soporta eventos en
 * otro huso; esto lo deja consistente con las otras doce y con lo que se ve en
 * la pantalla.
 */
import { Client } from 'pg'
import { readFileSync } from 'fs'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const APLICAR = process.argv.includes('--aplicar')

/** Costa Rica es UTC-6 fijo. Mismo criterio que expand-recurrence. */
const CR = 6
const FIN_SERIE = '2030-12-31T23:59:59Z'
const DESDE = '2026-09-07'
const CUPO_YOUTH = 100

type Dia = 'TUE' | 'WED' | 'THU' | 'SUN'
const DOW: Record<Dia, number> = { SUN: 0, TUE: 2, WED: 3, THU: 4 }
const NOMBRE_DIA: Record<Dia, string> = { TUE: 'Martes', WED: 'Miércoles', THU: 'Jueves', SUN: 'Domingo' }

/**
 * Lo único que falta crear en el catálogo.
 *
 * Cartago, Liberia, Alajuela, Potrero y Pérez Zeledón YA existen —con su día,
 * hora y edad, que coinciden con la lista— pero están marcadas `is_zone = true`
 * en vez de sede. No se duplican: se usan como están y la inconsistencia del
 * catálogo se reporta aparte, porque arreglarla toca los filtros por zona de
 * otras pantallas.
 */
const SEDES_NUEVAS = [
  { code: 'pedregal-miercoles', name: 'Sede Pedregal Miércoles', day: 'Miércoles', time: '7:30pm', location: 'Pedregal, Belén', age_group: 'Todas las edades', currency: 'CRC' },
]

/** Las 14 charlas. `sede` es el `code` en la tabla sedes. */
const CHARLAS: Array<{
  titulo: string; sede: string; dia: Dia; hora: string; edad: string
  youth?: boolean; currency?: 'CRC' | 'EUR'; nota?: string
}> = [
  { titulo: 'Charla Meridiano Martes',      sede: 'meridiano',           dia: 'TUE', hora: '19:30', edad: '+32' },
  { titulo: 'Charla Meridiano Miércoles',   sede: 'meridiano-miercoles', dia: 'WED', hora: '19:30', edad: '+32' },
  { titulo: 'Charla Antares Miércoles',     sede: 'antares',             dia: 'WED', hora: '19:30', edad: '+18' },
  { titulo: 'Charla Pedregal Miércoles',    sede: 'pedregal-miercoles',  dia: 'WED', hora: '19:30', edad: 'Adultos', youth: true },
  { titulo: 'Charla Pedregal Jueves',       sede: 'home',                dia: 'THU', hora: '19:30', edad: '18–32' },
  { titulo: 'Charla Pedregal Domingo',      sede: 'united',              dia: 'SUN', hora: '11:00', edad: 'Adultos', youth: true },
  { titulo: 'Charla Cartago Miércoles',     sede: 'cartago',             dia: 'WED', hora: '19:30', edad: 'Adultos', youth: true },
  { titulo: 'Charla Liberia Miércoles',     sede: 'liberia',             dia: 'WED', hora: '19:30', edad: '+18' },
  { titulo: 'Charla Alajuela Jueves',       sede: 'alajuela',            dia: 'THU', hora: '19:30', edad: '+18' },
  { titulo: 'Charla Guápiles Miércoles',    sede: 'guapiles',            dia: 'WED', hora: '19:00', edad: '+18' },
  { titulo: 'Charla Potrero Jueves',        sede: 'potrero',             dia: 'THU', hora: '19:30', edad: '+18' },
  { titulo: 'Charla Pérez Zeledón Miércoles', sede: 'perez-zeledon',      dia: 'WED', hora: '19:00', edad: '+18' },
  { titulo: 'Charla Madrid Domingo',        sede: 'madrid',              dia: 'SUN', hora: '11:30', edad: 'Adultos', youth: true, currency: 'EUR', nota: 'Hora de Madrid.' },
  { titulo: 'Charla Madrid Home Jueves',    sede: 'madrid-home',         dia: 'THU', hora: '20:30', edad: '18–32', currency: 'EUR', nota: 'Reunión en casa. Hora de Madrid.' },
]

/**
 * El primer `dia` a las `hora` (CR) que caiga en `desde` o después.
 *
 * El día de la semana se saca del MEDIODÍA UTC de cada fecha, que en Costa Rica
 * sigue siendo ese mismo día (06:00). Con las 00:00 UTC daba el día anterior
 * —CR está 6 horas atrás— y toda la serie salía corrida: "martes" caía en
 * miércoles.
 */
function primeraOcurrencia(desde: string, dia: Dia, hora: string): string {
  const [h, min] = hora.split(':').map(Number)
  for (let i = 0; i < 8; i++) {
    const base = new Date(`${desde}T12:00:00Z`)
    base.setUTCDate(base.getUTCDate() + i)
    if (base.getUTCDay() !== DOW[dia]) continue
    const ymd = base.toISOString().slice(0, 10)
    // La hora es CR: el instante UTC es esa hora + 6.
    const inicio = new Date(Date.UTC(
      Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)),
      h + CR, min, 0,
    ))
    if (inicio.getTime() >= Date.now()) return inicio.toISOString()
  }
  throw new Error(`no se encontró ocurrencia para ${dia} ${hora}`)
}

async function main() {
  console.log(APLICAR ? '⚠️  APLICANDO\n' : '🔍 DRY-RUN — no crea nada\n')
  const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').match(/https:\/\/([a-z0-9]+)\./)![1]
  const c = new Client({
    connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD!)}@aws-1-us-east-2.pooler.supabase.com:6543/postgres`,
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()

  // ── Sedes ──
  const { rows: existentes } = await c.query<{ code: string; id: string; name: string }>(
    `select code, id, name from sedes`)
  const porCode = new Map(existentes.map(s => [s.code, s]))
  const faltan = SEDES_NUEVAS.filter(s => !porCode.has(s.code))
  console.log(`── sedes ──`)
  for (const s of SEDES_NUEVAS) {
    const ya = porCode.get(s.code)
    console.log(`  ${ya ? '✓ ya existe' : '+ se crea  '} ${s.name} (${s.code})${ya ? ` → ${ya.name}` : ''}`)
  }

  // ── Charlas ──
  console.log(`\n── charlas ──`)
  const plan: Array<{ titulo: string; inicio: string; sede: string; youth: boolean }> = []
  for (const ch of CHARLAS) {
    const inicio = primeraOcurrencia(DESDE, ch.dia, ch.hora)
    const enCR = new Date(new Date(inicio).getTime() - CR * 3600_000).toISOString()
    const sedeOk = porCode.has(ch.sede) || faltan.some(f => f.code === ch.sede)
    if (!sedeOk) throw new Error(`sede desconocida: ${ch.sede}`)
    console.log(`  ${ch.titulo.padEnd(30)} ${NOMBRE_DIA[ch.dia]} ${ch.hora} · ${ch.edad.padEnd(8)}${ch.youth ? ' + Youth' : '        '} · 1ª: ${enCR.slice(0, 16).replace('T', ' ')}`)
    plan.push({ titulo: ch.titulo, inicio, sede: ch.sede, youth: !!ch.youth })
  }
  const conYouth = plan.filter(p => p.youth).length
  console.log(`\n  ${plan.length} series · ${conYouth} con subevento Youth · fin ${FIN_SERIE.slice(0, 10)} · ninguna pública`)

  // ── Ya existen? ──
  const { rows: yaHay } = await c.query<{ title: string }>(
    `select title from events where title = any($1) and is_recurring`, [plan.map(p => p.titulo)])
  if (yaHay.length > 0) {
    console.log(`\n⚠️  ${yaHay.length} ya existen como serie recurrente y NO se duplican:`)
    for (const y of yaHay) console.log(`     ${y.title}`)
  }

  if (!APLICAR) { console.log('\n(dry-run) Correlo con --aplicar.'); await c.end(); return }

  const yaSet = new Set(yaHay.map(y => y.title))
  await c.query('begin')
  try {
    for (const s of faltan) {
      await c.query(
        `insert into sedes (code, name, day, time, location, age_group, currency, is_active, is_zone, is_historical)
         values ($1,$2,$3,$4,$5,$6,$7, true, false, false)`,
        [s.code, s.name, s.day, s.time, s.location, s.age_group, s.currency])
      console.log(`  ✓ sede ${s.name}`)
    }
    const { rows: todas } = await c.query<{ code: string; id: string }>(`select code, id from sedes`)
    const idDeSede = new Map(todas.map(s => [s.code, s.id]))

    let creadas = 0
    for (const ch of CHARLAS) {
      if (yaSet.has(ch.titulo)) continue
      const inicio = primeraOcurrencia(DESDE, ch.dia, ch.hora)
      const fin = new Date(new Date(inicio).getTime() + 2 * 3600_000).toISOString()
      const desc = [
        `Charla semanal de ${NOMBRE_DIA[ch.dia]}.`,
        `Público: ${ch.edad}.`,
        ch.youth ? 'Incluye subevento de Youth.' : '',
        ch.nota ?? '',
      ].filter(Boolean).join(' ')
      const { rows } = await c.query<{ id: string }>(
        `insert into events (
           title, description, event_type, starts_at, ends_at,
           is_recurring, recurrence_rule, recurrence_end,
           sede_id, currency, requires_checkin,
           is_public, is_active, status, is_virtual, requires_registration, requires_payment
         ) values ($1,$2,'charla',$3,$4, true,$5,$6::timestamptz, $7,$8, true, false, true,'upcoming', false, false, false)
         returning id`,
        [ch.titulo, desc, inicio, fin, `WEEKLY:${ch.dia}`, FIN_SERIE,
          idDeSede.get(ch.sede) ?? null, ch.currency ?? 'CRC'])
      const eventId = rows[0].id
      creadas++
      if (ch.youth) {
        await c.query(`insert into sub_events (event_id, name, max_capacity) values ($1, 'Youth', $2)`,
          [eventId, CUPO_YOUTH])
      }
      console.log(`  ✓ ${ch.titulo}${ch.youth ? ' (+ Youth)' : ''}`)
    }
    await c.query('commit')
    console.log(`\n  ✅ ${faltan.length} sede(s) y ${creadas} serie(s) creadas`)
  } catch (e) {
    await c.query('rollback')
    console.error('❌ rollback:', e instanceof Error ? e.message : e)
    process.exit(1)
  }
  await c.end()
}

main().catch(e => { console.error('FALLO:', e.message); process.exit(1) })
