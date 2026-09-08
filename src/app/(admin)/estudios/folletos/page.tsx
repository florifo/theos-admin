'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { usePermissions } from '@/hooks/usePermissions'
import { useRowSelection } from '@/hooks/useRowSelection'
import { BulkActionBar } from '@/components/shared/BulkActionBar'
import { Modal } from '@/components/shared/Modal'
import { AccessDenied } from '@/components/shared/AccessDenied'
import { EmptyState } from '@/components/shared/EmptyState'
import { cn } from '@/lib/utils'
import { FileText, Loader2, Check, ChevronRight, MapPin } from 'lucide-react'
import type { DbFolletoRequest } from '@/lib/supabase/queries/folletos'
import {
  FOLLETO_STATES, FOLLETO_STATE_LABEL, FOLLETO_STATE_BADGE, nextFolletoState,
  levelLabel, type FolletoState,
} from '@/lib/studies/folletos'
import { FOLLETO_TIPO_LABEL, FOLLETO_TIPO_BADGE, type FolletoTipo } from '@/lib/studies/bloques'
import { textoDesgloseCorto } from '@/lib/studies/folleto-desglose'
import { ManualFolletoRequestButton } from '@/components/studies/ManualFolletoRequestButton'

const STATUS_FILTERS: { key: FolletoState | 'all'; label: string }[] = [
  { key: 'all', label: 'Todos' },
  ...FOLLETO_STATES.map(s => ({ key: s, label: FOLLETO_STATE_LABEL[s] })),
]

const TIPO_FILTERS: { key: FolletoTipo | 'all'; label: string }[] = [
  { key: 'all', label: 'Todos los tipos' },
  { key: 'cierre', label: 'Cierre' },
  { key: 'preapertura_preliminar', label: 'Preliminar' },
  { key: 'preapertura_confirmacion', label: 'Confirmación' },
  { key: 'preapertura_final', label: 'Final' },
  { key: 'manual', label: 'Manual' },
]


