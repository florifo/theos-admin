'use client'

// REV-3: página unificada de pagos — el listado general de finanzas y la cola
// de revisión (antes /pagos/revision, que ahora redirige acá) conviven como
// pestañas. La ven el módulo finanzas Y los roles de revisión (revision_pagos,
// folletos, coordinadores); las acciones siguen gateadas por permiso:
// revisión → revision_pagos:edit, devoluciones/SINPE → finanzas:edit.

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useUrlFilter } from '@/hooks/useUrlFilter'
import { CreditCard, Eye, EyeOff, Search } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { AccessDenied } from '@/components/shared/AccessDenied'
import { Modal } from '@/components/shared/Modal'
import { useToast } from '@/components/shared/Toast'
import { AmountDisplay, TotalsDisplay } from '@/components/finance/AmountDisplay'
import type { MoneyTotals } from '@/lib/money'
import { PaymentMethodBadge } from '@/components/finance/PaymentMethodBadge'
import { PaymentStatusBadge } from '@/components/finance/PaymentStatusBadge'
import { RefundModal } from '@/components/finance/RefundModal'
import { PaymentReviewQueue, type PaymentReviewQueueHandle } from '@/components/finance/PaymentReviewQueue'
import { type Payment, type PaymentMethod, type PaymentStatus } from '@/types/finance'
import { usePaginatedList } from '@/hooks/usePaginatedList'
import { LoadMoreFooter } from '@/components/shared/LoadMoreFooter'
import type { DbPayment } from '@/lib/supabase/queries/finance'
import { toDomainPayment } from '@/lib/finance/adapter'
import { formatDate, formatDateTime, CURRENCIES, type Currency } from '@/lib/format'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { cn } from '@/lib/utils'
import {
  paymentDescription, paymentEntityName, paymentKindLabel, type PaymentForLabel,
} from '@/lib/finance/payment-label'

/** El adapter ya trae `description_label`/`kind_label`; esto es el respaldo para
 *  un Payment que venga de otra ruta sin esos campos. */
function toLabel(p: { concept?: string | null; entity_type?: string | null; entity_name?: string; notes?: string | null }): PaymentForLabel {
  return {
    concept: p.concept,
    entity_type: p.entity_type,
    event_name: p.entity_type === 'event' ? p.entity_name : null,
    group_name: p.entity_type === 'event' ? null : p.entity_name,
    description: p.notes,
  }
}

