import { ExternalLink } from 'lucide-react'
import { RecurrenceSelector } from '@/components/events/RecurrenceSelector'
import { DatePicker } from '@/components/events/DatePicker'
import { TimePicker } from '@/components/events/TimePicker'
import { inputCls, Toggle, FieldLabel } from './shared'
import { ZONAS, ZONA_CR, aclaracionDeZona, paredAIso } from '@/lib/events/timezone'

interface Step2Props {
  start_date: string
  start_time: string
  end_date: string
  end_time: string
  is_virtual: boolean
  virtual_link: string
  location: string
  location_map_url: string
  is_recurring: boolean
  recurrence_rule: string | null
  recurrence_end: string
  timezone: string
  onTimezoneChange: (v: string) => void
  onStartDateChange: (v: string) => void
  onStartTimeChange: (v: string) => void
  onEndDateChange: (v: string) => void
  onEndTimeChange: (v: string) => void
  onToggleVirtual: () => void
  onVirtualLinkChange: (v: string) => void
  onLocationChange: (v: string) => void
  onLocationMapUrlChange: (v: string) => void
  onToggleRecurring: () => void
  onRecurrenceRuleChange: (v: string | null) => void
  onRecurrenceEndChange: (v: string) => void
}

export function Step2Programacion({
  start_date,
  start_time,
  end_date,
  end_time,
  is_virtual,
  virtual_link,
  location,
  location_map_url,
  is_recurring,
  recurrence_rule,
  recurrence_end,
  timezone,
  onTimezoneChange,
  onStartDateChange,
  onStartTimeChange,
  onEndDateChange,
  onEndTimeChange,
  onToggleVirtual,
  onVirtualLinkChange,
  onLocationChange,
  onLocationMapUrlChange,
  onToggleRecurring,
  onRecurrenceRuleChange,
  onRecurrenceEndChange,
}: Step2Props) {
  // Validación: el fin nunca puede ser anterior al inicio (fecha + hora).
  const startTs = start_date ? new Date(`${start_date}T${start_time || '00:00'}`).getTime() : null
  const endTs = end_date ? new Date(`${end_date}T${end_time || '00:00'}`).getTime() : null
  const endBeforeStart = startTs !== null && endTs !== null && endTs < startTs
  // Qué hora es en Costa Rica la que se acaba de teclear. Solo se muestra
  // cuando el evento no es de acá — para el resto no hay nada que aclarar.
  const isoTecleado = start_date ? paredAIso(timezone || ZONA_CR, start_date, start_time || '00:00') : null
  const equivalencia = isoTecleado ? aclaracionDeZona(timezone, isoTecleado) : null

  return (
    <div className="card py-5 px-6 w-full">
      <div className="card-title mb-5">Programación y ubicación</div>

      {/* Fechas */}
      <div className="mb-5">
        <div className="form-row">
          <div>
            <FieldLabel>Fecha inicio</FieldLabel>
            <DatePicker value={start_date} onChange={onStartDateChange} />
          </div>
          <div>
            <FieldLabel>Hora inicio</FieldLabel>
            <TimePicker value={start_time} onChange={onStartTimeChange} />
          </div>
          <div>
            <FieldLabel>Fecha fin</FieldLabel>
            <DatePicker value={end_date} onChange={onEndDateChange} min={start_date || undefined} error={endBeforeStart} />
          </div>
          <div>
            <FieldLabel>Hora fin</FieldLabel>
            <TimePicker
              value={end_time}
              onChange={onEndTimeChange}
              error={endBeforeStart}
              min={end_date && end_date === start_date ? start_time || undefined : undefined}
            />
          </div>
        </div>
        {/* Zona horaria: la hora de arriba es la hora LOCAL DEL EVENTO. Casi
            todos son de Costa Rica y ese es el default; el selector existe por
            las sedes de España, donde además hay horario de verano y el desfase
            con Costa Rica cambia dos veces al año. */}
        <div className="mt-4 max-w-md">
          <FieldLabel>Zona horaria del evento</FieldLabel>
          <select
            className={inputCls}
            value={timezone || ZONA_CR}
            onChange={e => onTimezoneChange(e.target.value)}
            aria-label="Zona horaria en la que se define la hora del evento"
          >
            {ZONAS.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
          </select>
          {equivalencia && (
            <p className="text-[13px] text-navy-light/80 mt-1.5 font-body">
              La hora que escribís es {equivalencia}.
            </p>
          )}
        </div>
        {endBeforeStart && (
          <p className="text-[13px] text-coral mt-2 font-body" role="alert">
            La fecha y hora de fin no pueden ser anteriores a las de inicio.
          </p>
        )}
      </div>

      {/* Ubicación */}
      <div
        className="pt-4 border-t border-t-[var(--outline-variant)] space-y-4 mb-5"
      >
        <Toggle
          checked={is_virtual}
          onToggle={onToggleVirtual}
          label="Evento virtual"
        />
        {!is_virtual && (
          <div className="space-y-3 pl-14">
            <div>
              <FieldLabel>Dirección</FieldLabel>
              <input
                className={`${inputCls} font-body`}
                placeholder="Dirección exacta del evento..."
                value={location}
                onChange={e => onLocationChange(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel>Link Waze / Google Maps</FieldLabel>
              <div className="flex gap-2">
                <input
                  className={`${inputCls} font-body`}
                  placeholder="https://maps.google.com/..."
                  value={location_map_url}
                  onChange={e => onLocationMapUrlChange(e.target.value)}
                />
                {location_map_url && (
                  <a
                    href={location_map_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-[var(--outline-variant)] px-3 py-2 text-[13px] text-navy-light hover:bg-surface-low transition-colors font-body"
                  >
                    <ExternalLink size={13} />
                    Probar
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
        {is_virtual && (
          <div className="space-y-3 pl-14">
            <div>
              <FieldLabel>Link de la reunión virtual (opcional)</FieldLabel>
              <div className="flex gap-2">
                <input
                  className={`${inputCls} font-body`}
                  placeholder="https://zoom.us/... o https://meet.google.com/..."
                  value={virtual_link}
                  onChange={e => onVirtualLinkChange(e.target.value)}
                />
                {virtual_link && (
                  <a
                    href={virtual_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-[var(--outline-variant)] px-3 py-2 text-[13px] text-navy-light hover:bg-surface-low transition-colors font-body"
                  >
                    <ExternalLink size={13} />
                    Probar
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recurrencia */}
      <div
        className="pt-4 border-t border-t-[var(--outline-variant)] space-y-4"
      >
        <Toggle
          checked={is_recurring}
          onToggle={onToggleRecurring}
          label="Evento recurrente"
        />
        {is_recurring && (
          <div className="pl-14">
            <RecurrenceSelector
              value={recurrence_rule}
              onChange={onRecurrenceRuleChange}
              startDate={start_date}
              endDate={recurrence_end}
              onEndDateChange={onRecurrenceEndChange}
            />
          </div>
        )}
      </div>
    </div>
  )
}