export default function FolletosPage() {
  const { can, loaded } = usePermissions()
  const canView = can('folletos', 'view')
  const canEdit = can('folletos', 'edit')

  const [rows, setRows] = useState<DbFolletoRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [sedeFilter, setSedeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<FolletoState | 'all'>('all')
  const [tipoFilter, setTipoFilter] = useState<FolletoTipo | 'all'>('all')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<FolletoState | null>(null)

  const refetch = useCallback(() => {
    setLoading(true)
    fetch('/api/studies/folletos')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: DbFolletoRequest[]) => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { if (canView) refetch() }, [canView, refetch])

  const sedeOptions = useMemo(
    () => Array.from(new Set(rows.map(r => r.sede).filter((s): s is string => !!s))).sort((a, b) => a.localeCompare(b)),
    [rows],
  )
  const filtered = useMemo(() => rows.filter(r =>
    (sedeFilter === 'all' || r.sede === sedeFilter) &&
    (statusFilter === 'all' || r.status === statusFilter) &&
    (tipoFilter === 'all' || r.tipo === tipoFilter),
  ), [rows, sedeFilter, statusFilter, tipoFilter])

  const sel = useRowSelection(filtered.map(r => r.id))

  const applyStatus = useCallback(async (ids: string[], status: FolletoState) => {
    if (busy || ids.length === 0) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/studies/folletos/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, status }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'No se pudo actualizar.')
      setMsg(`${data.updated} folleto${data.updated !== 1 ? 's' : ''} → ${FOLLETO_STATE_LABEL[status]}.`)
      sel.clear(); setConfirm(null); refetch()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error desconocido')
    } finally { setBusy(false) }
  }, [busy, sel, refetch])

  if (loaded && !canView) return <AccessDenied />

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-navy px-5 sm:px-6 py-5 shadow-[var(--shadow-md)]">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
              <FileText size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl text-white font-display font-extrabold tracking-[-0.02em]">Folletos</h1>
              <p className="mt-0.5 text-sm text-white/80 font-body">{filtered.length} solicitud{filtered.length !== 1 ? 'es' : ''}</p>
            </div>
          </div>
          {canEdit && <ManualFolletoRequestButton onCreated={refetch} />}
        </div>
      </div>

      {msg && (
        <p className="rounded-xl bg-surface-low px-4 py-2 text-sm text-navy-light/80 font-body inline-flex items-center gap-1.5">
          <Check size={14} className="text-teal-deep" /> {msg}
        </p>
      )}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={sedeFilter}
          onChange={e => setSedeFilter(e.target.value)}
          aria-label="Filtrar por sede"
          className="w-full sm:w-auto rounded-xl bg-surface-card px-3 py-2 text-sm text-navy outline-none focus:ring-1 focus:ring-coral/30 shadow-[var(--shadow-sm)] font-body"
        >
          <option value="all">Todas las sedes</option>
          {sedeOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={tipoFilter}
          onChange={e => setTipoFilter(e.target.value as FolletoTipo | 'all')}
          aria-label="Filtrar por tipo"
          className="w-full sm:w-auto rounded-xl bg-surface-card px-3 py-2 text-sm text-navy outline-none focus:ring-1 focus:ring-coral/30 shadow-[var(--shadow-sm)] font-body"
        >
          {TIPO_FILTERS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-[13px] font-medium border transition-all duration-150 font-display',
                statusFilter === f.key ? 'bg-navy text-white border-navy' : 'text-navy-light/80 hover:text-navy hover:bg-surface-low border-transparent',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk */}
      {canEdit && (
        <BulkActionBar count={sel.count} onClear={sel.clear} noun="folletos">
          {FOLLETO_STATES.filter(s => s !== 'creada').map(s => (
            <button
              key={s}
              onClick={() => setConfirm(s)}
              className="rounded-full border border-white/30 px-3.5 py-1.5 text-[13px] text-white hover:bg-white/10 transition-colors font-body"
            >
              {FOLLETO_STATE_LABEL[s]}
            </button>
          ))}
        </BulkActionBar>
      )}

      {/* Tabla */}
      <div className="rounded-2xl overflow-hidden bg-surface-card shadow-[var(--shadow-md)]">
        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-navy-light/80 font-body inline-flex items-center gap-2 justify-center w-full"><Loader2 size={15} className="animate-spin" /> Cargando…</p>
        ) : filtered.length === 0 ? (
          <EmptyState icon={FileText} title="No hay solicitudes de folletos con esos filtros" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {canEdit && (
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox" className="accent-coral" aria-label="Seleccionar todos"
                        checked={sel.allSelected && filtered.length > 0}
                        ref={el => { if (el) el.indeterminate = sel.someSelected }}
                        onChange={sel.toggleAll}
                      />
                    </th>
                  )}
                  {['Tipo', 'Origen', 'Cantidad', 'Entrega en', 'Estado', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] tracking-widest uppercase text-navy-light/80 font-display whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => {
                  const next = nextFolletoState(r.status)
                  return (
                    <tr key={r.id} className={cn('transition-colors', sel.isSelected(r.id) ? 'bg-coral/5' : idx % 2 === 1 ? 'bg-surface-low/40' : '')}>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <input type="checkbox" className="accent-coral" aria-label={`Seleccionar folleto ${r.sede ?? ''}`} checked={sel.isSelected(r.id)} onChange={() => sel.toggle(r.id)} />
                        </td>
                      )}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold font-display', FOLLETO_TIPO_BADGE[(r.tipo as FolletoTipo)] ?? '')}>
                          {FOLLETO_TIPO_LABEL[(r.tipo as FolletoTipo)] ?? r.tipo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-navy-light/80 font-body">
                        {r.tipo === 'cierre' ? (
                          <>{r.source_group?.name ?? '—'}{r.target_level_code && <span className="text-navy-light/80"> · → {levelLabel(r.target_level_code)}</span>}</>
                        ) : r.tipo === 'manual' ? (
                          <>
                            {(() => {
                              const leader = r.target_leader_name || (r.target_leader ? [r.target_leader.first_name, r.target_leader.last_name].filter(Boolean).join(' ') : '')
                              return <span>{r.target_level_code ? levelLabel(r.target_level_code) : '—'}{leader ? ` · ${leader}` : ''}</span>
                            })()}
                            {r.note && <span className="block text-navy-light/80 text-[13px] italic">“{r.note}”</span>}
                          </>
                        ) : (r.bloque?.nombre ?? '—')}
                      </td>
                      {/* El TOTAL a imprimir, con el desglose debajo. `quantity`
                          sola es solo la parte de estudiantes: el dirigente y el
                          co-dirigente también llevan folleto, y quien imprime
                          necesita el número completo. */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm font-semibold text-navy tabular-nums font-display">
                          {r.desglose.total}
                        </span>
                        <span className="block text-[11px] text-navy-light font-body">
                          {textoDesgloseCorto(r.desglose)}
                        </span>
                      </td>
                      {/* Destino DESTACADO: es el dato que usa quien organiza
                          la entrega para armar los paquetes, no un atributo más
                          de la fila. Un tiquete sin destino se marca en rojo en
                          vez de mostrar un guion, que se lee como "no aplica". */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {r.sede ? (
                          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy font-body">
                            <MapPin size={13} className="text-teal-deep shrink-0" aria-hidden />
                            {r.sede}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-coral-deep font-body">
                            <MapPin size={13} className="shrink-0" aria-hidden />
                            Sin destino
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold font-display', FOLLETO_STATE_BADGE[r.status])}>
                          {FOLLETO_STATE_LABEL[r.status]}
                        </span>
                      </td>
                      {/* El estado de pago y la fecha estimada se movieron al
                          detalle: la fila queda con lo que se usa para armar los
                          paquetes, y lo demás está a un clic. */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <Link
                            href={`/estudios/folletos/${r.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--outline-variant)] px-2.5 py-1 text-[13px] text-navy-light hover:bg-surface-low transition-colors font-body"
                          >
                            Ver <ChevronRight size={12} aria-hidden />
                          </Link>
                          {canEdit && next && (
                            <button
                              onClick={() => applyStatus([r.id], next)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--outline-variant)] px-2.5 py-1 text-[13px] text-navy-light hover:bg-surface-low transition-colors disabled:opacity-50 font-body"
                            >
                              {FOLLETO_STATE_LABEL[next]} <ChevronRight size={12} aria-hidden />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmación bulk */}
      {confirm && (
        <Modal onClose={() => !busy && setConfirm(null)} titleId="confirm-folleto-title" width={420}>
          <div className="p-6 space-y-4">
            <h3 id="confirm-folleto-title" className="text-base font-bold text-navy font-display">Cambiar estado</h3>
            <p className="text-sm text-navy-light/80 font-body">
              <strong className="text-navy">{sel.count}</strong> folleto{sel.count !== 1 ? 's' : ''} pasará{sel.count !== 1 ? 'n' : ''} a <strong className="text-navy">{FOLLETO_STATE_LABEL[confirm]}</strong>.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => applyStatus(sel.selectedIds, confirm)}
                disabled={busy}
                className={cn('flex-1 rounded-full px-4 py-2.5 text-sm text-white transition-colors font-body inline-flex items-center justify-center gap-2 bg-teal-deep hover:opacity-90', busy && 'opacity-60 cursor-not-allowed')}
              >
                {busy ? <><Loader2 size={15} className="animate-spin" /> Aplicando…</> : 'Confirmar'}
              </button>
              <button onClick={() => setConfirm(null)} disabled={busy} className="rounded-full border border-[var(--outline-variant)] px-4 py-2.5 text-sm text-navy-light hover:bg-surface-low transition-colors font-body">Cancelar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
