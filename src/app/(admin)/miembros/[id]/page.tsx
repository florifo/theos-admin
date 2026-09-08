'use client'

import { useState, useMemo, useEffect } from 'react'
import { Tabs } from '@/components/shared/Tabs'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { openSectionsFromParam } from '@/lib/members/profile-deeplink'
import { notFound } from 'next/navigation'
import { useMember } from '@/hooks/useMember'
import { useStudyPlans } from '@/hooks/useStudyPlans'
import { useAuth } from '@/hooks/useAuth'
import { STUDY_ADMIN_ROLES } from '@/lib/auth/roles'
import { Modal } from '@/components/shared/Modal'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import { MemberHeader } from './_components/MemberHeader'
import { MemberSummaryTab } from './_components/MemberSummaryTab'
import { MemberDigitalPass } from './_components/MemberDigitalPass'
import { MemberPersonalTab } from './_components/MemberPersonalTab'
import { MemberEmailStatus } from './_components/MemberEmailStatus'
import { MemberSpiritualTab } from './_components/MemberSpiritualTab'
import { MemberAdminTab } from './_components/MemberAdminTab'
import { MemberRecommendations } from './_components/MemberRecommendations'
import { MemberParticipationTab } from './_components/MemberParticipationTab'
import { MemberFamilyTab } from './_components/MemberFamilyTab'
import type { StudyRow, ServiceRow, EventoRow, DonacionRow, EventRegistrationRow } from './_components/MemberParticipationTab'
import { apareceEnHistorial, etiquetaHistorial } from '@/lib/studies/enrollment-history'

// ─── Helpers ──────────────────────────────────────────────────────────────────

type TabDef = { id: string; label: string }
const BASE_TABS: TabDef[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'personal', label: 'Info Personal' },
  { id: 'participacion', label: 'Participación' },
  { id: 'familia', label: 'Familia' },
]
const PASE_TAB: TabDef = { id: 'pase', label: 'Pase Digital' }

const LOAD_MORE = 10

