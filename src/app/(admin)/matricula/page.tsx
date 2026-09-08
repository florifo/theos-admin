'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  GraduationCap, Search, ChevronDown, ChevronUp, CheckCircle2,
  XCircle, Calendar, DollarSign, X, AlertCircle,
  BookOpen, ArrowRight, Sparkles, Info, Heart, CreditCard,
} from 'lucide-react'
import { Modal } from '@/components/shared/Modal'
import { MemberCombobox } from '@/components/shared/MemberCombobox'
import { PaymentMethodSelector, type PaymentMethodValue } from '@/components/shared/PaymentMethodSelector'
import { ScholarshipRequestModal } from '@/components/finance/ScholarshipRequestModal'
import { DocumentCapture } from '@/components/members/DocumentCapture'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useStudyPlans } from '@/hooks/useStudyPlans'
import type { EligibilityResult, EligibleGroup, MemberStudyProfile } from '@/lib/studies/eligibility'
import { DEBT_BLOCK_REASON } from '@/lib/studies/eligibility'
import { summarizeStageRequirements } from '@/lib/studies/stage-requirements-summary'
import type { StudyType } from '@/types/study'
import { ATTENDANCE_MIN_CHARLAS, ATTENDANCE_MONTHS, ATTENDANCE_RECENCY_DAYS } from '@/lib/attendance'
import { formatDateLong, formatCRC, formatMoney } from '@/lib/format'
import { studyCostLabel } from '@/lib/studies/cost-label'
import { buildPaymentBreakdown, formatDiscount } from '@/lib/finance/payment-breakdown'
import { StudyReceiptModal } from '@/components/finance/StudyReceiptModal'

// 'prematrimonial' NO es una etapa: es una pestaña propia (pedido 2026-07-31),
// porque el curso tiene su propio flujo (pareja, logística, ceremonia y pago) y
// antes vivía escondido como tarjeta dentro de "Todos" y "Etapa Inicial".
type FilterTab = 'all' | 'available' | 'niveles' | 'inicial' | 'intermedia' | 'avanzada' | 'campaña' | 'prematrimonial'

const STAGE_ORDER: FilterTab[] = ['niveles', 'inicial', 'intermedia', 'avanzada', 'campaña']

const STAGE_META: Record<string, { label: string; bg: string; text: string }> = {
  niveles:    { label: 'Niveles',          bg: 'rgba(41,54,92,0.08)',      text: '#29365C' },
  inicial:    { label: 'Etapa Inicial',    bg: 'rgba(181,221,224,0.35)',   text: '#3B7579' },
  intermedia: { label: 'Etapa Intermedia', bg: 'rgba(239,85,84,0.12)',     text: '#C43635' },
  avanzada:   { label: 'Etapa Avanzada',   bg: 'rgba(233,185,73,0.18)',    text: '#9B7200' },
  'campaña':  { label: 'Campañas',         bg: 'rgba(155,127,212,0.15)',   text: '#7C5EC2' },
}

// Campañas se agrega dinámicamente solo si hay grupos de campaña abiertos.
const FILTER_TABS_BASE: { id: FilterTab; label: string }[] = [
  { id: 'all',         label: 'Todos' },
  { id: 'niveles',     label: 'Niveles' },
  { id: 'inicial',     label: 'Etapa Inicial' },
  { id: 'intermedia',  label: 'Etapa Intermedia' },
  { id: 'avanzada',    label: 'Etapa Avanzada' },
]

type ConfirmState = { group: EligibleGroup; study: EligibilityResult }

