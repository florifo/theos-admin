'use client'

import { useEffect, useState } from 'react'
import { zonaValida, etiquetaZona, aclaracionDeZona } from '@/lib/events/timezone'
import { Image as ImageIcon, UserPlus, Check } from 'lucide-react'
import type { RegistrationCta } from '@/lib/events/detail-access'
import { CapacityBar } from '@/components/events/CapacityBar'
import { cn } from '@/lib/utils'
import { useOrg } from '@/lib/org'
import type { AdminEvent } from '@/data/event-config'
import { MAX_FILE_SIZE_BYTES } from '@/lib/constants'
import { formatMoney } from '@/lib/format'
import { recurrenceLabel } from '@/lib/events/expand-recurrence'
import { surveyStatus } from '@/lib/events/survey-schedule'

type Event = AdminEvent

type Props = {
  event: Event
  flyerPreview: string | null
  flyerDragOver: boolean
  flyerInputRef: React.RefObject<HTMLInputElement | null>
  onFlyerSelect: (file: File) => void
  onFlyerDragOver: (val: boolean) => void
  onFlyerClear: () => void
  flyerError?: string | null
  /** Sin permiso de gestión el flyer es solo lectura. */
  canEditFlyer?: boolean
  /** false = quien mira no gestiona eventos: no se muestran cupos ocupados ni
   *  nada derivado de inscritos/check-ins (el API tampoco se los manda). */
  showManagementData?: boolean
  /** Qué mostrar sobre la inscripción (regla en lib/events/detail-access.ts). */
  cta?: RegistrationCta
  onRegister?: () => void
}

