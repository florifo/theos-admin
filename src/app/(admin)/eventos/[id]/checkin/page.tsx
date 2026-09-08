'use client'

import { use, useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { type AttendanceType, type EventCheckin } from '@/types/event'
import { useEvent } from '@/hooks/useEvents'
import { usePermissions } from '@/hooks/usePermissions'
import { CheckinCard } from '@/components/events/CheckinCard'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { ChevronLeft, UserPlus, X, Camera, Trash2 } from 'lucide-react'
import { FamilyMemberModal, type FamilyDraft } from '@/components/members/FamilyMemberModal'
import { DocumentCapture } from '@/components/members/DocumentCapture'
import { Modal } from '@/components/shared/Modal'
import { getInitials, toYmdLocal, formatMoney } from '@/lib/format'
import { validarAltaDePersona } from '@/lib/members/alta-persona'
import { normalizeCedula } from '@/lib/cedula'
import { PageContainer } from '@/components/layout/PageContainer'

// El escáner QR (zxing, ~100KB+) se carga solo cuando el usuario abre la cámara:
// no forma parte del bundle inicial de la página.
const QrScanner = dynamic(
  () => import('@/components/events/QrScanner').then(m => m.QrScanner),
  {
    ssr: false,
    loading: () => (
      <div className="w-full aspect-square max-h-[340px] rounded-2xl bg-surface-card flex items-center justify-center shadow-[var(--shadow-sm)]">
        <p className="text-sm text-navy-light/80 font-body">Cargando cámara…</p>
      </div>
    ),
  },
)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Feedback al escanear: beep corto (WebAudio) + vibración.
function scanFeedback(ok: boolean) {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AC()
    const osc = ctx.createOscillator(); const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = ok ? 880 : 300
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18)
    osc.start(); osc.stop(ctx.currentTime + 0.18)
    osc.onended = () => ctx.close()
  } catch { /* sin audio */ }
  try { navigator.vibrate?.(ok ? 80 : [60, 40, 60]) } catch { /* */ }
}

const AVATAR_COLORS: Record<string, string> = {
  A: 'bg-coral', B: 'bg-teal-deep', C: 'bg-navy', D: 'bg-navy-light', E: 'bg-coral-deep',
  F: 'bg-coral', G: 'bg-teal-deep', H: 'bg-navy', I: 'bg-navy-light', J: 'bg-coral-deep',
  K: 'bg-coral', L: 'bg-teal-deep', M: 'bg-navy', N: 'bg-navy-light', O: 'bg-coral-deep',
  P: 'bg-coral', Q: 'bg-teal-deep', R: 'bg-navy', S: 'bg-navy-light', T: 'bg-coral-deep',
  U: 'bg-coral', V: 'bg-teal-deep', W: 'bg-navy', X: 'bg-navy-light', Y: 'bg-coral-deep', Z: 'bg-coral',
}

function avatarColor(name: string) {
  return AVATAR_COLORS[name.charAt(0).toUpperCase()] ?? 'bg-navy'
}
function Clock() {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date().toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }, 1000)
    return () => clearInterval(interval)
  }, [])
  return (
    <span className="tabular-nums text-white/80 text-lg font-mono">
      {time}
    </span>
  )
}

