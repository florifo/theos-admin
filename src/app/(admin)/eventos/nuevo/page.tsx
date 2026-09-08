'use client'

import { useState, useMemo, useRef, useEffect, Suspense } from 'react'
import { ZONA_CR } from '@/lib/events/timezone'
import { useSearchParams } from 'next/navigation'
import { useToast } from '@/components/shared/Toast'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuth } from '@/lib/auth/auth-context'
import { AccessDenied } from '@/components/shared/AccessDenied'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { type EventType } from '@/data/event-config'
import { toYmdLocal } from '@/lib/format'
import { useEventTypes } from '@/hooks/useEventTypes'
import { StepSidebar } from './_components/StepSidebar'
import { Step1Informacion } from './_components/Step1Informacion'
import { Step2Programacion } from './_components/Step2Programacion'
import { Step3SubEventos } from './_components/Step3SubEventos'
import { Step4Financiero } from './_components/Step4Financiero'
import { EventSummary } from './_components/EventSummary'

// ─── Types ────────────────────────────────────────────────────────────────────

type SubEventInput = { id: string; name: string; max_capacity: string }

interface FormData {
  name: string
  event_type: EventType | ''
  organizing_committee_ids: string[]
  description: string
  /** Mostrar en el calendario público y en el de los miembros. */
  is_public: boolean
  start_date: string
  start_time: string
  timezone: string
  end_date: string
  end_time: string
  is_virtual: boolean
  virtual_link: string
  location: string
  location_map_url: string
  is_recurring: boolean
  recurrence_rule: string | null
  recurrence_end: string
  sub_events: SubEventInput[]
  requires_registration: boolean
  max_capacity: string
  prerequisite: string
  has_satisfaction_survey: boolean
  registration_form_id: string | null
  survey_form_id: string | null
  survey_template_id: string | null
  survey_offset_hours: number | null
  survey_send_at: string | null
  /** INT-3: sede del evento; propone la moneda del cobro. */
  sede_id: string | null
  requires_payment: boolean
  payment_amount: string
  currency: string
  server_price: string
  servers_pay: boolean
  flyer: string | null
}

const STEPS_COUNT = 4

