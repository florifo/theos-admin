'use client'

import { use, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useToast } from '@/components/shared/Toast'
import { Modal } from '@/components/shared/Modal'
import Link from 'next/link'
import { type EventType } from '@/data/event-config'
import { useEventTypes } from '@/hooks/useEventTypes'
import { useEvent } from '@/hooks/useEvents'
import { RecurrenceSelector } from '@/components/events/RecurrenceSelector'
import { CommitteeMultiSelect } from '@/components/events/CommitteeMultiSelect'
import { DatePicker } from '@/components/events/DatePicker'
import { TimePicker } from '@/components/events/TimePicker'
import { ymdCR, crFormParts, CURRENCIES, currencySymbol, amountStep } from '@/lib/format'
import { ZONAS, ZONA_CR, zonaValida, aclaracionDeZona, paredAIso } from '@/lib/events/timezone'
import { useSedes } from '@/lib/sedes'
import { cn } from '@/lib/utils'
import { EventManagersPanel } from '../_components/EventManagersPanel'
import { useAuth } from '@/hooks/useAuth'
import { canGrantEventManagers } from '@/lib/auth/events-scope'
import { RegistrationFormPicker } from '@/components/events/RegistrationFormPicker'
import { EventSurveyFields, type SurveyFieldsValue } from '@/components/events/EventSurveyFields'
import {
  ChevronLeft, ChevronDown, ChevronUp, Mic, Tent, Heart, BookOpen, Plus, X,
  Users, Star, MapPin, Music, Coffee, Zap,
} from 'lucide-react'

const inputCls = 'w-full rounded-xl bg-surface-low px-3 py-2 text-sm text-navy outline-none focus:ring-1 focus:ring-coral/30'

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  mic: Mic, tent: Tent, users: Users, star: Star, 'book-open': BookOpen,
  heart: Heart, 'map-pin': MapPin, music: Music, coffee: Coffee, zap: Zap,
}

type SubEventInput = { id: string; name: string; max_capacity: string }

type RecurringScope = 'single' | 'future' | 'all'

function Section({ title, open, onToggle, children }: {
  id: string; title: string; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl overflow-hidden bg-surface-card shadow-[var(--shadow-md)]">
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-low transition-colors">
        <span className="text-sm font-semibold text-navy font-display">{title}</span>
        {open ? <ChevronUp size={16} className="text-navy-light/80" /> : <ChevronDown size={16} className="text-navy-light/80" />}
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-t-[var(--outline-variant)]">
          <div className="pt-4">{children}</div>
        </div>
      )}
    </div>
  )
}