export default function MatriculaPage() {
  const router = useRouter()

  const { user } = useAuth()
  const { studyTypes } = useStudyPlans()
  const userRoles = user?.roles ?? []
  // "Ver disponibilidad como": admin, dirección y coordinación de estudios
  // (2026-08-19). El API de elegibilidad ya lo permite vía módulo estudios.
  const isAdminView = userRoles.some(r => ['admin', 'direccion', 'coordinador_estudios'].includes(r))
  // PAG-2: espejo del isStaff del API (STUDY_ADMIN_ROLES + admin) para el override.
  const isStudyStaff = userRoles.some(r => ['coordinador_estudios', 'coordinador_dirigentes', 'direccion', 'admin'].includes(r))

  const [selectedMember, setSelectedMember] = useState<{ id: string; name: string } | null>(null)
  const effectiveMemberId = selectedMember?.id ?? user?.member_id ?? null
  const effectiveName = selectedMember?.name ?? user?.name ?? 'miembro'
  // A dónde lleva "ver el pago pendiente". Si el staff está matriculando a
  // otra persona, a la deuda de ESA persona; si no, a la propia.
  const deudaHref = selectedMember
    ? `/miembros/${selectedMember.id}?tab=participacion&open=pagos`
    : '/mis-pagos'

  const [activeFilter, setActiveFilter]   = useState<FilterTab>('all')
  const [search, setSearch]               = useState('')
  const [expandedStudy, setExpandedStudy] = useState<string | null>(null)
  const [confirmModal, setConfirmModal]   = useState<ConfirmState | null>(null)
  // FIN-2: matrícula pedida por alguien sin documento — se captura antes de
  // confirmar y luego sigue con la confirmación que quedó pendiente.
  const [docGate, setDocGate]             = useState<ConfirmState | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodValue>('sinpe')
  const [enrolling, setEnrolling]         = useState(false)
  const [pendingReceipt, setPendingReceipt] = useState<{ enrollmentId: string; groupId: string; studyName: string; amount: number; currency: string | null } | null>(null)
  const [scholarshipTarget, setScholarshipTarget] = useState<{ entity_type: 'study_plan'; id: string; name: string } | null>(null)
  const [enrollError, setEnrollError] = useState<string | null>(null)

  const [eligibilityResults, setEligibilityResults] = useState<EligibilityResult[]>([])
  const [profile, setProfile] = useState<MemberStudyProfile | null>(null)
  // PRE-5: la tarjeta del prematrimonial solo se muestra si el miembro cumple
  // el requisito (N1 completado + inscrito en N2). Server-side en el flag.
  const [prematOk, setPrematOk] = useState(false)
  // PAG-2: pagos de estudios pendientes → banner y bloqueo (con override staff).
  const [pendingPayments, setPendingPayments] = useState(0)
  // El DETALLE de la deuda (cuánto y de qué estudio), para poder explicarla en
  // vez de solo contarla.
  const [deuda, setDeuda] = useState<{ count: number; total: number; currency: string; planCodes: string[] } | null>(null)
  const [overridePrompt, setOverridePrompt] = useState<{ count: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  // Elegibilidad + perfil académico desde datos reales.
  useEffect(() => {
    if (!effectiveMemberId) { setLoading(false); return }
    let alive = true
    setLoading(true)
    setLoadError(false)
    fetch(`/api/matricula/eligibility?member_id=${effectiveMemberId}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => {
        if (!alive) return
        setEligibilityResults(d?.eligibility ?? [])
        setProfile(d?.profile ?? null)
        setPrematOk(!!d?.premat_ok)
        setPendingPayments(Number(d?.pending_study_payments ?? 0))
        setDeuda(d?.blocking_debt ?? null)
        setLoading(false)
      })
      .catch(() => { if (alive) { setLoadError(true); setLoading(false) } })
    return () => { alive = false }
  }, [effectiveMemberId, retryKey])

  // Solo se ofrecen los estudios con grupos abiertos y matriculables para el
  // miembro. El plan completo (con descripciones) vive en /estudios/plan.
  // Lo que se lista: lo que se puede matricular MÁS lo que está bloqueado solo
  // por la deuda. Esos últimos se muestran como tarjeta bloqueada (con su
  // motivo y el enlace a pagar) en vez de desaparecer: si se esconden, la
  // pantalla dice "no hay grupos abiertos" cuando sí los hay, y contradice el
  // aviso de arriba que acaba de decir que la lista está bloqueada.
  const availableResults = useMemo(
    () => eligibilityResults.filter(r =>
      r.available_groups.length > 0
      && (r.is_eligible || r.reasons_blocked.every(m => m === DEBT_BLOCK_REASON))),
    [eligibilityResults],
  )

  const hasCampaignGroups = availableResults.some(r => r.stage === 'campaña')
  const filterTabs = [
    ...FILTER_TABS_BASE,
    ...(hasCampaignGroups ? [{ id: 'campaña' as FilterTab, label: 'Campañas' }] : []),
    // La pestaña SIEMPRE está, cumpla o no el requisito: si no lo cumple, adentro
    // se explica qué falta. Esconderla dejaba a la gente preguntando dónde se
    // inscribe el prematrimonial.
    { id: 'prematrimonial' as FilterTab, label: 'Prematrimonial' },
  ]

  const filteredResults = useMemo(() => {
    let res = availableResults
    if (activeFilter !== 'all' && activeFilter !== 'available') {
      res = res.filter(r => r.stage === activeFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      res = res.filter(r =>
        r.study_name.toLowerCase().includes(q) ||
        r.study_code.toLowerCase().includes(q)
      )
    }
    return res
  }, [availableResults, activeFilter, search])

  const grouped = STAGE_ORDER
    .map(stage => ({ stage, items: filteredResults.filter(r => r.stage === stage) }))
    .filter(g => g.items.length > 0)

  // Cuando una etapa (tab específico) no tiene nada matriculable, explicamos por
  // qué en vez de dejarlo vacío — reutiliza reasons_met/reasons_blocked que ya
  // calcula computeEligibility, sin reimplementar ningún requisito.
  const stageResultsForEmptyState = useMemo(() => {
    if (activeFilter === 'all' || activeFilter === 'available') return null
    return eligibilityResults.filter(r => r.stage === activeFilter)
  }, [eligibilityResults, activeFilter])

  // Métricas del perfil (datos reales)
  const completedStudies = studyTypes.filter(s => profile?.completed_codes.includes(s.code))
  const currentStudyInfo = studyTypes.find(s => s.code === profile?.current_code)
  const isDonor = profile?.is_donor ?? false
  const isActiveServer = profile?.is_server ?? false
  const charlaCount = profile?.charla_count ?? 0
  const attendanceActive = profile?.attendance_active ?? false
  const availableCount = eligibilityResults.filter(r => r.is_eligible && r.available_groups.length > 0).length

  async function handleEnroll(scholarship?: { scholarship_id?: string; coupon_code?: string }, overridePending = false) {
    if (!confirmModal || !effectiveMemberId || enrolling) return
    const { group, study } = confirmModal
    setEnrolling(true)
    try {
      const res = await fetch(`/api/studies/groups/${group.group_id}/enrollments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: effectiveMemberId, ...scholarship, ...(overridePending ? { override_pago_pendiente: true } : {}) }),
      })
      const data = await res.json().catch(() => null)
      // PAG-2: staff matriculando a otro puede pasar el bloqueo con override
      // EXPLÍCITO (modal de confirmación, nunca silencioso).
      if (res.status === 409 && data?.code === 'pago_pendiente' && selectedMember && isStudyStaff) {
        setOverridePrompt({ count: Number(data?.count ?? 1) })
        setEnrolling(false)
        return
      }
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      setConfirmModal(null)
      if (data?.requires_payment) {
        // Con costo: se ofrece subir el comprobante en el momento, que es lo
        // más cómodo estando ahí. La matrícula YA quedó hecha (2026-08-04,
        // carriles separados), pero desde el 2026-09-01 la pantalla ofrece
        // CANCELARLA: antes no había salida y quien se arrepentía quedaba
        // matriculado con un cobro abierto.
        setPendingReceipt({
          enrollmentId: data.enrollment_id,
          groupId: group.group_id,
          studyName: study.study_name,
          amount: data.amount,
          currency: data.currency ?? group.currency ?? null,
        })
        setEnrolling(false)
      } else {
        router.push(`/matricula/confirmacion?group=${group.group_id}&study=${study.study_code}`)
      }
    } catch (err) {
      console.error('No se pudo matricular:', err)
      setEnrollError(err instanceof Error ? err.message : 'No se pudo matricular.')
      setEnrolling(false)
    }
  }

  if (!effectiveMemberId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-navy-light/80 font-body">
          No hay un miembro asociado a tu cuenta.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Header strip */}
      <div
        className="rounded-2xl px-6 py-5 bg-navy shadow-card"
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <GraduationCap size={18} className="text-white/80" />
              <span className="text-xs uppercase tracking-widest text-white/80 font-display">
                Portal de Matrícula
              </span>
            </div>
            <h1
              className="text-2xl text-white font-display font-extrabold tracking-[-0.02em]"
            >
              Matrícula de Estudios
            </h1>
            <p className="mt-0.5 text-sm text-white/80 font-body">
              Hola, <span className="text-white font-medium">{effectiveName}</span>
              {' · '}{availableCount} estudio{availableCount !== 1 ? 's' : ''} disponible{availableCount !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Selector de miembro — solo admin/direccion */}
          {isAdminView && (
            <MemberPicker
              selected={selectedMember}
              onSelect={m => { setSelectedMember(m); setExpandedStudy(null) }}
            />
          )}
        </div>
      </div>

      {/* Perfil académico */}
      <div
        className="rounded-2xl px-5 py-4 bg-surface-card shadow-card"
      >
        <p className="text-[11px] uppercase tracking-widest text-navy-light/80 mb-3 font-display">
          Perfil académico
        </p>
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1 space-y-2.5">
            {/* Estudios completados */}
            <div>
              <p className="text-[13px] text-navy-light/80 mb-1.5 font-body">
                Estudios completados ({completedStudies.length})
              </p>
              {completedStudies.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {completedStudies.map(s => (
                    <span
                      key={s.code}
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-semibold bg-teal-soft/30 text-teal-deep font-display"
                    >
                      {s.code} ✓
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-[13px] text-navy-light/80 italic font-body">
                  Ninguno aún
                </span>
              )}
            </div>

            {/* En curso */}
            {currentStudyInfo && (
              <div>
                <p className="text-[13px] text-navy-light/80 mb-1.5 font-body">
                  En curso
                </p>
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-semibold bg-coral/15 text-coral font-display"
                >
                  {currentStudyInfo.code} — {currentStudyInfo.name}
                </span>
              </div>
            )}
          </div>

          {/* Compromisos */}
          <div
            className="rounded-xl px-4 py-3 shrink-0 bg-surface-low"
          >
            <p className="text-[11px] uppercase tracking-widest text-navy-light/80 mb-2 font-display">
              Compromisos
            </p>
            <div className="space-y-1.5">
              <CommitmentRow met={isDonor}                    label="Donante/a activo/a" />
              <CommitmentRow met={!!isActiveServer}           label="Servidor/a en comité" />
              <CommitmentRow
                met={attendanceActive}
                label="Asistencia activa"
                info={`Al menos ${ATTENDANCE_MIN_CHARLAS} charlas en los últimos ${ATTENDANCE_MONTHS} meses, con al menos una en los últimos ${ATTENDANCE_RECENCY_DAYS} días (llevás ${charlaCount}).`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Acceso al plan de estudios completo — destacado a propósito: es la
          referencia de "qué pide cada estudio", no un link secundario. */}
      <Link
        href="/estudios/plan"
        className="group flex items-center gap-4 rounded-2xl px-6 py-5 border-2 border-coral/25 bg-coral/5 hover:bg-coral/10 hover:border-coral/40 transition-colors"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-coral/15">
          <BookOpen size={22} className="text-coral-deep" strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-extrabold text-navy font-display tracking-[-0.01em] flex items-center gap-1.5">
            <Sparkles size={15} className="text-coral shrink-0" />
            Explorá el plan de estudios completo
          </p>
          <p className="text-[13px] text-navy-light/80 font-body">
            Todos los estudios de Theos Place, con los compromisos que pide cada uno — donante, servicio, asistencia y qué estudio va primero.
          </p>
        </div>
        <ArrowRight size={18} className="shrink-0 text-coral transition-transform group-hover:translate-x-1" />
      </Link>

      {/* Filtros */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {filterTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-[13px] font-medium border transition-all',
                activeFilter === tab.id
                  ? 'bg-navy text-white border-navy'
                  : 'text-navy-light/80 hover:text-navy border-transparent hover:border-navy/20'
              , 'font-display')}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-surface-low px-3 py-2 w-full sm:w-64 focus-within:ring-1 focus-within:ring-coral/30 transition-all">
          <Search size={14} className="text-navy-light/80 shrink-0" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar estudio..."
            aria-label="Buscar estudio"
            className="flex-1 bg-transparent text-sm text-navy placeholder-navy-light/50 outline-none font-body"
          />
        </div>
      </div>

      {/* Inscripción al curso prematrimonial — pertenece al bloque inicial, por
          eso solo se muestra en el tab "Todos" o "Etapa Inicial". Flujo propio
          (pareja + logística + ceremonia + pago por comprobante). PRE-5: solo
          aparece si el miembro cumple el requisito (flag server-side). */}
      {/* PAG-2 · La deuda no es un regaño: es un trámite pendiente y hay que
          decirlo así. Explica QUÉ falta, POR QUÉ no hay estudios disponibles y
          CÓMO se resuelve, en ese orden. El aviso viejo era una línea que solo
          contaba pagos, y las tarjetas de abajo seguían ofreciendo estudios que
          el servidor iba a rechazar. */}
      {pendingPayments > 0 && (
        <div className="rounded-2xl border border-coral/25 bg-coral/[0.06] px-5 py-5 sm:px-6">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="mt-0.5 shrink-0 text-coral-deep" aria-hidden />
            <div className="space-y-2.5">
              <p className="text-base font-bold text-navy font-display">
                {selectedMember
                  ? `A ${selectedMember.name} le falta un pago`
                  : 'Te falta un pago para seguir matriculándote'}
              </p>
              <p className="text-sm text-navy-light/80 font-body">
                {selectedMember ? 'Tiene' : 'Tenés'}{' '}
                <strong className="text-navy">
                  {deuda && deuda.total > 0
                    ? `${formatMoney(deuda.total, deuda.currency)} de matrícula sin pagar`
                    : `${pendingPayments} pago${pendingPayments !== 1 ? 's' : ''} de matrícula sin completar`}
                </strong>
                {deuda?.planCodes.length ? ` (${deuda.planCodes.join(', ')})` : ''}. Mientras ese pago
                esté pendiente no {selectedMember ? 'puede' : 'podés'} matricular estudios nuevos — por eso
                la lista de abajo aparece bloqueada.
              </p>
              <p className="text-sm text-navy-light/80 font-body">
                No {selectedMember ? 'perdió' : 'perdiste'} nada: {selectedMember ? 'su' : 'tu'} lugar y{' '}
                {selectedMember ? 'su' : 'tu'} avance siguen ahí. En cuanto confirmemos{' '}
                {selectedMember ? 'su' : 'tu'} pago, los estudios se habilitan solos.
              </p>
              {/* El destino depende de QUIÉN tiene la deuda. Estaba fijo en
                  /mis-pagos, que son los pagos de quien está operando: el
                  staff matriculando a otra persona leía "Ver SUS pagos
                  pendientes", hacía clic y llegaba a una pantalla vacía —los
                  suyos— mientras la deuda de la otra persona seguía ahí.
                  Reportado con Valeria Astorga Calvo (2026-09-08). */}
              <Link
                href={deudaHref}
                className="inline-flex items-center gap-1.5 rounded-xl bg-coral px-4 py-2 text-sm font-medium text-white hover:bg-coral-deep transition-colors font-body"
              >
                <CreditCard size={15} aria-hidden="true" />
                {selectedMember ? 'Ver sus pagos pendientes' : 'Ir a pagar'}
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Prematrimonial sin el requisito: se dice qué falta en vez de dejar el
          tab vacío (PRE-5 mantiene el gate real en el servidor). */}
      {!prematOk && activeFilter === 'prematrimonial' && (
        <div className="rounded-2xl border-2 border-teal/20 bg-teal/[0.04] px-6 py-5 space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal/15">
              <Heart size={20} className="text-teal-deep" strokeWidth={1.75} />
            </div>
            <p className="text-base font-extrabold text-navy font-display tracking-[-0.01em]">Curso Prematrimonial</p>
          </div>
          <p className="text-[13px] text-navy-light/80 font-body leading-relaxed">
            Se inscribe en pareja, y <strong className="text-navy">cada uno</strong> debe tener
            Nivel 1 completado y estar inscrito en Nivel 2.{' '}
            {selectedMember
              ? 'Esta persona todavía no cumple ese requisito.'
              : 'Todavía no cumplís ese requisito.'}
          </p>
          <p className="text-[13px] text-navy-light/80 font-body">
            Cuando lo cumplan, la inscripción aparece acá con su propio formulario
            (logística, ceremonia y pago).
          </p>
        </div>
      )}

      {prematOk && (activeFilter === 'all' || activeFilter === 'prematrimonial') && (
        <Link
          href={selectedMember ? `/matricula/prematrimonial?member_id=${selectedMember.id}` : '/matricula/prematrimonial'}
          className="group flex items-center gap-4 rounded-2xl px-6 py-5 border-2 border-teal/25 bg-teal/5 hover:bg-teal/10 hover:border-teal/40 transition-colors"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal/15">
            <Heart size={22} className="text-teal-deep" strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-extrabold text-navy font-display tracking-[-0.01em]">Curso Prematrimonial</p>
            <p className="text-[13px] text-navy-light/80 font-body">
              {selectedMember
                ? `Inscribí a ${selectedMember.name} con su pareja. Ambos deben tener Nivel 1 completado y estar inscritos en Nivel 2; tiene su propio formulario (logística, ceremonia y pago).`
                : 'Inscribite con tu pareja. Ambos deben tener Nivel 1 completado y estar inscritos en Nivel 2; tiene su propio formulario (logística, ceremonia y pago).'}
            </p>
          </div>
          <ArrowRight size={18} className="shrink-0 text-teal-deep transition-transform group-hover:translate-x-1" />
        </Link>
      )}

      {/* Etapa avanzada: los tres estudios activos de esta etapa son POR
          INVITACIÓN (CDC, CDEB, HER — requires_invitation en study_plans), así que
          sin invitación la lista sale vacía y parece un error. Se explica. */}
      {activeFilter === 'avanzada' && (
        <div className="flex items-start gap-3 rounded-2xl border border-navy/15 bg-navy/[0.04] px-5 py-4">
          <Info size={18} className="mt-0.5 shrink-0 text-navy-light/80" aria-hidden />
          <p className="text-[13px] text-navy-light/80 font-body leading-relaxed">
            Los estudios de esta etapa son <strong className="text-navy">solo por invitación</strong>:
            Cómo Dar Estudios Bíblicos, Hermenéutica y Cómo Dar Charlas. Aparecen acá únicamente
            si el comité correspondiente {selectedMember ? 'lo invitó' : 'te invitó'}, y la
            invitación llega por correo. Si no ves ninguno, todavía no hay invitación.
          </p>
        </div>
      )}

      {/* Lista de estudios — el tab del prematrimonial solo muestra su tarjeta. */}
      {activeFilter === 'prematrimonial' ? null : loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 rounded-full border-2 border-coral border-t-transparent animate-spin" />
        </div>
      ) : loadError ? (
        <div
          className="rounded-2xl p-12 text-center bg-surface-card shadow-card border border-coral/30"
        >
          <AlertCircle size={28} className="text-coral mx-auto mb-3" />
          <p className="text-sm font-semibold text-navy font-body">
            No se pudo cargar la matrícula. Probá de nuevo.
          </p>
          <button
            onClick={() => setRetryKey(k => k + 1)}
            className="mt-4 inline-flex items-center rounded-full bg-coral px-4 py-2 text-sm text-white hover:bg-coral-deep transition-colors font-body"
          >
            Reintentar
          </button>
        </div>
      ) : grouped.length === 0 ? (
        // Niveles y Campañas no piden compromisos — si el tab queda vacío es
        // por otra razón (sin grupos abiertos), nunca por requisitos.
        stageResultsForEmptyState && stageResultsForEmptyState.length > 0
          && activeFilter !== 'niveles' && activeFilter !== 'campaña' ? (
          <StageRequirementsEmptyState
            stage={activeFilter}
            results={stageResultsForEmptyState}
            studyTypes={studyTypes}
          />
        ) : (
          <div
            className="rounded-2xl p-12 text-center bg-surface-card shadow-card"
          >
            <GraduationCap size={28} className="text-navy-light/80 mx-auto mb-3" />
            <p className="text-sm font-semibold text-navy-light/80 font-body">
              Por ahora no hay grupos abiertos para matricular
            </p>
            <p className="text-[13px] text-navy-light/80 mt-1 font-body">
              Podés reportar tu interés desde tu perfil — el equipo de estudios analiza la demanda para abrir grupos
            </p>
          </div>
        )
      ) : (
        <div className="space-y-6">
          {grouped.map(({ stage, items }) => {
            const meta = STAGE_META[stage] ?? STAGE_META.niveles
            return (
              <div key={stage}>
                {/* Separador de etapa */}
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className="rounded-full px-3 py-1 text-[13px] font-bold"
                    style={{ background: meta.bg, color: meta.text, fontFamily: 'var(--font-display)' }}
                  >
                    {meta.label}
                  </span>
                  <div className="flex-1 h-px bg-outline" />
                  <span className="text-[13px] text-navy-light/80 font-body">
                    {items.length} estudio{items.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {items.map(result => (
                    <StudyCard
                      key={result.study_code}
                      result={result}
                      stageMeta={meta}
                      expanded={expandedStudy === result.study_code}
                      onToggleExpand={() => setExpandedStudy(
                        expandedStudy === result.study_code ? null : result.study_code
                      )}
                      onEnroll={group => {
                        setPaymentMethod('sinpe')
                        setEnrollError(null)
                        // FIN-2: sin documento no se puede matricular (guard
                        // server-side en enrollMember). Se pide ACÁ como paso
                        // previo, en vez de dejar que el POST falle después.
                        if (profile && profile.has_document === false) {
                          setDocGate({ group, study: result })
                          return
                        }
                        setConfirmModal({ group, study: result })
                      }}
                      deudaHref={deudaHref}
                      onRequestScholarship={() => {
                        const plan = studyTypes.find(s => s.code === result.study_code)
                        if (plan?.plan_id) setScholarshipTarget({ entity_type: 'study_plan', id: plan.plan_id, name: plan.name })
                      }}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de confirmación */}
      {/* PAG-2: override explícito del staff sobre el bloqueo por pago pendiente. */}
      {overridePrompt && confirmModal && (
        <Modal onClose={() => setOverridePrompt(null)} titleId="override-pago-title" width={440}>
          <div className="p-6 space-y-4">
            <h3 id="override-pago-title" className="text-base font-bold text-navy font-display">Pago de estudios pendiente</h3>
            <p className="text-[13px] text-navy-light/80 font-body">
              {selectedMember?.name ?? 'El miembro'} tiene <strong>{overridePrompt.count} pago{overridePrompt.count !== 1 ? 's' : ''} de estudios pendiente{overridePrompt.count !== 1 ? 's' : ''}</strong>.
              ¿Matricularlo de todas formas? El pago pendiente sigue debiéndose.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setOverridePrompt(null); handleEnroll(undefined, true) }}
                className="flex-1 rounded-full bg-coral px-4 py-2.5 text-sm text-white hover:bg-coral-deep transition-colors font-body"
              >
                Matricular de todas formas
              </button>
              <button
                onClick={() => setOverridePrompt(null)}
                className="rounded-full border border-[var(--outline-variant)] px-4 py-2.5 text-sm text-navy-light hover:bg-surface-low transition-colors font-body"
              >
                Cancelar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* FIN-2: paso previo obligatorio — documento de identidad. */}
      {docGate && effectiveMemberId && (
        <Modal onClose={() => setDocGate(null)} titleId="matricula-doc-title" width={440}>
          <div className="p-6">
            <h2 id="matricula-doc-title" className="text-lg font-bold text-navy font-display">
              {selectedMember ? 'Falta el documento de identidad' : 'Necesitás registrar tu documento de identidad'}
            </h2>
            <p className="mt-2 text-sm text-navy-light/80 font-body">
              {selectedMember
                ? 'Esta persona no tiene documento registrado. Ingresá su cédula o número de documento de identidad para continuar — queda guardado en su perfil.'
                : 'Ingresá tu cédula o número de documento de identidad para continuar — queda guardado en tu perfil.'}
            </p>
            <div className="mt-4">
              <DocumentCapture
                memberId={effectiveMemberId}
                idPrefix="matricula-doc"
                submitLabel="Guardar documento y continuar"
                autoFocus
                onSaved={() => {
                  // El perfil local ya tiene documento: seguimos con la
                  // confirmación que disparó el gate.
                  setProfile(p => (p ? { ...p, has_document: true } : p))
                  setConfirmModal(docGate)
                  setDocGate(null)
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => setDocGate(null)}
              className="mt-2 w-full rounded-full px-4 py-2 text-[13px] text-navy-light/80 transition-colors hover:bg-navy/5 hover:text-navy font-body"
            >
              Cancelar
            </button>
          </div>
        </Modal>
      )}

      {confirmModal && (
        <ConfirmModal
          study={confirmModal.study}
          group={confirmModal.group}
          paymentMethod={paymentMethod}
          onPaymentChange={setPaymentMethod}
          onCancel={() => setConfirmModal(null)}
          onConfirm={handleEnroll}
          enrolling={enrolling}
          error={enrollError}
          memberId={effectiveMemberId}
          planId={studyTypes.find(s => s.code === confirmModal.study.study_code)?.plan_id ?? null}
        />
      )}

      {/* Comprobante de pago inmediato (matrícula con costo, recién creada) */}
      {pendingReceipt && (
        <StudyReceiptModal
          enrollmentId={pendingReceipt.enrollmentId}
          groupId={pendingReceipt.groupId}
          memberId={effectiveMemberId}
          studyName={pendingReceipt.studyName}
          memberName={effectiveName}
          amount={pendingReceipt.amount}
          currency={pendingReceipt.currency}
          onDone={() => setPendingReceipt(null)}
          onCancelada={() => { setPendingReceipt(null); setRetryKey(k => k + 1) }}
        />
      )}

      {scholarshipTarget && effectiveMemberId && (
        <ScholarshipRequestModal
          memberId={effectiveMemberId}
          fixedTarget={scholarshipTarget}
          onClose={() => setScholarshipTarget(null)}
        />
      )}
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

// Buscador de miembro para admin/dirección (ver disponibilidad como otra persona).
function MemberPicker({ selected, onSelect }: {
  selected: { id: string; name: string } | null
  onSelect: (m: { id: string; name: string } | null) => void
}) {
  return (
    <div className="flex flex-col gap-1 w-64">
      <span className="text-[11px] uppercase tracking-widest text-white/80 font-display">
        Ver disponibilidad como:
      </span>
      {selected ? (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-sm text-white">
          <span className="truncate font-body">{selected.name}</span>
          <button onClick={() => onSelect(null)} aria-label="Quitar miembro seleccionado" className="text-white/80 hover:text-white shrink-0"><X size={14} /></button>
        </div>
      ) : (
        <MemberCombobox
          dropdown
          variant="onDark"
          pageSize={6}
          placeholder="Buscar miembro…"
          onSelect={m => onSelect({ id: m.id, name: `${m.first_name} ${m.last_name}` })}
        />
      )}
    </div>
  )
}

// ¿Es este estudio la "puerta de entrada" real de su etapa? — su prerequisito
// no pertenece a la MISMA etapa (o no tiene). Los estudios cuyo prerequisito
// es OTRO estudio de la misma etapa (ej. Discípulos 2 pide Discípulos 1) son
// pasos internos de la cadena, no el mínimo real para entrar a la etapa — si
// se incluyeran, el mensaje agregado mostraría de más (ej. pedir a la vez SCJ,
// Discípulos 1, Discípulos 2 y Panorama para "Etapa Intermedia", cuando el
// único requisito real de entrada es SCJ).
function isStageGateway(r: EligibilityResult, studyTypes: StudyType[]): boolean {
  const study = studyTypes.find(s => s.code === r.study_code)
  if (!study?.prerequisite) return true
  const prereq = studyTypes.find(s => s.code === study.prerequisite)
  return !prereq || prereq.stage !== study.stage
}

// Mensaje de un tab de etapa sin nada matriculable: por qué, y qué le falta a
// ESTA persona puntualmente — a partir de reasons_met/reasons_blocked que ya
// trae cada EligibilityResult (computeEligibility), sin recalcular requisitos.
// Acotado a los estudios "puerta de entrada" de la etapa (ver isStageGateway)
// para no mezclar los prerequisitos internos de la cadena con el mínimo real.
function StageRequirementsEmptyState({ stage, results, studyTypes }: {
  stage: FilterTab; results: EligibilityResult[]; studyTypes: StudyType[]
}) {
  const meta = STAGE_META[stage] ?? STAGE_META.niveles
  const gateway = results.filter(r => isStageGateway(r, studyTypes))
  const anyEligible = gateway.some(r => r.is_eligible)
  // MAT-1: resumen estructurado y mínimo (datos, no unión de strings): un solo
  // prerequisito por cadena (el mínimo real) y compromisos deduplicados con
  // etiquetas cortas — el detalle largo va como texto secundario.
  const planNameByCode = (code: string) => studyTypes.find(s => s.code === code)?.name ?? code
  const { met, missing } = summarizeStageRequirements(gateway, planNameByCode)

  return (
    <div className="rounded-2xl p-8 bg-surface-card shadow-card">
      <div className="flex items-start gap-3 mb-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: meta.bg }}>
          <GraduationCap size={18} style={{ color: meta.text }} />
        </div>
        <div>
          <p className="text-base font-bold text-navy font-display">
            {anyEligible
              ? `Ya cumplís los requisitos de ${meta.label}`
              : `Requisitos para ${meta.label}`}
          </p>
          <p className="text-[13px] text-navy-light/80 font-body mt-0.5">
            {anyEligible
              ? 'Todavía no hay grupos abiertos en este momento — apenas se abra uno vas a poder matricularte.'
              : 'Estos son los compromisos que pide esta etapa.'}
          </p>
        </div>
      </div>

      {(met.length > 0 || missing.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {met.length > 0 && (
            <div>
              <p className="text-[13px] uppercase tracking-widest text-navy-light/80 font-display mb-2">Ya cumplís</p>
              <div className="space-y-1.5">
                {met.map(item => (
                  <div key={item.key} className="flex items-start gap-1.5">
                    <CheckCircle2 size={13} className="text-teal-deep shrink-0 mt-0.5" />
                    <span className="text-[13px] text-navy font-body">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {missing.length > 0 && (
            <div>
              <p className="text-[13px] uppercase tracking-widest text-navy-light/80 font-display mb-2">Requisitos para esta etapa</p>
              <div className="space-y-1.5">
                {missing.map(item => (
                  <div key={item.key} className="flex items-start gap-1.5">
                    <XCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
                    <span className="text-[13px] text-navy-light/80 font-body">
                      {item.label}
                      {item.detail && <span className="block text-[13px] text-navy-light/80">{item.detail}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Link
        href="/estudios/plan"
        className="mt-6 inline-flex items-center gap-1.5 text-[13px] text-coral hover:text-coral-deep transition-colors font-body underline decoration-dotted"
      >
        Ver todos los estudios y sus compromisos <ArrowRight size={13} />
      </Link>
    </div>
  )
}

function CommitmentRow({ met, label, info }: { met: boolean; label: string; info?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {met
        ? <CheckCircle2 size={13} className="text-teal-deep shrink-0" />
        : <XCircle size={13} className="text-navy-light/80 shrink-0" />
      }
      <span
        className={cn('text-[13px]', met ? 'text-navy' : 'text-navy-light/80', 'font-body')}
      >
        {label}
      </span>
      {info && (
        <span
          tabIndex={0}
          title={info}
          aria-label={info}
          className="cursor-help text-navy-light/80 hover:text-navy-light/80 focus:outline-none focus:text-navy-light/80"
        >
          <Info size={12} />
        </span>
      )}
    </div>
  )
}

function StudyCard({
  result, stageMeta, expanded, onToggleExpand, onEnroll, onRequestScholarship, deudaHref,
}: {
  result: EligibilityResult
  stageMeta: { label: string; bg: string; text: string }
  expanded: boolean
  onToggleExpand: () => void
  onEnroll: (group: EligibleGroup) => void
  onRequestScholarship: () => void
  /** A dónde mandar por la deuda: los pagos propios, o los de la persona que el
   *  staff está matriculando. Llega resuelto de arriba porque acá no se sabe a
   *  nombre de quién se está trabajando. */
  deudaHref: string
}) {
  const studyType = result.available_groups[0]

  return (
    <div
      className={cn('rounded-2xl overflow-hidden transition-opacity', !result.is_eligible && 'opacity-60')}
      style={{ background: 'var(--surface-card)', boxShadow: 'var(--shadow-md)' }}
    >
      <div className="p-5 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-[13px] font-bold rounded px-1.5 py-0.5"
                style={{ background: stageMeta.bg, color: stageMeta.text, fontFamily: 'var(--font-mono)' }}
              >
                {result.study_code}
              </span>
              {!result.is_eligible && (
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-red-100 text-red-600 font-display"
                >
                  Bloqueado
                </span>
              )}
              {result.by_invitation && (
                <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-coral/10 text-coral font-display">
                  Por invitación
                </span>
              )}
              {result.by_exception && (
                <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-teal-soft/40 text-teal-deep font-display">
                  Excepción autorizada
                </span>
              )}
            </div>
            <p className="mt-1 text-base font-bold text-navy leading-snug font-display">
              {result.study_name}
            </p>
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold shrink-0"
            style={{ background: stageMeta.bg, color: stageMeta.text, fontFamily: 'var(--font-display)' }}
          >
            {stageMeta.label}
          </span>
        </div>

        {/* Meta: semanas + costo */}
        <div className="flex items-center gap-3 text-[13px] text-navy-light/80 font-body">
          <span className="flex items-center gap-1">
            <Calendar size={12} />
            {result.weeks} semanas
          </span>
          {studyType?.requires_payment && studyType.cost ? (
            <span className="flex items-center gap-1 text-coral">
              <DollarSign size={12} />
              {formatMoney(studyType.cost, studyType.currency)}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-teal-deep">
              <DollarSign size={12} />
              {/* DIS2/DIS3 no son gratis: van incluidos en el pago de DIS1. */}
              {studyCostLabel(result.study_code, studyType?.cost ?? 0) === 'Gratis' ? 'Gratuito' : studyCostLabel(result.study_code, studyType?.cost ?? 0)}
            </span>
          )}
          {studyType?.requires_payment && (studyType.cost ?? 0) > 0 && (
            <button
              type="button"
              onClick={onRequestScholarship}
              className="ml-auto text-[13px] text-coral hover:text-coral-deep transition-colors font-body underline decoration-dotted"
            >
              ¿Necesitás ayuda para pagar? Solicitar beca
            </button>
          )}
        </div>

        {/* Requisitos */}
        <div className="space-y-1">
          {result.is_eligible ? (
            <>
              <p className="text-[13px] text-navy-light/80 font-medium font-display">
                Prerequisitos cumplidos:
              </p>
              {result.reasons_met.map((r, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <CheckCircle2 size={12} className="text-teal-deep shrink-0 mt-0.5" />
                  <span className="text-[13px] text-navy-light/80 font-body">{r}</span>
                </div>
              ))}
            </>
          ) : (
            <>
              <p className="text-[13px] text-navy-light/80 font-medium font-display">
                Para poder matricular necesitás:
              </p>
              {result.reasons_blocked.map((r, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <XCircle size={12} className="text-red-400 shrink-0 mt-0.5" />
                  <span className="text-[13px] text-navy-light/80 font-body">
                    {r}
                    {/* La deuda es el único motivo que la persona puede
                        resolver sola y ya mismo: se le pone el camino al lado
                        en vez de dejarla adivinando adónde ir. */}
                    {r === DEBT_BLOCK_REASON && (
                      <>
                        {' — '}
                        {/* Mismo cuidado que el banner de arriba: si el staff
                            está matriculando a otra persona, el enlace va a la
                            deuda de ESA persona, no a la suya. */}
                        <Link
                          href={deudaHref}
                          className="text-coral underline decoration-dotted hover:text-coral-deep"
                        >
                          {deudaHref === '/mis-pagos'
                            ? 'pagalo acá y se habilita al confirmarlo'
                            : 'ver su pago pendiente'}
                        </Link>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* CTA */}
        {result.is_eligible && (
          <button
            onClick={onToggleExpand}
            className="w-full flex items-center justify-between gap-2 rounded-xl bg-coral/10 hover:bg-coral/20 px-4 py-2.5 text-[13px] font-medium text-coral transition-colors font-body"
          >
            <span>
              {result.available_groups.length} grupo{result.available_groups.length !== 1 ? 's' : ''} disponible{result.available_groups.length !== 1 ? 's' : ''}
              {result.available_groups.length === 0 && ' — sin cupos'}
            </span>
            <span className="flex items-center gap-1">
              Ver grupos y matricular
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </button>
        )}
      </div>

      {/* Panel expandido de grupos */}
      {expanded && result.available_groups.length > 0 && (
        <div
          className="border-t border-outline"
        >
          <div className="px-5 py-3">
            <p className="text-[13px] font-semibold text-navy-light/80 uppercase tracking-widest mb-3 font-display">
              Grupos disponibles — {result.study_name}
            </p>
            <div className="space-y-2">
              {result.available_groups.map(group => (
                <GroupRow key={group.group_id} group={group} onEnroll={() => onEnroll(group)} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function GroupRow({ group, onEnroll }: { group: EligibleGroup; onEnroll: () => void }) {
  const fillPct = group.max_capacity > 0 ? Math.round((group.filled / group.max_capacity) * 100) : 0

  return (
    <div
      className="rounded-xl px-3 py-3 flex items-center gap-3 flex-wrap bg-surface-low"
    >
      <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5">
        <div>
          <p className="text-[11px] text-navy-light/80 uppercase tracking-wider mb-0.5 font-display">Zona</p>
          <p className="text-[13px] font-medium text-navy capitalize font-body flex items-center gap-1.5">
            {group.zone}
            {group.is_virtual && (
              <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium font-display bg-teal-soft/40 text-teal-deep normal-case">
                Virtual
              </span>
            )}
          </p>
          {/* La ubicación va DEBAJO de la zona, no en una quinta columna: es el
              detalle de la zona, y la fila ya venía apretada con cuatro. */}
          {group.location && (
            <p className="text-[13px] text-navy-light/80 font-body leading-snug">{group.location}</p>
          )}
        </div>
        <div>
          <p className="text-[11px] text-navy-light/80 uppercase tracking-wider mb-0.5 font-display">Horario</p>
          <p className="text-[13px] text-navy font-body">{group.schedule_days} {group.schedule_time}</p>
        </div>
        <div>
          <p className="text-[11px] text-navy-light/80 uppercase tracking-wider mb-0.5 font-display">Dirigente</p>
          <p className="text-[13px] text-navy font-body">{group.leader_name}</p>
        </div>
        <div>
          <p className="text-[11px] text-navy-light/80 uppercase tracking-wider mb-0.5 font-display">Cupos</p>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-navy font-body">
              {group.spots_available}/{group.max_capacity}
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-navy-light/10 overflow-hidden min-w-[40px]">
              <div
                className="h-full rounded-full bg-coral transition-all"
                style={{ width: `${fillPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[13px] text-navy-light/80 font-body">
          Inicio: {formatDateLong(group.start_date)}
        </span>
        {group.requires_payment && group.cost ? (
          <span className="text-[13px] font-semibold text-coral font-display">
            {formatCRC(group.cost)}
          </span>
        ) : (
          <span className="text-[13px] font-semibold text-teal-deep font-display">
            Gratuito
          </span>
        )}
        <button
          onClick={onEnroll}
          className="mt-1 rounded-lg bg-coral px-3 py-1.5 text-[13px] font-medium text-white hover:bg-coral-deep transition-colors font-body"
        >
          Matricular
        </button>
      </div>
    </div>
  )
}

// `currency` importa para las becas de MONTO FIJO: solo aplican en su propia
// moneda (INT-2). Sin ese dato el modal mostraría un descuento que el server
// después niega.
type ApplicableScholarship = {
  id: string
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  currency?: string | null
}

function ConfirmModal({
  study, group, paymentMethod, onPaymentChange, onCancel, onConfirm, enrolling, error, memberId, planId,
}: {
  study: EligibilityResult
  group: EligibleGroup
  paymentMethod: PaymentMethodValue
  onPaymentChange: (m: PaymentMethodValue) => void
  onCancel: () => void
  onConfirm: (scholarship?: { scholarship_id?: string; coupon_code?: string }) => void
  enrolling: boolean
  error: string | null
  memberId: string | null
  planId: string | null
}) {
  const [applicable, setApplicable] = useState<ApplicableScholarship | null>(null)
  const [useScholarship, setUseScholarship] = useState(true)
  const [couponCode, setCouponCode] = useState('')

  useEffect(() => {
    if (!memberId || !planId || !(group.requires_payment && group.cost)) return
    fetch(`/api/scholarships/applicable?member_id=${memberId}&entity_type=study_plan&entity_id=${planId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setApplicable(d?.scholarship ?? null))
      .catch(() => setApplicable(null))
  }, [memberId, planId, group.requires_payment, group.cost])

  // FIN-3: el desglose sale del módulo puro compartido (mismo cálculo y mismo
  // redondeo por moneda que usa el server al cobrar).
  const breakdown = buildPaymentBreakdown({
    price: group.cost,
    currency: group.currency,
    scholarship: applicable && useScholarship ? applicable : null,
  })

  function handleConfirm() {
    if (applicable && useScholarship) onConfirm({ scholarship_id: applicable.id })
    else if (couponCode.trim()) onConfirm({ coupon_code: couponCode.trim() })
    else onConfirm()
  }

  return (
    <Modal onClose={onCancel} titleId="confirmar-matricula-title" width={448}>
      <div className="p-6 space-y-5">
        {/* Header */}
        <p id="confirmar-matricula-title" className="text-base font-bold text-navy font-display">
          Confirmar matrícula
        </p>

        {/* Detalle */}
        <div className="rounded-xl space-y-0 overflow-hidden border border-outline">
          {[
            { label: 'Estudio',   value: study.study_name },
            { label: 'Grupo',     value: `${group.zone.charAt(0).toUpperCase() + group.zone.slice(1)} — ${group.schedule_days} ${group.schedule_time}` },
            // Acá es donde de verdad hace falta: es lo último que ve antes de
            // confirmar, y es el dato con el que tiene que llegar el primer día.
            ...(group.location ? [{ label: 'Dónde', value: group.location }] : []),
            { label: 'Dirigente', value: group.leader_name },
            { label: 'Inicio',    value: formatDateLong(group.start_date) },
            { label: 'Duración',  value: `${study.weeks} semanas` },
            // La moneda sale del plan (INT-3); antes se formateaba siempre en colones.
            { label: 'Costo',     value: group.requires_payment && group.cost ? formatMoney(group.cost, group.currency) : 'Gratuito' },
          ].map(({ label, value }, i) => (
            <div
              key={label}
              className={cn('flex items-center gap-3 px-4 py-2.5', i > 0 && 'border-t', 'border-outline')}
            >
              <span className="w-24 text-[13px] text-navy-light/80 uppercase tracking-wider shrink-0 font-display">
                {label}
              </span>
              <span className="text-[13px] font-medium text-navy font-body">
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Aviso */}
        <div
          className="flex items-start gap-2.5 rounded-xl px-3 py-3 bg-coral/7 border border-coral/20"
        >
          <AlertCircle size={14} className="text-coral shrink-0 mt-0.5" />
          <p className="text-[13px] text-navy-light/80 font-body">
            {group.requires_payment && group.cost
              ? 'Al confirmar, te vamos a pedir el comprobante de pago para completar la matrícula.'
              : 'Al confirmar tu matrícula, un administrador procesará tu inscripción y recibirás un mensaje de confirmación.'}
          </p>
        </div>

        {/* Beca: asignada aplicable, o código genérico */}
        {group.requires_payment && group.cost && (
          <div className="space-y-2">
            {applicable ? (
              <label className="flex items-start gap-2.5 rounded-xl px-3 py-2.5 bg-teal-soft/10 border border-teal-deep/20 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={useScholarship}
                  onChange={e => setUseScholarship(e.target.checked)}
                />
                <span className="text-[13px] text-navy font-body">
                  Usar mi beca ({formatDiscount(applicable.discount_type, applicable.discount_value, applicable.currency ?? group.currency)} de descuento)
                  {breakdown?.blockedByCurrency && (
                    <span className="mt-0.5 block text-[13px] text-coral-deep">
                      Esta beca está en otra moneda que el cobro, así que no se puede aplicar acá.
                    </span>
                  )}
                </span>
              </label>
            ) : (
              <div className="space-y-1">
                <label htmlFor="coupon-code" className="text-[13px] uppercase tracking-widest text-navy-light/80 font-display">¿Tenés un código de descuento?</label>
                <input
                  id="coupon-code" value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="Opcional"
                  className="w-full rounded-xl bg-surface-low px-3 py-2 text-sm text-navy outline-none focus:ring-1 focus:ring-coral/30 font-body"
                />
                <p className="text-[13px] text-navy-light/80 font-body">
                  El descuento se calcula al confirmar.
                </p>
              </div>
            )}

            {/* FIN-3: desglose explícito. El reclamo de finanzas es que la
                gente transfiere montos equivocados, así que el monto final va
                grande y sin ambigüedad. */}
            {breakdown && (
              <div className="rounded-xl border border-outline px-3 py-2.5 space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] text-navy-light/80 font-body">Precio</span>
                  <span className="text-[13px] text-navy font-body">{formatMoney(breakdown.price, breakdown.currency)}</span>
                </div>
                {breakdown.discount > 0 && (
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] text-teal-deep font-body">
                      Beca{breakdown.discountLabel ? ` (${breakdown.discountLabel})` : ''}
                    </span>
                    <span className="text-[13px] text-teal-deep font-body">
                      −{formatMoney(breakdown.discount, breakdown.currency)}
                    </span>
                  </div>
                )}
                <div className="flex items-baseline justify-between gap-3 border-t border-outline pt-1.5">
                  <span className="text-[13px] uppercase tracking-wider text-navy-light/80 font-display">
                    {breakdown.covered ? 'Total' : 'Total a pagar'}
                  </span>
                  <span className="text-lg font-bold text-navy font-display">
                    {formatMoney(breakdown.final, breakdown.currency)}
                  </span>
                </div>
                {breakdown.covered && (
                  <p className="text-[13px] text-teal-deep font-body">
                    La beca cubre el total: no hay que subir comprobante.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Método de pago */}
        {group.requires_payment && group.cost && (
          <PaymentMethodSelector value={paymentMethod} onChange={onPaymentChange} />
        )}

        {error && <p className="text-[13px] text-coral font-body">{error}</p>}

        {/* Botones */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            disabled={enrolling}
            className="flex-1 rounded-xl border py-2.5 text-sm text-navy-light hover:bg-surface-low transition-colors border-outline font-body"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={enrolling}
            className={cn('flex-1 rounded-xl bg-coral py-2.5 text-sm text-white hover:bg-coral-deep transition-colors font-medium font-body', enrolling && 'opacity-50 cursor-not-allowed')}
          >
            {enrolling ? 'Matriculando…' : 'Confirmar matrícula'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// Comprobante inmediato tras matricular un estudio con costo. Mismo patrón que
// PayMatriculaButton del perfil del miembro, pero abierto de una vez en vez de
// requerir un click extra.
//
// 2026-08-04: la matrícula YA está hecha cuando este modal se abre — cerrar no
// la deshace (antes sí: cerrar anulaba la matrícula recién creada).
// El comprobante se pide ACÁ y no se ofrece salida: sin botón de "después" y
// sin cierre por fondo ni Esc. Decisión de TI: el momento de subirlo es este,
// con el SINPE recién hecho; la gente que "lo sube después" no lo sube.
// Lo único que no se puede impedir es que cierren la pestaña, y ahí la
// matrícula queda igual con su cobro pendiente — eso es la regla, no un
// agujero.
