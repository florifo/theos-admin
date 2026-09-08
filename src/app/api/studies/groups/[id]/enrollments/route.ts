import { NextRequest, NextResponse } from 'next/server'
import { requireRoles, resolveTargetMemberId, pidioPorOtroSinPermiso } from '@/lib/auth/guard'
import { GROUP_ADMIN_ROLES } from '@/lib/auth/roles'
import { enrollMember, withdrawMember, setEnrollmentGrade } from '@/lib/supabase/queries/studies'
import { notifyEnrollment } from '@/lib/email/enrollment-notify'
import { scholarshipErrorResponse } from '@/lib/supabase/queries/scholarships'
import { groupFullMessage } from '@/lib/studies/enrollment-capacity'
import { RESTRICTION_ERROR_CODE } from '@/lib/studies/group-restrictions'
import { logAudit } from '@/lib/audit'
import { withdrawReasonError } from '@/lib/studies/close-payload'
import { esTipoDeBaja } from '@/lib/studies/baja-matricula'
import { resolveOnBehalf } from '@/lib/auth/on-behalf'

// POST: inscribe un miembro. Body: { member_id, scholarship_id?, coupon_code? }.
// Autoservicio real: cualquier autenticado puede matricularse a sí mismo; el
// staff (GROUP_ADMIN_ROLES) puede matricular a otro pasando su member_id
// (anti-suplantación vía resolveTargetMemberId).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
    const auth = await requireRoles() // solo exige sesión; quién matricula A OTROS se resuelve abajo
    if (auth.res) return auth.res
  try {
    const { id } = await params
    const { member_id, scholarship_id, coupon_code, override_pago_pendiente, override_restriccion } = await req.json()
    // FRM-4: quién matriculó, si no fue la propia persona.
    const { memberId: targetMemberId, recordedBy, denegado } = resolveOnBehalf(auth.ctx, member_id, GROUP_ADMIN_ROLES)
    if (denegado) {
      return NextResponse.json(
        { error: 'No tenés permiso para registrar a otra persona.', code: 'sin_permiso_por_otro' },
        { status: 403 },
      )
    }

    if (!targetMemberId) return NextResponse.json({ error: 'No se pudo determinar el miembro.' }, { status: 400 })
    // GRU-1: la ventana de matrícula aplica al autoservicio; el staff con
    // GROUP_ADMIN_ROLES puede matricular fuera de la ventana.
    // Misma lista que la de arriba: quien puede matricular a otro es quien
    // administra grupos. Antes acá decía STUDY_ADMIN_ROLES y en la UI el botón
    // se mostraba con GROUP_ADMIN_ROLES — las dos listas en desacuerdo son lo
    // que produjo el bug de matricular a la persona equivocada.
    const isStaff = auth.ctx.roles.some(r => (GROUP_ADMIN_ROLES as readonly string[]).includes(r) || r === 'admin')
    const result = await enrollMember(id, targetMemberId, { scholarship_id, coupon_code }, {
      recordedBy,
      enforceEnrollmentWindow: !isStaff,
      // PAG-2: el bloqueo por pago de estudios pendiente aplica a TODOS; el
      // staff puede saltarlo solo con el override EXPLÍCITO del body (la UI
      // se lo confirma — nunca silencioso).
      allowPendingStudyPayments: isStaff && override_pago_pendiente === true,
      // GRU-2: mismo criterio que el override de pago — solo el staff, solo
      // explícito, y queda registrado abajo.
      allowRestrictionOverride: isStaff && override_restriccion === true,
    })
    if (isStaff && override_restriccion === true) {
      await logAudit({
        actorUserId: auth.ctx.userId, action: 'UPDATE', entityType: 'study_enrollments',
        entityId: result.enrollment_id,
        newData: { override_restriccion: true, group_id: id, member_id: targetMemberId },
      })
    }
    // Correos de matrícula (estudiante + dirigentes). Best-effort, no bloquea.
    //
    // SOLO si el estudio NO cobra. Cuando hay que pagar, el correo sale al
    // subir el comprobante (POST /api/payments), no acá: antes le llegaba "tu
    // matrícula fue confirmada" a alguien que todavía estaba viendo la pantalla
    // del comprobante, y si la abandonaba quedaba con la bienvenida a un curso
    // que nunca llevó. Caso real: Alexandra Forero.
    if (!result.requires_payment) {
      await notifyEnrollment(id, targetMemberId)
    }
    // Acá NO se piden folletos. Antes se disparaba 'cupo_lleno' al llenarse el
    // grupo, pero eso exige que el grupo tenga max_students y la mayoría no lo
    // tiene (vienen así de la importación de PCO), así que la regla no se
    // activaba nunca. Decisión 2026-09-02: los folletos se piden AL CERRAR,
    // que es cuando se sabe quién avanza y a qué grupo.
    return NextResponse.json({ ok: true, ...result }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'YA_COMPLETADO') {
      return NextResponse.json(
        { error: 'El miembro ya completó este estudio en este grupo.' },
        { status: 409 },
      )
    }
    if (error instanceof Error && error.message.startsWith('CUPO_LLENO')) {
      const max = Number(error.message.split(':')[1] || 0)
      return NextResponse.json(
        { error: groupFullMessage(max), code: 'cupo_lleno' },
        { status: 409 },
      )
    }
    // A3: deuda del MISMO plan (se retiró debiendo la matrícula y vuelve).
    if (error instanceof Error && error.message === 'PAGO_PENDIENTE') {
      return NextResponse.json(
        { error: 'El miembro tiene el pago de este mismo estudio sin resolver; hay que completarlo antes de volver a matricularlo.' },
        { status: 409 },
      )
    }
    if (error instanceof Error && error.message === 'GRUPO_VIRTUAL_NO_AUTORIZADO') {
      return NextResponse.json(
        { error: 'Este grupo es virtual y el miembro no tiene autorización para estudios virtuales.' },
        { status: 403 },
      )
    }
    if (error instanceof Error && error.message.startsWith('PAGO_ESTUDIOS_PENDIENTE:')) {
      const count = Number(error.message.split(':')[1] || 1)
      return NextResponse.json(
        {
          error: `El miembro tiene ${count} pago${count !== 1 ? 's' : ''} de estudios pendiente${count !== 1 ? 's' : ''}; debe completarlo${count !== 1 ? 's' : ''} antes de matricular otro estudio.`,
          code: 'pago_pendiente',
          count,
        },
        { status: 409 },
      )
    }
    // FIN-4: tracto vencido. El mensaje ya viene armado con el detalle de la
    // deuda (cuántos tractos, cuánto suman y desde cuándo).
    if (error instanceof Error && error.message.startsWith('TRACTO_VENCIDO:')) {
      return NextResponse.json(
        { error: error.message.slice('TRACTO_VENCIDO:'.length), code: 'tracto_vencido' },
        { status: 409 },
      )
    }
    // GRU-2: el mensaje dice POR QUÉ ("Este grupo es solo para: Dirigente"),
    // no un error genérico — llega igual por deep link que desde el staff.
    if (error instanceof Error && error.message.startsWith('RESTRICCION_GRUPO:')) {
      return NextResponse.json(
        { error: error.message.slice('RESTRICCION_GRUPO:'.length), code: RESTRICTION_ERROR_CODE },
        { status: 409 },
      )
    }
    if (error instanceof Error && error.message === 'MATRICULA_CERRADA') {
      return NextResponse.json(
        { error: 'El período de matrícula de este grupo no está abierto.', code: 'matricula_cerrada' },
        { status: 409 },
      )
    }
    if (error instanceof Error && error.message === 'CEDULA_REQUERIDA') {
      return NextResponse.json(
        { error: 'Este curso requiere el documento de identidad registrado. Completalo en tu perfil para poder inscribirte.', code: 'cedula_requerida' },
        { status: 409 },
      )
    }
    const scholarshipRes = scholarshipErrorResponse(error)
    if (scholarshipRes) return scholarshipRes
    console.error('POST enrollments:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// PATCH: actualiza nota. Body: { member_id, grade }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
    const auth = await requireRoles('coordinador_estudios', 'coordinador_dirigentes', 'direccion')
    if (auth.res) return auth.res
  try {
    const { id } = await params
    const body = await req.json()
    const { member_id, grade, resultado, motivo } = body as {
      member_id: string; grade?: unknown
      resultado?: 'aprobado' | 'reprobado' | 'retirado'; motivo?: string
    }

    /**
     * RESOLVER una inscripción 'en_revision' (2026-08-27).
     *
     * Son las que quedaron sin resultado cuando su grupo se cerró. Solo se
     * pueden resolver desde acá —roles de estudios— y solo desde ese estado: si
     * la inscripción ya tiene un resultado, esto NO lo pisa. Un endpoint que
     * pudiera reescribir un 'completed' sería una forma silenciosa de regalar o
     * quitar estudios.
     *
     * El motivo es obligatorio para reprobado y retirado, igual que en el
     * cierre normal: sin él, después nadie sabe por qué.
     */
    if (resultado) {
      const MAPA = { aprobado: 'completed', reprobado: 'reprobado', retirado: 'dropped' } as const
      if (!(resultado in MAPA)) {
        return NextResponse.json({ error: 'Resultado inválido.' }, { status: 400 })
      }
      const razon = (motivo ?? '').trim()
      if (resultado !== 'aprobado' && !razon) {
        return NextResponse.json(
          { error: 'Indicá el motivo: sin él no queda rastro de por qué no aprobó.', code: 'motivo_requerido' },
          { status: 400 },
        )
      }
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const db = createAdminClient()
      // La fecha de cierre es la del GRUPO, no la de hoy: el estudio terminó
      // cuando terminó, y fecharlo hoy le ensucia el expediente a la persona.
      const { data: g } = await db.from('study_groups').select('ends_at').eq('id', id).maybeSingle()
      const fecha = (g as { ends_at: string | null } | null)?.ends_at ?? null
      const { data, error } = await db.from('study_enrollments')
        .update({
          status: MAPA[resultado],
          completed_at: resultado === 'aprobado' ? fecha : null,
          drop_reason: resultado === 'aprobado' ? null : razon,
        })
        .eq('group_id', id).eq('member_id', member_id).eq('status', 'en_revision')
        .select('id')
      if (error) throw error
      if ((data ?? []).length === 0) {
        return NextResponse.json(
          { error: 'Esa inscripción ya no está por confirmar (puede que alguien más la resolviera).' },
          { status: 409 },
        )
      }
      await logAudit({
        actorUserId: auth.ctx.userId, action: 'UPDATE', entityType: 'study_enrollments',
        entityId: (data as Array<{ id: string }>)[0].id,
        newData: { resuelta_desde: 'en_revision', resultado, motivo: razon || null, group_id: id },
      })
      return NextResponse.json({ ok: true, resultado })
    }

    await setEnrollmentGrade(id, member_id, Number(grade))
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('PATCH enrollments:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// DELETE: retira un miembro. Body: { member_id?, reason }
//
// EST-14: `reason` es OBLIGATORIO. Antes era opcional y la UI mandaba
// 'Desinscrito desde el grupo' hardcodeado, así que los retiros quedaban sin
// rastro de por qué — que es justo el dato que se necesita después para
// reubicar a la persona o darle seguimiento. Se valida acá y no solo en la UI:
// el endpoint lo puede llamar cualquiera con sesión.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
    // Simétrico con el POST (Fase 3a): cualquier autenticado puede retirar su
    // PROPIA matrícula (p. ej. cancelar el alta con costo si no completa el
    // pago); el staff (GROUP_ADMIN_ROLES) puede retirar a otro pasando su
    // member_id. resolveTargetMemberId corta la suplantación. withdrawMember
    // ya protege 'completed' (NO_RETIRABLE) y cancela el pago pendiente.
    const auth = await requireRoles()
    if (auth.res) return auth.res
  try {
    const { id } = await params
    const { member_id, reason, tipo } = await req.json()
    // Misma lista que el alta: quien administra grupos también da de baja. Y si
    // pidieron dar de baja a otro sin el rol, se corta — antes se retiraba al
    // propio actor en silencio.
    if (pidioPorOtroSinPermiso(auth.ctx, member_id, GROUP_ADMIN_ROLES)) {
      return NextResponse.json(
        { error: 'No tenés permiso para sacar del grupo a otra persona.', code: 'sin_permiso_por_otro' },
        { status: 403 },
      )
    }
    const targetMemberId = resolveTargetMemberId(auth.ctx, member_id, GROUP_ADMIN_ROLES)
    if (!targetMemberId) return NextResponse.json({ error: 'No se pudo determinar el miembro.' }, { status: 400 })
    const malMotivo = withdrawReasonError(typeof reason === 'string' ? reason : null)
    if (malMotivo) {
      return NextResponse.json({ error: malMotivo, code: 'motivo_requerido' }, { status: 400 })
    }
    // Sin `tipo` se retira, que es el comportamiento de siempre: un cliente
    // viejo no debe empezar a cancelar matrículas sin haberlo pedido.
    const tipoBaja = esTipoDeBaja(tipo) ? tipo : 'retirar'
    await withdrawMember(id, targetMemberId, (reason as string).trim(), tipoBaja)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'NO_RETIRABLE') {
      return NextResponse.json(
        { error: 'La inscripción ya no está activa (completada o ya retirada); refrescá la página.' },
        { status: 409 },
      )
    }
    console.error('DELETE enrollments:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
