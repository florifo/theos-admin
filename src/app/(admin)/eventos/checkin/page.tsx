'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAllEventsLight } from '@/hooks/useEvents'
import { usePermissions } from '@/hooks/usePermissions'
import { AccessDenied } from '@/components/shared/AccessDenied'
import { todaysCheckinEvents, CHECKIN_STATUS_LABEL, type CheckinStatus } from '@/lib/events/checkin-window'
import { cn } from '@/lib/utils'
import { Search, ChevronRight, QrCode, ChevronLeft } from 'lucide-react'

const STATUS_STYLE: Record<CheckinStatus, string> = {
  en_curso: 'bg-teal-soft/30 text-teal-deep',
  por_iniciar: 'bg-navy/10 text-navy',
  recien_terminado: 'bg-amber-50 text-amber-700',
}

function checkinHref(ev: { id: string; start_at: string; occurrence_key?: string }): string {
  // Ocurrencia recurrente → lleva su fecha para que el check-in quede en la fecha real.
  return ev.occurrence_key
    ? `/eventos/${ev.id}/checkin?date=${encodeURIComponent(ev.start_at)}`
    : `/eventos/${ev.id}/checkin`
}

export default function CheckinPickerPage() {
  const router = useRouter()
  const { can, loaded } = usePermissions()
  const canCheckin = can('eventos', 'edit') // encargado_eventos, direccion, admin
  const { events, loading } = useAllEventsLight()
  const [search, setSearch] = useState('')

  // Sin permiso → AccessDenied explícito (redirigir en silencio a /dashboard
  // hacía creer que el link estaba roto).

  const today = useMemo(() => todaysCheckinEvents(events), [events])
  const q = search.trim().toLowerCase()
  // Sin búsqueda: ventana de hoy. Con búsqueda: cualquier evento por nombre
  // (registros tardíos / fuera de ventana → entrar al evento y hacer check-in ahí).
  const results = useMemo(() => {
    if (!q) return today
    return events
      .filter(e => e.name.toLowerCase().includes(q))
      .sort((a, b) => b.start_at.localeCompare(a.start_at))
      .slice(0, 50)
  }, [q, today, events])

  if (loaded && !canCheckin) return <AccessDenied />

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl bg-navy px-5 py-5 shadow-[var(--shadow-md)]">
        <Link href="/eventos" className="inline-flex items-center gap-1 text-[13px] text-white/80 hover:text-white mb-2 font-body">
          <ChevronLeft size={14} /> Eventos
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
            <QrCode size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl text-white font-display font-extrabold tracking-[-0.02em]">Check-in</h1>
            <p className="mt-0.5 text-sm text-white/80 font-body">Elegí el evento para registrar asistencia</p>
          </div>
        </div>
      </div>

      {/* Buscador */}
      <div className="flex items-center gap-2 rounded-2xl bg-surface-card px-4 py-3 shadow-[var(--shadow-md)]">
        <Search size={18} className="text-navy-light/80 shrink-0" />
        <input
          autoFocus
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar evento por nombre…"
          aria-label="Buscar evento por nombre"
          className="flex-1 bg-transparent text-base text-navy placeholder-navy-light/50 outline-none font-body"
        />
      </div>

      {!q && (
        <p className="px-1 text-[13px] uppercase tracking-widest text-navy-light/80 font-display">
          Eventos de hoy
        </p>
      )}

      {/* Lista */}
      {loading ? (
        <p className="px-1 py-8 text-center text-sm text-navy-light/80 font-body">Cargando…</p>
      ) : results.length === 0 ? (
        <div className="rounded-2xl bg-surface-card p-8 text-center shadow-[var(--shadow-md)]">
          <p className="text-sm text-navy-light/80 font-body">
            {q ? 'Ningún evento con ese nombre.' : 'No hay eventos de hoy en ventana de check-in. Buscá por nombre para registros de otro día.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {results.map(ev => {
            const status = (ev as { checkin_status?: CheckinStatus }).checkin_status
            return (
              <button
                key={(ev as { occurrence_key?: string }).occurrence_key ?? ev.id}
                onClick={() => router.push(checkinHref(ev))}
                className="w-full text-left rounded-2xl bg-surface-card px-4 py-4 shadow-[var(--shadow-md)] flex items-center justify-between gap-3 active:bg-surface-low hover:shadow-[var(--shadow-lg)] transition-all min-h-[64px]"
              >
                <div className="min-w-0">
                  <p className="text-base text-navy font-body truncate">{ev.name}</p>
                  <p className="text-[13px] text-navy-light/80 font-body mt-0.5">
                    {new Date(ev.start_at).toLocaleString('es-CR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {status && (
                    <span className={cn('rounded-full px-2.5 py-1 text-[13px] font-medium font-display', STATUS_STYLE[status])}>
                      {CHECKIN_STATUS_LABEL[status]}
                    </span>
                  )}
                  <ChevronRight size={18} className="text-navy-light/40" />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
