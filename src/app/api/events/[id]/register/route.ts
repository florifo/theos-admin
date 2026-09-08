import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/auth/guard'
import { rateLimit } from '@/lib/rate-limit'
import { resolveOnBehalf, EVENT_ON_BEHALF_ROLES } from '@/lib/auth/on-behalf'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createRegistration, registrationPricing,
  PaymentRequiredError, EventFullError, AlreadyRegisteredError,
} from '@/lib/supabase/queries/events'
import { scholarshipErrorResponse } from '@/lib/supabase/queries/scholarships'
import { submitEventComprobante, PAYMENT_RECEIPTS_BUCKET } from '@/lib/supabase/queries/payments'
import { montoAPagar, comprobanteRequerido, type Descuento } from '@/lib/events/registration-payment'

// Quién puede inscribir A OTRO desde acá (mismos roles que gestionan
// event_registrations en la ruta de staff, /api/events/[id]/registrations).

// POST /api/events/[id]/register — autoservicio: cualquier autenticado se
// inscribe a sí mismo; staff puede inscribir a otro pasando member_id.
//
// SI EL EVENTO ES PAGO, EL COMPROBANTE ES OBLIGATORIO EN ESTA MISMA LLAMADA
// (decisión del 2026-08-27: "sin comprobante no hay inscripción"). Antes la
// inscripción nacía 'pending' y el comprobante venía después, en otra pantalla
// que se podía cerrar con "Más tarde" — o sea que quedaba gente inscrita, con el
// cupo tomado, sin haber pagado nunca.
//
// Por eso acepta multipart además de JSON: el archivo viaja con la inscripción.
// Si el evento es gratuito, exento, o la beca deja el monto en ₡0, no se pide
// nada y sigue siendo JSON como antes.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles() // solo exige sesión
  if (auth.res) return auth.res
  try {
    const { id } = await params
    const tipo = req.headers.get('content-type') ?? ''
    const esMultipart = tipo.includes('multipart/form-data')

    let cuerpo: Record<string, unknown> = {}
    let archivo: File | null = null
    let referencia: string | null = null
    if (esMultipart) {
      const form = await req.formData()
      for (const k of ['member_id', 'scholarship_id', 'coupon_code']) {
        const v = form.get(k)
        if (typeof v === 'string' && v !== '') cuerpo[k] = v
      }
      const f = form.get('file')
      archivo = f instanceof File && f.size > 0 ? f : null
      referencia = (String(form.get('reference') ?? '')).trim() || null
    } else {
      cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
    }

    // FRM-4: quién inscribió, si no fue la propia persona.
    const { memberId, recordedBy, denegado } = resolveOnBehalf(auth.ctx, cuerpo?.member_id as string | undefined, EVENT_ON_BEHALF_ROLES)
    if (denegado) {
      return NextResponse.json(
        { error: 'No tenés permiso para registrar a otra persona.', code: 'sin_permiso_por_otro' },
        { status: 403 },
      )
    }

    if (!memberId) return NextResponse.json({ error: 'No se pudo determinar el miembro.' }, { status: 400 })

    const scholarshipId = cuerpo?.scholarship_id as string | undefined
    const couponCode = cuerpo?.coupon_code as string | undefined

    const pricing = await registrationPricing(id, memberId)

    /** Lo que la persona realmente debe pagar, YA con la beca aplicada. Se
     *  calcula acá y no se asume `pricing.price`: con una beca del 100% el monto
     *  queda en ₡0 y pedir comprobante sería absurdo.
     *  resolveScholarshipForApplication es de solo lectura — el consumo lo hace
     *  createRegistration más adelante. */
    let descuento: Descuento | null = null
    if (pricing.requiresPayment && !pricing.exempt && (scholarshipId || couponCode)) {
      const { resolveScholarshipForApplication } = await import('@/lib/supabase/queries/scholarships')
      const r = await resolveScholarshipForApplication(memberId, 'event', id, { scholarship_id: scholarshipId, coupon_code: couponCode })
      descuento = { discount_type: r.discount_type, discount_value: r.discount_value }
    }
    const aPagar = montoAPagar(pricing, descuento)

    if (comprobanteRequerido(aPagar) && !archivo) {
      return NextResponse.json({
        error: 'Este evento tiene costo, así que la inscripción necesita el comprobante de pago para quedar hecha.',
        code: 'comprobante_requerido',
      }, { status: 422 })
    }
    if (archivo) {
      if (!rateLimit(`inscripcion-comprobante:${auth.ctx.userId}`, 5, 60_000)) {
        return NextResponse.json({ error: 'Demasiados intentos seguidos; esperá un minuto.' }, { status: 429 })
      }
      if (archivo.size > 8 * 1024 * 1024) {
        return NextResponse.json({ error: 'El archivo supera 8 MB.' }, { status: 400 })
      }
    }

    const res = await createRegistration(id, {
      member_id: memberId, scholarship_id: scholarshipId, coupon_code: couponCode, recorded_by: recordedBy,
    })

    // El comprobante va DESPUÉS de crear la inscripción porque necesita su id.
    // Si algo de esto falla, la inscripción SE DESHACE: la regla es que no puede
    // quedar nadie con el cupo tomado y sin comprobante. Es el único momento en
    // que esta ruta borra algo.
    if (archivo && comprobanteRequerido(aPagar)) {
      const supabase = createAdminClient()
      const ext = (archivo.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
      const path = `event-registrations/${res.id}/${crypto.randomUUID()}.${ext}`
      try {
        const bytes = new Uint8Array(await archivo.arrayBuffer())
        const { error: upErr } = await supabase.storage
          .from(PAYMENT_RECEIPTS_BUCKET)
          .upload(path, bytes, { contentType: archivo.type || 'application/octet-stream', upsert: false })
        if (upErr) throw new Error(upErr.message)
        const ok = await submitEventComprobante({ event_registration_id: res.id, receipt_path: path, reference_code: referencia })
        if (!ok) throw new Error('submitEventComprobante devolvió null')
      } catch (e) {
        await supabase.from('event_registrations').delete().eq('id', res.id)
        console.error('register: comprobante falló, inscripción deshecha:', e)
        return NextResponse.json({
          error: 'No pudimos guardar el comprobante, así que la inscripción no quedó hecha. Probá de nuevo.',
        }, { status: 500 })
      }
    }

    const { notifyEventRegistration } = await import('@/lib/email/event-registration-notify')
    await notifyEventRegistration(memberId, id, { comprobanteRecibido: comprobanteRequerido(aPagar), amount: aPagar })

    return NextResponse.json({ ...res, pricing, comprobante_recibido: comprobanteRequerido(aPagar) }, { status: 201 })
  } catch (error) {
    if (error instanceof PaymentRequiredError) return NextResponse.json({ error: error.message }, { status: 422 })
    if (error instanceof AlreadyRegisteredError) return NextResponse.json({ error: error.message }, { status: 409 })
    if (error instanceof EventFullError) return NextResponse.json({ error: error.message }, { status: 409 })
    if (error instanceof Error && error.message.startsWith('TRACTO_VENCIDO:')) {
      return NextResponse.json(
        { error: error.message.slice('TRACTO_VENCIDO:'.length), code: 'tracto_vencido' },
        { status: 409 },
      )
    }
    const scholarshipRes = scholarshipErrorResponse(error)
    if (scholarshipRes) return scholarshipRes
    console.error('POST /api/events/[id]/register:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
