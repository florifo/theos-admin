/**
 * FLUJO 7 · Check-in de una charla (Evelyn Eventos, encargada de eventos).
 * Registra a una persona sola (Ana) y a una familia con subevento (Fabián al
 * evento general, Felipe al cuidado de niños).
 * REPETIBLE: el setup asegura la cuenta de Evelyn, la familia [prueba] y el
 * subevento, mueve la charla a HOY (para que salga "En curso" en el selector)
 * y borra los check-ins de la corrida anterior.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { crearCuentaDeAcceso } from '../lib/cuentas-de-prueba'
import { credenciales, type TutorialFlow, type Tools } from './lib'

credenciales() // guard @prueba. (las credenciales de Evelyn van en duro abajo)
const EVELYN = 'evelyn.eventos@prueba.theosplace.invalid'
const PASSWORD = 'Prueba.Agosto.2026' // contraseña única del seed
const CHARLA = '[prueba] Charla de bienvenida'
const SUBEVENTO = '[prueba] Cuidado de niños'
// La persona que llega sola: sin familia, así que al elegirla va directo a la
// tarjeta de confirmación en vez de abrir la ventana de familia.
//
// La creaba el seed y en algún momento se limpió, así que la grabación se caía
// buscándola. Ahora la asegura el setup, como a todo lo demás: un tutorial que
// depende de datos que otro script mantiene no es repetible.
const ANA = '[prueba] Ana Asistente'
const FABIAN = '[prueba] Fabián Familia'
const FELIPE = '[prueba] Felipe Familia'

async function ensureCharla(admin: SupabaseClient): Promise<string> {
  // Siempre HOY: media hora de empezada, dos horas por delante → "En curso".
  const ahora = Date.now()
  const horario = {
    starts_at: new Date(ahora - 30 * 60_000).toISOString(),
    ends_at: new Date(ahora + 2 * 3600_000).toISOString(),
  }
  const { data } = await admin.from('events').select('id').eq('title', CHARLA).maybeSingle()
  if (data) {
    const id = (data as { id: string }).id
    await admin.from('events').update(horario).eq('id', id)
    return id
  }
  const { data: nuevo, error } = await admin.from('events').insert({
    title: CHARLA, event_type: 'charla', location: '[prueba] Salón principal',
    ...horario, requires_registration: false, requires_payment: false,
    requires_checkin: true, is_active: true, is_public: false,
  }).select('id').single()
  if (error) throw error
  return (nuevo as { id: string }).id
}

/** Miembro [prueba] sin cuenta, idempotente por external_id (prefijo del seed
 *  para que limpiar-datos-de-prueba lo borre con el resto del set). */
async function ensureMiembro(admin: SupabaseClient, input: {
  externalId: string; firstName: string; lastName: string; birthDate?: string
}): Promise<string> {
  const { data } = await admin.from('members').select('id').eq('external_id', input.externalId).maybeSingle()
  if (data) return (data as { id: string }).id
  const { data: nuevo, error } = await admin.from('members').insert({
    first_name: input.firstName, last_name: input.lastName,
    external_id: input.externalId, birth_date: input.birthDate ?? null, is_active: true,
  }).select('id').single()
  if (error) throw error
  return (nuevo as { id: string }).id
}

/** Familia [prueba]: Fabián (titular) + Felipe (hijo, menor), y el subevento
 *  de cuidado de niños en la charla. Todo idempotente. */
async function ensureFamiliaYSubevento(admin: SupabaseClient, eventId: string): Promise<void> {
  const fabianId = await ensureMiembro(admin, { externalId: 'PRUEBA-9003', firstName: '[prueba] Fabián', lastName: 'Familia' })
  const felipeId = await ensureMiembro(admin, { externalId: 'PRUEBA-9004', firstName: '[prueba] Felipe', lastName: 'Familia', birthDate: '2018-04-12' })

  const { data: vinculo } = await admin.from('family_members').select('id').eq('member_id', fabianId).maybeSingle()
  if (!vinculo) {
    const { data: unit, error } = await admin.from('family_units')
      .insert({ name: '[prueba] Familia' }).select('id').single()
    if (error) throw error
    await admin.from('family_members').insert([
      { family_unit_id: (unit as { id: string }).id, member_id: fabianId, relation: 'Titular' },
      { family_unit_id: (unit as { id: string }).id, member_id: felipeId, relation: 'Hijo' },
    ])
  }

  const { data: sub } = await admin.from('sub_events')
    .select('id').eq('event_id', eventId).eq('name', SUBEVENTO).maybeSingle()
  if (!sub) await admin.from('sub_events').insert({ event_id: eventId, name: SUBEVENTO, max_capacity: 15 })
}

