'use client'

import { use, useState, useMemo, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useEvent } from '@/hooks/useEvents'
import type { Member } from '@/types/member'
import { toDomainMember } from '@/lib/members/adapter'
import { CancellationModal } from '@/components/events/CancellationModal'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import { ActiveWarningModal } from '@/components/shared/ActiveWarningModal'
import { Modal } from '@/components/shared/Modal'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/hooks/usePermissions'
import { useToast } from '@/components/shared/Toast'
import { useOrg } from '@/lib/org'
import { generateCSV } from '@/lib/export'
import { Send, Download, Check, X } from 'lucide-react'
import { TOAST_MS } from '@/lib/constants'
import { useRef } from 'react'
import { EventHeader } from './_components/EventHeader'
import { useAuth } from '@/hooks/useAuth'
import { EventInfoTab } from './_components/EventInfoTab'
import { useEventRegistration } from '@/components/events/useEventRegistration'
import {
  visibleEventTabs, canSeeEventManagementData, registrationCta,
  type EventTab,
} from '@/lib/events/detail-access'
import type { EventEligibilityResult } from '@/lib/events/eligibility'
import { CompartirInscripcion } from '@/components/events/CompartirInscripcion'
import { contarPersonasNuevas } from '@/lib/events/personas-nuevas'
import { EventRegistrationsTab } from './_components/EventRegistrationsTab'
import { EventCheckinTab } from './_components/EventCheckinTab'
import { EventServersTab } from './_components/EventServersTab'
import type { VolunteerBooking } from './_components/EventServersTab'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getInitials, formatMoney } from '@/lib/format'

/** Envío REAL vía el módulo de comunicaciones (correo + notificación interna
 *  a los inscritos con miembro asociado). El botón que abre este modal está
 *  gateado por can('comunicaciones','create') — los endpoints exigen ese rol. */
