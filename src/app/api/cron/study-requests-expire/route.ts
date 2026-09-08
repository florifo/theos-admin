import { NextRequest, NextResponse } from 'next/server'
import { requireRoles, secretsMatch } from '@/lib/auth/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { pingHealthcheck } from '@/lib/health'
import { solicitudesAVencer, ESTADO_QUE_VENCE, ESTADO_VENCIDA } from '@/lib/studies/request-expiry'

/** Autorizado con el CRON_SECRET (cron diario) o sesión de coordinación —
 *  igual que los demás crons, para poder dispararlo a mano si hace falta. */
async function authorize(req: NextRequest): Promise<NextResponse | null> {
  const bearer = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secretsMatch(bearer, process.env.CRON_SECRET)) return null
  const auth = await requireRoles('coordinador_estudios', 'coordinador_dirigentes', 'direccion', 'admin')
  return auth.res ?? null
}

/**
 * POST: pasa a 'vencida' las solicitudes ABIERTAS cuyo bloque de matrícula ya
 * cerró. La regla —cuál bloque atiende cada solicitud y cuándo se considera
 * cerrado— vive en lib/studies/request-expiry.ts, con sus tests; acá solo se
 * leen los datos y se escribe el resultado.
 *
 * Idempotente: una vez en 'vencida' deja de calificar, así que correrlo dos
 * veces no hace nada la segunda.
 */
export async function POST(req: NextRequest) {
  const denied = await authorize(req)
  if (denied) return denied
  try {
    const supabase = createAdminClient()
    const [{ data: bloques }, { data: abiertas }] = await Promise.all([
      supabase.from('capacitacion_bloques').select('id, nombre, fecha_cierre_matricula'),
      supabase.from('study_requests').select('id, status, created_at').eq('status', ESTADO_QUE_VENCE),
    ])

    const aVencer = solicitudesAVencer(
      (abiertas ?? []) as Array<{ id: string; status: string; created_at: string }>,
      (bloques ?? []) as Array<{ id: string; nombre: string; fecha_cierre_matricula: string | null }>,
    )
    if (aVencer.length === 0) {
      await pingHealthcheck('HEALTHCHECK_URL_STUDY_REQUESTS_EXPIRE')
      return NextResponse.json({ ok: true, vencidas: 0 })
    }

    const { error } = await supabase
      .from('study_requests')
      .update({ status: ESTADO_VENCIDA, updated_at: new Date().toISOString() })
      .in('id', aVencer.map(x => x.id))
      // Guard de carrera: si alguien la tomó entre la lectura y el update, gana
      // la persona. Una solicitud que ya está siendo atendida no se vence.
      .eq('status', ESTADO_QUE_VENCE)
    if (error) throw error

    // Por bloque, para que el log diga POR QUÉ vencieron y no solo cuántas.
    const porBloque = aVencer.reduce<Record<string, number>>((acc, x) => {
      acc[x.bloque] = (acc[x.bloque] ?? 0) + 1
      return acc
    }, {})
    console.log('study-requests-expire:', aVencer.length, 'vencidas', porBloque)
    await pingHealthcheck('HEALTHCHECK_URL_STUDY_REQUESTS_EXPIRE')
    return NextResponse.json({ ok: true, vencidas: aVencer.length, por_bloque: porBloque })
  } catch (error) {
    console.error('POST /api/cron/study-requests-expire:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
