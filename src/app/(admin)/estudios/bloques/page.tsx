'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { AccessDenied } from '@/components/shared/AccessDenied'
import { EmptyState } from '@/components/shared/EmptyState'
import { Modal } from '@/components/shared/Modal'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import { ActiveWarningModal } from '@/components/shared/ActiveWarningModal'
import { cn } from '@/lib/utils'
import { CalendarRange, Loader2, Plus, Pencil, Trash2, Check } from 'lucide-react'
import { bloqueMilestones, bloqueCierre, suggestedBlocksForYear, BLOQUE_ESTADO_LABEL, BLOQUE_ESTADO_BADGE, type BloqueEstado } from '@/lib/studies/bloques'
import { BloqueCalendar } from '@/components/studies/BloqueCalendar'
import { availableYears, type VentanaGrupo } from '@/lib/studies/bloque-calendar'
import { ymdCR } from '@/lib/format'

type Bloque = {
  id: string; nombre: string; anio: number; fecha_apertura: string; fecha_cierre_matricula: string
  estado: BloqueEstado
  preliminar_sent_at: string | null; confirmacion_sent_at: string | null; final_sent_at: string | null
}

const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' })

const emptyForm = { nombre: '', anio: new Date().getFullYear(), fecha_apertura: '', fecha_cierre_matricula: '' }