function SendMessageModal({ eventTitle, memberIds, onClose }: {
  eventTitle: string
  memberIds: string[]
  onClose: () => void
}) {
  const [subject, setSubject] = useState(`Evento: ${eventTitle}`)
  const [msg, setMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSend() {
    if (sending) return
    setSending(true)
    setError(null)
    try {
      const createRes = await fetch('/api/communications/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'email',
          kind: 'transactional',
          subject,
          body: msg,
          body_format: 'text',
          segment_label: `Inscritos · ${eventTitle}`,
          total_recipients: memberIds.length,
          smtp_config_id: null,
          whatsapp_config_id: null,
        }),
      })
      if (!createRes.ok) throw new Error()
      const { id } = await createRes.json()
      const recipients = memberIds.flatMap(mid => [
        { member_id: mid, channel: 'email', recipient: '' },
        { member_id: mid, channel: 'interna', recipient: '' },
      ])
      const sendRes = await fetch(`/api/communications/messages/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients }),
      })
      if (!sendRes.ok) {
        const d = await sendRes.json().catch(() => null)
        throw new Error(d?.error)
      }
      setSent(true)
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'No se pudo enviar el mensaje. Intentá de nuevo.')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <Modal onClose={onClose} titleId="enviar-mensaje-titulo" width={384}>
        <div className="p-6 text-center space-y-3">
          <Send size={32} className="text-teal-deep mx-auto" />
          <p id="enviar-mensaje-titulo" className="font-semibold text-navy font-display">Mensaje enviado</p>
          <p className="text-sm text-navy-light/80 font-body">
            Se envió a {memberIds.length} inscrito{memberIds.length !== 1 ? 's' : ''} (correo + notificación).
            Podés ver el estado en Comunicaciones.
          </p>
          <button onClick={onClose} className="rounded-full bg-coral px-4 py-2 text-sm text-white hover:bg-coral-deep transition-colors font-body">Cerrar</button>
        </div>
      </Modal>
    )
  }
  return (
    <Modal onClose={onClose} titleId="enviar-mensaje-titulo" width={384}>
      <div className="p-5 space-y-4">
        <h3 id="enviar-mensaje-titulo" className="font-semibold text-navy font-display">Enviar mensaje a los inscritos</h3>
        <p className="text-sm text-navy-light/80 font-body">
          Va por correo y notificación interna a {memberIds.length} inscrito{memberIds.length !== 1 ? 's' : ''} con miembro asociado.
        </p>
        <input
          aria-label="Asunto"
          className="w-full rounded-xl bg-surface-low px-3 py-2 text-sm text-navy outline-none focus:ring-1 focus:ring-coral/30 font-body"
          value={subject}
          onChange={e => setSubject(e.target.value)}
        />
        <textarea
          aria-label="Mensaje"
          className="w-full rounded-xl bg-surface-low px-3 py-2 text-sm text-navy outline-none focus:ring-1 focus:ring-coral/30 resize-none font-body"
          rows={4}
          placeholder="Escribe el mensaje para los inscritos..."
          value={msg}
          onChange={e => setMsg(e.target.value)}
        />
        {error && <p className="text-sm text-coral font-body" role="alert">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleSend}
            disabled={!msg.trim() || !subject.trim() || memberIds.length === 0 || sending}
            className="flex-1 rounded-full bg-coral px-4 py-2 text-sm text-white hover:bg-coral-deep transition-colors disabled:opacity-40 font-body"
          >
            {sending ? 'Enviando…' : 'Enviar'}
          </button>
          <button onClick={onClose} className="rounded-full border border-[var(--outline-variant)] px-4 py-2 text-sm text-navy-light hover:bg-surface-low transition-colors font-body">Cancelar</button>
        </div>
      </div>
    </Modal>
  )
}

type Tab = EventTab
const TAB_LABELS: Record<Tab, string> = {
  informacion: 'Información',
  inscripciones: 'Inscripciones',
  checkin: 'Check-in',
  servidores: 'Servidores',
  comunicaciones: 'Comunicaciones',
  reportes: 'Reportes',
}

export default function EventoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { event: rawEvent, loading, refetch } = useEvent(id)
  // Si venimos de una ocurrencia recurrente (?date=ISO), mostramos SU fecha, no
  // la del evento padre. Conserva la duración del evento (end - start).
  const occParam = useSearchParams().get('date')
  const event = useMemo(() => {
    if (!rawEvent || !occParam) return rawEvent
    const occStart = new Date(occParam)
    if (isNaN(occStart.getTime())) return rawEvent
    const durMs = Math.max(0, new Date(rawEvent.end_at).getTime() - new Date(rawEvent.start_at).getTime())
    return { ...rawEvent, start_at: occStart.toISOString(), end_at: new Date(occStart.getTime() + durMs).toISOString() }
  }, [rawEvent, occParam])
  const { can } = usePermissions()
  const toast = useToast()
  const { adminCommittees } = useOrg()
  // Gating de tabs: los miembros normales solo ven Información. encargado_eventos
  // (edit/export en eventos) ve check-in y reportes; gestión (inscripciones,
  // servidores, comunicaciones) requiere create → solo dirección/admin.
  const canCheckin = can('eventos', 'edit')
  const canReport  = can('eventos', 'export')
  const canManage  = can('eventos', 'create')
  // El envío usa los endpoints de comunicaciones, que exigen ese rol.
  const canSendMessage = can('comunicaciones', 'create')
  // Regla pura compartida (src/lib/events/detail-access.ts): Información es de
  // cualquier sesión; el resto exige permiso de eventos.
  // FRM-1 B: encargada de ESTE evento — ve y gestiona todo lo suyo aunque no
  // tenga el módulo de eventos.
  const { user } = useAuth()
  const isEventManager = (user?.managed_event_ids ?? []).includes(id)
  const visibleTabs = visibleEventTabs({ canManage, canCheckin, canReport, isManager: isEventManager })
  const seeManagementData = canSeeEventManagementData({ canManage, canCheckin, canReport, isManager: isEventManager })
  const [activeTab, setActiveTab] = useState<Tab>('informacion')

  // Inscripción desde la ficha: misma elegibilidad y mismo modal que la lista
  // de eventos, para no tener dos caminos que se puedan desincronizar.
  const memberId = user?.member_id ?? null
  const [elig, setElig] = useState<EventEligibilityResult | null>(null)
  const [eligRefresh, setEligRefresh] = useState(0)
  useEffect(() => {
    if (!memberId) return
    let alive = true
    fetch(`/api/eventos/elegibilidad?member_id=${memberId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!alive) return
        const list = (d?.eligibility ?? []) as EventEligibilityResult[]
        setElig(list.find(e => e.event_id === id) ?? null)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [memberId, id, eligRefresh])
  const { openRegister, successEvent, clearSuccess, modals: registrationModals } =
    useEventRegistration(memberId, () => setEligRefresh(n => n + 1))
  const cta = event ? registrationCta(
    { requires_registration: event.requires_registration, status: event.status, end_at: event.end_at },
    elig,
    new Date(),
  ) : { kind: 'ninguno' as const }
  const [showMenu, setShowMenu] = useState(false)
  const [duplicando, setDuplicando] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showDeleteScope, setShowDeleteScope] = useState(false) // selector de alcance (recurrentes)
  const [confirmScope, setConfirmScope] = useState<'all' | 'future' | 'single' | null>(null) // pendiente de confirmar con "eliminar"
  const [showActiveWarning, setShowActiveWarning] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()
  const [showMessageModal, setShowMessageModal] = useState(false)
  const [showCalendarPopover, setShowCalendarPopover] = useState(false)
  const [icsWithRRule, setIcsWithRRule] = useState(false)
  const [cancelled, setCancelled] = useState(false)

  // Servidores tab state
  const [localBookings] = useState<VolunteerBooking[]>([])
  const [memberResults, setMemberResults] = useState<Member[]>([])
  const [assigning, setAssigning] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [modalStep, setModalStep] = useState<1 | 2>(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCommittee, setFilterCommittee] = useState(false)
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [assignRole, setAssignRole] = useState('')
  const [customRole, setCustomRole] = useState('')
  const [serverToast, setServerToast] = useState<string | null>(null)
  // undefined = sin cambio local; se muestra el flyer del servidor (que llega async).
  const [flyerOverride, setFlyerOverride] = useState<string | null | undefined>(undefined)
  const flyerPreview = flyerOverride === undefined ? (event?.flyer_url ?? null) : flyerOverride
  const [flyerDragOver, setFlyerDragOver] = useState(false)
  const [flyerError, setFlyerError] = useState<string | null>(null)
  const flyerInputRef = useRef<HTMLInputElement>(null)

  // Servidores derived (hooks deben ir antes de cualquier return condicional)
  const allBookings: VolunteerBooking[] = useMemo(() => [
    ...(event?.volunteer_bookings ?? []).map(vb => ({
      id: vb.member_id,
      member_id: vb.member_id,
      member_name: vb.member_name,
      member_initials: getInitials(vb.member_name),
      role: vb.role,
      status: vb.status as 'confirmed' | 'pending' | 'declined',
      is_recurring: false,
    })),
    ...localBookings,
  ], [event?.volunteer_bookings, localBookings])

  // Búsqueda real de miembros (debounced) mientras el modal está abierto.
  useEffect(() => {
    if (!showAssignModal) return
    const q = searchQuery.trim()
    if (q.length < 2) { setMemberResults([]); return }
    let alive = true
    const t = setTimeout(() => {
      // /lookup: encargado_eventos no tiene el módulo miembros (bug 2026-08-04).
      fetch(`/api/members/lookup?search=${encodeURIComponent(q)}&pageSize=10`)
        .then(r => (r.ok ? r.json() : { members: [] }))
        .then(d => { if (alive) setMemberResults(((d.members ?? []) as Parameters<typeof toDomainMember>[0][]).map(toDomainMember)) })
        .catch(() => { if (alive) setMemberResults([]) })
    }, 300)
    return () => { alive = false; clearTimeout(t) }
  }, [searchQuery, showAssignModal])

  // organizing_committee_ids son ids de área; service_history.committee es el
  // nombre. Se resuelven los ids → nombres para comparar (cualquiera de ellos).
  const committeeNames = (event?.organizing_committee_ids ?? [])
    .map(id => adminCommittees.find(c => c.id === id)?.name)
    .filter((n): n is string => !!n)
  const filteredMembers = useMemo(() => {
    if (!filterCommittee) return memberResults
    return memberResults.filter(m =>
      m.service_history?.some(s => committeeNames.includes(s.committee) && s.status === 'activo'),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberResults, filterCommittee, committeeNames.join(',')])

  if (!event) {
    return (
      <div className="space-y-4">
        <Link href="/eventos" className="flex items-center gap-1 text-sm text-navy-light/80 hover:text-navy">
          <ChevronLeft size={16} /> Eventos
        </Link>
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-navy-light/80">
            <div className="h-8 w-8 rounded-full border-2 border-coral/30 border-t-coral animate-spin" aria-hidden />
            <p className="text-sm font-body">Cargando evento…</p>
          </div>
        ) : (
          <p className="text-navy-light/80 font-body">Evento no encontrado.</p>
        )}
      </div>
    )
  }

  const registrationCount = event.registrations.length
  const checkinCount = event.checkins.length
  const attendanceRate = registrationCount > 0 ? Math.round((checkinCount / registrationCount) * 100) : 0

  const activeTabIndex = Math.max(0, visibleTabs.indexOf(activeTab))
  const tabWidthPct = 100 / visibleTabs.length

  const incomeEstimate = event.requires_payment && event.payment_amount
    ? checkinCount * event.payment_amount
    : 0

  const groupedBookings = allBookings.reduce<Record<string, VolunteerBooking[]>>((acc, b) => {
    if (!acc[b.role]) acc[b.role] = []
    acc[b.role].push(b)
    return acc
  }, {})

  const confirmedCount = allBookings.filter(b => b.status === 'confirmed').length
  const pendingCount   = allBookings.filter(b => b.status === 'pending').length
  const declinedCount  = allBookings.filter(b => b.status === 'declined').length

  const selectedMember = selectedMemberId ? memberResults.find(m => m.id === selectedMemberId) : null

  // Ocurrencia sobre la que se actúa: date (YYYY-MM-DD hora CR) + start ISO.
  function occurrenceRef(): { date: string; start: string } {
    const d = occParam ? new Date(occParam) : new Date(rawEvent!.start_at)
    const pad = (n: number) => String(n).padStart(2, '0')
    return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, start: d.toISOString() }
  }

  // ¿Tiene asistencia ligada? (bloquea borrado destructivo de la serie/puntual).
  const hasAttendance = event.checkins.length > 0 || event.registrations.length > 0

  /**
   * Duplica el evento y lleva DIRECTO a editar la copia.
   *
   * No se queda en la copia recién creada mostrando un toast: quien duplica lo
   * hace para cambiarle la fecha, así que el paso siguiente es siempre el
   * mismo. Y la copia nace INTERNA (is_public en false, ver
   * lib/events/duplicate.ts), así que hasta que se publique no aparece en
   * ningún calendario con la fecha vieja.
   */
  async function duplicar() {
    if (duplicando) return
    setShowMenu(false)
    setDuplicando(true)
    try {
      const res = await fetch(`/api/events/${id}/duplicate`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast(d.error ?? 'No se pudo duplicar el evento.', 'error'); return }
      toast('Copia creada. Revisá la fecha y publicala cuando esté lista.', 'success')
      router.push(`/eventos/${d.id}/editar`)
    } catch {
      toast('No se pudo duplicar el evento.', 'error')
    } finally { setDuplicando(false) }
  }

  // Inicia el flujo de borrado desde el menú.
  function startDelete() {
    setShowMenu(false)
    if (rawEvent?.is_recurring) { setShowDeleteScope(true); return }
    if (hasAttendance) { setShowActiveWarning(true); return }
    setConfirmScope('all') // puntual sin asistencia → confirmar escribiendo "eliminar"
  }

  // El usuario eligió alcance (recurrente).
  function chooseScope(scope: 'all' | 'future' | 'single') {
    setShowDeleteScope(false)
    if (scope === 'all') {
      if (hasAttendance) { setShowActiveWarning(true); return }
      setConfirmScope('all') // destructivo → confirmar con "eliminar"
    } else {
      runDelete(scope) // single/future no destruyen asistencia → directo
    }
  }

  async function runDelete(scope: 'all' | 'future' | 'single') {
    if (deleting) return
    setDeleting(true)
    const occ = occurrenceRef()
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, occurrence_date: occ.date, occurrence_start: occ.start }),
      })
      if (res.status === 422) {
        setConfirmScope(null)
        setShowActiveWarning(true)
        setDeleting(false)
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (scope === 'all' || !rawEvent?.is_recurring) {
        router.push('/eventos')
      } else {
        setConfirmScope(null)
        setDeleting(false)
        refetch()
      }
    } catch (e) {
      console.error('No se pudo eliminar el evento:', e)
      toast('No se pudo eliminar el evento. Intentá de nuevo.', 'error')
      setDeleting(false)
    }
  }

  function resetModal() {
    setModalStep(1)
    setSearchQuery('')
    setFilterCommittee(false)
    setSelectedMemberId(null)
    setAssignRole('')
    setCustomRole('')
    setShowAssignModal(false)
  }

  async function confirmAssignment() {
    if (!selectedMember || assigning) return
    const role = assignRole === 'Otro' ? customRole.trim() || 'Otro' : assignRole
    if (!role) return
    const name = `${selectedMember.first_name} ${selectedMember.last_name}`
    setAssigning(true)
    try {
      const res = await fetch(`/api/events/${id}/volunteers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: selectedMember.id, role, status: 'pending' }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(detail?.error || `HTTP ${res.status}`)
      }
      await refetch()
      setServerToast(`${name} asignado como ${role}`)
      setTimeout(() => setServerToast(null), TOAST_MS)
      resetModal()
    } catch (err) {
      console.error('No se pudo asignar el servidor:', err)
      setServerToast(err instanceof Error ? err.message : 'No se pudo asignar el servidor. Intentá de nuevo.')
      setTimeout(() => setServerToast(null), TOAST_MS)
    } finally {
      setAssigning(false)
    }
  }

  async function removeBooking(memberId: string) {
    try {
      const res = await fetch(`/api/events/${id}/volunteers/${memberId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await refetch()
    } catch (err) {
      console.error('No se pudo quitar el servidor:', err)
    }
  }

  // Persiste el flyer (data URL, igual que el wizard de creación). Optimista
  // con rollback: si el PUT falla, se restaura el anterior y se avisa.
  async function persistFlyer(dataUrl: string | null) {
    const prev = flyerOverride
    setFlyerOverride(dataUrl)
    setFlyerError(null)
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flyer: dataUrl, scope: 'all' }),
      })
      if (!res.ok) throw new Error()
      refetch()
    } catch {
      setFlyerOverride(prev)
      setFlyerError('No se pudo guardar el flyer. Intentá de nuevo.')
    }
  }

  // EVE-2: el flyer se sube a Storage y se persiste la URL pública (antes se
  // guardaba el base64 completo en la BD — este era el último productor).
  async function handleFlyerSelect(file: File) {
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/events/upload-flyer', { method: 'POST', body: fd })
      const d = await res.json().catch(() => null)
      if (!res.ok) throw new Error(d?.error || 'No se pudo subir el flyer.')
      void persistFlyer(d.url as string)
    } catch (e) {
      setFlyerError(e instanceof Error ? e.message : 'No se pudo subir el flyer. Intentá de nuevo.')
    }
  }

  const arcPct = attendanceRate / 100
  // Personas cuya ficha se creó el mismo día del evento: las que vinieron por
  // primera vez y se registraron ahí mismo desde el check-in.
  const nuevos = contarPersonasNuevas(event.checkins, event.start_at)
  const circumference = 2 * Math.PI * 40

  return (
    <div className="space-y-5">
      {showCancelModal && (
        <CancellationModal
          eventName={event.name}
          registrationCount={registrationCount}
          onConfirm={async (reason) => {
            // Lanza si falla: el modal muestra el error y permite reintentar.
            const res = await fetch(`/api/events/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'cancel', reason }),
            })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            setCancelled(true)
            refetch()
          }}
          onClose={() => setShowCancelModal(false)}
        />
      )}
      {showMessageModal && (
        <SendMessageModal
          eventTitle={event.name}
          memberIds={[...new Set(event.registrations.map(r => r.member_id).filter((m): m is string => Boolean(m)))]}
          onClose={() => setShowMessageModal(false)}
        />
      )}
      {showDeleteScope && (
        <DeleteEventModal
          busy={deleting}
          onConfirm={chooseScope}
          onClose={() => { if (!deleting) setShowDeleteScope(false) }}
        />
      )}
      <DeleteConfirmModal
        open={confirmScope !== null}
        title="Eliminar evento"
        description="Esta acción es permanente y no se puede deshacer."
        keyword="eliminar"
        confirmLabel="Eliminar"
        loading={deleting}
        onConfirm={() => confirmScope && runDelete(confirmScope)}
        onCancel={() => setConfirmScope(null)}
      />
      <ActiveWarningModal
        open={showActiveWarning}
        title="No se puede eliminar"
        message="Este evento tiene check-ins o inscripciones registrados. Cancelalo en su lugar para conservar el historial."
        onClose={() => setShowActiveWarning(false)}
      />

      {/* Header */}
      <EventHeader
        event={event}
        id={id}
        cancelled={cancelled}
        registrationCount={registrationCount}
        showMenu={showMenu}
        onMenuToggle={() => setShowMenu(m => !m)}
        onCancelClick={() => { setShowMenu(false); setShowCancelModal(true) }}
        onDeleteClick={startDelete}
        onDuplicateClick={duplicar}
        duplicando={duplicando}
        occParam={occParam}
        showCalendarPopover={showCalendarPopover}
        onCalendarPopoverToggle={() => setShowCalendarPopover(p => !p)}
        onCalendarPopoverClose={() => setShowCalendarPopover(false)}
        canManage={canManage}
        canCheckin={canCheckin}
        icsWithRRule={icsWithRRule}
        onIcsWithRRuleChange={setIcsWithRRule}
      />

      {/* Tabs */}
      <div className="overflow-x-auto border-b border-b-[var(--outline-variant)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="relative min-w-[480px] md:min-w-0">
          <div className="flex">
            {visibleTabs.map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={cn(
                  'flex-1 whitespace-nowrap px-2 py-2.5 text-[13px] transition-colors',
                  activeTab === t ? 'text-coral font-semibold' : 'text-navy-light/80 hover:text-navy',
                  'font-body'
                )}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
          <div
            className="absolute bottom-0 h-0.5 bg-coral transition-transform duration-200 ease-out"
            style={{
              width: `${tabWidthPct}%`,
              transform: `translateX(${activeTabIndex * 100}%)`,
            }}
          />
        </div>
      </div>

      {/* Tab: Información — la parte de la ficha que ve cualquiera. Si el evento
          pide inscripción, acá mismo está el botón (mismo modal que la lista). */}
      {activeTab === 'informacion' && (
        <EventInfoTab
          event={event}
          flyerPreview={flyerPreview}
          flyerDragOver={flyerDragOver}
          flyerInputRef={flyerInputRef}
          onFlyerSelect={handleFlyerSelect}
          onFlyerDragOver={setFlyerDragOver}
          onFlyerClear={() => { void persistFlyer(null) }}
          flyerError={flyerError}
          canEditFlyer={canManage}
          showManagementData={seeManagementData}
          cta={cta}
          onRegister={() => { if (elig) openRegister(elig) }}
        />
      )}

      {/* Tab: Inscripciones */}
      {/* El link público va arriba del tab: es lo que se busca cuando hay que
          comunicar el evento, y solo tiene sentido si el evento pide inscripción.
          Visible para quien gestiona eventos (criterio del 2026-08-26), no solo
          para admin y comunicaciones como el compartir del calendario. */}
      {activeTab === 'inscripciones' && event.requires_registration && (
        <div className="mb-4">
          <CompartirInscripcion eventId={id} registrationFormId={event.registration_form_id} />
        </div>
      )}
      {activeTab === 'inscripciones' && (
        <EventRegistrationsTab
          event={event}
          eventId={id}
          registrationCount={registrationCount}
          circumference={circumference}
          onSendMessage={canSendMessage ? () => setShowMessageModal(true) : undefined}
          onChanged={refetch}
        />
      )}

      {/* Tab: Check-in */}
      {activeTab === 'checkin' && (
        <EventCheckinTab
          event={event}
          eventId={id}
          checkinCount={checkinCount}
          onChanged={refetch}
        />
      )}

      {/* Tab: Servidores */}
      {activeTab === 'servidores' && (
        <EventServersTab
          allBookings={allBookings}
          groupedBookings={groupedBookings}
          confirmedCount={confirmedCount}
          pendingCount={pendingCount}
          declinedCount={declinedCount}
          isRecurring={event.is_recurring}
          onRemoveBooking={removeBooking}
          showAssignModal={showAssignModal}
          onShowAssignModal={() => setShowAssignModal(true)}
          modalStep={modalStep}
          setModalStep={setModalStep}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          filterCommittee={filterCommittee}
          onFilterCommitteeChange={setFilterCommittee}
          filteredMembers={filteredMembers}
          selectedMemberId={selectedMemberId}
          onSelectMemberId={setSelectedMemberId}
          selectedMember={selectedMember}
          assignRole={assignRole}
          onAssignRoleChange={setAssignRole}
          customRole={customRole}
          onCustomRoleChange={setCustomRole}
          onResetModal={resetModal}
          onConfirmAssignment={confirmAssignment}
          serverToast={serverToast}
          noCommittee={event.organizing_committee_ids.length === 0}
        />
      )}

      {/* Tab: Comunicaciones */}
      {activeTab === 'comunicaciones' && (
        <div className="space-y-4">
          {canSendMessage && (
            <div className="flex justify-end">
              <button
                onClick={() => setShowMessageModal(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-coral px-4 py-2 text-sm text-white hover:bg-coral-deep transition-colors font-body"
              >
                <Send size={14} /> Enviar mensaje
              </button>
            </div>
          )}

          <div className="rounded-2xl p-6 bg-surface-card shadow-[var(--shadow-md)] text-center">
            <p className="text-sm text-navy-light/80 font-body">
              {canSendMessage
                ? 'Los mensajes enviados desde acá quedan registrados en el módulo de Comunicaciones.'
                : 'El envío de mensajes requiere el rol de comunicaciones.'}
            </p>
          </div>
        </div>
      )}

      {/* Tab: Reportes */}
      {activeTab === 'reportes' && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Gauge tasa de asistencia */}
            <div className="rounded-2xl p-5 flex flex-col items-center bg-surface-card shadow-[var(--shadow-md)]">
              <p className="text-[11px] tracking-widest uppercase text-navy-light/80 mb-4 self-start font-display">
                Tasa de asistencia
              </p>
              <svg viewBox="0 0 100 60" className="w-40 h-24">
                <path
                  d="M 10 55 A 40 40 0 0 1 90 55"
                  fill="none" stroke="var(--surface-low)" strokeWidth="8" strokeLinecap="round"
                />
                {checkinCount > 0 && (
                  <path
                    d="M 10 55 A 40 40 0 0 1 90 55"
                    fill="none" stroke="#D63E3D" strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={`${arcPct * 125.6} 125.6`}
                  />
                )}
                <text x="50" y="52" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#161440" fontFamily="var(--font-display)">
                  {attendanceRate}%
                </text>
              </svg>
              <p className="text-[13px] text-navy-light/80 mt-2 font-body">
                {checkinCount} de {registrationCount} inscritos asistieron
              </p>
            </div>

            {/* Personas nuevas: ficha creada el mismo día del evento */}
            <div className="rounded-2xl p-5 bg-surface-card shadow-[var(--shadow-md)]">
              <p className="text-[11px] tracking-widest uppercase text-navy-light/80 mb-3 font-display">
                Personas nuevas
              </p>
              <div className="flex items-baseline gap-3">
                <p className="text-4xl font-extrabold text-navy tabular-nums font-display">
                  {nuevos.nuevas}
                </p>
                {nuevos.conFicha > 0 && (
                  <p className="text-lg font-semibold text-teal-deep tabular-nums font-body">
                    {nuevos.porcentaje}%
                  </p>
                )}
              </div>
              <p className="text-[13px] text-navy-light/80 mt-2 font-body">
                {nuevos.conFicha === 0
                  ? 'Todavía no hay asistencia registrada.'
                  : `de ${nuevos.conFicha} asistentes con ficha, se les creó el perfil ese mismo día`}
              </p>
              {nuevos.nuevas > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {event.checkins
                    .filter(c => c.member_created_at &&
                      contarPersonasNuevas([c], event.start_at).nuevas === 1)
                    .map(c => (
                      <span
                        key={c.id}
                        className="rounded-full bg-surface-low px-2.5 py-1 text-[13px] text-navy-light font-body"
                      >
                        {c.member_name}
                      </span>
                    ))}
                </div>
              )}
            </div>

            {/* Ingresos */}
            {event.requires_payment && event.payment_amount && (
              <div className="rounded-2xl p-5 bg-surface-card shadow-[var(--shadow-md)]">
                <p className="text-[11px] tracking-widest uppercase text-navy-light/80 mb-3 font-display">
                  Ingresos estimados
                </p>
                <p className="text-4xl font-extrabold text-navy tabular-nums font-display">
                  {formatMoney(incomeEstimate, event.currency)}
                </p>
                <p className="text-[13px] text-navy-light/80 mt-2 font-body">
                  {checkinCount} asistentes × {formatMoney(event.payment_amount, event.currency)}
                </p>
                {/* Sin costo, "pagados / en revisión / pendientes" no dicen nada. */}
                {!event.requires_payment ? (
                  <p className="mt-4 text-[13px] text-navy-light/80 font-body">
                    Evento sin costo: el pago no aplica.
                  </p>
                ) : (
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[11px] text-navy-light/80 font-display">Pagados</p>
                    <p className="font-semibold text-navy font-body">{event.registrations.filter(r => r.payment_status === 'paid').length}</p>
                  </div>
                  <div>
                    {/* "Pendientes" ya no mete en la misma bolsa a quien no pagó
                        y a quien ya subió el comprobante. */}
                    <p className="text-[11px] text-navy-light/80 font-display">En revisión</p>
                    <p className="font-semibold text-teal-deep font-body">{event.registrations.filter(r => r.payment_status === 'pending' && r.payment_in_review).length}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-navy-light/80 font-display">Pendientes</p>
                    <p className="font-semibold text-amber-600 font-body">{event.registrations.filter(r => r.payment_status === 'pending' && !r.payment_in_review).length}</p>
                  </div>
                </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => generateCSV(
                ['Nombre', 'Tipo de asistencia', 'Fecha de check-in', '¿Primera vez?'],
                event.checkins.map(c => [
                  c.member_name,
                  c.attendance_type === 'server' ? 'Servidor' : 'Participante',
                  c.checked_at ? new Date(c.checked_at).toLocaleString('es-CR') : '',
                  !c.member_created_at ? ''
                    : contarPersonasNuevas([c], event.start_at).nuevas === 1 ? 'Sí' : 'No',
                ]),
                `asistencia-${event.name}`,
              )}
              disabled={event.checkins.length === 0}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--outline-variant)] px-4 py-2 text-sm text-navy-light hover:bg-surface-low transition-colors font-body disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download size={14} /> Exportar asistencia
            </button>
            <button
              onClick={() => generateCSV(
                ['Nombre', 'Estado de pago', 'Fecha de inscripción'],
                event.registrations.map(r => [
                  r.member_name,
                  !event.requires_payment ? 'No aplica'
                    : r.payment_status === 'paid' ? 'Pagado'
                    : r.payment_status === 'pending' ? (r.payment_in_review ? 'En revisión' : 'Pendiente')
                    : (r.payment_status ?? ''),
                  r.registered_at ? new Date(r.registered_at).toLocaleDateString('es-CR') : '',
                ]),
                `inscritos-${event.name}`,
              )}
              disabled={event.registrations.length === 0}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--outline-variant)] px-4 py-2 text-sm text-navy-light hover:bg-surface-low transition-colors font-body disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download size={14} /> Exportar inscritos
            </button>
          </div>
        </div>
      )}
      {/* Inscripción (confirmación, comprobante, beca) y aviso de éxito. */}
      {successEvent && (
        <div className="rounded-2xl bg-teal-soft/20 px-4 py-3 text-sm text-teal-deep font-body flex items-center gap-2">
          <Check size={16} />
          Quedaste inscrito/a en {successEvent}.
          <button onClick={clearSuccess} className="ml-auto text-navy-light/80 hover:text-navy" aria-label="Cerrar aviso">
            <X size={16} />
          </button>
        </div>
      )}
      {registrationModals}
    </div>
  )
}

// ─── Modal: eliminar evento (con alcances si es recurrente) ──────────────────────

// Selector de alcance para eliminar un recurrente. El borrado destructivo de
// "toda la serie" se confirma luego con DeleteConfirmModal (escribir "eliminar").
function DeleteEventModal({ busy, onConfirm, onClose }: {
  busy: boolean
  onConfirm: (scope: 'all' | 'future' | 'single') => void
  onClose: () => void
}) {
  const [scope, setScope] = useState<'all' | 'future' | 'single'>('single')
  const OPTIONS: { key: 'all' | 'future' | 'single'; title: string; desc: string }[] = [
    { key: 'single', title: 'Solo este evento', desc: 'Cancela únicamente esta fecha; el resto de la serie no cambia.' },
    { key: 'future', title: 'Esta y las siguientes', desc: 'Termina la serie justo antes de esta fecha (las anteriores se conservan).' },
    { key: 'all', title: 'Toda la serie', desc: 'Elimina todos los eventos de la serie. No se puede deshacer.' },
  ]

  return (
    <Modal onClose={onClose} titleId="del-evento-title" width={448}>
      <div className="px-5 py-4 border-b border-b-[var(--outline-variant)]">
        <h3 id="del-evento-title" className="text-sm font-semibold text-navy font-display">Eliminar evento</h3>
        <p className="text-[13px] text-navy-light/80 mt-0.5 font-body">
          Este es un evento recurrente. ¿Qué querés eliminar?
        </p>
      </div>
      <div className="p-5 space-y-3">
        {OPTIONS.map(opt => (
          <div
            key={opt.key}
            onClick={() => setScope(opt.key)}
            className={cn('rounded-xl border p-3.5 cursor-pointer transition-all',
              scope === opt.key ? 'border-coral bg-coral/5' : 'hover:bg-surface-low')}
            style={{ borderColor: scope === opt.key ? undefined : 'var(--outline-variant)' }}
          >
            <div className="flex items-start gap-2">
              <div className={cn('mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0',
                scope === opt.key ? 'border-coral' : 'border-navy-light/30')}>
                {scope === opt.key && <div className="h-2 w-2 rounded-full bg-coral" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-navy font-body">{opt.title}</p>
                <p className="text-[13px] text-navy-light/80 mt-0.5 font-body">{opt.desc}</p>
              </div>
            </div>
          </div>
        ))}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onConfirm(scope)}
            disabled={busy}
            className="flex-1 rounded-full bg-coral px-5 py-2.5 text-sm text-white hover:bg-coral-deep transition-colors font-body disabled:opacity-50"
          >
            {busy ? 'Procesando…' : 'Continuar'}
          </button>
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-[var(--outline-variant)] px-5 py-2.5 text-sm text-navy-light hover:bg-surface-low transition-colors font-body disabled:opacity-40"
          >
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  )
}