function RecurringSaveModal({
  registrationCount,
  onConfirm,
  onClose,
}: {
  registrationCount: number
  onConfirm: (scope: RecurringScope, notify: boolean) => void
  onClose: () => void
}) {
  const [scope, setScope] = useState<RecurringScope>('single')
  const [notify, setNotify] = useState(false)

  const SCOPE_OPTIONS: { key: RecurringScope; title: string; desc: string; warn?: boolean }[] = [
    { key: 'single', title: 'Solo esta instancia', desc: 'Modifica solo este evento, el resto de la serie no cambia.' },
    { key: 'future', title: 'Esta y las futuras', desc: 'Aplica los cambios a este evento y a todos los que vienen después.' },
    { key: 'all', title: 'Toda la serie', desc: 'Modifica todos los eventos de esta serie, incluyendo los pasados.', warn: true },
  ]

  return (
    <Modal onClose={onClose} titleId="guardar-cambios-recurrente-titulo" width={448}>
        <div className="px-5 py-4 border-b border-b-[var(--outline-variant)]">
          <h3 id="guardar-cambios-recurrente-titulo" className="text-sm font-semibold text-navy font-display">
            Guardar cambios
          </h3>
          <p className="text-[13px] text-navy-light/80 mt-0.5 font-body">
            Este es un evento recurrente. ¿A cuántas instancias aplicar los cambios?
          </p>
        </div>
        <div className="p-5 space-y-3">
          {SCOPE_OPTIONS.map(opt => (
            <div
              key={opt.key}
              onClick={() => setScope(opt.key)}
              className={cn(
                'rounded-xl border p-3.5 cursor-pointer transition-all',
                scope === opt.key ? 'border-coral bg-coral/5' : 'hover:bg-surface-low'
              )}
              style={{ borderColor: scope === opt.key ? undefined : 'var(--outline-variant)' }}
            >
              <div className="flex items-start gap-2">
                <div className={cn(
                  'mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0',
                  scope === opt.key ? 'border-coral' : 'border-navy-light/30'
                )}>
                  {scope === opt.key && <div className="h-2 w-2 rounded-full bg-coral" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-navy font-body">{opt.title}</p>
                    {opt.warn && (
                      <span className="rounded-md bg-coral/10 px-1.5 py-0.5 text-[11px] font-semibold text-coral uppercase font-display">
                        Atención
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] text-navy-light/80 mt-0.5 font-body">{opt.desc}</p>
                </div>
              </div>
            </div>
          ))}

          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input type="checkbox" className="accent-coral" checked={notify} onChange={e => setNotify(e.target.checked)} />
            <span className="text-sm text-navy-light/80 font-body">
              Notificar a los {registrationCount} inscritos
            </span>
          </label>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => onConfirm(scope, notify)}
              className="flex-1 rounded-full bg-coral px-5 py-2.5 text-sm text-white hover:bg-coral-deep transition-colors font-body"
            >
              Guardar cambios
            </button>
            <button
              onClick={onClose}
              className="rounded-full border border-[var(--outline-variant)] px-5 py-2.5 text-sm text-navy-light hover:bg-surface-low transition-colors font-body"
            >
              Cancelar
            </button>
          </div>
        </div>
    </Modal>
  )
}

export default function EditarEventoPage({ params }: { params: Promise<{ id: string }> }) {
  const toast = useToast()
  const { id } = use(params)
  // El encargado puede editar su evento, pero NO repartir el permiso.
  const { roles } = useAuth()
  const puedeNombrarEncargados = canGrantEventManagers(roles)
  const { event, loading } = useEvent(id)
  const activeEventTypes = useEventTypes() // catálogo real de la BD (solo activos)
  // Si venimos de una ocurrencia recurrente (?date=ISO), editamos SOBRE su fecha.
  const occParam = useSearchParams().get('date')

  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['info']))
  const [name, setName] = useState(event?.name ?? '')
  const [selectedType, setSelectedType] = useState<EventType | ''>(event?.event_type ?? '')
  const [committeeIds, setCommitteeIds] = useState<string[]>(event?.organizing_committee_ids ?? [])
  const [description, setDescription] = useState(event?.description ?? '')
  // Los inputs muestran la hora de COSTA RICA, no la cadena cruda del
  // timestamp. Ver crFormParts: partir el ISO con split('T') mostraba la hora
  // UTC y, al guardar, la reinterpretaba como CR — el evento se corría 6 horas
  // en cada edición.
  // …y en la ZONA DEL EVENTO, no siempre en la de Costa Rica: una charla de
  // Madrid se edita en hora de Madrid. Si los inputs mostraran la hora tica y
  // al guardar se reinterpretaran como Madrid, el evento se correría 7 u 8
  // horas en cada edición — el mismo bug de antes, con otro número.
  const zonaEvento = zonaValida(event?.timezone)
  const inicioCR = crFormParts(event?.start_at, zonaEvento)
  const finCR = crFormParts(event?.end_at, zonaEvento)
  const [timezone, setTimezone] = useState(zonaEvento)
  const [startDate, setStartDate] = useState(inicioCR.date)
  const [startTime, setStartTime] = useState(inicioCR.time)
  const [endDate, setEndDate] = useState(finCR.date)
  const [endTime, setEndTime] = useState(finCR.time)
  const [isVirtual, setIsVirtual] = useState(event?.is_virtual ?? false)
  const [virtualLink, setVirtualLink] = useState(event?.virtual_url ?? '')
  const [location, setLocation] = useState(event?.location ?? '')
  const [isRecurring, setIsRecurring] = useState(event?.is_recurring ?? false)
  const [recurrenceRule, setRecurrenceRule] = useState<string | null>(event?.recurrence_rule ?? null)
  const [recurrenceEnd, setRecurrenceEnd] = useState<string>(event?.recurrence_end ? ymdCR(new Date(event.recurrence_end)) : '')
  const [subEvents, setSubEvents] = useState<SubEventInput[]>(
    event?.sub_events.map(se => ({ id: se.id, name: se.name, max_capacity: String(se.max_capacity) })) ?? []
  )
  const [showSubEventForm, setShowSubEventForm] = useState(false)
  const [newSubName, setNewSubName] = useState('')
  const [newSubCap, setNewSubCap] = useState('')
  const [requiresRegistration, setRequiresRegistration] = useState(event?.requires_registration ?? false)
  // Los eventos anteriores a la columna no traen el campo: se asumen públicos,
  // que es lo que venían siendo.
  const [isPublic, setIsPublic] = useState(event?.is_public ?? true)
  const [maxCapacity, setMaxCapacity] = useState(event ? String(event.max_capacity ?? '') : '')
  const [requiresPayment, setRequiresPayment] = useState(event?.requires_payment ?? false)
  const [paymentAmount, setPaymentAmount] = useState(event?.payment_amount ? String(event.payment_amount) : '')
  // INT-2: moneda del cobro del evento.
  const [currency, setCurrency] = useState(event?.currency ?? 'CRC')
  // INT-3: la sede propone la moneda del cobro (Madrid en euros). Editable.
  const [sedeId, setSedeId] = useState<string | null>(event?.sede_id ?? null)
  const { activeSedes } = useSedes()
  const sedeSel = activeSedes.find(x => x.sede_id === sedeId)
  // Aviso, no bloqueo: la moneda se puede dejar distinta a propósito.
  const sedeDesajuste = !!sedeSel && (sedeSel.currency ?? 'CRC') !== currency
  const [serverPrice, setServerPrice] = useState(event?.server_price != null ? String(event.server_price) : '')
  const [serversPay, setServersPay] = useState(event?.servers_pay ?? true)
  const [showRecurringModal, setShowRecurringModal] = useState(false)
  const [saved, setSaved] = useState(false)
  // EVE-4 · Formulario de inscripción y encuesta programada.
  const [registrationFormId, setRegistrationFormId] = useState<string | null>(null)
  const [survey, setSurvey] = useState<SurveyFieldsValue>({
    survey_form_id: null, survey_template_id: null, survey_offset_hours: 24, survey_send_at: null,
  })
  const [requiresSurvey, setRequiresSurvey] = useState(false)
  const [saving, setSaving] = useState(false)

  // Poblar el formulario cuando carga el evento (fetch async).
  useEffect(() => {
    if (!event) return
    setName(event.name ?? '')
    setSelectedType(event.event_type ?? '')
    setCommitteeIds(event.organizing_committee_ids ?? [])
    setDescription(event.description ?? '')
    // Con ocurrencia (?date=): desplazar las fechas a ESA ocurrencia (hora CR local),
    // conservando la duración del evento. Sin ocurrencia: la fecha real del evento.
    const pad = (n: number) => String(n).padStart(2, '0')
    const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
    const realStart = new Date(event.start_at)
    const realEnd = new Date(event.end_at)
    const occStart = occParam ? new Date(occParam) : realStart
    const dur = Math.max(0, realEnd.getTime() - realStart.getTime())
    const occEnd = new Date(occStart.getTime() + dur)
    setStartDate(ymd(occStart))
    setStartTime(hm(occStart))
    setEndDate(ymd(occEnd))
    setEndTime(hm(occEnd))
    setIsVirtual(event.is_virtual ?? false)
    setVirtualLink(event.virtual_url ?? '')
    setLocation(event.location ?? '')
    setIsRecurring(event.is_recurring ?? false)
    setRecurrenceRule(event.recurrence_rule ?? null)
    setRecurrenceEnd(event.recurrence_end ? ymdCR(new Date(event.recurrence_end)) : '')
    setSubEvents(event.sub_events.map(se => ({ id: se.id, name: se.name, max_capacity: String(se.max_capacity) })))
    setRequiresRegistration(event.requires_registration ?? false)
    setIsPublic(event.is_public ?? true)
    setMaxCapacity(String(event.max_capacity ?? ''))
    setRequiresPayment(event.requires_payment ?? false)
    setPaymentAmount(event.payment_amount ? String(event.payment_amount) : '')
    setCurrency(event.currency ?? 'CRC')
    setSedeId(event.sede_id ?? null)
    setServerPrice(event.server_price != null ? String(event.server_price) : '')
    setServersPay(event.servers_pay ?? true)
    // EVE-4
    setRegistrationFormId(event.registration_form_id ?? null)
    setRequiresSurvey(event.requires_survey ?? false)
    setSurvey({
      survey_form_id: event.survey_form_id ?? null,
      survey_template_id: event.survey_template_id ?? null,
      survey_offset_hours: event.survey_offset_hours ?? (event.survey_send_at ? null : 24),
      survey_send_at: event.survey_send_at ?? null,
    })
     
  }, [event, occParam])

  if (!event) {
    return (
      <div className="space-y-4">
        <Link href="/eventos" className="flex items-center gap-1 text-sm text-navy-light/80 hover:text-navy">
          <ChevronLeft size={16} /> Eventos
        </Link>
        <p className="text-navy-light/80 font-body">{loading ? 'Cargando…' : 'Evento no encontrado.'}</p>
      </div>
    )
  }

  function toggleSection(id: string) {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function addSubEvent() {
    if (!newSubName.trim()) return
    setSubEvents(prev => [...prev, { id: `sub-${Date.now()}`, name: newSubName.trim(), max_capacity: newSubCap || '50' }])
    setNewSubName('')
    setNewSubCap('')
    setShowSubEventForm(false)
  }

  function removeSubEvent(subId: string) {
    setSubEvents(prev => prev.filter(s => s.id !== subId))
  }

  // Fecha (YYYY-MM-DD, hora CR) e inicio ISO de la ocurrencia sobre la que se actúa.
  function occurrenceRef(): { date: string; start: string } | null {
    if (!occParam) {
      // Sin ?date: la ocurrencia es el inicio real del evento (padre).
      const d = event ? new Date(event.start_at) : null
      if (!d) return null
      const pad = (n: number) => String(n).padStart(2, '0')
      return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, start: d.toISOString() }
    }
    const d = new Date(occParam)
    if (isNaN(d.getTime())) return null
    const pad = (n: number) => String(n).padStart(2, '0')
    return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, start: d.toISOString() }
  }

  async function doSave(scope: RecurringScope = 'all') {
    setSaving(true)
    const occ = occurrenceRef()
    const body = {
      name, event_type: selectedType, description,
      organizing_committee_ids: committeeIds,
      timezone,
      start_date: startDate, start_time: startTime,
      end_date: endDate, end_time: endTime,
      is_virtual: isVirtual, virtual_link: virtualLink, location,
      is_recurring: isRecurring, recurrence_rule: recurrenceRule, recurrence_end: recurrenceEnd,
      requires_registration: requiresRegistration, max_capacity: maxCapacity,
      is_public: isPublic,
      requires_payment: requiresPayment, payment_amount: paymentAmount, currency, sede_id: sedeId,
      server_price: serverPrice, servers_pay: serversPay,
      sub_events: subEvents,
      // EVE-4 · Formulario de inscripción y encuesta programada.
      registration_form_id: registrationFormId,
      has_satisfaction_survey: requiresSurvey,
      ...survey,
      // Alcance para series recurrentes (lo ignora el backend si scope='all').
      scope,
      occurrence_date: occ?.date,
      occurrence_start: occ?.start,
    }
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Error guardando cambios')
      setSaved(true)
    } catch (e) {
      console.error(e)
      toast('No se pudieron guardar los cambios. Intentá de nuevo.', 'error')
      setSaving(false)
    }
  }

  function handleSave() {
    if (event!.is_recurring) {
      setShowRecurringModal(true)
    } else {
      doSave('all')
    }
  }

  function handleRecurringSave(scope: RecurringScope) {
    setShowRecurringModal(false)
    doSave(scope)
  }

  if (saved) {
    return (
      <div className="flex items-center justify-center min-h-60">
        <div className="text-center space-y-4">
          <div className="h-14 w-14 rounded-full bg-teal-soft/30 flex items-center justify-center mx-auto">
            <span className="text-2xl text-teal-deep">✓</span>
          </div>
          <p className="text-xl font-bold text-navy font-display">
            Cambios guardados
          </p>
          <p className="text-sm text-navy-light/80 font-body">
            El evento fue actualizado correctamente.
          </p>
          <Link
            href={`/eventos/${id}`}
            className="inline-block rounded-full bg-coral px-5 py-2.5 text-sm text-white hover:bg-coral-deep transition-colors mt-2 font-body"
          >
            Ver evento
          </Link>
        </div>
      </div>
    )
  }

  // El fin nunca puede ser anterior al inicio (fecha + hora).
  const startTs = startDate ? new Date(`${startDate}T${startTime || '00:00'}`).getTime() : null
  const endTs = endDate ? new Date(`${endDate}T${endTime || '00:00'}`).getTime() : null
  const endBeforeStart = startTs !== null && endTs !== null && endTs < startTs
  // Qué hora es en Costa Rica la que muestran los inputs. Null si el evento es
  // de acá: no hay nada que aclarar.
  const isoTecleado = startDate ? paredAIso(timezone || ZONA_CR, startDate, startTime || '00:00') : null
  const equivalenciaZona = isoTecleado ? aclaracionDeZona(timezone, isoTecleado) : null

  return (
    <div className="space-y-4">
      {/* AUD-1 · Encabezado para lectores de pantalla: esta pantalla no
          tiene un título visible (se identifica por la barra superior y las
          insignias), y sin <h1> no hay punto de entrada para orientarse. */}
      <h1 className="sr-only">{`Editar ${event.name ?? 'el evento'}`}</h1>
      {showRecurringModal && (
        <RecurringSaveModal
          registrationCount={event.registrations.length}
          onConfirm={handleRecurringSave}
          onClose={() => setShowRecurringModal(false)}
        />
      )}

      {/* Sticky bar */}
      <div
        className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 sm:px-5 bg-surface-card shadow-[var(--shadow-md)]"
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Link
            href={`/eventos/${id}`}
            className="flex items-center gap-1 text-sm text-navy-light/80 hover:text-navy transition-colors font-body"
          >
            <ChevronLeft size={16} />
            Volver
          </Link>
          <span className="text-navy-light/80">|</span>
          <span className="text-sm font-semibold text-navy font-display">
            Editar evento
          </span>
          {event.is_recurring && (
            <span className="rounded-md bg-navy/10 px-2 py-0.5 text-[11px] text-navy-light/80 font-display">
              Recurrente
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/eventos/${id}`}
            className="rounded-full border border-[var(--outline-variant)] px-3.5 py-1.5 text-[13px] text-navy-light hover:bg-surface-low transition-colors font-body"
          >
            Descartar
          </Link>
          <button
            onClick={handleSave}
            disabled={saving || endBeforeStart}
            className="rounded-full bg-coral px-3.5 py-1.5 text-[13px] text-white hover:bg-coral-deep transition-colors disabled:opacity-50 font-body"
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      {/* Sección 1 */}
      <Section id="info" title="① Información principal" open={openSections.has('info')} onToggle={() => toggleSection('info')}>
        <div className="space-y-4">
          <div>
            <input
              className="w-full border-0 border-b border-b-2 border-b-[var(--outline-variant)] bg-transparent pb-2 text-2xl font-bold text-navy outline-none placeholder:text-navy-light/80 transition-colors font-display"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-[13px] tracking-widest uppercase text-navy-light/80 font-display">Tipo</span>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {activeEventTypes.map(t => {
                const Icon = ICON_MAP[t.icon] ?? Mic
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedType(t.id as EventType)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all duration-150',
                      selectedType === t.id ? 'border-coral bg-coral/5 text-coral' : 'text-navy-light/80 hover:bg-surface-low'
                    )}
                    style={{ borderColor: selectedType === t.id ? undefined : 'var(--outline-variant)' }}
                  >
                    <Icon size={18} />
                    <span className="text-[13px] font-medium font-display">{t.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor="ev-comites" className="text-[13px] tracking-widest uppercase text-navy-light/80 font-display">Comités organizadores</label>
            <CommitteeMultiSelect inputId="ev-comites" value={committeeIds} onChange={setCommitteeIds} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[13px] tracking-widest uppercase text-navy-light/80 font-display">Descripción</span>
              <span className="text-[11px] text-navy-light/80 font-mono">{description.length}/500</span>
            </div>
            <textarea
              className={cn(inputCls, 'resize-none', 'font-body')}
              rows={3}
              maxLength={500}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
        </div>
      </Section>

      {/* Sección 2 */}
      <Section id="visibilidad" title="Visibilidad" open={openSections.has('visibilidad')} onToggle={() => toggleSection('visibilidad')}>
        <div className="flex items-start gap-3">
          <button
            type="button" role="switch" aria-checked={isPublic}
            aria-label="Mostrar en el calendario público"
            onClick={() => setIsPublic(v => !v)}
            className={cn('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-all duration-200 cursor-pointer', isPublic ? 'bg-coral' : 'bg-navy-light/20')}
          >
            <span className={cn('absolute top-0.5 left-0 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200', isPublic ? 'translate-x-4' : 'translate-x-0.5')} />
          </button>
          <div>
            <p className="text-sm text-navy font-body">Mostrar en el calendario público</p>
            <p className="mt-1 text-[13px] text-navy-light/80 font-body">
              {isPublic
                ? 'Aparece en el calendario del sitio y en el de todos los miembros.'
                : 'Evento interno: no aparece en ningún calendario. Solo lo ven quienes gestionan eventos, y quien reciba el link para compartir — que sigue funcionando igual.'}
            </p>
          </div>
        </div>
      </Section>

      <Section id="schedule" title="② Programación y ubicación" open={openSections.has('schedule')} onToggle={() => toggleSection('schedule')}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-[13px] tracking-widest uppercase text-navy-light/80 font-display">Fecha inicio</span>
              <DatePicker ariaLabel="Fecha inicio" value={startDate} onChange={setStartDate} />
            </div>
            <div className="space-y-1">
              <span className="text-[13px] tracking-widest uppercase text-navy-light/80 font-display">Hora inicio</span>
              <TimePicker ariaLabel="Hora inicio" value={startTime} onChange={setStartTime} />
            </div>
            <div className="space-y-1">
              <span className="text-[13px] tracking-widest uppercase text-navy-light/80 font-display">Fecha fin</span>
              <DatePicker ariaLabel="Fecha fin" value={endDate} onChange={setEndDate} min={startDate || undefined} error={endBeforeStart} />
            </div>
            <div className="space-y-1">
              <span className="text-[13px] tracking-widest uppercase text-navy-light/80 font-display">Hora fin</span>
              <TimePicker ariaLabel="Hora fin" value={endTime} onChange={setEndTime} error={endBeforeStart} min={endDate && endDate === startDate ? startTime || undefined : undefined} />
            </div>
          </div>
          {/* La hora de arriba es la hora LOCAL DEL EVENTO. Ver zonaEvento. */}
          <div className="space-y-1 max-w-sm">
            <span className="text-[13px] tracking-widest uppercase text-navy-light/80 font-display">Zona horaria</span>
            <select
              className="w-full rounded-xl border border-[var(--outline-variant)] bg-surface-card px-3 py-2.5 text-sm text-navy font-body"
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              aria-label="Zona horaria en la que se define la hora del evento"
            >
              {ZONAS.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
            </select>
            {equivalenciaZona && (
              <p className="text-[13px] text-navy-light/80 font-body">
                La hora que ves es {equivalenciaZona}.
              </p>
            )}
          </div>
          {endBeforeStart && (
            <p className="text-[13px] text-coral font-body" role="alert">
              La fecha y hora de fin no pueden ser anteriores a las de inicio.
            </p>
          )}
          <label className="flex items-center gap-3 cursor-pointer">
            <button type="button" role="switch" aria-checked={isVirtual} aria-label="Evento virtual" onClick={() => setIsVirtual(v => !v)} className={cn('relative h-5 w-9 rounded-full transition-all duration-200 cursor-pointer', isVirtual ? 'bg-coral' : 'bg-navy-light/20')}><span className={cn('absolute top-0.5 left-0 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200', isVirtual ? 'translate-x-4' : 'translate-x-0.5')} /></button>
            <span className="text-sm text-navy font-body">Virtual</span>
          </label>
          {!isVirtual && (
            <div className="space-y-1">
              <label htmlFor="direccion" className="text-[13px] tracking-widest uppercase text-navy-light/80 font-display">Dirección</label>
              <input id="direccion" className={cn(inputCls, 'font-body')} value={location} onChange={e => setLocation(e.target.value)} />
            </div>
          )}
          {isVirtual && (
            <div className="space-y-1">
              <label htmlFor="link-de-la-reunion-virtual-opcional" className="text-[13px] tracking-widest uppercase text-navy-light/80 font-display">Link de la reunión virtual (opcional)</label>
              <input id="link-de-la-reunion-virtual-opcional" className={cn(inputCls, 'font-body')} placeholder="https://zoom.us/... o https://meet.google.com/..." value={virtualLink} onChange={e => setVirtualLink(e.target.value)} />
            </div>
          )}
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <button type="button" role="switch" aria-checked={isRecurring} aria-label="Evento recurrente" onClick={() => { const next = !isRecurring; setIsRecurring(next); if (!next) { setRecurrenceRule(null); setRecurrenceEnd('') } }} className={cn('relative h-5 w-9 rounded-full transition-all duration-200 cursor-pointer', isRecurring ? 'bg-coral' : 'bg-navy-light/20')}><span className={cn('absolute top-0.5 left-0 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200', isRecurring ? 'translate-x-4' : 'translate-x-0.5')} /></button>
              <span className="text-sm text-navy font-body">Recurrente</span>
            </label>
            {isRecurring && (
              <div className="pl-12">
                <RecurrenceSelector
                  value={recurrenceRule}
                  onChange={setRecurrenceRule}
                  startDate={startDate}
                  endDate={recurrenceEnd}
                  onEndDateChange={setRecurrenceEnd}
                />
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Sección 3 */}
      <Section id="subevents" title="③ Sub-eventos" open={openSections.has('subevents')} onToggle={() => toggleSection('subevents')}>
        <div className="space-y-3">
          {subEvents.map(se => (
            <div key={se.id} className="flex items-center justify-between rounded-xl px-3 py-2.5 bg-surface-low">
              <div>
                <p className="text-sm font-medium text-navy font-body">{se.name}</p>
                <p className="text-[13px] text-navy-light/80">Cap. {se.max_capacity}</p>
              </div>
              <button type="button" onClick={() => removeSubEvent(se.id)} className="relative after:absolute after:content-[''] after:-inset-1.5 h-7 w-7 rounded-lg flex items-center justify-center text-navy-light/80 hover:text-coral hover:bg-coral/10 transition-colors" aria-label={`Eliminar sub-evento ${se.name}`}>
                <X size={14} />
              </button>
            </div>
          ))}
          {showSubEventForm ? (
            <div className="rounded-xl border border-[var(--outline-variant)] p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input className={cn(inputCls, 'font-body')} placeholder="Nombre" value={newSubName} onChange={e => setNewSubName(e.target.value)} autoFocus />
                <input type="number" className={cn(inputCls, 'font-body')} placeholder="Capacidad" value={newSubCap} onChange={e => setNewSubCap(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={addSubEvent} className="rounded-full bg-navy px-3.5 py-1.5 text-[13px] text-white hover:bg-navy/80 transition-colors font-body">Agregar</button>
                <button type="button" onClick={() => setShowSubEventForm(false)} className="rounded-full border border-[var(--outline-variant)] px-3.5 py-1.5 text-[13px] text-navy-light hover:bg-surface-low transition-colors font-body">Cancelar</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowSubEventForm(true)} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--outline-variant)] px-3.5 py-1.5 text-[13px] text-navy-light hover:bg-surface-low transition-colors font-body">
              <Plus size={13} /> Añadir sub-evento
            </button>
          )}
        </div>
      </Section>

      {/* Sección 4 */}
      <Section id="registration" title="④ Inscripciones" open={openSections.has('registration')} onToggle={() => toggleSection('registration')}>
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <button type="button" role="switch" aria-checked={requiresRegistration} aria-label="Requiere inscripción" onClick={() => setRequiresRegistration(r => !r)} className={cn('relative h-5 w-9 rounded-full transition-all duration-200 cursor-pointer', requiresRegistration ? 'bg-coral' : 'bg-navy-light/20')}><span className={cn('absolute top-0.5 left-0 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200', requiresRegistration ? 'translate-x-4' : 'translate-x-0.5')} /></button>
            <span className="text-sm text-navy font-body">Requiere inscripción</span>
          </label>
          {requiresRegistration && (
            <div className="space-y-2 pl-1">
              <div className="space-y-1">
                <label htmlFor="capacidad-maxima" className="text-[13px] tracking-widest uppercase text-navy-light/80 font-display">Capacidad máxima</label>
                <input id="capacidad-maxima" type="number" className={cn(inputCls, 'font-body')} value={maxCapacity} onChange={e => setMaxCapacity(e.target.value)} />
              </div>
              {/* "Prerrequisito" se quitó: los eventos no tienen ese campo en la
                  BD y el select no estaba conectado a nada. */}
            </div>
          )}
        </div>
      </Section>

      {/* Sección 5 */}
      <Section id="finance" title="⑤ Financiero" open={openSections.has('finance')} onToggle={() => toggleSection('finance')}>
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <button type="button" role="switch" aria-checked={requiresPayment} aria-label="Requiere pago" onClick={() => setRequiresPayment(r => !r)} className={cn('relative h-5 w-9 rounded-full transition-all duration-200 cursor-pointer', requiresPayment ? 'bg-coral' : 'bg-navy-light/20')}><span className={cn('absolute top-0.5 left-0 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200', requiresPayment ? 'translate-x-4' : 'translate-x-0.5')} /></button>
            <span className="text-sm text-navy font-body">Evento con cobro</span>
          </label>
          <div className="space-y-1 max-w-[280px]">
            <label className="text-[13px] tracking-widest uppercase text-navy-light/80 font-display" htmlFor="edit-event-sede">Sede</label>
            <select
              id="edit-event-sede"
              className={cn(inputCls, 'font-body')}
              value={sedeId ?? ''}
              onChange={e => {
                const id = e.target.value || null
                setSedeId(id)
                const s = activeSedes.find(x => x.sede_id === id)
                if (s?.currency) setCurrency(s.currency)
              }}
            >
              <option value="">Sin sede</option>
              {activeSedes.map(s => <option key={s.sede_id ?? s.id} value={s.sede_id ?? ''}>{s.name}</option>)}
            </select>
          </div>
          {requiresPayment && (
            <div className="space-y-3 pl-1">
              <div className="space-y-1">
                <label className="text-[13px] tracking-widest uppercase text-navy-light/80 font-display" htmlFor="edit-event-currency">Moneda</label>
                <select id="edit-event-currency" className={cn(inputCls, 'font-body', 'max-w-[160px]')} value={currency} onChange={e => setCurrency(e.target.value)}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {sedeDesajuste && (
                  <p className="text-[13px] text-coral font-body">
                    {sedeSel?.name} cobra normalmente en {sedeSel?.currency}. Revisá la moneda.
                  </p>
                )}
                <span className="text-[13px] tracking-widest uppercase text-navy-light/80 font-display">Costo</span>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-navy-light/80 font-mono">{currencySymbol(currency)}</span>
                  <input type="number" step={amountStep(currency)} className={cn(inputCls, 'pl-7', 'font-body')} value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[13px] tracking-widest uppercase text-navy-light/80 font-display">Costo para servidores (opcional)</span>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-navy-light/80 font-mono">{currencySymbol(currency)}</span>
                  <input type="number" step={amountStep(currency)} className={cn(inputCls, 'pl-7', 'font-body')} placeholder="Igual al costo" value={serverPrice} onChange={e => setServerPrice(e.target.value)} disabled={!serversPay} />
                </div>
                <p className="text-[13px] text-navy-light/80 font-body">Se aplica a servidores activos de los comités organizadores.</p>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <button type="button" role="switch" aria-checked={!serversPay} aria-label="Servidores exentos de pago" onClick={() => setServersPay(s => !s)} className={cn('relative h-5 w-9 rounded-full transition-all duration-200 cursor-pointer', !serversPay ? 'bg-coral' : 'bg-navy-light/20')}><span className={cn('absolute top-0.5 left-0 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200', !serversPay ? 'translate-x-4' : 'translate-x-0.5')} /></button>
                <span className="text-sm text-navy font-body">Servidores exentos de pago</span>
              </label>
            </div>
          )}
        </div>
      </Section>

      <Section id="encuesta" title="⑥ Inscripción y encuesta" open={openSections.has('encuesta')} onToggle={() => toggleSection('encuesta')}>
        <div className="space-y-5">
          <RegistrationFormPicker value={registrationFormId} onChange={setRegistrationFormId} />

          <div className="space-y-3 border-t border-[var(--outline-variant)] pt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <button type="button" role="switch" aria-checked={requiresSurvey} aria-label="Enviar encuesta de satisfacción" onClick={() => setRequiresSurvey(v => !v)} className={cn('relative h-5 w-9 rounded-full transition-all duration-200 cursor-pointer', requiresSurvey ? 'bg-coral' : 'bg-navy-light/20')}><span className={cn('absolute top-0.5 left-0 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200', requiresSurvey ? 'translate-x-4' : 'translate-x-0.5')} /></button>
              <span className="text-sm text-navy font-body">Enviar encuesta de satisfacción después del evento</span>
            </label>
            {requiresSurvey && (
              <EventSurveyFields
                value={survey}
                onChange={patch => setSurvey(prev => ({ ...prev, ...patch }))}
                endsAt={endDate ? new Date(`${endDate}T${endTime || '00:00'}`).toISOString() : null}
              />
            )}
          </div>
        </div>
      </Section>

      {/* FRM-1 B · Encargados: quién gestiona ESTE evento sin tener el módulo.
          Va acá, en la configuración del evento, y su formulario lo hereda. */}
      {puedeNombrarEncargados && (
        <Section id="encargados" title="⑦ Encargados de este evento" open={openSections.has('encargados')} onToggle={() => toggleSection('encargados')}>
          <EventManagersPanel eventId={id} />
        </Section>
      )}
      </div>
    </div>
  )
}