export const flujo: TutorialFlow = {
  slug: 'checkin',
  mdFile: 'check-in-de-una-charla.md',
  gifAlt: 'El flujo completo: registrar a una persona y a una familia con subevento',

  async setup(admin) {
    // Cuenta de la encargada (idempotente). El external_id PRUEBA-9001 está
    // fuera de la secuencia del seed pero dentro de su prefijo: el script de
    // limpieza la borra junto con el resto del set.
    await crearCuentaDeAcceso(admin as never, {
      email: EVELYN, password: PASSWORD, nombre: '[prueba] Evelyn Eventos',
      role: 'encargado_eventos',
      camposMiembro: { external_id: 'PRUEBA-9001', gender: 'F' },
    })
    // Cédula de prueba: sin ella, el banner "Falta tu cédula" sale en todas
    // las tomas del tutorial.
    await admin.from('members').update({ cedula: '9-9999-9001' }).eq('email', EVELYN)
    // Ana: la asistente que llega sola. Sin familia a propósito.
    await ensureMiembro(admin, {
      externalId: 'PRUEBA-9002', firstName: '[prueba] Ana', lastName: 'Asistente',
    })
    const eventId = await ensureCharla(admin)
    await ensureFamiliaYSubevento(admin, eventId)
    await admin.from('event_checkins').delete().eq('event_id', eventId)
    console.log('    (charla movida a hoy, familia y subevento asegurados, check-ins borrados)')
  },

  async run(t: Tools) {
    // 1 · Login que aterriza en el selector de check-in (eventos de hoy)
    await t.goto('/login?redirect=/eventos/checkin')
    await t.fill('input[placeholder*="ejemplo@correo"]', EVELYN)
    await t.fill('input[type="password"]', PASSWORD)
    await t.click(t.page.getByRole('button', { name: 'Iniciar sesión' }))
    await t.page.waitForURL('**/eventos/checkin**', { timeout: 30_000 })
    await t.page.getByText(CHARLA).filter({ visible: true }).first().waitFor({ timeout: 30_000 })
    await t.badge(1)
    await t.pause(1200)
    await t.shot('01-eventos-de-hoy')

    // 2 · Elegir la charla → la pantalla de registro (con los chips de destino)
    await t.click(t.page.getByText(CHARLA).filter({ visible: true }).first())
    await t.page.getByText('Escanear QR').first().waitFor({ timeout: 30_000 })
    await t.badge(2)
    await t.pause(1000)
    await t.shot('02-charla')

    // 3 · Buscar a la persona por nombre (la alternativa al QR)
    await t.fill('input[placeholder*="Buscar por nombre"]', 'Ana Asistente')
    await t.page.getByText(ANA).filter({ visible: true }).first().waitFor({ timeout: 15_000 })
    await t.badge(3)
    await t.pause(800)
    await t.shot('03-buscar')

    // 4 · La tarjeta de confirmación (Participante / Servidor)
    await t.click(t.page.getByText(ANA).filter({ visible: true }).first())
    await t.page.getByRole('button', { name: 'Participante' }).waitFor({ timeout: 15_000 })
    await t.badge(4)
    await t.pause(800)
    await t.shot('04-confirmar')

    // 5 · Confirmar → aparece en Registrados
    await t.click(t.page.getByRole('button', { name: 'Participante' }))
    await t.page.getByRole('button', { name: 'Participante' }).waitFor({ state: 'detached', timeout: 15_000 })
    await t.page.getByText(ANA).filter({ visible: true }).first().waitFor({ timeout: 15_000 })
    await t.badge(5)
    await t.pause(1200)
    await t.shot('05-registrado')

    // 6 · Una familia llega: el papá al evento, el hijo al subevento
    await t.fill('input[placeholder*="Buscar por nombre"]', 'Familia')
    await t.page.getByText(FABIAN).filter({ visible: true }).first().waitFor({ timeout: 15_000 })
    await t.click(t.page.getByText(FABIAN).filter({ visible: true }).first())
    await t.page.getByText('viene con familia').first().waitFor({ timeout: 15_000 })
    await t.badge(6)
    await t.pause(1000)
    await t.shot('06-familia')
    // Marcar al hijo y mandarlo al cuidado de niños
    await t.click(t.page.getByRole('checkbox', { name: /Felipe/ }))
    await t.click(t.page.getByRole('radiogroup', { name: /Felipe/ }).getByRole('radio', { name: SUBEVENTO }))
    await t.pause(600)
    await t.shot('07-subevento')

    // 7 · Registrar a los dos → cada quien queda en su destino
    await t.badge(7)
    await t.click(t.page.getByRole('button', { name: /Registrar 2/ }))
    await t.page.getByText('viene con familia').waitFor({ state: 'detached', timeout: 20_000 })
    await t.page.getByText(FABIAN).filter({ visible: true }).first().waitFor({ timeout: 15_000 })
    await t.pause(1000)
    await t.shot('08-registrados')
    // El hijo quedó en el subevento: cambiar el chip para verlo
    await t.click(t.page.getByRole('button', { name: SUBEVENTO }))
    await t.page.getByText(FELIPE).filter({ visible: true }).first().waitFor({ timeout: 15_000 })
    await t.pause(1500)
    await t.shot('09-subevento-lista')
  },

  async teardown(admin) {
    const { data } = await admin.from('events').select('id').eq('title', CHARLA).maybeSingle()
    if (data) await admin.from('event_checkins').delete().eq('event_id', (data as { id: string }).id)
  },

  mdImages: [],
}