export default function CheckinLivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { can } = usePermissions()
  const canCheckin = can('eventos', 'edit') // encargado_eventos, direccion, admin
  const { event, loading, refetch } = useEvent(id)
  // Fecha de ESTA ocurrencia (si venimos de una recurrente con ?date=), para el header.
  const occParam = useSearchParams().get('date')
  // Subevento destino del check-in (null = evento padre).
  const [targetSub, setTargetSub] = useState<string | null>(null)
  const [scanOn, setScanOn] = useState(false)
  const [scanMsg, setScanMsg] = useState<{ kind: 'ok' | 'dup' | 'error'; text: string } | null>(null)
  const [toDelete, setToDelete] = useState<EventCheckin | null>(null)
  const [deleting, setDeleting] = useState(false)
  const lastScanRef = useRef<{ id: string; t: number } | null>(null)
  const [query, setQuery] = useState('')
  const [selectedMember, setSelectedMember] = useState<{ id: string; name: string } | null>(null)
  const [checkins, setCheckins] = useState<EventCheckin[]>([])
  const [memberResults, setMemberResults] = useState<{ id: string; name: string; has_document?: boolean }[]>([])
  // FIN-2 (3): captura OPCIONAL de documento tras un check-in. Vive fuera del
  // flujo de la fila: se puede ignorar y seguir registrando gente.
  const [docCapture, setDocCapture] = useState<{ id: string; name: string } | null>(null)
  const [searching, setSearching] = useState(false)
  const [showNewPerson, setShowNewPerson] = useState(false)
  const [familyCheckin, setFamilyCheckin] = useState<{ member: { id: string; name: string }; family: { member_id: string; name: string; relation: string }[] } | null>(null)
  const [checkingFamily, setCheckingFamily] = useState(false)
  // Persona NO inscrita en un evento pago (los 3 métodos convergen acá). En
  // Fase 2 abre el modal de cobro en sitio; en Fase 1 avisa de forma consistente.
  const [cobroTarget, setCobroTarget] = useState<{ id: string; name: string; method: 'manual' | 'qr' } | null>(null)
  // Camino en curso del cobro en sitio ('pending' | 'verified'), para el estado del botón.
  const [cobroSubmitting, setCobroSubmitting] = useState<'pending' | 'verified' | null>(null)
  // ¿El miembro seleccionado es servidor de algún comité organizador? (gating de "Servidor")
  const [serverInfo, setServerInfo] = useState<{ hasCommittees: boolean; isServer: boolean } | null>(null)

  // Sin permiso → fuera (el registro lo hace un encargado autenticado).
  useEffect(() => { if (!canCheckin) router.replace('/dashboard') }, [canCheckin, router])

  // Sincroniza los check-ins ya registrados cuando carga el evento.
  useEffect(() => {
    if (event) setCheckins(event.checkins)
  }, [event])

  // Al seleccionar un miembro, consulta si es servidor de los comités organizadores.
  useEffect(() => {
    if (!selectedMember) { setServerInfo(null); return }
    let alive = true
    setServerInfo(null)
    fetch(`/api/events/${id}/server-check?member_id=${selectedMember.id}`)
      .then(r => (r.ok ? r.json() : { hasCommittees: false, isServer: false }))
      .then(d => { if (alive) setServerInfo({ hasCommittees: !!d.hasCommittees, isServer: !!d.isServer }) })
      .catch(() => { if (alive) setServerInfo({ hasCommittees: false, isServer: false }) })
    return () => { alive = false }
  }, [selectedMember, id])

  // Búsqueda real entre TODOS los miembros (debounced). Va por /lookup y no
  // por /api/members: el rol encargado_eventos —el que hace check-in— no tiene
  // el módulo miembros, así que ahí la búsqueda devolvía siempre vacío
  // (bug 2026-08-04).
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setMemberResults([]); return }
    let alive = true
    setSearching(true)
    const t = setTimeout(() => {
      fetch(`/api/members/lookup?search=${encodeURIComponent(q)}&pageSize=8`)
        .then(r => (r.ok ? r.json() : { members: [] }))
        .then(d => {
          if (!alive) return
          const list = (d.members ?? []) as Array<{ id: string; first_name: string; last_name: string; cedula?: string | null }>
          // FIN-2: el lookup ya trae el documento; se conserva para marcar a
          // quién le falta y poder capturarlo al vuelo (nunca frena la fila).
          setMemberResults(list.map(m => ({
            id: m.id,
            name: `${m.first_name} ${m.last_name}`.trim(),
            has_document: !!String(m.cedula ?? '').trim(),
          })))
        })
        .catch(() => { if (alive) setMemberResults([]) })
        .finally(() => { if (alive) setSearching(false) })
    }, 300)
    return () => { alive = false; clearTimeout(t) }
  }, [query])

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-low flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-navy-light/80">
          <div className="h-8 w-8 rounded-full border-2 border-coral/30 border-t-coral animate-spin" aria-hidden />
          <p className="text-sm font-body">Cargando evento…</p>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-surface-low flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-navy-light/80 font-body">Evento no encontrado.</p>
          <Link href="/eventos" className="text-coral hover:text-coral-deep">← Volver</Link>
        </div>
      </div>
    )
  }

  const registeredIds = new Set(event.registrations.map(r => r.member_id))
  const searchResults = memberResults

  // Persiste un check-in (optimista con rollback). CHOKE POINT ÚNICO de los tres
  // métodos (QR, nombre/cédula, familia, persona nueva) — acá vive el gate de
  // "evento pago requiere inscripción" para que TODOS se comporten igual
  // (Fase 1). 'not_registered' = evento pago y la persona no está inscrita.
  async function persistCheckin(m: { id: string; name: string }, type: AttendanceType, method: 'manual' | 'qr' = 'manual', subEvent: string | null = targetSub): Promise<'ok' | 'dup' | 'error' | 'not_registered'> {
    // Gate cliente (feedback inmediato sin round-trip); el server lo re-valida.
    if (event!.requires_payment && !registeredIds.has(m.id)) return 'not_registered'
    const subEventId = subEvent // null = evento padre; o el subevento elegido para esta persona
    const nowIso = new Date().toISOString()       // fecha real del check-in (válida)
    const tempId = `tmp:${nowIso}:${m.id}`        // id temporal para rollback/replace
    const newCheckin: EventCheckin & { _new?: boolean } = {
      id: tempId, // optimista; al refrescar trae el id real de la BD
      member_id: m.id,
      member_name: m.name,
      attendance_type: type,
      sub_event_id: subEventId,
      checked_at: nowIso,
      _new: true,
    }
    setCheckins(prev => [newCheckin, ...prev])
    const rollback = () => {
      setCheckins(prev => prev.filter(c => c.id !== tempId))
    }
    try {
      const res = await fetch(`/api/events/${id}/checkins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: m.id, sub_event_id: subEventId, method }),
      })
      if (res.status === 409) {
        rollback()
        const data = await res.json().catch(() => null) as { code?: string } | null
        return data?.code === 'not_registered' ? 'not_registered' : 'dup'
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // Reemplaza el id optimista por el real (para poder eliminarlo luego).
      const data = await res.json().catch(() => null) as { id?: string } | null
      if (data?.id) {
        setCheckins(prev => prev.map(c => c.id === tempId ? { ...c, id: data.id! } : c))
      }
      return 'ok'
    } catch (err) {
      console.error('No se pudo registrar el check-in:', err)
      rollback()
      return 'error'
    }
  }

  // Lee un QR (member_id) y registra al miembro en este evento. Mantiene la
  // cámara abierta; ignora el mismo código por 3s para no duplicar lecturas.
  async function handleScan(text: string) {
    const memberId = text.trim()
    const now = Date.now()
    if (lastScanRef.current && lastScanRef.current.id === memberId && now - lastScanRef.current.t < 3000) return
    lastScanRef.current = { id: memberId, t: now }
    const flash = (kind: 'ok' | 'dup' | 'error', txt: string) => { setScanMsg({ kind, text: txt }); setTimeout(() => setScanMsg(m => (m?.text === txt ? null : m)), 3000) }

    if (!UUID_RE.test(memberId)) { scanFeedback(false); flash('error', 'QR no válido'); return }
    const already = checkins.find(c => c.member_id === memberId)
    if (already) { scanFeedback(false); flash('dup', `${already.member_name} ya estaba registrado`); return }
    try {
      const res = await fetch(`/api/members/${memberId}`)
      if (!res.ok) { scanFeedback(false); flash('error', 'El QR no corresponde a ningún miembro'); return }
      const mem = await res.json() as { first_name: string; last_name: string }
      const name = `${mem.first_name} ${mem.last_name}`.trim()
      // El gate de "evento pago requiere inscripción" vive en persistCheckin
      // (mismo camino que nombre/cédula). 'not_registered' → cobro en sitio.
      const r = await persistCheckin({ id: memberId, name }, 'participant', 'qr')
      const dest = targetSub ? subName(targetSub) : null
      if (r === 'ok') { scanFeedback(true); flash('ok', `✓ ${name} registrado${dest ? ` → ${dest}` : ''}`) }
      else if (r === 'dup') { scanFeedback(false); flash('dup', `${name} ya estaba registrado`) }
      else if (r === 'not_registered') { scanFeedback(false); requestCobro({ id: memberId, name }, 'qr') }
      else { scanFeedback(false); flash('error', 'No se pudo registrar') }
    } catch { scanFeedback(false); flash('error', 'Error al registrar') }
  }

  // Persona no inscrita en evento pago: punto único al que llegan los 3 métodos.
  // Abre el modal de cobro en sitio (Fase 2, 2 caminos).
  function requestCobro(m: { id: string; name: string }, method: 'manual' | 'qr' = 'manual') {
    setSelectedMember(null)
    setCobroTarget({ ...m, method })
  }

  // Cobro en sitio + check-in de una persona no inscrita (Fase 2).
  //   'pending'  → inscribe con pago pendiente + correo + check-in.
  //   'verified' → inscribe con pago aprobado (comprobante ya visto) + check-in.
  // Tras el éxito refresca el evento (trae inscripción + check-in reales).
  async function submitOnsiteCharge(mode: 'pending' | 'verified') {
    if (!cobroTarget || cobroSubmitting) return
    const target = cobroTarget
    setCobroSubmitting(mode)
    try {
      const res = await fetch(`/api/events/${id}/onsite-charge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: target.id, mode, method: target.method }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null
        setScanMsg({ kind: 'error', text: data?.error ?? 'No se pudo registrar el cobro' })
        return
      }
      setCobroTarget(null)
      setQuery('')
      await refetch()
      const msg = mode === 'verified'
        ? `✓ ${target.name}: pago verificado y check-in`
        : `✓ ${target.name}: cobro enviado y check-in`
      setScanMsg({ kind: 'ok', text: msg })
      setTimeout(() => setScanMsg(m => (m?.text === msg ? null : m)), 3500)
    } catch {
      setScanMsg({ kind: 'error', text: 'Error al registrar el cobro' })
    } finally {
      setCobroSubmitting(null)
    }
  }

  // Al elegir un miembro existente: si tiene familia, ofrecer registrar a todos.
  async function handleSelectMember(member: { id: string; name: string }) {
    try {
      const res = await fetch(`/api/members/${member.id}/family`)
      const family = res.ok ? await res.json() : []
      if (Array.isArray(family) && family.length > 0) {
        setFamilyCheckin({ member, family })
        return
      }
    } catch { /* si falla, seguimos al flujo individual */ }
    setSelectedMember(member)
  }

  async function handleConfirm(type: AttendanceType) {
    if (!selectedMember) return
    const member = selectedMember
    // FIN-2 (3): ¿le faltaba documento? Se resuelve ANTES de limpiar la
    // búsqueda, que es de donde viene el dato.
    const faltaDocumento = memberResults.find(m => m.id === member.id)?.has_document === false
    setSelectedMember(null)
    setQuery('')
    const r = await persistCheckin(member, type)
    if (r === 'not_registered') requestCobro(member)
    // Captura al vuelo, opcional y después del registro: el check-in nunca se
    // bloquea ni se retrasa por esto.
    if (faltaDocumento && r === 'ok') setDocCapture(member)
  }

  // Registra varios miembros (familia) al evento. Cada entrada lleva su subevento.
  // Los no inscritos de un evento pago se reportan (mismo gate que los otros
  // métodos) — el cobro en sitio es por persona, no en lote.
  async function registerFamily(entries: Array<{ id: string; name: string; sub_event_id: string | null }>) {
    if (!familyCheckin) return
    setCheckingFamily(true)
    const notRegistered: string[] = []
    for (const e of entries) {
      const r = await persistCheckin({ id: e.id, name: e.name }, 'participant', 'manual', e.sub_event_id)
      if (r === 'not_registered') notRegistered.push(e.name)
    }
    setCheckingFamily(false)
    setFamilyCheckin(null)
    setQuery('')
    if (notRegistered.length > 0) {
      setScanMsg({ kind: 'error', text: `Sin inscripción en este evento pago: ${notRegistered.join(', ')}. Cobralos por separado.` })
    }
  }

  // Elimina un check-in (basurero). Confirmación corta vía modal.
  async function confirmDelete() {
    if (!toDelete || deleting) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/events/${id}/checkins?checkinId=${encodeURIComponent(toDelete.id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setCheckins(prev => prev.filter(c => c.id !== toDelete.id))
      setToDelete(null)
    } catch (e) {
      console.error('No se pudo eliminar el check-in:', e)
    } finally {
      setDeleting(false)
    }
  }

  // Crea un miembro nuevo (primera visita) y lo deja seleccionado para el check-in.
  async function handlePersonCreated(member: { id: string; name: string }) {
    setShowNewPerson(false)
    setMemberResults([])
    setSelectedMember(member)
    setQuery(member.name)
  }

  const subName = (subId: string | null) => event.sub_events.find(s => s.id === subId)?.name ?? null
  const hasSubs = event.sub_events.length > 0
  // Con subeventos, el contador y la lista reflejan el destino activo (targetSub);
  // sin subeventos, todos los check-ins del evento.
  const visibleCheckins = [...checkins]
    .filter(c => !hasSubs || c.sub_event_id === targetSub)
    .sort((a, b) => (b.checked_at ?? '').localeCompare(a.checked_at ?? ''))
  const targetLabel = targetSub ? (subName(targetSub) ?? event.name) : event.name
  // Check-in de servidor: solo servidores activos de los comités organizadores.
  // Sin comités organizadores → permisivo (históricos). Mientras carga la consulta
  // no se ofrece "Servidor" para no permitirlo de más.
  const serverGate: { allow: boolean; notice: string | null } =
    serverInfo === null
      ? { allow: false, notice: null }
      : !serverInfo.hasCommittees
        ? { allow: true, notice: 'Sin comité organizador asignado.' }
        : serverInfo.isServer
          ? { allow: true, notice: null }
          : { allow: false, notice: 'Solo servidores activos del comité organizador pueden marcarse como servidor.' }

  // Eventos pagos: el gate "solo inscritos" vive en persistCheckin (choke point)
  // y en el server; un no inscrito cae en requestCobro (cobro en sitio, Fase 2).
  // Fecha mostrada: la de la ocurrencia (?date=) si viene, si no la del evento.
  const eventDate = occParam ? new Date(occParam) : new Date(event.start_at)
  const headerDate = isNaN(eventDate.getTime())
    ? ''
    : eventDate.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  // ¿Se está registrando en una fecha distinta a la del evento? (registro tardío)
  const dateMismatch = !isNaN(eventDate.getTime()) && toYmdLocal(eventDate) !== toYmdLocal(new Date())

  return (
    <div className="min-h-screen bg-surface-low flex flex-col font-body">
      {/* Header */}
      <div className="bg-surface-card border-b border-[var(--outline-variant)] px-4 py-3 sm:px-6 sm:py-4 shadow-[var(--shadow-sm)]">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={`/eventos/${id}`}
            className="inline-flex items-center gap-1.5 text-sm text-navy-light/80 hover:text-navy transition-colors"
          >
            <ChevronLeft size={16} /> Volver
          </Link>
          <span className="hidden sm:inline-flex text-navy-light/80"><Clock /></span>
        </div>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-display font-extrabold text-navy tracking-[-0.02em] truncate">
              {event.name}
            </h1>
            <p className="text-sm text-navy-light/80 font-body capitalize">{headerDate}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-4xl sm:text-5xl font-extrabold text-coral tabular-nums font-display leading-none">
              {visibleCheckins.length}
            </p>
            <p className="text-[11px] uppercase tracking-widest text-navy-light/80 font-display mt-1">
              {hasSubs ? 'en este subevento' : 'registrados'}
            </p>
          </div>
        </div>
        {/* Selector de evento/subevento destino del check-in */}
        {event.sub_events.length > 0 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {[{ id: null as string | null, name: 'Evento general' }, ...event.sub_events.map(se => ({ id: se.id as string | null, name: se.name }))].map(opt => (
              <button
                key={opt.id ?? 'parent'}
                onClick={() => setTargetSub(opt.id)}
                className={cn('shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium font-body transition-colors',
                  targetSub === opt.id ? 'bg-coral text-white' : 'bg-surface-low text-navy-light/80 hover:bg-surface-low/70')}
              >
                {opt.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto">
        <PageContainer width="work" className="p-4 sm:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 items-start">
            {/* Columna izquierda: acciones (escanear + buscar) */}
            <div className="space-y-4">
          {/* Aviso: registro en fecha distinta a la del evento */}
          {dateMismatch && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2.5" role="alert">
              <span className="text-amber-600 text-base leading-none mt-0.5">⚠️</span>
              <p className="text-[13px] text-amber-800 font-body">
                Estás registrando asistencia en una fecha distinta a la del evento ({headerDate}). El check-in quedará con la fecha de hoy.
              </p>
            </div>
          )}

          {/* Acción principal: escanear QR */}
          <button
            onClick={() => setScanOn(s => !s)}
            className={cn('w-full inline-flex items-center justify-center gap-2 rounded-2xl py-4 text-base font-semibold font-body transition-colors min-h-[56px] shadow-[var(--shadow-sm)]',
              scanOn ? 'bg-navy text-white hover:bg-navy/90' : 'bg-coral text-white hover:bg-coral-deep')}
          >
            {scanOn ? <X size={18} /> : <Camera size={18} />}
            {scanOn ? 'Cerrar cámara' : 'Escanear QR'}
          </button>

          {scanOn && (
            <div className="space-y-2">
              <QrScanner onResult={handleScan} className="w-full aspect-square max-h-[340px]" />
              {scanMsg && (
                <div className={cn('rounded-xl px-4 py-3 text-sm font-medium font-body text-center',
                  scanMsg.kind === 'ok' ? 'bg-teal-soft/40 text-teal-deep'
                  : scanMsg.kind === 'dup' ? 'bg-amber-50 text-amber-700'
                  : 'bg-coral/10 text-coral')}>
                  {scanMsg.text}
                </div>
              )}
              <p className="text-navy-light/80 text-[13px] text-center font-body">Apuntá al pase digital. La cámara sigue abierta para el siguiente.</p>
            </div>
          )}

          {/* FIN-2 (3): captura opcional de documento, ya registrado el
              check-in. Es un panel al costado de la fila: se puede cerrar y
              seguir registrando gente sin llenarlo. */}
          {docCapture && (
            <div className="rounded-2xl bg-surface-card p-4 shadow-[var(--shadow-sm)]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13px] text-navy-light/80 font-body">
                  <span className="font-medium text-navy">{docCapture.name}</span> no tiene documento
                  registrado. Si lo tenés a mano, podés agregarlo — es opcional.
                </p>
                <button
                  onClick={() => setDocCapture(null)}
                  aria-label="Cerrar captura de documento"
                  className="shrink-0 rounded-lg p-1 text-navy-light/80 transition-colors hover:bg-navy/5 hover:text-navy"
                >
                  <X size={16} aria-hidden />
                </button>
              </div>
              <div className="mt-3">
                <DocumentCapture
                  memberId={docCapture.id}
                  idPrefix="checkin-doc"
                  submitLabel="Guardar documento"
                  onSaved={() => {
                    setMemberResults(prev => prev.map(m => (
                      m.id === docCapture.id ? { ...m, has_document: true } : m
                    )))
                    setDocCapture(null)
                  }}
                />
              </div>
            </div>
          )}

          {/* Búsqueda manual */}
          <input
            className="w-full rounded-2xl bg-surface-card px-5 py-4 text-base text-navy placeholder-navy-light/60 outline-none focus:ring-2 focus:ring-coral/30 shadow-[var(--shadow-sm)] font-body"
            placeholder="Buscar por nombre o cédula…"
            aria-label="Buscar por nombre o cédula"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedMember(null) }}
          />

          {/* Selección de miembro / resultados de búsqueda */}
          {selectedMember ? (
            <div className="flex justify-center">
              <CheckinCard
                member={selectedMember}
                onConfirm={handleConfirm}
                onCancel={() => { setSelectedMember(null); setQuery('') }}
                targetLabel={targetLabel}
                allowServer={serverGate.allow}
                serverNotice={serverGate.notice}
              />
            </div>
          ) : searchResults.length > 0 ? (
            <div className="space-y-2">
              {searchResults.map(r => (
                <button
                  key={r.id}
                  onClick={() => handleSelectMember(r)}
                  className="w-full flex items-center gap-4 rounded-2xl bg-surface-card px-4 py-3 text-left hover:bg-surface-low transition-colors shadow-[var(--shadow-sm)] min-h-[60px]"
                >
                  <div className={cn('h-10 w-10 rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0', avatarColor(r.name))}>
                    {getInitials(r.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-navy font-medium font-body truncate">{r.name}</p>
                    <p className="text-navy-light/80 text-[13px] font-body">
                      {registeredIds.has(r.id) ? 'Inscrito' : 'Miembro'}
                      {r.has_document === false && (
                        <span className="ml-2 rounded-md bg-navy/5 px-1.5 py-0.5 text-[11px] text-navy-light/80">
                          sin documento
                        </span>
                      )}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : query.trim().length >= 2 && searching ? (
            <div className="rounded-2xl bg-surface-card p-6 text-center shadow-[var(--shadow-sm)]">
              <p className="text-navy-light/80 text-sm font-body">Buscando…</p>
            </div>
          ) : query.trim().length >= 2 ? (
            <div className="rounded-2xl bg-surface-card p-6 text-center shadow-[var(--shadow-sm)]">
              <p className="text-navy-light/80 text-sm font-body">No se encontró nadie con ese nombre.</p>
            </div>
          ) : null}

          {/* Persona nueva: botón FIJO. Antes solo aparecía después de escribir
              un nombre y esperar a que la búsqueda no encontrara nada — tres
              pasos para lo que en la fila es lo primero que se sabe: que la
              persona no está. Cuando ya hay algo escrito, arrastra el nombre al
              formulario para no volver a teclearlo. */}
          <button
            onClick={() => setShowNewPerson(true)}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-coral px-4 py-3 text-sm font-semibold text-white hover:bg-coral-deep transition-colors font-body min-h-[52px]"
          >
            <UserPlus size={17} />
            {query.trim().length >= 2
              ? `Agregar a «${query.trim()}» como persona nueva`
              : 'Agregar persona nueva'}
          </button>
            </div>

            {/* Columna derecha: registrados */}
            <div className="space-y-4">
          {/* Lista de registrados */}
          <div className="rounded-2xl bg-surface-card shadow-[var(--shadow-md)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--outline-variant)] flex items-center justify-between gap-3">
              <p className="text-[11px] tracking-widest uppercase text-navy-light/80 font-display truncate">
                Registrados{hasSubs ? ` · ${targetLabel}` : ''}
              </p>
              <span className="text-[13px] text-navy-light/80 font-body tabular-nums shrink-0">{visibleCheckins.length}</span>
            </div>
            {visibleCheckins.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-navy-light/80 font-body">Aún nadie registrado. Escaneá un QR o buscá por nombre.</p>
            ) : visibleCheckins.map(ci => (
              <div key={ci.id} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--outline-variant)] last:border-0">
                <div className={cn('h-9 w-9 rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0', avatarColor(ci.member_name))}>
                  {getInitials(ci.member_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-navy text-sm truncate font-body">{ci.member_name}</p>
                  <p className="text-navy-light/80 text-[13px] font-body">
                    {(() => { const d = new Date(ci.checked_at); return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }) })()}
                    {subName(ci.sub_event_id) ? ` · ${subName(ci.sub_event_id)}` : ''}
                  </p>
                </div>
                <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-medium shrink-0',
                  ci.attendance_type === 'server' ? 'bg-coral/10 text-coral' : 'bg-teal-soft/30 text-teal-deep')}>
                  {ci.attendance_type === 'server' ? 'Servidor' : 'Participante'}
                </span>
                {canCheckin && (
                  <button
                    onClick={() => setToDelete(ci)}
                    aria-label={`Eliminar check-in de ${ci.member_name}`}
                    title="Eliminar check-in"
                    className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg text-navy-light/80 hover:text-coral hover:bg-coral/5 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
            </div>
          </div>
        </PageContainer>
      </div>

      {showNewPerson && (
        <NewPersonModal
          initialName={query.trim()}
          onClose={() => setShowNewPerson(false)}
          onCreated={handlePersonCreated}
          onCheckedIn={() => { setShowNewPerson(false); setQuery('') }}
          persistCheckin={persistCheckin}
        />
      )}

      {familyCheckin && (
        <FamilyCheckinModal
          member={familyCheckin.member}
          family={familyCheckin.family}
          subEvents={event.sub_events}
          defaultSub={targetSub}
          busy={checkingFamily}
          onRegister={registerFamily}
          onClose={() => setFamilyCheckin(null)}
        />
      )}

      {/* Cobro en sitio de un no inscrito en evento pago (Fase 2, 2 caminos). */}
      {cobroTarget && (
        <Modal onClose={() => !cobroSubmitting && setCobroTarget(null)} titleId="cobro-title" width={460}>
          <div className="p-6 space-y-5">
            <div className="space-y-1.5">
              <h3 id="cobro-title" className="text-base font-bold text-navy font-display">
                Cobro en sitio — {cobroTarget.name}
              </h3>
              <p className="text-sm text-navy-light/80 font-body">
                No tiene inscripción en este evento pago. Registrá el cobro y le hacés
                check-in de una vez.
                {event.payment_amount != null && event.payment_amount > 0 && (
                  <> Monto del evento: <strong className="text-navy">{formatMoney(event.payment_amount, event.currency)}</strong>.</>
                )}
              </p>
            </div>

            <div className="space-y-3">
              {/* Camino 1 — enviar cobro a la persona */}
              <button
                onClick={() => submitOnsiteCharge('pending')}
                disabled={!!cobroSubmitting}
                className="w-full text-left rounded-xl border border-[var(--outline-variant)] p-4 hover:border-coral/60 hover:bg-surface-low transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <p className="text-sm font-semibold text-navy font-body">
                  {cobroSubmitting === 'pending' ? 'Registrando…' : 'Enviar cobro a la persona'}
                </p>
                <p className="text-[13px] text-navy-light/80 font-body mt-1">
                  Inscribe con pago pendiente, le llega un correo para subir el comprobante
                  y hace check-in ya. Queda en la cola de finanzas.
                </p>
              </button>

              {/* Camino 2 — pago verificado en sitio */}
              <button
                onClick={() => submitOnsiteCharge('verified')}
                disabled={!!cobroSubmitting}
                className="w-full text-left rounded-xl border border-coral bg-coral/5 p-4 hover:bg-coral/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <p className="text-sm font-semibold text-coral-deep font-body">
                  {cobroSubmitting === 'verified' ? 'Registrando…' : 'Marcar pago verificado en sitio'}
                </p>
                <p className="text-[13px] text-navy-light/80 font-body mt-1">
                  Ya viste el comprobante en su teléfono. Registra el pago como aprobado
                  (con tu nombre y la hora) y hace check-in.
                </p>
              </button>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => { setCobroTarget(null); setQuery('') }}
                disabled={!!cobroSubmitting}
                className="rounded-full border border-[var(--outline-variant)] px-4 py-2 text-sm text-navy-light hover:bg-surface-low transition-colors font-body disabled:opacity-40"
              >
                Cancelar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmar eliminación de check-in */}
      {toDelete && (
        <Modal onClose={() => !deleting && setToDelete(null)} titleId="del-checkin-title" width={380}>
          <div className="p-5 space-y-4">
            <h2 id="del-checkin-title" className="text-base font-display font-extrabold text-navy">
              ¿Eliminar el check-in de {toDelete.member_name}?
            </h2>
            <p className="text-sm text-navy-light/80 font-body">
              Quita su registro de asistencia a este evento. Se puede volver a registrar.
            </p>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setToDelete(null)} disabled={deleting} className="flex-1 rounded-full border border-[var(--outline-variant)] py-2.5 text-sm text-navy-light hover:bg-surface-low transition-colors font-body disabled:opacity-40">Cancelar</button>
              <button onClick={confirmDelete} disabled={deleting} className="flex-1 rounded-full bg-coral py-2.5 text-sm text-white hover:bg-coral-deep transition-colors font-body disabled:opacity-50">{deleting ? 'Eliminando…' : 'Eliminar'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Modal: check-in en familia (miembro existente con familia) ──────────────────

function FamilyCheckinModal({ member, family, subEvents, defaultSub, busy, onRegister, onClose }: {
  member: { id: string; name: string }
  family: { member_id: string; name: string; relation: string }[]
  subEvents: { id: string; name: string }[]
  defaultSub: string | null
  busy: boolean
  onRegister: (entries: Array<{ id: string; name: string; sub_event_id: string | null }>) => void
  onClose: () => void
}) {
  const hasSubs = subEvents.length > 0
  const everyone = [
    { member_id: member.id, name: member.name, relation: 'Titular' as const },
    ...family,
  ]
  // El titular arranca seleccionado; los familiares deseleccionados (solo se
  // registra a quien se marque). Cada quien con el subevento por defecto.
  const [selected, setSelected] = useState<Set<string>>(new Set([member.id]))
  const [subById, setSubById] = useState<Record<string, string | null>>(
    () => Object.fromEntries(everyone.map(p => [p.member_id, defaultSub])),
  )

  function toggle(id: string) {
    if (id === member.id) return // el titular siempre va
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function setSub(id: string, sub: string | null) {
    setSubById(prev => ({ ...prev, [id]: sub }))
  }

  function buildEntries(ids: string[]): Array<{ id: string; name: string; sub_event_id: string | null }> {
    return ids.map(id => {
      const p = everyone.find(x => x.member_id === id)!
      return { id, name: p.name, sub_event_id: hasSubs ? (subById[id] ?? null) : defaultSub }
    })
  }

  const subLabel = (id: string | null) => id === null ? 'Evento general' : (subEvents.find(s => s.id === id)?.name ?? 'Evento general')

  return (
    <Modal onClose={onClose} titleId="family-checkin-title" width={480} tone="dark">
      <div className="p-6 space-y-4">
        <h3 id="family-checkin-title" className="text-lg font-extrabold text-white font-display">
          {member.name} viene con familia
        </h3>
        <p className="text-sm text-white/80 font-body">
          {hasSubs ? '¿Quién llegó y a qué subevento va cada uno?' : '¿Quién más llegó?'}
        </p>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {everyone.map(p => {
            const isTitular = p.member_id === member.id
            const on = selected.has(p.member_id)
            return (
              <div key={p.member_id} className={cn('rounded-xl px-3 py-2.5', isTitular ? 'bg-white/10' : 'bg-white/5')}>
                <div className="flex items-center gap-3">
                  {isTitular ? (
                    <span className="h-4 w-4 shrink-0" aria-hidden />
                  ) : (
                    <input type="checkbox" checked={on} onChange={() => toggle(p.member_id)} className="accent-coral h-4 w-4 shrink-0" aria-label={`Incluir a ${p.name}`} />
                  )}
                  <div className={cn('h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0', isTitular ? 'bg-coral' : 'bg-navy-light')}>{getInitials(p.name)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate font-body">{p.name}</p>
                    <p className="text-[13px] text-white/80">{p.relation}</p>
                  </div>
                </div>
                {hasSubs && on && (
                  <div className="mt-2 pl-7 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Subevento de ${p.name}`}>
                    {[{ id: null as string | null, name: 'Evento general' }, ...subEvents.map(se => ({ id: se.id as string | null, name: se.name }))].map(opt => {
                      const checked = (subById[p.member_id] ?? null) === opt.id
                      return (
                        <button
                          key={opt.id ?? 'general'}
                          type="button"
                          role="radio"
                          aria-checked={checked}
                          onClick={() => setSub(p.member_id, opt.id)}
                          className={cn('rounded-full px-3 py-1 text-[13px] font-body transition-colors',
                            checked ? 'bg-coral text-white' : 'bg-white/10 text-white/80 hover:bg-white/15')}
                        >
                          {opt.name}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onRegister(buildEntries([member.id]))}
            disabled={busy}
            className="flex-1 rounded-2xl border border-white/15 py-3 text-sm font-medium text-white/80 hover:bg-white/10 transition-colors disabled:opacity-50 font-body"
          >
            Solo {member.name.split(' ')[0]}{hasSubs ? ` (${subLabel(subById[member.id] ?? null)})` : ''}
          </button>
          <button
            onClick={() => onRegister(buildEntries(Array.from(selected)))}
            disabled={busy}
            className="flex-1 rounded-2xl bg-coral py-3 text-sm font-semibold text-white hover:bg-coral-deep transition-colors disabled:opacity-50 font-body"
          >
            {busy ? 'Registrando…' : `Registrar ${selected.size}`}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Modal: agregar persona nueva (primera visita) ──────────────────────────────

function NewPersonModal({ initialName, onClose, onCreated, onCheckedIn, persistCheckin }: {
  initialName: string
  onClose: () => void
  onCreated: (member: { id: string; name: string }) => void
  onCheckedIn: () => void
  persistCheckin: (m: { id: string; name: string }, type: AttendanceType) => Promise<'ok' | 'dup' | 'error' | 'not_registered'>
}) {
  const parts = initialName.split(' ')
  const [firstName, setFirstName] = useState(parts[0] ?? '')
  const [lastName, setLastName] = useState(parts.slice(1).join(' '))
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [cedula, setCedula] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [familyDrafts, setFamilyDrafts] = useState<FamilyDraft[]>([])
  const [showFamily, setShowFamily] = useState(false)
  const [tocado, setTocado] = useState(false)
  // Persona que YA tiene esa cédula. En vez de solo bloquear, se ofrece hacerle
  // el check-in a ella: es lo que resuelve la fila y lo que evita el duplicado.
  const [yaExiste, setYaExiste] = useState<{ id: string; name: string } | null>(null)

  const chequeo = validarAltaDePersona({
    first_name: firstName, last_name: lastName, cedula, birth_date: birthDate,
  })
  const valid = chequeo.ok

  /** Al salir del campo: ¿esta cédula ya es de alguien? El lookup busca por
   *  cédula además de por nombre, así que sirve tal cual. */
  async function buscarDuplicado() {
    const n = normalizeCedula(cedula)
    if (!n) { setYaExiste(null); return }
    try {
      const res = await fetch(`/api/members/lookup?search=${encodeURIComponent(n)}&pageSize=5`)
      if (!res.ok) return
      const d = await res.json() as { members?: Array<{ id: string; first_name: string; last_name: string; cedula?: string | null }> }
      const hit = (d.members ?? []).find(m => normalizeCedula(String(m.cedula ?? '')) === n)
      setYaExiste(hit ? { id: hit.id, name: `${hit.first_name} ${hit.last_name}`.trim() } : null)
    } catch {
      // Si la consulta falla no se frena el alta: el POST /api/members igual
      // devuelve 409 por duplicado y ahí se avisa.
    }
  }

  async function createMember(payload: Record<string, unknown>): Promise<{ id: string; name: string }> {
    const res = await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      throw new Error(data?.code === 'duplicate'
        ? `Ya existe un miembro con la cédula o correo de ${payload.first_name}.`
        : `No se pudo crear a ${payload.first_name}.`)
    }
    return { id: data.id as string, name: `${payload.first_name} ${payload.last_name}` }
  }

  async function submit() {
    if (saving) return
    if (!valid) { setTocado(true); return }
    setSaving(true)
    setError(null)
    try {
      const principal = await createMember({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        cedula: cedula.trim() || null,
        birth_date: birthDate || null,
        send_invite: !!email.trim(),
      })

      // Sin familia → flujo de una persona (el operador elige participante/servidor).
      if (familyDrafts.length === 0) {
        onCreated(principal)
        return
      }

      // Con familia → crear integrantes, armar familia y check-in de todos.
      const entries: Array<{ member_id: string; relation: string }> = [{ member_id: principal.id, relation: 'Titular' }]
      const toCheckin: Array<{ id: string; name: string }> = [principal]
      for (const d of familyDrafts) {
        if (d.kind === 'linked') {
          entries.push({ member_id: d.member_id, relation: d.relation })
          toCheckin.push({ id: d.member_id, name: `${d.first_name} ${d.last_name}` })
        } else {
          const created = await createMember({
            first_name: d.first_name,
            last_name: d.last_name || lastName.trim(),
            cedula: d.cedula,
            birth_date: d.birth_date,
            phone: d.phone,
            email: d.email,
            send_invite: !!d.email,
          })
          entries.push({ member_id: created.id, relation: d.relation })
          toCheckin.push(created)
        }
      }
      const famRes = await fetch('/api/families', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Familia ${lastName.trim()}`, members: entries }),
      })
      if (!famRes.ok) throw new Error('Se crearon los miembros pero falló la creación de la familia.')

      // Evento pago: los recién creados no están inscritos → el gate los frena.
      // Se reporta (el cobro en sitio es individual, no en este alta en lote).
      const notReg: string[] = []
      for (const m of toCheckin) {
        const r = await persistCheckin(m, 'participant')
        if (r === 'not_registered') notReg.push(m.name)
      }
      if (notReg.length > 0) {
        setError(`Evento pago: falta inscribir/cobrar a ${notReg.join(', ')} desde el check-in individual.`)
        return
      }
      onCheckedIn()
    } catch (err) {
      console.error('Error creando persona/familia:', err)
      setError(err instanceof Error ? err.message : 'No se pudo crear. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const fieldCls = 'w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/50 outline-none focus:ring-2 focus:ring-coral/40'
  const fieldStyle = { background: 'rgba(255,255,255,0.08)', fontFamily: 'var(--font-body)' } as const
  const labelStyle = { fontFamily: 'var(--font-body)' } as const
  const labelCls = 'text-[13px] text-white/80 block'

  return (
    <Modal onClose={onClose} titleId="new-person-title" width={448} tone="dark">
      <div className="p-6 space-y-4">
        <h3 id="new-person-title" className="text-lg font-extrabold text-white font-display">Persona nueva</h3>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="np-first" className={labelCls} style={labelStyle}>Nombre *</label>
            <input id="np-first" className={fieldCls} style={fieldStyle} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Nombre" />
          </div>
          <div className="space-y-1">
            <label htmlFor="np-last" className={labelCls} style={labelStyle}>Apellidos *</label>
            <input id="np-last" className={fieldCls} style={fieldStyle} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Apellidos" />
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="np-phone" className={labelCls} style={labelStyle}>Teléfono</label>
          <input id="np-phone" className={fieldCls} style={fieldStyle} value={phone} onChange={e => setPhone(e.target.value)} placeholder="8888-8888" />
        </div>
        <div className="space-y-1">
          <label htmlFor="np-email" className={labelCls} style={labelStyle}>Correo</label>
          <input id="np-email" type="email" className={fieldCls} style={fieldStyle} value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@ejemplo.com" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="np-cedula" className={labelCls} style={labelStyle}>
              Cédula {chequeo.exigeCedula ? '*' : '(opcional para menores)'}
            </label>
            <input
              id="np-cedula" className={fieldCls} style={fieldStyle}
              value={cedula}
              onChange={e => { setCedula(e.target.value); setYaExiste(null) }}
              onBlur={buscarDuplicado}
              placeholder="1-2345-6789"
              aria-invalid={tocado && !!chequeo.errores.cedula}
              aria-describedby={chequeo.errores.cedula ? 'np-cedula-err' : undefined}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="np-birth" className={labelCls} style={labelStyle}>Fecha de nacimiento</label>
            <input id="np-birth" type="date" className={fieldCls} style={fieldStyle} value={birthDate} onChange={e => setBirthDate(e.target.value)} />
          </div>
        </div>

        {tocado && chequeo.errores.cedula && (
          <p id="np-cedula-err" className="text-[13px] text-coral-soft font-body" role="alert">
            {chequeo.errores.cedula}
          </p>
        )}

        {/* La cédula ya es de alguien: se ofrece registrar a esa persona en vez
            de crear un duplicado. */}
        {yaExiste && (
          <div className="rounded-xl bg-white/10 px-3 py-3 space-y-2" role="alert">
            <p className="text-[13px] text-white font-body">
              Esa cédula ya es de <span className="font-semibold">{yaExiste.name}</span>. No hay que
              crearle otra ficha.
            </p>
            <button
              type="button"
              onClick={() => { onCreated(yaExiste); }}
              className="w-full rounded-xl bg-white/15 py-2 text-[13px] font-medium text-white hover:bg-white/25 transition-colors font-body"
            >
              Hacerle el check-in a {yaExiste.name.split(' ')[0]}
            </button>
          </div>
        )}

        {/* Familia */}
        <div className="space-y-2">
          {familyDrafts.map((d, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
              <div className="h-7 w-7 rounded-full bg-navy-light flex items-center justify-center text-[11px] font-bold text-white">{getInitials(`${d.first_name} ${d.last_name}`)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate font-body">{d.first_name} {d.last_name}</p>
                <p className="text-[13px] text-white/80">{d.relation} · {d.kind === 'linked' ? 'existente' : 'nuevo'}</p>
              </div>
              <button onClick={() => setFamilyDrafts(prev => prev.filter((_, j) => j !== i))} className="text-white/80 hover:text-coral"><X size={14} /></button>
            </div>
          ))}
          <button
            onClick={() => setShowFamily(true)}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 py-2.5 text-[13px] text-white/80 hover:text-white hover:border-white/30 transition-colors font-body"
          >
            <UserPlus size={14} /> Agregar familia
          </button>
        </div>

        {error && <p className="text-[13px] text-coral-soft font-body" role="alert">{error}</p>}

        {tocado && (chequeo.errores.first_name || chequeo.errores.last_name) && (
          <p className="text-[13px] text-coral-soft font-body" role="alert">
            {chequeo.errores.first_name ?? chequeo.errores.last_name}
          </p>
        )}

        <p className="text-[13px] text-white/80 font-body">
          Si tiene correo, se le enviará una invitación para completar su perfil y crear su contraseña.
        </p>

        <button
          onClick={submit}
          disabled={saving || !!yaExiste}
          className="w-full rounded-2xl bg-coral py-3 text-sm font-semibold text-white hover:bg-coral-deep transition-colors disabled:opacity-40 font-body"
        >
          {saving ? 'Creando…' : familyDrafts.length > 0 ? `Crear familia y check-in (${familyDrafts.length + 1})` : 'Crear y hacer check-in'}
        </button>
      </div>

      {showFamily && (
        <FamilyMemberModal
          defaultLastName={lastName.trim()}
          existingIds={familyDrafts.filter((f): f is Extract<FamilyDraft, { kind: 'linked' }> => f.kind === 'linked').map(f => f.member_id)}
          onAdd={d => { setFamilyDrafts(prev => [...prev, d]); setShowFamily(false) }}
          onClose={() => setShowFamily(false)}
        />
      )}
    </Modal>
  )
}
