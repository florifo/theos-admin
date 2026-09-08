'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Lock, Loader2, ArrowRight, MapPin, Clock, BookOpen, Plus, X, Calendar, CheckCircle2, AlertCircle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/shared/Toast'
import { canAssignRequests } from '@/lib/studies/request-assignment'
import { ESTADOS_MOVIBLES, estadosDestino } from '@/lib/studies/request-status-change'
import { REQUEST_STATUS_BADGE } from '@/components/shared/RequestBoard'

/** Etiqueta de cada estado — la misma del badge, para que el selector y la
 *  insignia no digan cosas distintas. */
const ESTADO_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(REQUEST_STATUS_BADGE).map(([k, v]) => [k, v.label]),
)
import { Modal } from '@/components/shared/Modal'
import { MemberCombobox, type MemberHit } from '@/components/shared/MemberCombobox'
import { RequestBoard } from '@/components/shared/RequestBoard'
import { RequestTabs } from '@/components/shared/RequestTabs'
import { PrematrimonialQueue } from '@/components/studies/PrematrimonialQueue'
import { StudyRequestActions } from '@/components/studies/StudyRequestActions'
import { RelocationResolveGroupPicker } from '@/components/studies/RelocationResolveGroupPicker'
import type { StudyRequest } from '@/types/study'
import { getInitials } from '@/lib/format'
import { requestQueueScope } from '@/lib/studies/request-assignment'
import { resolveRequestSection, type RequestSection } from '@/lib/studies/request-deeplink'

const TABS = [
  { key: 'relocation', label: 'Reubicaciones' },
  { key: 'study_interest', label: 'Intereses de estudio' },
]

const TYPE_LABEL: Record<string, string> = {
  relocation: 'Reubicación',
  study_interest: 'Interés en estudio',
}

function initials(name: string) {
  return getInitials(name) || '—'
}

function classLabel(v: string | null): string {
  if (!v) return ''
  return v === 'no_recuerda' ? 'No recuerda la clase' : `Quedó en la clase ${v}`
}