function PagosContent() {
  const { loaded, hasRole } = useAuth()
  const { can } = usePermissions()
  // Ver la página: módulo finanzas O permiso de revisión (espejo del guard de
  // GET /api/finance/payments y de la excepción del ModuleGuard del layout).
  const canFinance = can('finanzas', 'view')
  const canQueue = can('revision_pagos', 'view')
  const canReview = can('revision_pagos', 'edit')
  const canFinanceEdit = can('finanzas', 'edit')
  // BEC-1: aplicar beca/cupón desde el modal (espejo del guard del endpoint).
  const canApplyScholarship = can('becas', 'edit') || canReview
  // FIN-4: crear arreglos de pago. Por ROL (no por módulo) para que coincida
  // con requireRoles del endpoint: dirección tiene finanzas solo en view.
  const canPlan = hasRole('finanzas', 'direccion', 'admin')

  const [revealAll, setRevealAll] = useState(false)
  // Pestañas: 'todos' (listado general) | 'revision' (cola de revisión).
  // En la URL para que el redirect de /pagos/revision y los links compartidos
  // caigan directo en la cola.
  const [tabRaw, setTab] = useUrlFilter('tab', 'todos')
  const tab = tabRaw === 'revision' && canQueue ? 'revision' : 'todos'
  // Filtros en la URL: sobreviven recargas y se comparten por link.
  const [entityRaw, setEntityFilter] = useUrlFilter('entidad', 'all')
  const entityFilter = entityRaw as 'all' | 'event' | 'study_group'
  const [methodRaw, setMethodFilter] = useUrlFilter('metodo', 'all')
  const methodFilter = methodRaw as 'all' | PaymentMethod
  const [statusRaw, setStatusFilter] = useUrlFilter('estado', 'all')
  const statusFilter = statusRaw as 'all' | PaymentStatus
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])
  const [refundTarget, setRefundTarget] = useState<Payment | null>(null)
  const [sinpeTarget, setSinpeTarget] = useState<Payment | null>(null)
  const [sinpeConf, setSinpeConf] = useState('')
  const [sinpeDate, setSinpeDate] = useState('')
  // Detalle plano de un pago que NO está en la cola de revisión (pagado,
  // devuelto, etc.). Los que sí están se abren en el modal de la cola.
  const [plainDetail, setPlainDetail] = useState<Payment | null>(null)
  const queueRef = useRef<PaymentReviewQueueHandle>(null)
  const toast = useToast()

  // INT-3: filtro por moneda. Solo aparece si hay más de una en los totales —
  // mientras todo sea en colones, un chip de moneda sería ruido.
  const [currencyFilter, setCurrencyFilter] = useState<'all' | Currency>('all')
  // FIN-4: ver solo los tractos de arreglos de pago.
  const [planFilter, setPlanFilter] = useState<'all' | 'in_plan'>('all')
  // Listado paginado server-side (filtros + búsqueda viajan al servidor).
  const buildUrl = (page: number) => {
    const u = new URLSearchParams()
    if (debouncedSearch.trim()) u.set('search', debouncedSearch.trim())
    if (entityFilter !== 'all') u.set('entity_type', entityFilter)
    if (methodFilter !== 'all') u.set('method', methodFilter)
    if (statusFilter !== 'all') u.set('status', statusFilter)
    if (currencyFilter !== 'all') u.set('currency', currencyFilter)
    if (planFilter === 'in_plan') u.set('in_plan', '1')
    u.set('page', String(page))
    u.set('pageSize', '25')
    return `/api/finance/payments?${u.toString()}`
  }
  const {
    items: payments, total, loading, error, hasMore, loadMore, reload,
  } = usePaginatedList<DbPayment, Payment>(buildUrl, { pageSize: 25, itemsKey: 'payments', mapItem: toDomainPayment })
  const filtered = payments

  // Totales globales (los montos del header) — SQL, no sobre lo cargado.
  // INT-3: los totales llegan POR MONEDA ({"CRC": 25000}); ver TotalsDisplay.
  const [stats, setStats] = useState<{ total_paid: MoneyTotals; total_pending: MoneyTotals }>(
    { total_paid: {}, total_pending: {} })
  const loadStats = useCallback(() => {
    fetch('/api/finance/payments?stats=1')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setStats({ total_paid: d.total_paid ?? {}, total_pending: d.total_pending ?? {} }) })
      .catch(() => {})
  }, [])
  useEffect(() => { loadStats() }, [loadStats])
  const totalPaid = stats.total_paid
  const totalPending = stats.total_pending
  // Las monedas que REALMENTE hay (de los totales globales, no de la página).
  const monedasPresentes = CURRENCIES.filter(c =>
    stats.total_paid[c] !== undefined || stats.total_pending[c] !== undefined)

  // Contador de la pestaña "En revisión": tiquetes accionables
  // (pendiente + en_revision, el default del endpoint sin filtros).
  const [queueCount, setQueueCount] = useState<number | null>(null)
  const loadQueueCount = useCallback(() => {
    if (!canQueue) return
    fetch('/api/payments/queue')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (Array.isArray(d)) setQueueCount(d.length) })
      .catch(() => {})
  }, [canQueue])
  useEffect(() => { loadQueueCount() }, [loadQueueCount])

  const refetch = useCallback(() => { reload(); loadStats(); loadQueueCount() }, [reload, loadStats, loadQueueCount])

  // Abrir un pago desde la pestaña "Todos": los pendientes se intentan abrir
  // en el modal de la cola (con acciones de revisión); el resto, detalle plano.
  function openPayment(p: Payment) {
    const openedInQueue = canQueue && p.status === 'pending'
      && (queueRef.current?.openPayment(p.id) ?? false)
    if (!openedInQueue) setPlainDetail(p)
  }

  async function handleRefundConfirm(data: { type: 'full' | 'partial'; amount: number; reason: string; reasonDetail: string }) {
    if (!refundTarget) return
    const target = refundTarget
    setRefundTarget(null)
    try {
      const res = await fetch('/api/finance/refunds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_id: target.id,
          member_id: target.member_id || null,
          amount: data.amount,
          method: target.method,
          reason: [data.reason, data.reasonDetail].filter(Boolean).join(' — ') || null,
          sinpe_pending: target.method === 'sinpe',
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error)
      await refetch()
      toast(`Solicitud de devolución creada para ${target.member_name}`, 'success')
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : 'No se pudo crear la devolución. Intentá de nuevo.', 'error')
    }
  }

  async function handleConfirmSinpe() {
    if (!sinpeTarget || !sinpeConf) return
    const target = sinpeTarget
    setSinpeTarget(null)
    setSinpeConf('')
    setSinpeDate('')
    try {
      const res = await fetch(`/api/finance/payments/${target.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'paid',
          sinpe_confirmation: sinpeConf,
          paid_at: sinpeDate || new Date().toISOString(),
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error)
      await refetch()
      toast(`Pago SINPE confirmado para ${target.member_name}`, 'success')
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : 'No se pudo confirmar el pago. Intentá de nuevo.', 'error')
    }
  }

  if (!loaded) {
    return (
      <div className="py-16 text-center font-body">
        <div className="h-7 w-7 mx-auto mb-3 rounded-full border-2 border-navy-light/20 border-t-coral animate-spin" />
        <p className="text-sm text-navy-light/80">Cargando…</p>
      </div>
    )
  }
  if (loaded && !canFinance && !canQueue) return <AccessDenied />

  return (
    <>
      <div className="space-y-6">

        {/* Header */}
        <div
          className="rounded-2xl px-6 py-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-navy shadow-[var(--shadow-md)]"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-[rgba(255,255,255,0.10)]">
              <CreditCard size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl text-white font-display font-extrabold tracking-[-0.02em]">Pagos</h1>
              <p className="text-[13px] text-white/80 mt-0.5 font-body">
                Registro de todos los pagos del sistema y cola de revisión
              </p>
            </div>
          </div>
          <button
            onClick={() => setRevealAll(r => !r)}
            className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] self-start sm:self-auto bg-[rgba(255,255,255,0.10)] text-[rgba(255,255,255,0.70)] font-body"
          >
            {revealAll ? <EyeOff size={13} /> : <Eye size={13} />}
            {revealAll ? 'Ocultar montos' : 'Mostrar montos'}
          </button>
        </div>

        {/* Pestañas: listado general / cola de revisión */}
        {canQueue && (
          <div className="flex items-center gap-2 flex-wrap" role="tablist" aria-label="Vistas de pagos">
            {([
              ['todos', 'Todos los pagos'],
              ['revision', `En revisión${queueCount !== null ? ` (${queueCount})` : ''}`],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key === 'todos' ? '' : key)}
                className={cn(
                  'rounded-full px-4 py-2 text-[13px] font-medium border transition-all font-display',
                  tab === key ? 'bg-navy text-white border-navy' : 'text-navy-light/80 hover:text-navy border-navy/15 hover:border-navy/30 bg-surface-card',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Cola de revisión: siempre montada (sus modales atienden aperturas
            desde la pestaña "Todos"), la lista solo se pinta en su pestaña. */}
        {canQueue && (
          <PaymentReviewQueue
            ref={queueRef}
            visible={tab === 'revision'}
            canReview={canReview}
            canPlan={canPlan}
            canApplyScholarship={canApplyScholarship}
            onMutated={refetch}
          />
        )}

        {tab === 'todos' && (<>
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          {/* FASE FUTURA: pagos por tarjeta / SINPE directo aún no existen en
              el sistema (hoy todo entra por comprobante o manual) — las cards
              "Por tarjeta"/"Por SINPE" se reactivan cuando se implementen. */}
          {[
            { label: 'Total cobrado', value: totalPaid, color: '#161440' },
            { label: 'Pendientes', value: totalPending, color: '#E9B949' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-2xl p-5 bg-surface-card shadow-[var(--shadow-md)]">
              <p className="text-[11px] uppercase tracking-widest mb-2 font-display text-[rgba(22,20,64,0.60)]">{label}</p>
              <p className="text-xl font-extrabold font-display" style={{ color }}>
                <TotalsDisplay totals={value} defaultHidden={false} revealed={revealAll} />
              </p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 flex-1 min-w-48 bg-surface-card border border-[var(--outline-variant)]">
            <Search size={14} className="text-[rgba(22,20,64,0.60)] shrink-0" />
            <input
              type="search"
              placeholder="Buscar por miembro, concepto..."
              aria-label="Buscar por miembro, concepto"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none font-body text-navy"
            />
          </div>

          {/* Los filtros eran cinco filas de pastillas idénticas, cada una con
              su "Todos" y ninguna con rótulo visible: no se entendía a qué
              categoría pertenecía cada grupo. Pasan a dropdowns rotulados
              (2026-08-27). El aria-label ya existía —los lectores de pantalla sí
              sabían— así que lo que faltaba era decírselo a quien mira. */}
          <div className="flex flex-wrap gap-x-4 gap-y-3">
            <FiltroSelect
              label="Concepto"
              value={entityFilter}
              onChange={v => setEntityFilter(v as typeof entityFilter)}
              options={[
                { value: 'all', label: 'Todos' },
                { value: 'event', label: 'Eventos' },
                { value: 'study_group', label: 'Matrícula (grupos)' },
              ]}
            />
            <FiltroSelect
              label="Forma de pago"
              value={methodFilter}
              onChange={v => setMethodFilter(v as typeof methodFilter)}
              options={[
                // FASE FUTURA: 'card'/'sinpe' se agregan cuando existan.
                { value: 'all', label: 'Todas' },
                { value: 'comprobante', label: 'Comprobante' },
                { value: 'scholarship', label: 'Beca' },
                { value: 'cash', label: 'Efectivo' },
              ]}
            />
            <FiltroSelect
              label="Estado del pago"
              value={statusFilter}
              onChange={v => setStatusFilter(v as 'all' | PaymentStatus)}
              options={[
                { value: 'all', label: 'Todos' },
                { value: 'paid', label: 'Pagado' },
                { value: 'pending', label: 'Pendiente' },
                { value: 'cancelado', label: 'Cancelado' },
                { value: 'failed', label: 'Fallido' },
                { value: 'refunded', label: 'Devuelto' },
              ]}
            />
            {monedasPresentes.length > 1 && (
              <FiltroSelect
                label="Moneda"
                value={currencyFilter}
                onChange={v => setCurrencyFilter(v as 'all' | Currency)}
                options={[
                  { value: 'all', label: 'Todas' },
                  ...monedasPresentes.map(c => ({ value: c, label: c })),
                ]}
              />
            )}
            {/* FIN-4: los tractos son pagos normales y se mezclan con el resto;
                este filtro los aísla para darles seguimiento. */}
            <FiltroSelect
              label="Arreglo de pago"
              value={planFilter}
              onChange={v => setPlanFilter(v as 'all' | 'in_plan')}
              options={[
                { value: 'all', label: 'Todos los pagos' },
                { value: 'in_plan', label: 'Solo en arreglo' },
              ]}
            />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl overflow-hidden bg-surface-card shadow-[var(--shadow-md)]">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[var(--outline-variant)]">
                  {['Miembro', 'Concepto', 'Monto', 'Método', 'Estado', 'Fecha', 'Acciones'].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left text-[11px] uppercase tracking-widest font-display text-[rgba(22,20,64,0.60)]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => (
                  <tr key={p.id} className={`border-b border-[var(--outline-variant)] hover:bg-gray-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-[rgba(22,20,64,0.01)]'}`}>
                    <td className="px-5 py-4">
                      {/* El nombre lleva al perfil: desde la lista de pagos casi
                          siempre hay que ir a ver a la persona, y copiarse el
                          nombre para buscarla en el padrón era el camino largo. */}
                      {p.member_id ? (
                        <Link
                          href={`/miembros/${p.member_id}`}
                          className="text-[13px] font-medium font-body text-navy hover:text-coral transition-colors underline decoration-dotted underline-offset-2"
                        >
                          {p.member_name}
                        </Link>
                      ) : (
                        <p className="text-[13px] font-medium font-body text-navy">{p.member_name}</p>
                      )}
                      <p className="text-[13px] text-[rgba(22,20,64,0.45)] font-body">{p.member_cedula}</p>
                    </td>
                    <td className="px-5 py-4">
                      {/* Qué se está pagando: el NOMBRE del estudio o del
                          evento, y de qué tipo es (2026-08-06). */}
                      <p className="text-[13px] font-body text-navy">{paymentEntityName(toLabel(p)) || p.entity_name}</p>
                      <p className="text-[13px] text-[rgba(22,20,64,0.60)] font-body">
                        {p.kind_label ?? paymentKindLabel(toLabel(p))}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-[13px] font-medium font-body text-navy">
                        <AmountDisplay amount={p.amount} currency={p.currency} revealed={revealAll} />
                      </p>
                    </td>
                    <td className="px-5 py-4"><PaymentMethodBadge method={p.method} /></td>
                    <td className="px-5 py-4"><PaymentStatusBadge status={p.status} /></td>
                    <td className="px-5 py-4">
                      <p className="text-[13px] whitespace-nowrap font-body text-[rgba(22,20,64,0.55)]">
                        {formatDate(p.created_at)}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => openPayment(p)}
                          className="rounded-lg border px-3 py-1.5 text-[13px] transition-colors whitespace-nowrap border-[var(--outline-variant)] text-navy font-body hover:bg-surface-low"
                        >
                          Abrir
                        </button>
                        {canFinanceEdit && p.status === 'paid' && (
                          <button
                            onClick={() => setRefundTarget(p)}
                            className="rounded-lg border px-3 py-1.5 text-[13px] transition-colors whitespace-nowrap border-[rgba(239,85,84,0.30)] text-coral font-body"
                          >
                            Devolver
                          </button>
                        )}
                        {canFinanceEdit && p.status === 'pending' && p.method === 'sinpe' && (
                          <button
                            onClick={() => setSinpeTarget(p)}
                            className="rounded-lg border px-3 py-1.5 text-[13px] transition-colors whitespace-nowrap border-[rgba(81,157,162,0.30)] text-teal-deep font-body"
                          >
                            Confirmar SINPE
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      {error
                        ? <ErrorState message={error} onRetry={refetch} />
                        : loading
                          ? <p className="px-4 py-10 text-center text-sm text-navy-light/80 font-body">Cargando…</p>
                          : <EmptyState icon={CreditCard} title="No hay pagos que coincidan con los filtros" />}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile: tarjetas */}
          <ul className="md:hidden">
            {filtered.map((p, i) => (
              <li
                key={p.id}
                className="px-4 py-3 space-y-2.5"
                style={i < filtered.length - 1 ? { borderBottom: '1px solid var(--outline-variant)' } : {}}
              >
                <button onClick={() => openPayment(p)} className="flex items-start gap-3 w-full text-left">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium font-body text-navy truncate">{p.member_name}</p>
                    <p className="text-[13px] text-[rgba(22,20,64,0.55)] font-body truncate">
                      {p.description_label ?? paymentDescription(toLabel(p))}
                    </p>
                    <p className="text-[13px] text-[rgba(22,20,64,0.45)] font-body mt-0.5">{formatDate(p.created_at)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <p className="text-[13px] font-medium font-body text-navy">
                      <AmountDisplay amount={p.amount} currency={p.currency} revealed={revealAll} />
                    </p>
                    <PaymentStatusBadge status={p.status} />
                  </div>
                </button>
                <div className="flex items-center gap-2 flex-wrap">
                  <PaymentMethodBadge method={p.method} />
                  <div className="flex-1" />
                  {canFinanceEdit && p.status === 'paid' && (
                    <button
                      onClick={() => setRefundTarget(p)}
                      className="rounded-lg border px-3 py-1.5 text-[13px] transition-colors whitespace-nowrap border-[rgba(239,85,84,0.30)] text-coral font-body"
                    >
                      Devolver
                    </button>
                  )}
                  {canFinanceEdit && p.status === 'pending' && p.method === 'sinpe' && (
                    <button
                      onClick={() => setSinpeTarget(p)}
                      className="rounded-lg border px-3 py-1.5 text-[13px] transition-colors whitespace-nowrap border-[rgba(81,157,162,0.30)] text-teal-deep font-body"
                    >
                      Confirmar SINPE
                    </button>
                  )}
                </div>
              </li>
            ))}
            {filtered.length === 0 && (
              <li>
                {error
                  ? <ErrorState message={error} onRetry={refetch} />
                  : loading
                    ? <p className="px-4 py-8 text-center text-sm text-navy-light/80 font-body">Cargando pagos…</p>
                    : <EmptyState icon={CreditCard} title="No hay pagos que coincidan con los filtros" />}
              </li>
            )}
          </ul>
          {filtered.length > 0 && (
            <LoadMoreFooter
              shown={payments.length}
              total={total}
              hasMore={hasMore}
              loading={loading}
              onLoadMore={loadMore}
              noun="pagos"
              increment={25}
            />
          )}
        </div>
        </>)}
      </div>

      {/* Detalle plano (pago fuera de la cola de revisión: pagado, devuelto…) */}
      {plainDetail && (() => {
        const p = plainDetail
        const rows: [string, React.ReactNode][] = [
          ['Persona', p.member_name],
          ['Cédula', p.member_cedula || '—'],
          ['Concepto', p.description_label ?? paymentDescription(toLabel(p))],
          ['Tipo', p.entity_type === 'event' ? 'Evento' : 'Grupo de estudio'],
          ['Monto', <AmountDisplay key="m" amount={p.amount} currency={p.currency} revealed={revealAll} />],
          ['Creado', formatDateTime(p.created_at)],
          ['Pagado', p.paid_at ? formatDateTime(p.paid_at) : '—'],
        ]
        return (
        <Modal onClose={() => setPlainDetail(null)} titleId="plain-detail-title" width={480}>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 id="plain-detail-title" className="text-base font-bold text-navy font-display">Detalle del pago</h3>
              <div className="flex items-center gap-2">
                <PaymentMethodBadge method={p.method} />
                <PaymentStatusBadge status={p.status} />
              </div>
            </div>
            <div className="rounded-xl border border-outline overflow-hidden">
              {rows.map(([label, value], i) => (
                <div key={label} className={cn('flex gap-3 px-4 py-2.5', i > 0 && 'border-t border-outline')}>
                  <span className="w-32 shrink-0 text-[13px] uppercase tracking-wider text-navy-light/80 font-display">{label}</span>
                  <span className="text-[13px] text-navy font-body">{value}</span>
                </div>
              ))}
            </div>
            {p.notes && (
              <p className="rounded-xl p-3 text-[13px] text-[rgba(22,20,64,0.65)] font-body bg-[rgba(22,20,64,0.04)] border border-[rgba(22,20,64,0.08)]">{p.notes}</p>
            )}
            {canFinance && (
              <Link
                href={`/finanzas/pagos/${p.id}`}
                className="inline-flex items-center text-[13px] text-teal-deep font-body hover:underline"
              >
                Ver detalle completo →
              </Link>
            )}
          </div>
        </Modal>
        )
      })()}

      {/* Refund modal */}
      {refundTarget && (
        <RefundModal
          isOpen
          onClose={() => setRefundTarget(null)}
          onConfirm={handleRefundConfirm}
          payment={refundTarget}
        />
      )}

      {/* SINPE confirm modal */}
      {sinpeTarget && (
        <Modal onClose={() => setSinpeTarget(null)} titleId="confirmar-pago-sinpe" width={448}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--outline-variant)]">
              <p id="confirmar-pago-sinpe" className="text-sm font-bold font-display text-navy">
                Confirmar pago SINPE
              </p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-[13px] font-body text-[rgba(22,20,64,0.70)]">
                <strong>{sinpeTarget.member_name}</strong> — {sinpeTarget.description_label ?? sinpeTarget.entity_name}
              </p>
              <div>
                <label htmlFor="numero-de-confirmacion-sinpe" className="text-[13px] uppercase tracking-widest mb-1.5 block font-display text-[rgba(22,20,64,0.60)]">
                  Número de confirmación SINPE
                </label>
                <input id="numero-de-confirmacion-sinpe"
                  type="text"
                  value={sinpeConf}
                  onChange={e => setSinpeConf(e.target.value)}
                  placeholder="ej. SINPE-2026-05-12345"
                  className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none border-[var(--outline-variant)] font-body text-navy"
                />
              </div>
              <div>
                <label htmlFor="fecha-de-transferencia" className="text-[13px] uppercase tracking-widest mb-1.5 block font-display text-[rgba(22,20,64,0.60)]">
                  Fecha de transferencia
                </label>
                <input id="fecha-de-transferencia"
                  type="date"
                  value={sinpeDate}
                  onChange={e => setSinpeDate(e.target.value)}
                  className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none border-[var(--outline-variant)] font-body text-navy"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t flex gap-3 border-[var(--outline-variant)]">
              <button onClick={() => setSinpeTarget(null)}
                className="flex-1 rounded-full border py-2.5 text-sm transition-colors border-[var(--outline-variant)] font-body text-[rgba(22,20,64,0.70)]">
                Cancelar
              </button>
              <button
                onClick={handleConfirmSinpe}
                disabled={!sinpeConf}
                className="flex-1 rounded-full py-2.5 text-sm text-white transition-all disabled:opacity-40 bg-teal-deep font-body">
                Confirmar pago
              </button>
            </div>
        </Modal>
      )}

    </>
  )
}

export default function PagosPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-sm text-navy-light/80 font-body">Cargando...</div>
      </div>
    }>
      <PagosContent />
    </Suspense>
  )
}

/** Un filtro con su rótulo encima. Existe para que se vea a qué categoría
 *  pertenece cada desplegable: antes eran cinco grupos de pastillas iguales en
 *  fila y no había forma de saber cuál era cuál. */
function FiltroSelect({ label, value, onChange, options }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  const id = `filtro-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[11px] uppercase tracking-wider text-navy-light/80 font-display">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="rounded-xl border border-navy/15 bg-surface-card px-3 py-1.5 text-[13px] text-navy outline-none focus:border-navy/30 font-body"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}