// ── Defaults de fecha/hora para agilizar la creación ──────────────────────────
/** Hora actual redondeada hacia arriba a la siguiente media hora (HH:mm). */
function nextHalfHour(): string {
  const d = new Date()
  d.setSeconds(0, 0)
  const m = d.getMinutes()
  if (m === 0 || m === 30) { /* ya está en punto/media */ }
  else if (m < 30) d.setMinutes(30)
  else { d.setHours(d.getHours() + 1); d.setMinutes(0) }
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
/** 'HH:mm' + 1 hora (envuelve a 23:59 máximo). */
function plusOneHour(time: string): string {
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h)) return ''
  const nh = Math.min(h + 1, 23)
  return `${String(nh).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NuevoEventoPage() {
  // useSearchParams exige límite de Suspense en prerender.
  return (
    <Suspense fallback={null}>
      <NuevoEventoForm />
    </Suspense>
  )
}

function NuevoEventoForm() {
  const toast = useToast()
  // Gate temprano: sin permiso de crear eventos, el 403 llegaba recién al
  // publicar, después de llenar los 4 pasos.
  const { can } = usePermissions()
  const { loaded } = useAuth()
  // Fecha precargada al venir del clic en una celda del calendario (?date=YYYY-MM-DD).
  const dateParam = useSearchParams().get('date')
  const initialDate = dateParam || toYmdLocal(new Date())
  const initialStart = nextHalfHour()
  // Marca si el usuario tocó la hora/fecha final (para no sobreescribir el default +1h).
  const [endTouched, setEndTouched] = useState(false)
  const [step, setStep]                         = useState(1)
  const [published, setPublished]               = useState(false)
  const [showSubEventForm, setShowSubEventForm] = useState(false)
  const [newSubName, setNewSubName]             = useState('')
  const [newSubCap, setNewSubCap]               = useState('')
  const [flyer, setFlyer]                       = useState<string | null>(null)
  const [flyerDragOver, setFlyerDragOver]       = useState(false)
  const flyerInputRef                           = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<FormData>({
    name: '',
    event_type: '',
    organizing_committee_ids: [],
    description: '',
    // Público por default: es lo que hacían todos los eventos hasta ahora, así
    // que marcar la casilla es una decisión y no marcarla no cambia nada.
    is_public: true,
    start_date: initialDate,
    start_time: initialStart,
    timezone: ZONA_CR,
    end_date: initialDate,
    end_time: plusOneHour(initialStart),
    is_virtual: false,
    virtual_link: '',
    location: '',
    location_map_url: '',
    is_recurring: false,
    recurrence_rule: null,
    recurrence_end: '',
    sub_events: [],
    requires_registration: false,
    max_capacity: '',
    prerequisite: '',
    has_satisfaction_survey: false,
    // EVE-4 · Formulario de inscripción y encuesta programada (opcionales).
    registration_form_id: null,
    survey_form_id: null,
    survey_template_id: null,
    survey_offset_hours: 24,   // "al día siguiente" es el default razonable
    survey_send_at: null,
    requires_payment: false,
    payment_amount: '',
    sede_id: null,
    currency: 'CRC',
    server_price: '',
    servers_pay: true,
    flyer: null,
  })

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  // EVE-4 · Fin del evento en ISO: con esto se calcula el momento de la encuesta
  // ("3 días después de que termine").
  const endsAtIso = form.end_date
    ? new Date(`${form.end_date}T${form.end_time || '00:00'}`).toISOString()
    : null

  // El wizard no guarda borradores: si hay trabajo empezado, avisar antes de
  // recargar/cerrar la pestaña (sin esto los 4 pasos se pierden sin aviso).
  const dirty = !published && (form.name.trim() !== '' || form.description !== '' || form.sub_events.length > 0)
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])


  function addSubEvent() {
    if (!newSubName.trim()) return
    set('sub_events', [...form.sub_events, {
      id: `sub-${Date.now()}`,
      name: newSubName.trim(),
      max_capacity: newSubCap || '50',
    }])
    setNewSubName('')
    setNewSubCap('')
    setShowSubEventForm(false)
  }

  function removeSubEvent(id: string) {
    set('sub_events', form.sub_events.filter(s => s.id !== id))
  }

  // EVE-2: el flyer se sube a Storage (bucket público event-flyers) y se guarda
  // la URL pública en flyer_url — antes se metía el base64 completo en la BD.
  async function handleFlyerSelect(file: File) {
    if (file.size > 5 * 1024 * 1024) return
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/events/upload-flyer', { method: 'POST', body: fd })
      const d = await res.json().catch(() => null)
      if (!res.ok) throw new Error(d?.error || 'No se pudo subir el flyer.')
      setFlyer(d.url as string)
    } catch (e) {
      console.error('upload flyer:', e)
      setFlyer(null)
    }
  }

  // El fin nunca puede ser anterior al inicio (fecha + hora).
  function endBeforeStart(): boolean {
    if (!form.start_date || !form.end_date) return false
    const s = new Date(`${form.start_date}T${form.start_time || '00:00'}`).getTime()
    const e = new Date(`${form.end_date}T${form.end_time || '00:00'}`).getTime()
    return e < s
  }

  function canProceed(): boolean {
    if (step === 2 && endBeforeStart()) return false
    return missingForStep().length === 0
  }

  // Qué falta para poder avanzar (misma condición que deshabilita "Siguiente").
  function missingForStep(): string[] {
    const missing: string[] = []
    if (step === 1) {
      if (form.name.trim().length === 0) missing.push('el nombre')
      if (form.event_type === '') missing.push('el tipo de evento')
    }
    if (step === 2) {
      if (form.start_date === '') missing.push('la fecha de inicio')
      if (form.start_time === '') missing.push('la hora de inicio')
    }
    return missing
  }

  const eventTypes = useEventTypes() // catálogo real de la BD (solo activos)
  const selectedTypeObj = useMemo(
    () => eventTypes.find(t => t.id === form.event_type),
    [eventTypes, form.event_type],
  )

  const [submitting, setSubmitting] = useState(false)

  // Después de TODOS los hooks (regla de hooks): gate temprano de permiso.
  if (loaded && !can('eventos', 'create')) return <AccessDenied />

  async function handlePublish() {
    setSubmitting(true)
    try {
      // QA 2026-07-17: un sub-evento escrito en el formulario inline pero sin
      // confirmar con el botón "Agregar" se descartaba en silencio al publicar.
      // Se auto-incluye (la intención del usuario es clara: lo escribió).
      const pendingSub = showSubEventForm && newSubName.trim()
        ? [{ id: `sub-${Date.now()}`, name: newSubName.trim(), max_capacity: newSubCap || '50' }]
        : []
      const sub_events = [...form.sub_events, ...pendingSub]
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, sub_events, flyer }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(detail?.error || 'Error creando el evento')
      }
      setPublished(true) // solo "publicado" si el INSERT realmente persistió
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      toast(`No se pudo crear el evento: ${msg}`, 'error')
      setSubmitting(false)
    }
  }

  // ── Estado: publicado ──────────────────────────────────────────────────────

  if (published) {
    return (
      <div className="page">
        <div className="ph">
          <h1 className="ptitle">Crear evento</h1>
        </div>
        <div className="card p-10 text-center">
          <div className="h-14 w-14 rounded-full bg-teal-soft/30 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">✓</span>
          </div>
          <p
            className="text-xl font-bold text-navy mb-2 font-display"
          >
            Evento publicado
          </p>
          <p
            className="text-sm text-navy-light/80 mb-6 font-body"
          >
            El evento quedó disponible para inscripciones.
          </p>
          <Link
            href="/eventos"
            className="btn btn-primary inline-flex mx-auto"
          >
            Ver todos los eventos
          </Link>
        </div>
      </div>
    )
  }

  // ── Layout principal ───────────────────────────────────────────────────────

  return (
    <div className="page">

      {/* ── Header ── */}
      <div className="ph">
        <div className="ph-row">
          <div>
            <h1 className="ptitle">Crear evento</h1>
            <div className="psub">Completá los pasos para publicar un nuevo evento</div>
          </div>
          <div className="ph-actions">
            {/* "Siguiente" va al pie del paso; arriba solo Publicar (último paso). */}
            {step === STEPS_COUNT && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handlePublish}
                disabled={submitting}
              >
                {submitting ? 'Publicando…' : 'Publicar evento'}
              </button>
            )}
          </div>
        </div>
        {step < STEPS_COUNT && !canProceed() && missingForStep().length > 0 && (
          <p className="text-[13px] text-navy-light/80 mt-1.5 text-right font-body" role="status">
            Para continuar, completá {missingForStep().join(' y ')}.
          </p>
        )}
      </div>

      {/* ── Grid: stepper sidebar + contenido + resumen ── */}
      <div
        className="grid grid-cols-1 lg:grid-cols-[clamp(170px,16%,210px)_1fr_clamp(240px,24%,300px)] gap-6 w-full items-start"
      >
        {/* Sidebar de pasos */}
        <StepSidebar step={step} onStepClick={setStep} />

        {/* Contenido del paso activo */}
        <div className="w-full min-w-0">

          {step === 1 && (
            <Step1Informacion
              name={form.name}
              event_type={form.event_type}
              organizing_committee_ids={form.organizing_committee_ids}
              description={form.description}
              is_public={form.is_public}
              flyer={flyer}
              flyerDragOver={flyerDragOver}
              flyerInputRef={flyerInputRef}
              onNameChange={v => set('name', v)}
              onEventTypeChange={v => set('event_type', v)}
              onCommitteesChange={v => set('organizing_committee_ids', v)}
              onDescriptionChange={v => set('description', v)}
              onIsPublicToggle={() => set('is_public', !form.is_public)}
              onFlyerSelect={handleFlyerSelect}
              onFlyerDragOver={setFlyerDragOver}
              onFlyerRemove={() => setFlyer(null)}
            />
          )}

          {step === 2 && (
            <Step2Programacion
              start_date={form.start_date}
              start_time={form.start_time}
              end_date={form.end_date}
              end_time={form.end_time}
              is_virtual={form.is_virtual}
              virtual_link={form.virtual_link}
              location={form.location}
              location_map_url={form.location_map_url}
              is_recurring={form.is_recurring}
              recurrence_rule={form.recurrence_rule}
              recurrence_end={form.recurrence_end}
            timezone={form.timezone}
            onTimezoneChange={v => set('timezone', v)}
              onStartDateChange={v => {
                setForm(prev => ({
                  ...prev,
                  start_date: v,
                  // Si no se tocó la fecha fin, la seguimos a la de inicio.
                  end_date: endTouched ? prev.end_date : v,
                }))
              }}
              onStartTimeChange={v => {
                setForm(prev => ({
                  ...prev,
                  start_time: v,
                  // Default ágil: hora fin = inicio + 1h, salvo que el usuario ya la haya puesto.
                  end_time: endTouched ? prev.end_time : plusOneHour(v),
                }))
              }}
              onEndDateChange={v => { setEndTouched(true); set('end_date', v) }}
              onEndTimeChange={v => { setEndTouched(true); set('end_time', v) }}
              onToggleVirtual={() => set('is_virtual', !form.is_virtual)}
              onVirtualLinkChange={v => set('virtual_link', v)}
              onLocationChange={v => set('location', v)}
              onLocationMapUrlChange={v => set('location_map_url', v)}
              onToggleRecurring={() => {
                const next = !form.is_recurring
                set('is_recurring', next)
                if (!next) {
                  set('recurrence_rule', null) // apagar limpia la regla
                  set('recurrence_end', '')
                }
              }}
              onRecurrenceRuleChange={v => set('recurrence_rule', v)}
              onRecurrenceEndChange={v => set('recurrence_end', v)}
            />
          )}

          {step === 3 && (
            <Step3SubEventos
              sub_events={form.sub_events}
              showSubEventForm={showSubEventForm}
              newSubName={newSubName}
              newSubCap={newSubCap}
              requires_registration={form.requires_registration}
              max_capacity={form.max_capacity}
              has_satisfaction_survey={form.has_satisfaction_survey}
              onSetShowSubEventForm={setShowSubEventForm}
              onNewSubNameChange={setNewSubName}
              onNewSubCapChange={setNewSubCap}
              onAddSubEvent={addSubEvent}
              onRemoveSubEvent={removeSubEvent}
              onToggleRegistration={() => set('requires_registration', !form.requires_registration)}
              onMaxCapacityChange={v => set('max_capacity', v)}
              onToggleSatisfactionSurvey={() => set('has_satisfaction_survey', !form.has_satisfaction_survey)}
              registration_form_id={form.registration_form_id}
              onRegistrationFormChange={v => set('registration_form_id', v)}
              survey={{
                survey_form_id: form.survey_form_id,
                survey_template_id: form.survey_template_id,
                survey_offset_hours: form.survey_offset_hours,
                survey_send_at: form.survey_send_at,
              }}
              onSurveyChange={patch => setForm(prev => ({ ...prev, ...patch }))}
              endsAt={endsAtIso}
            />
          )}

          {step === 4 && (
            <Step4Financiero
              sede_id={form.sede_id}
              onSedeChange={(sedeId, currency) => setForm(prev => ({ ...prev, sede_id: sedeId, currency }))}
              requires_payment={form.requires_payment}
              payment_amount={form.payment_amount}
              currency={form.currency}
              server_price={form.server_price}
              servers_pay={form.servers_pay}
              onTogglePayment={() => set('requires_payment', !form.requires_payment)}
              onPaymentAmountChange={v => set('payment_amount', v)}
              onCurrencyChange={v => set('currency', v)}
              onServerPriceChange={v => set('server_price', v)}
              onToggleServersPay={() => set('servers_pay', !form.servers_pay)}
            />
          )}

          {/* Navegación inferior: Paso anterior + Siguiente/Publicar al pie del paso */}
          <div className="mt-4 flex items-center justify-between gap-3">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep(s => s - 1)}
                className="btn btn-ghost btn-sm"
              >
                ← Paso anterior
              </button>
            ) : <span />}
            {step < STEPS_COUNT ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setStep(s => s + 1)}
                disabled={!canProceed()}
              >
                Siguiente <ChevronRight size={13} />
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handlePublish}
                disabled={submitting}
              >
                {submitting ? 'Publicando…' : 'Publicar evento'}
              </button>
            )}
          </div>

        </div>

        {/* Resumen persistente: se va llenando con cada paso */}
        <EventSummary
          name={form.name}
          selectedTypeName={selectedTypeObj?.name}
          organizing_committee_ids={form.organizing_committee_ids}
          start_date={form.start_date}
          start_time={form.start_time}
          end_date={form.end_date}
          end_time={form.end_time}
          is_virtual={form.is_virtual}
          virtual_link={form.virtual_link}
          location={form.location}
          location_map_url={form.location_map_url}
          is_recurring={form.is_recurring}
          sub_events={form.sub_events}
          requires_registration={form.requires_registration}
          max_capacity={form.max_capacity}
          requires_payment={form.requires_payment}
          payment_amount={form.payment_amount}
          currency={form.currency}
        />
      </div>
    </div>
  )
}