export default function SolicitudesPage() {
  const { user, loaded } = useAuth()
  const toast = useToast()
  const [requests, setRequests] = useState<StudyRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [createFor, setCreateFor] = useState<MemberHit | null>(null)
  // Tab inicial: lo resuelve resolveRequestSection (regla pura y testeada). Las
  // notificaciones viejas traen solo ?request=<id> y las nuevas ?tab=&request=;
  // en ambos casos, cuando la lista carga manda el TIPO real de la solicitud.
  const searchParams = useSearchParams()
  const [sectionState, setSection] = useState<RequestSection>(() => resolveRequestSection({
    tabParam: searchParams.get('tab'),
    requestId: searchParams.get('request'),
    fullQueue: true, // se corrige abajo si la persona solo ve reubicaciones
  }))

  // EST-7: 'direccion' puede ejecutar el PATCH de gestión — también debe ver la
  // página. 2026-07-31: el comité de estudios bíblicos entra con alcance
  // 'assigned' (solo lo que le asignaron) aunque no tenga rol. Espejo de
  // requestQueueScope en la API.
  const scope = requestQueueScope({
    roles: user?.roles,
    inStudyCommittee: !!user?.in_study_committee,
  })
  const allowed = scope !== 'none'
  const fullQueue = scope === 'all'
  // El comité solo tiene el tab de reubicaciones: sin esto, el default
  // ('prematrimonial') le abriría una cola que no le corresponde.
  const section = fullQueue ? sectionState : 'relocation'

  useEffect(() => {
    if (!allowed) return
    let alive = true
    fetch('/api/studies/requests')
      .then(r => (r.ok ? r.json() : []))
      .then(d => {
        if (!alive) return
        const list: StudyRequest[] = Array.isArray(d) ? d : []
        setRequests(list)
        setLoading(false)
        // Deep-link de una notificación: el tab sale del TIPO real de la
        // solicitud enlazada — manda sobre el ?tab= (que puede faltar en las
        // notificaciones viejas o no coincidir). RequestBoard después expande
        // la fila y hace scroll.
        const id = searchParams.get('request')
        const target = id ? list.find(r => r.id === id) : undefined
        if (target) {
          setSection(resolveRequestSection({
            tabParam: searchParams.get('tab'),
            requestId: id,
            requestType: target.request_type,
            fullQueue: true,
          }))
        }
      })
      .catch(() => { if (alive) { setRequests([]); setLoading(false) } })
    return () => { alive = false }
  }, [allowed, reloadKey, searchParams])

  if (!loaded) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={20} className="animate-spin text-navy-light/80" />
      </div>
    )
  }

  if (user && !allowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy/6 mb-4">
          <Lock size={22} className="text-navy-light/80" />
        </div>
        <p className="text-base font-semibold text-navy font-display mb-1">Acceso restringido</p>
        <p className="text-sm text-navy-light/80 font-body max-w-sm">
          Esta sección es para coordinadores de estudios y de dirigentes, y para el comité de
          estudios bíblicos (que ve las solicitudes que le asignaron).
        </p>
      </div>
    )
  }

  // Quién puede mover estados a mano: la misma lista que puede asignar.
  const puedeCambiarEstados = canAssignRequests(user?.roles ?? [])

  async function cambiarEstadoDeSolicitud(id: string, status: string) {
    try {
      const res = await fetch(`/api/studies/requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_status', status }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'No se pudo cambiar el estado.')
      setRequests(prev => prev.map(r => (r.id === data.id ? data : r)))
      toast(`Estado cambiado a «${ESTADO_LABEL[status] ?? status}».`, 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo cambiar el estado.', 'error')
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl bg-navy px-6 py-5 shadow-card flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl text-white font-display font-extrabold tracking-[-0.02em]">
            Solicitudes de estudios
          </h1>
          <p className="mt-1 text-sm text-white/80 font-body">
            {fullQueue
              ? 'Reubicaciones e intereses de estudio de los miembros'
              : 'Las solicitudes que te asignaron'}
          </p>
        </div>
        {section !== 'prematrimonial' && fullQueue && (
          <button
            onClick={() => { setCreateFor(null); setCreateOpen(true) }}
            className="inline-flex items-center gap-1.5 rounded-full bg-coral px-4 py-2 text-sm text-white font-body hover:bg-coral-deep transition-colors shrink-0"
          >
            <Plus size={14} />
            Crear solicitud
          </button>
        )}
      </div>

      {/* Tres tabs planos: prematrimonial (flujo propio), reubicaciones e
          intereses de estudio (RequestBoard, un tipo por tab). */}
      <RequestTabs
        tabs={fullQueue ? [
          { key: 'prematrimonial', label: 'Prematrimonial' },
          { key: 'relocation', label: 'Reubicaciones' },
          { key: 'study_interest', label: 'Intereses de estudio' },
        ] : [
          // El comité solo trabaja reubicaciones asignadas: prematrimonial es
          // otro flujo y los intereses son datos de demanda.
          { key: 'relocation', label: 'Reubicaciones' },
        ]}
        active={section}
        onChange={k => setSection(k as RequestSection)}
      />

      {section === 'prematrimonial' ? <PrematrimonialQueue /> : (
      <RequestBoard
        key={section}
        requests={requests}
        loading={loading}
        tabs={TABS.filter(t => t.key === section)}
        typeLabel={TYPE_LABEL}
        endpointBase="/api/studies/requests"
        // EST-6: los intereses son datos de demanda de SOLO LECTURA (el API
        // también rechaza acciones); las reubicaciones mantienen su flujo.
        readOnly={section === 'study_interest'}
        assigneesUrl={section === 'study_interest' || !fullQueue ? undefined : '/api/studies/requests/assignees'}
        onUpdated={updated => setRequests(prev => prev.map(r => (r.id === updated.id ? updated : r)))}
        // Cambio de estado a mano: SOLO coordinación (decisión 2026-09-08). El
        // comité trabaja lo asignado con las acciones de siempre. Se ofrece
        // también en el tablero de intereses, que es de solo lectura y era
        // justo donde las solicitudes se quedaban 'Abierta' para siempre.
        cambiarEstado={puedeCambiarEstados ? {
          opciones: r => (ESTADOS_MOVIBLES as readonly string[]).includes(r.status)
            ? estadosDestino(r.request_type)
                .filter(e => e !== r.status)
                .map(e => ({ value: e, label: ESTADO_LABEL[e] }))
            : [],
          onChange: (r, status) => { void cambiarEstadoDeSolicitud(r.id, status) },
        } : undefined}
        renderDetails={r => (
          <>
            {r.request_type === 'relocation' && (
              <span className="inline-flex items-center gap-1.5">
                <span className="font-medium text-navy">{r.current_group_name ?? 'Sin grupo actual'}</span>
                <ArrowRight size={13} className="text-navy-light/80" />
                <span className="font-medium text-navy">
                  {r.status === 'resolved' ? (r.resolved_group_name ?? '—') : (r.needed_study_code ?? r.existing_group_name ?? 'Grupo por definir')}
                </span>
              </span>
            )}
            {r.request_type === 'relocation' && r.last_class_attended && (
              <span>{classLabel(r.last_class_attended)}</span>
            )}
            {r.request_type === 'relocation' && r.last_leader_name && (
              <span>Último dirigente: {r.last_leader_name}</span>
            )}
            {r.request_type === 'relocation' && r.wants_folleto && (
              <span className="rounded-full bg-coral/10 px-2 py-0.5 text-[13px] font-semibold text-coral font-display">
                Ocupa folleto
              </span>
            )}
            {r.request_type !== 'relocation' && (
              <span className="inline-flex items-center gap-1.5">
                <BookOpen size={13} className="text-navy-light/80" />
                {r.plan_name ?? 'Plan por definir'}
              </span>
            )}
            {r.existing_group_name && r.request_type === 'study_interest' && (
              <span className="font-medium text-navy">{r.existing_group_name}</span>
            )}
            {/* REU-1: zonas múltiples (incluye la zona única de solicitudes viejas). */}
            {r.proposed_zones.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={13} className="text-navy-light/80" />
                {r.proposed_zones.join(', ')}
              </span>
            )}
            {r.proposed_schedule && (
              <span className="inline-flex items-center gap-1.5">
                <Clock size={13} className="text-navy-light/80" />
                {r.proposed_schedule}
              </span>
            )}
            {r.proposed_days.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={13} className="text-navy-light/80" />
                {r.proposed_days.join(', ')}{r.proposed_time ? ` · ${r.proposed_time}` : ''}
              </span>
            )}
            {r.request_type === 'study_interest' && r.was_eligible === true && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[13px] font-semibold text-emerald-700 font-display">
                <CheckCircle2 size={11} /> Elegible al solicitar
              </span>
            )}
            {r.request_type === 'study_interest' && r.was_eligible === false && (
              <span className="inline-flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-[13px] text-amber-700 font-body">
                <AlertCircle size={12} className="mt-0.5 shrink-0" /> No elegible: {r.eligibility_note || 'faltan requisitos'}
              </span>
            )}
          </>
        )}
        renderResolveExtra={(r, onChange) => (
          r.request_type === 'relocation'
            ? <RelocationResolveGroupPicker request={r} onChange={onChange} />
            : null
        )}
      />
      )}

      {/* Modal "Crear solicitud" a nombre de otra persona */}
      {createOpen && (
        <Modal onClose={() => { setCreateOpen(false); setReloadKey(k => k + 1) }} titleId="create-request-title">
          <div className="p-6 space-y-4">
            <h2 id="create-request-title" className="text-lg font-semibold text-navy font-display">
              Crear solicitud a nombre de un miembro
            </h2>
            {!createFor ? (
              <>
                <p className="text-[13px] text-navy-light/80 font-body">
                  Buscá al miembro; los estudios disponibles se calculan según su elegibilidad.
                </p>
                <MemberCombobox autoFocus onSelect={setCreateFor} />
              </>
            ) : (
              <>
                <div className="flex items-center gap-2.5 rounded-xl bg-surface-low px-3 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy/10 text-navy text-[11px] font-display font-extrabold">
                    {initials(`${createFor.first_name} ${createFor.last_name}`)}
                  </span>
                  <span className="flex-1 truncate text-sm text-navy font-body font-medium">
                    {createFor.first_name} {createFor.last_name}
                  </span>
                  <button
                    onClick={() => setCreateFor(null)}
                    aria-label="Cambiar miembro"
                    className="rounded-lg p-1 text-navy-light/80 hover:text-coral transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
                <p className="text-[13px] text-navy-light/80 font-body">
                  Elegí el tipo de solicitud — los estudios mostrados son los elegibles para este miembro:
                </p>
                <StudyRequestActions memberId={createFor.id} />
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