function useSortableTable<T extends object>(data: T[]) {
  const [sortKey, setSortKey] = useState<keyof T | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  function toggleSort(key: keyof T) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  const sorted = useMemo(() => {
    if (!sortKey) return data
    return [...data].sort((a, b) => {
      const av = a[sortKey] as string | number
      const bv = b[sortKey] as string | number
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [data, sortKey, sortDir])
  return { sorted, sortKey, sortDir, toggleSort }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MiembroDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : ''

  const { member, loading, notFound: isNotFound, error, refetch } = useMember(id || undefined)
  const { studyTypes } = useStudyPlans()
  const { hasRole, member: viewer } = useAuth()

  const isStudyAdmin = hasRole(...STUDY_ADMIN_ROLES)
  // Onboarding de servidores: estos roles también entran al tab Administrativo,
  // pero ahí solo ven su sección (el API no les da los datos de estudios).
  const isServersOnboardingAdmin = hasRole('admin', 'encargado_staff', 'coordinador_servidores')
  const isDirigente = hasRole('dirigente')
  const isOwnProfile = !!viewer?.id && viewer.id === id
  const canDeactivate = hasRole('admin', 'comunicaciones')

  // Permite abrir un tab directo vía ?tab= (p. ej. la notificación de cobro
  // apunta a ?tab=participacion). Fallback a 'resumen'.
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'resumen')
  const [menuOpen, setMenuOpen] = useState(false)
  const [showDeactivate, setShowDeactivate] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [revealDonations, setRevealDonations] = useState(false)
  const [showMerge, setShowMerge] = useState(false)
  // PAG-4: ?open=<sección> (p. ej. "Ver historial de pagos" de /mis-pagos usa
  // ?tab=participacion&open=pagos) arranca con ese acordeón expandido.
  const [openSections, setOpenSections] = useState({
    estudios: true,
    ledStudies: false,
    servicio: false,
    eventos: false,
    eventRegistrations: false,
    misBecas: false,
    pagos: false,
    donaciones: false,
    ...openSectionsFromParam(searchParams.get('open')),
  })

  function changeTab(tab: string) {
    setActiveTab(tab)
  }

  async function handleDeactivate() {
    if (deactivating) return
    setDeactivating(true)
    try {
      const res = await fetch(`/api/members/${id}/deactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'baja_manual' }),
      })
      if (!res.ok) throw new Error()
      setShowDeactivate(false)
      refetch()
    } catch {
      // se mantiene el modal abierto; el botón se rehabilita
    } finally {
      setDeactivating(false)
    }
  }

  function toggleSection(key: keyof typeof openSections) {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // Derived (safe-against-null para no romper los hooks de abajo mientras carga)
  const currentStudyEntry = member?.current_study
    ? studyTypes.find(s => s.code === member.current_study)
    : null

  const currentWeek = member?.current_study_week ?? 0


  const lastStudyCode = member?.completed_studies[member.completed_studies.length - 1]
  const lastStudyEntry = lastStudyCode ? studyTypes.find(s => s.code === lastStudyCode) : null

  const hasFinanceRole = true // demo

  // ── Typed rows for sortable tables ──────────────────────────────────────────

  const estudiosRows: StudyRow[] = useMemo(() => {
    if (!member?.study_history) return []
    // Las etiquetas y el filtro viven en enrollment-history, con tests.
    // 'en_revision': el grupo cerró y esta inscripción quedó sin resultado. NO
    // dice aprobado ni reprobado — eso lo confirma el coordinador de estudios.
    // Y 'dropped' dice "Se retiró", no "Reprobó": son cosas distintas y solo
    // una de las dos es un juicio sobre el desempeño de la persona.
    const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic']
    const fmt = (date: string | null, year: number | null) => {
      if (date) { const [y, m] = date.split('-'); return `${MESES[Number(m) - 1] ?? ''} ${y}`.trim() }
      return year ? String(year) : '—'
    }
    return member.study_history
      // Una matrícula cancelada no ocurrió: no sale en el historial.
      .filter(s => apareceEnHistorial(s.status))
      .map(s => ({
      code: s.code,
      name: s.name || studyTypes.find(x => x.code === s.code)?.name || s.code,
      startYear: s.year ?? 0,
      startLabel: fmt(s.date, s.year),
      duration: s.weeks ? `${s.weeks} sem.` : '—',
      status: etiquetaHistorial(s.status),
      groupId: s.group_id,
      enrollmentId: s.enrollment_id,
      rawStatus: s.status,
      groupStatus: s.group_status ?? null,
      requiresPayment: s.requires_payment,
      paymentStatus: s.payment_status,
      paymentsCount: s.payments_count ?? 0,
      cost: s.cost,
      grade: s.grade ?? null,
      notes: s.notes ?? null,
      esExterno: s.es_externo,
      fuenteExterna: s.fuente_externa,
      registradoPor: s.registrado_por,
    }))
  }, [member, studyTypes])

  const servicioRows: ServiceRow[] = useMemo(() =>
    (member?.service_history ?? []).map(s => ({
      position: s.position,
      committee: s.committee,
      from: s.from,
      to: s.to ?? '',
      status: s.status,
    })),
  [member])

  const eventosRows: EventoRow[] = useMemo(() =>
    (member?.attendance_history ?? []).map(ev => ({
      name: ev.name,
      type: ev.type,
      date: ev.date,
      attendance_type: ev.attendance_type,
    })),
  [member])

  const donacionesRows: DonacionRow[] = useMemo(() =>
    (member?.donations ?? []).map(d => ({
      date: d.date,
      description: d.description,
      amount: d.amount,
    })),
  [member])

  const eventRegistrationRows: EventRegistrationRow[] = useMemo(() =>
    (member?.event_registration_history ?? []).map(r => ({
      registrationId: r.registration_id,
      eventId: r.event_id,
      eventName: r.event_name,
      eventDate: r.event_date,
      requiresPayment: r.requires_payment,
      cost: r.cost,
      paymentStatus: r.payment_status,
      reviewStatus: r.review_status,
    })),
  [member])

  // ── Sortable tables ──────────────────────────────────────────────────────────
  const estudiosTable  = useSortableTable(estudiosRows)
  const servicioTable  = useSortableTable(servicioRows)
  const eventosTable   = useSortableTable(eventosRows)
  const donacionesTable = useSortableTable(donacionesRows)
  const eventRegistrationTable = useSortableTable(eventRegistrationRows)

  // ── Pagination ───────────────────────────────────────────────────────────────
  const [visibleEstudios,  setVisibleEstudios]  = useState(LOAD_MORE)
  const [visibleServicio,  setVisibleServicio]  = useState(LOAD_MORE)
  const [visibleEventos,   setVisibleEventos]   = useState(LOAD_MORE)
  const [visibleDonaciones, setVisibleDonaciones] = useState(LOAD_MORE)
  const [visibleEventRegistrations, setVisibleEventRegistrations] = useState(LOAD_MORE)

  // ── Estados de carga (van DESPUÉS de todos los hooks por reglas de React) ──
  if (isNotFound) notFound()
  if (error) {
    return (
      <div className="p-8 text-center text-coral font-body">
        Error cargando miembro: {error}
      </div>
    )
  }
  if (loading || !member) {
    return (
      <div className="p-8 text-center text-navy-light/80 font-body">
        Cargando…
      </div>
    )
  }

  // Tabs visibles según rol y propiedad del perfil:
  //  · Espiritual → el propio miembro o roles administrativos.
  //  · Administrativo → SOLO roles administrativos (el miembro nunca lo ve).
  const visibleTabs: TabDef[] = [
    ...BASE_TABS,
    ...(isOwnProfile || isStudyAdmin ? [{ id: 'espiritual', label: 'Espiritual' }] : []),
    ...(isStudyAdmin || isServersOnboardingAdmin ? [{ id: 'administrativo', label: 'Administrativo' }] : []),
    PASE_TAB,
  ]

  return (
    <div className="space-y-4">
      {/* ── Header Card ── */}
      <MemberHeader
        member={member}
        onEdit={() => router.push(`/miembros/${id}/editar`)}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen(o => !o)}
        onMenuClose={() => setMenuOpen(false)}
        canDeactivate={canDeactivate}
        onDeactivate={() => { setMenuOpen(false); setShowDeactivate(true) }}
        onMerge={() => { setMenuOpen(false); setShowMerge(true) }}
      />

      {/* ── Tab bar ──
          Pasa por el Tabs compartido en vez de una fila propia. Dos razones:
          esta barra llega a SIETE tabs y con overflow-x-auto en un celular se
          veían tres —los otros cuatro había que adivinar que estaban a la
          derecha—, y además la versión propia no tenía ni role="tab" ni
          navegación con flechas, que el compartido sí trae.

          Deja de ser sticky en móvil: partida en dos o tres líneas, pegada
          arriba se comía media pantalla. En sm+ va en una sola línea y se
          queda pegada como antes. */}
      <div className="sm:sticky sm:top-0 z-10 rounded-2xl bg-surface-card shadow-[var(--shadow-md)] px-2">
        <Tabs
          tabs={visibleTabs.map(t => ({ key: t.id, label: t.label }))}
          active={activeTab}
          onChange={changeTab}
          className="border-b-0"
        />
      </div>

      {/* ── Tab Content ── */}

      {/* TAB: Resumen */}
      {activeTab === 'resumen' && (
        <MemberSummaryTab
          member={member}
          currentStudyEntry={currentStudyEntry}
          currentWeek={currentWeek}
          lastStudyEntry={lastStudyEntry}
        />
      )}

      {/* TAB: Info Personal */}
      {activeTab === 'personal' && (
        <div className="space-y-4">
          <MemberPersonalTab member={member} />
          <MemberEmailStatus memberId={member.id} />
        </div>
      )}

      {/* TAB: Participación */}
      {activeTab === 'participacion' && (
        <div className="space-y-3">
        <MemberParticipationTab
          memberId={member.id}
          memberName={`${member.first_name ?? ''} ${member.last_name ?? ''}`.trim()}
          onResuelto={refetch}
          openSections={openSections}
          onToggleSection={toggleSection}
          estudiosTable={estudiosTable}
          servicioTable={servicioTable}
          eventosTable={eventosTable}
          donacionesTable={donacionesTable}
          eventRegistrationTable={eventRegistrationTable}
          visibleEstudios={visibleEstudios}
          visibleServicio={visibleServicio}
          visibleEventos={visibleEventos}
          visibleDonaciones={visibleDonaciones}
          visibleEventRegistrations={visibleEventRegistrations}
          onLoadMoreEstudios={() => setVisibleEstudios(v => v + LOAD_MORE)}
          onLoadMoreServicio={() => setVisibleServicio(v => v + LOAD_MORE)}
          onLoadMoreEventos={() => setVisibleEventos(v => v + LOAD_MORE)}
          onLoadMoreDonaciones={() => setVisibleDonaciones(v => v + LOAD_MORE)}
          onLoadMoreEventRegistrations={() => setVisibleEventRegistrations(v => v + LOAD_MORE)}
          hasFinanceRole={hasFinanceRole}
          revealDonations={revealDonations}
          onToggleRevealDonations={() => setRevealDonations(r => !r)}
          donationsCount={member.donations.length}
          ledStudies={member.led_studies ?? []}
        />
        {/* Dirigente sin rol administrativo: recomendaciones SOLO de sus miembros
            (el backend filtra; vacío → no se pinta). No ve el resto del tab Admin. */}
        {isDirigente && !isStudyAdmin && (
          <MemberRecommendations memberId={member.id} hideWhenEmpty />
        )}
        </div>
      )}


      {showMerge && member && (
        <MergeMemberModal
          keepId={id}
          keepName={`${member.first_name} ${member.last_name}`.trim()}
          onClose={() => setShowMerge(false)}
          onMerged={() => { setShowMerge(false); refetch() }}
        />
      )}

      {/* TAB: Familia */}
      {activeTab === 'familia' && (
        <MemberFamilyTab member={member} onChanged={refetch} />
      )}

      {/* TAB: Espiritual (propio miembro o roles administrativos) */}
      {activeTab === 'espiritual' && (isOwnProfile || isStudyAdmin) && (
        <MemberSpiritualTab memberId={member.id} />
      )}

      {/* TAB: Administrativo (solo roles administrativos) */}
      {activeTab === 'administrativo' && (isStudyAdmin || isServersOnboardingAdmin) && (
        <MemberAdminTab memberId={member.id} onChanged={refetch} />
      )}

      {/* TAB: Pase Digital */}
      {activeTab === 'pase' && (
        <div className="space-y-4">
          <MemberDigitalPass member={member} />
        </div>
      )}

      {/* Confirmación de baja del miembro (admin / comunicaciones) */}
      <DeleteConfirmModal
        open={showDeactivate}
        title="Dar de baja al miembro"
        description={`Se desactivará el perfil de ${member.first_name} ${member.last_name}: quedará inaccesible y la persona será removida de sus roles activos. El historial se conserva. Escribí «desactivar» para confirmar.`}
        keyword="desactivar"
        confirmLabel="Dar de baja"
        loading={deactivating}
        onConfirm={handleDeactivate}
        onCancel={() => setShowDeactivate(false)}
      />
    </div>
  )
}

// ─── Modal: fusionar miembro duplicado ──────────────────────────────────────────

type SearchHit = { id: string; first_name: string; last_name: string; cedula: string | null; email: string | null; is_active?: boolean }

/** GET /api/members devuelve `{ members, total }`. Esta pantalla leía `data`, así
 *  que la búsqueda del modal de fusión SIEMPRE salía vacía (bug 2026-08-06). */
function hitsFrom(payload: unknown): SearchHit[] {
  if (Array.isArray(payload)) return payload as SearchHit[]
  const o = (payload ?? {}) as { members?: SearchHit[]; data?: SearchHit[] }
  return o.members ?? o.data ?? []
}

function MergeMemberModal({ keepId, keepName, onClose, onMerged }: {
  keepId: string
  keepName: string
  onClose: () => void
  onMerged: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchHit[]>([])
  const [picked, setPicked] = useState<SearchHit | null>(null)
  const [searching, setSearching] = useState(false)
  const [merging, setMerging] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    let alive = true
    setSearching(true)
    const t = setTimeout(() => {
      // Un duplicado suele estar DADO DE BAJA, y el padrón filtra activos por
      // defecto: se busca en los dos lados y se juntan.
      const buscar = (activos: boolean) =>
        fetch(`/api/members?search=${encodeURIComponent(q)}&pageSize=8&is_active=${activos}`)
          .then(r => (r.ok ? r.json() : null))
          .then(hitsFrom)
          .catch(() => [] as SearchHit[])
      Promise.all([buscar(true), buscar(false)])
        .then(([activos, inactivos]) => {
          if (!alive) return
          setResults([...activos, ...inactivos].filter(m => m.id !== keepId).slice(0, 12))
        })
        .finally(() => { if (alive) setSearching(false) })
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [query, keepId])

  async function handleMerge() {
    if (!picked) return
    setMerging(true)
    setErr(null)
    try {
      const res = await fetch(`/api/members/${keepId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duplicate_id: picked.id }),
      })
      if (!res.ok) throw new Error('Error al fusionar')
      onMerged()
    } catch (e) {
      console.error(e)
      setErr('No se pudo fusionar. Intentá de nuevo.')
      setMerging(false)
    }
  }

  return (
    <Modal onClose={onClose} titleId="fusionar-duplicado-title" width={448}>
      <div className="p-6 space-y-4">
        <div>
          <p id="fusionar-duplicado-title" className="text-base font-bold text-navy font-display">Fusionar duplicado</p>
          <p className="text-[13px] text-navy-light/80 font-body mt-1">
            Buscá el registro duplicado. Toda su información (estudios, asistencias, servicio, pagos…) se moverá a <strong className="text-navy">{keepName}</strong> y el duplicado se <strong>eliminará</strong>. Esta acción no se puede deshacer.
          </p>
        </div>

        {!picked ? (
          <>
            <input
              autoFocus
              className="w-full rounded-xl bg-surface-low px-3 py-2 text-sm text-navy outline-none focus:ring-1 focus:ring-coral/30 font-body"
              placeholder="Buscar por nombre, cédula, teléfono o correo…"
              aria-label="Buscar por nombre, cédula, teléfono o correo"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <div className="max-h-64 overflow-y-auto space-y-1">
              {searching && <p className="text-xs text-navy-light/80 px-1 font-body">Buscando…</p>}
              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <p className="text-xs text-navy-light/80 px-1 font-body">Sin resultados.</p>
              )}
              {results.map(m => (
                <button
                  key={m.id}
                  onClick={() => setPicked(m)}
                  className="w-full text-left rounded-xl px-3 py-2 hover:bg-surface-low transition-colors"
                >
                  <p className="text-sm text-navy font-body">
                    {m.first_name} {m.last_name}
                    {m.is_active === false && <span className="ml-2 text-[13px] text-navy-light/80">· dado de baja</span>}
                  </p>
                  <p className="text-[13px] text-navy-light/80 font-body">
                    {m.cedula ? `Cédula ${m.cedula}` : 'Sin cédula'}{m.email ? ` · ${m.email}` : ''}
                  </p>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-xl bg-coral-soft/15 px-3 py-3">
            <p className="text-[13px] uppercase tracking-widest text-navy-light/80 font-display mb-1">Se eliminará y fusionará en {keepName}</p>
            <p className="text-sm text-navy font-body">{picked.first_name} {picked.last_name}</p>
            <p className="text-[13px] text-navy-light/80 font-body">
              {picked.cedula ? `Cédula ${picked.cedula}` : 'Sin cédula'}{picked.email ? ` · ${picked.email}` : ''}
            </p>
            <button onClick={() => setPicked(null)} className="mt-2 text-[13px] text-coral hover:underline font-body">Elegir otro</button>
          </div>
        )}

        {err && <p className="text-sm text-coral font-body">{err}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 rounded-xl border py-2.5 text-sm text-navy-light hover:bg-surface-low transition-colors border-[var(--outline-variant)] font-body">
            Cancelar
          </button>
          <button onClick={handleMerge} disabled={!picked || merging} className="flex-1 rounded-xl bg-coral py-2.5 text-sm text-white hover:bg-coral-deep transition-colors disabled:opacity-40 font-body">
            {merging ? 'Fusionando…' : 'Fusionar y eliminar duplicado'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