export function EventInfoTab({
  event,
  flyerPreview,
  flyerDragOver,
  flyerInputRef,
  onFlyerSelect,
  onFlyerDragOver,
  onFlyerClear,
  flyerError,
  canEditFlyer = false,
  showManagementData = true,
  cta = { kind: 'ninguno' },
  onRegister,
}: Props) {
  const { adminCommittees } = useOrg()
  // EVE-4 · Cuántas respuestas lleva la encuesta. Solo se pide si YA se envió y
  // el destino era un formulario: antes de eso no hay nada que contar.
  const [respuestasEncuesta, setRespuestasEncuesta] = useState(0)
  const encuestaFormId = event.survey_sent_at ? event.survey_form_id : null
  useEffect(() => {
    if (!encuestaFormId) return
    let vivo = true
    fetch(`/api/forms/${encuestaFormId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (vivo && Array.isArray(d?.responses)) setRespuestasEncuesta(d.responses.length)
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [encuestaFormId])
  const committeeName = event.organizing_committee_ids
    .map(id => adminCommittees.find(c => c.id === id)?.name)
    .filter(Boolean)
    .join(', ') || '—'
  // Fecha y hora en la ZONA DEL EVENTO. Cuando no es Costa Rica se agrega una
  // fila con la zona y la equivalencia — si no, quien administra desde acá lee
  // "11:30" y asume que son las 11:30 de la mañana suyas.
  const zona = zonaValida(event.timezone)
  const enZona = (iso: string) => new Date(iso).toLocaleDateString('es-CR', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: zona,
  })
  const aclaracionZona = aclaracionDeZona(event.timezone, event.start_at)

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="space-y-4">
      {/* Inscripción: primero, porque para quien entra a ver el evento es lo que
          vino a hacer. */}
      {cta.kind !== 'ninguno' && (
        <div className="rounded-2xl p-5 bg-surface-card shadow-[var(--shadow-md)]">
          {cta.kind === 'inscribirse' && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-navy font-body font-semibold">Este evento requiere inscripción</p>
                <p className="text-[13px] text-navy-light/80 font-body mt-0.5">
                  {event.requires_payment && event.payment_amount
                    ? `Tiene un costo de ${formatMoney(event.payment_amount, event.currency)}.`
                    : 'Es gratuito.'}
                  {event.max_capacity != null && ' El cupo es limitado.'}
                </p>
              </div>
              <button
                type="button"
                onClick={onRegister}
                className="inline-flex items-center gap-1.5 rounded-full bg-coral px-5 py-2.5 text-sm text-white hover:bg-coral-deep transition-colors font-body shrink-0"
              >
                <UserPlus size={15} />
                Inscribirme
              </button>
            </div>
          )}
          {cta.kind === 'inscrito' && (
            <p className="flex items-center gap-2 text-sm text-teal-deep font-body font-semibold">
              <Check size={16} />
              Ya estás inscrito/a en este evento
            </p>
          )}
          {cta.kind === 'bloqueado' && (
            <div>
              <p className="text-sm text-navy font-body font-semibold">No podés inscribirte todavía</p>
              <ul className="mt-1 space-y-0.5">
                {cta.reasons.map(r => (
                  <li key={r} className="text-[13px] text-navy-light/80 font-body">· {r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl p-5 space-y-4 bg-surface-card shadow-[var(--shadow-md)]">
        <h3 className="text-[11px] tracking-widest uppercase text-navy-light/80 font-display">Descripción</h3>
        <p className="text-sm text-navy-light/80 leading-relaxed font-body">{event.description}</p>
        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-t-[var(--outline-variant)]">
          {[
            { label: 'Tipo', value: event.event_type },
            { label: 'Comité', value: committeeName },
            { label: 'Inicio', value: enZona(event.start_at) },
            { label: 'Fin', value: enZona(event.end_at) },
            ...(aclaracionZona ? [{ label: 'Zona horaria', value: `${etiquetaZona(zona)} — ${aclaracionZona}` }] : []),
            { label: 'Ubicación', value: event.location },
            { label: 'Virtual', value: event.is_virtual ? 'Sí' : 'No' },
            { label: 'Inscripción', value: event.requires_registration ? 'Requerida' : 'Libre' },
            { label: 'Capacidad', value: event.max_capacity != null ? `${event.max_capacity} personas` : 'Sin límite' },
          ].map(({ label, value }) => (
            <div key={label} className="space-y-0.5">
              <p className="text-[11px] tracking-widest uppercase text-navy-light/80 font-display">{label}</p>
              <p className="text-sm text-navy font-body">{value}</p>
            </div>
          ))}
        </div>
        {event.is_virtual && event.virtual_url && (
          <div className="space-y-0.5 pt-2 border-t border-t-[var(--outline-variant)]">
            <p className="text-[11px] tracking-widest uppercase text-navy-light/80 font-display">Link de la reunión</p>
            <a
              href={event.virtual_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-coral hover:underline break-all font-body"
            >
              {event.virtual_url}
            </a>
          </div>
        )}
      </div>
      </div>

      <div className="space-y-4">
        {event.sub_events.length > 0 && (
          <div className="rounded-2xl p-4 bg-surface-card shadow-[var(--shadow-md)]">
            <h3 className="text-[11px] tracking-widest uppercase text-navy-light/80 mb-3 font-display">Sub-eventos</h3>
            <div className="space-y-2">
              {event.sub_events.map(se => {
                const seCheckins = event.checkins.filter(c => c.sub_event_id === se.id).length
                return (
                  <div key={se.id} className="rounded-xl px-3 py-2.5 bg-surface-low">
                    <p className="text-sm font-medium text-navy font-body">{se.name}</p>
                    {/* El cupo ocupado sale de los check-ins: dato de gestión. */}
                    {showManagementData && <CapacityBar current={seCheckins} max={se.max_capacity} />}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="rounded-2xl p-4 space-y-3 bg-surface-card shadow-[var(--shadow-md)]">
          <h3 className="text-[11px] tracking-widest uppercase text-navy-light/80 font-display">Configuración</h3>
          {[
            // recurrenceLabel traduce la regla a algo legible ("El día 21 de cada
            // mes"); la regla cruda (FREQ=MONTHLY;BYMONTHDAY=21) no le dice nada a
            // nadie y además se desborda de la tarjeta.
            { label: 'Recurrente', value: event.is_recurring ? (recurrenceLabel(event.recurrence_rule) ?? 'Sí') : 'No' },
            // EVE-4 · Estado real de la encuesta, no solo "requerida":
            // programada para tal fecha / enviada a N / N respuestas.
            { label: 'Encuesta', value: etiquetaEncuesta(event, respuestasEncuesta) },
            { label: 'Pago', value: event.requires_payment ? formatMoney(event.payment_amount ?? 0, event.currency) : 'Gratuito' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between text-sm">
              <span className="text-navy-light/80 font-body">{label}</span>
              <span className="text-navy font-medium font-body">{value}</span>
            </div>
          ))}
        </div>

        {/* Flyer */}
        <div className="rounded-2xl p-4 space-y-3 bg-surface-card shadow-[var(--shadow-md)]">
          <h3 className="text-[11px] tracking-widest uppercase text-navy-light/80 font-display">Flyer / Banner</h3>
          <input
            ref={flyerInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f && f.size <= MAX_FILE_SIZE_BYTES) onFlyerSelect(f)
            }}
          />
          {!flyerPreview ? (
            canEditFlyer ? (
              <div
                onDragOver={(e) => { e.preventDefault(); onFlyerDragOver(true) }}
                onDragLeave={() => onFlyerDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  onFlyerDragOver(false)
                  const f = e.dataTransfer.files[0]
                  if (f?.type.startsWith('image/')) onFlyerSelect(f)
                }}
                onClick={() => flyerInputRef.current?.click()}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl border-2 border-dashed py-6 cursor-pointer transition-all',
                  flyerDragOver ? 'border-coral bg-coral/5' : 'border-[rgba(22,20,64,0.15)] hover:border-coral/40 hover:bg-surface-low'
                )}
              >
                <ImageIcon size={24} className="text-navy-light/80" />
                <p className="text-[13px] font-medium text-navy-light/80 font-body">
                  Subir flyer
                </p>
                <p className="text-[11px] text-navy-light/80 font-body">
                  PNG, JPG, WebP — máx 5MB
                </p>
              </div>
            ) : (
              <p className="text-sm text-navy-light/80 font-body">Sin flyer.</p>
            )
          ) : (
            <div className="relative rounded-xl overflow-hidden border border-[var(--outline-variant)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- preview local (blob/dataURL de un archivo recién elegido); next/image no lo optimiza. */}
              <img src={flyerPreview} alt="Flyer del evento" className="w-full object-cover max-h-40" />
              {canEditFlyer && (
                <div className="absolute bottom-0 inset-x-0 flex gap-2 justify-end p-2 bg-[rgba(22,20,64,0.6)]">
                  <button type="button" onClick={() => flyerInputRef.current?.click()}
                    className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-white bg-white/20 hover:bg-white/30 transition-colors font-body">
                    Cambiar
                  </button>
                  <button type="button" onClick={onFlyerClear}
                    className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-coral bg-coral/20 hover:bg-coral/30 transition-colors font-body">
                    Eliminar
                  </button>
                </div>
              )}
            </div>
          )}
          {flyerError && (
            <p className="text-sm text-coral font-body" role="alert">{flyerError}</p>
          )}
        </div>
      </div>
    </div>
  )
}

/** EVE-4 · Una línea con el estado de la encuesta para la tarjeta de
 *  configuración. Corta a propósito: el detalle vive en la pantalla de edición. */
function etiquetaEncuesta(
  event: Parameters<typeof surveyStatus>[0],
  respuestas: number,
): string {
  const st = surveyStatus(event, { responses: respuestas })
  switch (st.kind) {
    case 'sin_encuesta': return 'No'
    case 'incompleta':   return 'Sin programar'
    case 'programada':   return `Programada · ${fechaCorta(st.sendAt)}`
    case 'enviada':      return `Enviada a ${st.sent} · ${st.responses} respuesta${st.responses === 1 ? '' : 's'}`
  }
}

function fechaCorta(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('es-CR', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Costa_Rica' })
}