export default function BloquesPage() {
  const { hasRole, loaded } = useAuth()
  const canManage = hasRole('coordinador_estudios', 'admin')

  const [rows, setRows] = useState<Bloque[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [editing, setEditing] = useState<Bloque | null>(null)
  const [form, setForm] = useState<{ nombre: string; anio: number; fecha_apertura: string; fecha_cierre_matricula: string }>(emptyForm)
  const [showArchivados, setShowArchivados] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [del, setDel] = useState<Bloque | null>(null)
  const [warn, setWarn] = useState<string | null>(null)
  // BLQ-1 · Vista alternativa: el listado se mantiene tal cual. El calendario
  // es la vista por defecto (en pantalla angosta se oculta y queda la lista).
  const [vista, setVista] = useState<'lista' | 'calendario'>('calendario')
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [ventanas, setVentanas] = useState<VentanaGrupo[]>([])
  const [resaltado, setResaltado] = useState<string | null>(null)

  const refetch = useCallback(() => {
    setLoading(true)
    fetch('/api/studies/bloques')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: Bloque[]) => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { if (canManage) refetch() }, [canManage, refetch])

  // GRU-1: ventanas de matrícula por grupo, para el carril de abajo del
  // calendario. Se piden solo al abrir esa vista (el listado no las usa).
  useEffect(() => {
    if (vista !== 'calendario' || ventanas.length > 0) return
    let vivo = true
    fetch('/api/studies/groups?all=1')
      .then(r => (r.ok ? r.json() : []))
      .then((gs: Array<{ id: string; name?: string; enrollment_start_date?: string | null; enrollment_end_date?: string | null }>) => {
        if (!vivo || !Array.isArray(gs)) return
        setVentanas(gs
          .filter(g => g.enrollment_start_date && g.enrollment_end_date)
          .map(g => ({ id: g.id, nombre: g.name ?? 'Grupo', desde: g.enrollment_start_date!, hasta: g.enrollment_end_date! })))
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [vista, ventanas.length])

  function openNew() { setEditing(null); setForm(emptyForm); setModalOpen(true) }
  function openEdit(b: Bloque) {
    setEditing(b)
    setForm({ nombre: b.nombre, anio: b.anio, fecha_apertura: b.fecha_apertura, fecha_cierre_matricula: b.fecha_cierre_matricula })
    setModalOpen(true)
  }

  const visibleRows = showArchivados ? rows : rows.filter(b => b.estado !== 'archivado')

  const valid = form.nombre.trim() && form.anio && form.fecha_apertura && form.fecha_cierre_matricula

  async function save() {
    if (!valid || busy) return
    setBusy(true); setMsg(null)
    try {
      const url = editing ? `/api/studies/bloques/${editing.id}` : '/api/studies/bloques'
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, anio: Number(form.anio) }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'No se pudo guardar.')
      setModalOpen(false); refetch()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error desconocido')
    } finally { setBusy(false) }
  }

  const [genConfirm, setGenConfirm] = useState(false)

  async function generateYear() {
    const year = new Date().getFullYear() + 1
    setGenConfirm(false)
    setBusy(true); setMsg(null)
    let created = 0
    try {
      for (const b of suggestedBlocksForYear(year)) {
        const res = await fetch('/api/studies/bloques', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...b, anio: year }),
        })
        if (res.ok) created++
      }
      setMsg(created === 3
        ? `3 bloques de ${year} creados. Ajustá las fechas exactas.`
        : `Se crearon ${created} de 3 bloques de ${year}. Revisá y creá los que faltan a mano.`)
      refetch()
    } finally { setBusy(false) }
  }

  async function askDelete(b: Bloque) {
    // Regla de borrado: si tiene matrículas asociadas, solo advertencia.
    const res = await fetch(`/api/studies/bloques/${b.id}/usage`)
    const data = await res.json().catch(() => null)
    if (res.ok && (data?.enrollments ?? 0) > 0) {
      setWarn(`Este bloque tiene ${data.enrollments} matrícula(s) de capacitación asociadas. Archivalo en vez de borrarlo para conservar el histórico.`)
      return
    }
    setDel(b)
  }

  async function confirmDelete() {
    if (!del) return
    setBusy(true)
    try {
      await fetch(`/api/studies/bloques/${del.id}`, { method: 'DELETE' })
      setDel(null); refetch()
    } finally { setBusy(false) }
  }

  if (loaded && !canManage) return <AccessDenied />

  const milestones = form.fecha_apertura && form.fecha_cierre_matricula
    ? bloqueMilestones(form.fecha_apertura, form.fecha_cierre_matricula) : null

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-navy px-5 sm:px-6 py-5 flex items-start justify-between gap-4 shadow-[var(--shadow-md)]">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-white/10 flex items-center justify-center shrink-0"><CalendarRange size={22} className="text-white" /></div>
          <div>
            <h1 className="text-2xl text-white font-display font-extrabold tracking-[-0.02em]">Bloques de capacitación</h1>
            <p className="mt-0.5 text-sm text-white/80 font-body">{rows.length} bloque{rows.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <button onClick={() => setGenConfirm(true)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors disabled:opacity-40 font-body">
            Generar año siguiente
          </button>
          <button onClick={openNew} className="inline-flex items-center gap-1.5 rounded-full bg-coral px-4 py-2 text-sm text-white hover:bg-coral-deep transition-colors font-body">
            <Plus size={14} /> Nuevo bloque
          </button>
        </div>
      </div>

      {msg && <p className="rounded-xl bg-surface-low px-4 py-2 text-sm text-navy-light/80 font-body inline-flex items-center gap-1.5"><Check size={14} className="text-teal-deep" /> {msg}</p>}

      {/* BLQ-1 · Lista / Calendario. En pantalla angosta el calendario anual no
          se lee, así que el toggle no aparece y queda la lista. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <label className="inline-flex items-center gap-2 text-[13px] text-navy-light/80 font-body cursor-pointer">
          <input type="checkbox" className="accent-coral" checked={showArchivados} onChange={e => setShowArchivados(e.target.checked)} />
          Ver también archivados
        </label>

        <div className="hidden md:flex items-center gap-2">
          {vista === 'calendario' && (
            <select
              className="rounded-xl bg-surface-low px-3 py-1.5 text-[13px] text-navy outline-none focus:ring-1 focus:ring-coral/30 font-body"
              value={anio}
              onChange={e => setAnio(Number(e.target.value))}
              aria-label="Año del calendario"
            >
              {availableYears(rows, new Date().getFullYear()).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          <div className="inline-flex rounded-full border border-[var(--outline-variant)] p-0.5" role="tablist" aria-label="Vista de bloques">
            {(['lista', 'calendario'] as const).map(v => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={vista === v}
                onClick={() => setVista(v)}
                className={cn('rounded-full px-3 py-1 text-[13px] transition-colors font-body',
                  vista === v ? 'bg-navy text-white' : 'text-navy-light hover:bg-surface-low')}
              >
                {v === 'lista' ? 'Lista' : 'Calendario'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {vista === 'calendario' && (
        <div className="hidden md:block">
          <BloqueCalendar
            year={anio}
            bloques={visibleRows}
            ventanas={ventanas}
            todayIso={ymdCR()}
            onSelect={id => { setResaltado(id); setVista('lista') }}
          />
        </div>
      )}

      <div className="rounded-2xl overflow-hidden bg-surface-card shadow-[var(--shadow-md)]">
        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-navy-light/80 font-body inline-flex items-center gap-2 justify-center w-full"><Loader2 size={15} className="animate-spin" /> Cargando…</p>
        ) : visibleRows.length === 0 ? (
          <EmptyState icon={CalendarRange} title="No hay bloques con ese filtro." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr>
                {['Bloque', 'Apertura', 'Cierre matrícula', 'Cierre de bloque', 'Hitos (prelim · confirm · final)', 'Estado', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] tracking-widest uppercase text-navy-light/80 font-display whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {visibleRows.map((b, idx) => {
                  const hitos = bloqueMilestones(b.fecha_apertura, b.fecha_cierre_matricula)
                  return (
                    <tr key={b.id} className={cn('transition-colors', idx % 2 === 1 ? 'bg-surface-low/40' : '', resaltado === b.id && 'ring-2 ring-inset ring-coral/60')}>
                      <td className="px-4 py-3 text-sm font-medium text-navy font-body">{b.nombre}</td>
                      <td className="px-4 py-3 text-[13px] text-navy-light/80 font-body whitespace-nowrap">{fmt(b.fecha_apertura)}</td>
                      <td className="px-4 py-3 text-[13px] text-navy-light/80 font-body whitespace-nowrap">{fmt(b.fecha_cierre_matricula)}</td>
                      <td className="px-4 py-3 text-[13px] text-navy-light/80 font-body whitespace-nowrap">{fmt(bloqueCierre(b.fecha_cierre_matricula))}</td>
                      <td className="px-4 py-3 text-[13px] text-navy-light/80 font-body whitespace-nowrap">
                        {fmt(hitos.preliminar)} · {fmt(hitos.confirmacion)} · {fmt(hitos.final)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold font-display', BLOQUE_ESTADO_BADGE[b.estado])}>
                          {BLOQUE_ESTADO_LABEL[b.estado]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openEdit(b)} aria-label="Editar bloque" className="h-8 w-8 flex items-center justify-center rounded-lg text-navy-light hover:bg-surface-low transition-colors"><Pencil size={14} /></button>
                          <button onClick={() => askDelete(b)} aria-label="Eliminar bloque" className="h-8 w-8 flex items-center justify-center rounded-lg text-navy-light/80 hover:text-coral hover:bg-coral/5 transition-colors"><Trash2 size={14} /></button>
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

      {/* Crear/editar */}
      {genConfirm && (
        <Modal onClose={() => setGenConfirm(false)} titleId="generar-anio-titulo" width={400}>
          <div className="p-5 space-y-4">
            <h3 id="generar-anio-titulo" className="font-semibold text-navy font-display">Generar bloques del año</h3>
            <p className="text-sm text-navy-light/80 font-body">
              ¿Generar los 3 bloques sugeridos de {new Date().getFullYear() + 1}? Podés ajustar las fechas después.
            </p>
            <div className="flex gap-2">
              <button onClick={generateYear} className="flex-1 rounded-full bg-coral px-4 py-2 text-sm text-white hover:bg-coral-deep transition-colors font-body">Generar</button>
              <button onClick={() => setGenConfirm(false)} className="rounded-full border border-[var(--outline-variant)] px-4 py-2 text-sm text-navy-light hover:bg-surface-low transition-colors font-body">Cancelar</button>
            </div>
          </div>
        </Modal>
      )}

      {modalOpen && (
        <Modal onClose={() => !busy && setModalOpen(false)} titleId="bloque-title" width={460}>
          <div className="p-6 space-y-4">
            <h3 id="bloque-title" className="text-base font-bold text-navy font-display">{editing ? 'Editar bloque' : 'Nuevo bloque'}</h3>
            <div className="space-y-1">
              <label htmlFor="nombre" className="text-[11px] tracking-widest uppercase text-navy-light/80 font-display">Nombre</label>
              <input id="nombre" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Bloque 1 2026" className="w-full rounded-xl bg-surface-low px-3 py-2 text-sm text-navy outline-none focus:ring-1 focus:ring-coral/30 font-body" />
            </div>
            <div className="space-y-1">
              <label htmlFor="ano" className="text-[11px] tracking-widest uppercase text-navy-light/80 font-display">Año</label>
              <input id="ano" type="number" value={form.anio} onChange={e => setForm(f => ({ ...f, anio: Number(e.target.value) }))} className="w-full rounded-xl bg-surface-low px-3 py-2 text-sm text-navy outline-none focus:ring-1 focus:ring-coral/30 font-body" />
              <p className="text-[13px] text-navy-light/80 font-body">El estado (en apertura / activo / archivado) se calcula solo según las fechas. El bloque cierra 3 meses después del cierre de matrícula (~3.5 meses de duración).</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="fecha-de-apertura" className="text-[11px] tracking-widest uppercase text-navy-light/80 font-display">Fecha de apertura</label>
                <input id="fecha-de-apertura" type="date" value={form.fecha_apertura} onChange={e => setForm(f => ({ ...f, fecha_apertura: e.target.value }))} className="w-full rounded-xl bg-surface-low px-3 py-2 text-sm text-navy outline-none focus:ring-1 focus:ring-coral/30 font-body" />
              </div>
              <div className="space-y-1">
                <label htmlFor="cierre-de-matricula" className="text-[11px] tracking-widest uppercase text-navy-light/80 font-display">Cierre de matrícula</label>
                <input id="cierre-de-matricula" type="date" value={form.fecha_cierre_matricula} onChange={e => setForm(f => ({ ...f, fecha_cierre_matricula: e.target.value }))} className="w-full rounded-xl bg-surface-low px-3 py-2 text-sm text-navy outline-none focus:ring-1 focus:ring-coral/30 font-body" />
              </div>
            </div>
            {milestones && (
              <p className="text-[13px] text-navy-light/80 font-body rounded-xl bg-surface-low px-3 py-2">
                Hitos: preliminar <strong>{fmt(milestones.preliminar)}</strong> · confirmación <strong>{fmt(milestones.confirmacion)}</strong> · final <strong>{fmt(milestones.final)}</strong> · cierre de bloque <strong>{fmt(bloqueCierre(form.fecha_cierre_matricula))}</strong>
              </p>
            )}
            {msg && <p className="text-[13px] text-coral font-body">{msg}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={save} disabled={!valid || busy} className={cn('flex-1 rounded-full px-4 py-2.5 text-sm text-white transition-colors font-body inline-flex items-center justify-center gap-2 bg-coral hover:bg-coral-deep', (!valid || busy) && 'opacity-50 cursor-not-allowed')}>
                {busy ? <><Loader2 size={15} className="animate-spin" /> Guardando…</> : (editing ? 'Guardar cambios' : 'Crear bloque')}
              </button>
              <button onClick={() => setModalOpen(false)} disabled={busy} className="rounded-full border border-[var(--outline-variant)] px-4 py-2.5 text-sm text-navy-light hover:bg-surface-low transition-colors font-body">Cancelar</button>
            </div>
          </div>
        </Modal>
      )}

      <DeleteConfirmModal
        open={!!del}
        title="Eliminar bloque"
        description={`Se eliminará "${del?.nombre ?? ''}". Esta acción no se puede deshacer.`}
        loading={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDel(null)}
      />
      <ActiveWarningModal open={!!warn} title="No se puede eliminar" message={warn ?? ''} onClose={() => setWarn(null)} />
    </div>
  )
}
