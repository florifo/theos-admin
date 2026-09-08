'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { GraduationCap, Plus, Loader2, AlertTriangle } from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'
import { useRowSelection } from '@/hooks/useRowSelection'
import { BulkActionBar } from '@/components/shared/BulkActionBar'
import { AccessDenied } from '@/components/shared/AccessDenied'
import { EmptyState } from '@/components/shared/EmptyState'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import { ActiveWarningModal } from '@/components/shared/ActiveWarningModal'
import { Modal } from '@/components/shared/Modal'
import { useToast } from '@/components/shared/Toast'
import { cn } from '@/lib/utils'
import { formatDate, formatDateTime, formatMoney } from '@/lib/format'
import { formatDiscount } from '@/lib/finance/payment-breakdown'
import { previewApproval, QUICK_PERCENTAGES, quickLabel } from '@/lib/finance/scholarship-approval'
// MEMBER_LOOKUP_URL: el rol 'becas' no tiene el módulo miembros y el
// buscador quedaba vacío (bug 2026-08-04).
import { MemberCombobox, MEMBER_LOOKUP_URL, type MemberHit } from '@/components/shared/MemberCombobox'
import type { FinanceRequest } from '@/types/finance'

type Scholarship = {
  /** INT-3: moneda del descuento fijo. */
  currency?: string | null
  id: string
  kind: 'asignada' | 'generica'
  member_id: string | null
  member_name: string | null
  entity_type: 'study_plan' | 'event'
  entity_name: string
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  code: string | null
  expires_at: string | null
  approval_type: 'total' | 'parcial' | null
  status: 'active' | 'used' | 'revoked'
  used_count: number
  created_at: string
  /** BEC-1: último envío por correo del código. */
  email_sent_at: string | null
  email_sent_to: string | null
}

const STATUS_LABEL: Record<string, string> = { active: 'Activa', used: 'Usada', revoked: 'Revocada' }
const STATUS_BADGE: Record<string, string> = {
  active: 'bg-teal-soft/30 text-teal-deep', used: 'bg-navy/10 text-navy', revoked: 'bg-coral-soft/20 text-coral',
}

export default function BecasPage() {
  const { can, loaded } = usePermissions()
  const canView = can('becas', 'view')
  const canEdit = can('becas', 'edit')
  const toast = useToast()

  const [tab, setTab] = useState<'cupones' | 'solicitudes'>('cupones')

  // ── Cupones/becas ────────────────────────────────────────────────────────
  const [coupons, setCoupons] = useState<Scholarship[]>([])
  const [couponsLoading, setCouponsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'used' | 'revoked'>('all')

  const refetchCoupons = useCallback(() => {
    setCouponsLoading(true)
    fetch('/api/scholarships/coupons?kind=generica')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setCoupons(d?.items ?? []))
      .catch(() => setCoupons([]))
      .finally(() => setCouponsLoading(false))
  }, [])
  useEffect(() => { if (canView && tab === 'cupones') refetchCoupons() }, [canView, tab, refetchCoupons])

  const filteredCoupons = useMemo(
    () => (statusFilter === 'all' ? coupons : coupons.filter(c => c.status === statusFilter)),
    [coupons, statusFilter],
  )
  const sel = useRowSelection(filteredCoupons.filter(c => c.status === 'active').map(c => c.id))

  const [confirmRevoke, setConfirmRevoke] = useState<Scholarship | null>(null)
  const [warnUsed, setWarnUsed] = useState<Scholarship | null>(null)
  const [bulkRevoking, setBulkRevoking] = useState(false)

  // BEC-1: enviar el código de un cupón por correo a una persona elegida.
  const [sendTarget, setSendTarget] = useState<Scholarship | null>(null)
  const [sendMember, setSendMember] = useState<MemberHit | null>(null)
  const [sendBusy, setSendBusy] = useState(false)

  async function doSendEmail() {
    if (!sendTarget || !sendMember || sendBusy) return
    setSendBusy(true)
    try {
      const res = await fetch(`/api/scholarships/${sendTarget.id}/send-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: sendMember.id }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'No se pudo enviar el correo.')
      toast(`Cupón enviado a ${data.sent_to}.`, 'success')
      setSendTarget(null); setSendMember(null)
      refetchCoupons()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo enviar el correo.', 'error')
    } finally {
      setSendBusy(false)
    }
  }

  function requestRevoke(c: Scholarship) {
    if (c.used_count > 0) { setWarnUsed(c); return }
    setConfirmRevoke(c)
  }
  async function doRevoke() {
    if (!confirmRevoke) return
    const res = await fetch(`/api/scholarships/${confirmRevoke.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json().catch(() => null)
      toast(d?.error ?? 'No se pudo revocar.', 'error')
    } else {
      toast('Cupón revocado.', 'success')
      refetchCoupons()
    }
    setConfirmRevoke(null)
  }
  async function bulkRevoke() {
    setBulkRevoking(true)
    let ok = 0, failed = 0
    for (const id of sel.selectedIds) {
      const res = await fetch(`/api/scholarships/${id}`, { method: 'DELETE' })
      if (res.ok) ok++; else failed++
    }
    toast(failed > 0 ? `${ok} revocados, ${failed} no se pudieron revocar.` : `${ok} cupones revocados.`, failed > 0 ? 'error' : 'success')
    sel.clear()
    setBulkRevoking(false)
    refetchCoupons()
  }

  // ── Solicitudes de beca ──────────────────────────────────────────────────
  const [requests, setRequests] = useState<FinanceRequest[]>([])
  const [requestsLoading, setRequestsLoading] = useState(true)
  const refetchRequests = useCallback(() => {
    setRequestsLoading(true)
    fetch('/api/finance/requests?type=scholarship')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: FinanceRequest[]) => setRequests(Array.isArray(d) ? d : []))
      .catch(() => setRequests([]))
      .finally(() => setRequestsLoading(false))
  }, [])
  useEffect(() => { if (canView && tab === 'solicitudes') refetchRequests() }, [canView, tab, refetchRequests])

  const [reviewTarget, setReviewTarget] = useState<FinanceRequest | null>(null)

  if (loaded && !canView) return <AccessDenied />

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-navy px-5 sm:px-6 py-5 shadow-[var(--shadow-md)]">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
              <GraduationCap size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl text-white font-display font-extrabold tracking-[-0.02em]">Becas</h1>
              <p className="mt-0.5 text-sm text-white/80 font-body">Cupones genéricos y solicitudes asignadas</p>
            </div>
          </div>
          {canEdit && tab === 'cupones' && (
            <Link
              href="/finanzas/becas/nueva"
              className="inline-flex items-center gap-1.5 rounded-full bg-coral px-4 py-2 text-sm text-white hover:bg-coral-deep transition-colors font-body"
            >
              <Plus size={15} /> Crear cupón
            </Link>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {([['cupones', 'Cupones genéricos'], ['solicitudes', 'Solicitudes asignadas']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'rounded-full px-4 py-2 text-[13px] font-medium border transition-all font-display',
              tab === id ? 'bg-navy text-white border-navy' : 'text-navy-light/80 hover:text-navy border-transparent hover:border-navy/20',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'cupones' && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            {([['all', 'Todos'], ['active', 'Activos'], ['used', 'Usados'], ['revoked', 'Revocados']] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setStatusFilter(id)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-[13px] font-medium border transition-all font-display',
                  statusFilter === id ? 'bg-navy text-white border-navy' : 'text-navy-light/80 hover:text-navy border-transparent hover:border-navy/20',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {canEdit && sel.count > 0 && (
            <BulkActionBar count={sel.count} onClear={sel.clear} noun="cupones">
              <button
                onClick={bulkRevoke}
                disabled={bulkRevoking}
                className="rounded-full border border-white/25 text-white px-3.5 py-1.5 text-[13px] hover:bg-white/10 transition-colors font-body disabled:opacity-50"
              >
                {bulkRevoking ? 'Revocando…' : 'Revocar seleccionados'}
              </button>
            </BulkActionBar>
          )}

          <div className="rounded-2xl overflow-hidden bg-surface-card shadow-[var(--shadow-md)]">
            {couponsLoading ? (
              <p className="px-4 py-10 text-center text-sm text-navy-light/80 font-body inline-flex items-center gap-2 justify-center w-full"><Loader2 size={15} className="animate-spin" /> Cargando…</p>
            ) : filteredCoupons.length === 0 ? (
              <EmptyState icon={GraduationCap} title="No hay cupones" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {canEdit && (
                        <th className="px-4 py-3 text-left">
                          <input type="checkbox" aria-label="Seleccionar todos" checked={sel.allSelected}
                            ref={el => { if (el) el.indeterminate = sel.someSelected }} onChange={sel.toggleAll} />
                        </th>
                      )}
                      {['Código', 'Destino', 'Descuento', 'Vencimiento', 'Usos', 'Estado', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] tracking-widest uppercase text-navy-light/80 font-display whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCoupons.map((c, idx) => (
                      <tr key={c.id} className={cn('transition-colors', idx % 2 === 1 ? 'bg-surface-low/40' : '')}>
                        {canEdit && (
                          <td className="px-4 py-3">
                            {c.status === 'active' && (
                              <input type="checkbox" aria-label={`Seleccionar ${c.code}`} checked={sel.isSelected(c.id)} onChange={() => sel.toggle(c.id)} />
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3 text-sm font-mono font-medium text-navy">{c.code}</td>
                        <td className="px-4 py-3 text-[13px] text-navy-light/80 font-body">{c.entity_name}</td>
                        <td className="px-4 py-3 text-sm text-navy font-body">{formatDiscount(c.discount_type, c.discount_value, c.currency)}</td>
                        <td className="px-4 py-3 text-[13px] text-navy-light/80 font-body">{c.expires_at ? formatDate(c.expires_at) : '—'}</td>
                        <td className="px-4 py-3 text-[13px] text-navy-light/80 font-body">{c.used_count}</td>
                        <td className="px-4 py-3">
                          <span className={cn('rounded-full px-2.5 py-0.5 text-[13px] font-semibold font-display', STATUS_BADGE[c.status])}>{STATUS_LABEL[c.status]}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canEdit && c.status === 'active' && (
                            <div className="inline-flex items-center gap-2">
                              {/* BEC-1: mandar el código a una persona (dedupe por UI). */}
                              <button
                                onClick={() => { setSendMember(null); setSendTarget(c) }}
                                title={c.email_sent_at ? `Último envío: ${formatDateTime(c.email_sent_at)} a ${c.email_sent_to ?? '—'}` : undefined}
                                className="rounded-full border border-navy/20 text-navy px-3 py-1 text-[13px] hover:bg-navy/5 transition-colors font-body whitespace-nowrap"
                              >
                                {c.email_sent_at ? 'Reenviar correo' : 'Enviar por correo'}
                              </button>
                              <button
                                onClick={() => requestRevoke(c)}
                                className="rounded-full border border-coral/40 text-coral px-3 py-1 text-[13px] hover:bg-coral/5 transition-colors font-body"
                              >
                                Revocar
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'solicitudes' && (
        <div className="rounded-2xl overflow-hidden bg-surface-card shadow-[var(--shadow-md)]">
          {requestsLoading ? (
            <p className="px-4 py-10 text-center text-sm text-navy-light/80 font-body inline-flex items-center gap-2 justify-center w-full"><Loader2 size={15} className="animate-spin" /> Cargando…</p>
          ) : requests.length === 0 ? (
            <EmptyState icon={GraduationCap} title="No hay solicitudes de beca" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {['Persona', 'Destino', 'Motivo', 'Estado', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] tracking-widest uppercase text-navy-light/80 font-display whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r, idx) => (
                    <tr key={r.id} className={cn('transition-colors', idx % 2 === 1 ? 'bg-surface-low/40' : '')}>
                      <td className="px-4 py-3 text-sm font-medium text-navy font-body">{r.member_name}</td>
                      <td className="px-4 py-3 text-[13px] text-navy-light/80 font-body">{r.entity_name ?? '—'}</td>
                      <td className="px-4 py-3 text-[13px] text-navy-light/80 font-body max-w-xs truncate" title={r.reason}>{r.reason}</td>
                      <td className="px-4 py-3">
                        <span className={cn('rounded-full px-2.5 py-0.5 text-[13px] font-semibold font-display',
                          r.status === 'resolved' ? 'bg-teal-soft/30 text-teal-deep'
                          : r.status === 'rejected' ? 'bg-coral-soft/20 text-coral'
                          : 'bg-amber-50 text-amber-700')}>
                          {r.status === 'open' ? 'Abierta' : r.status === 'in_review' ? 'En revisión' : r.status === 'resolved' ? 'Aprobada' : 'Rechazada'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canEdit && (r.status === 'open' || r.status === 'in_review') && (
                          <button
                            onClick={() => setReviewTarget(r)}
                            className="rounded-full bg-navy px-3.5 py-1.5 text-[13px] text-white hover:opacity-90 transition-opacity font-body"
                          >
                            Revisar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <DeleteConfirmModal
        open={!!confirmRevoke}
        title="Revocar cupón"
        description={`Se revocará el cupón "${confirmRevoke?.code}". Esta acción no se puede deshacer.`}
        onConfirm={doRevoke}
        onCancel={() => setConfirmRevoke(null)}
      />
      <ActiveWarningModal
        open={!!warnUsed}
        title="No se puede revocar"
        message={`El cupón "${warnUsed?.code}" ya fue usado ${warnUsed?.used_count} vez/veces. No se puede revocar un cupón con usos registrados.`}
        onClose={() => setWarnUsed(null)}
      />

      {reviewTarget && (
        <ReviewRequestModal
          request={reviewTarget}
          onClose={() => setReviewTarget(null)}
          onDone={() => { setReviewTarget(null); refetchRequests() }}
        />
      )}

      {/* BEC-1: enviar el código del cupón por correo a una persona. */}
      {sendTarget && (
        <Modal onClose={() => !sendBusy && setSendTarget(null)} titleId="send-coupon-title" width={480}>
          <div className="p-6 space-y-4">
            <h3 id="send-coupon-title" className="text-base font-bold text-navy font-display">
              Enviar cupón por correo · <span className="font-mono">{sendTarget.code}</span>
            </h3>
            <p className="text-sm text-navy-light/80 font-body">
              Se le enviará el código, el descuento ({formatDiscount(sendTarget.discount_type, sendTarget.discount_value, sendTarget.currency)})
              y el destino ({sendTarget.entity_name}) al correo registrado de la persona.
            </p>
            {sendTarget.email_sent_at && (
              <p className="rounded-xl bg-amber-50 text-amber-700 px-3 py-2 text-[13px] font-body">
                Este cupón ya se envió el {formatDateTime(sendTarget.email_sent_at)}
                {sendTarget.email_sent_to ? ` a ${sendTarget.email_sent_to}` : ''}. Confirmá solo si querés reenviarlo.
              </p>
            )}
            {sendMember ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-outline px-4 py-2.5">
                <p className="text-sm text-navy font-body">
                  {sendMember.first_name} {sendMember.last_name}
                  {sendMember.email ? <span className="text-navy-light/80"> · {sendMember.email}</span> : null}
                </p>
                <button onClick={() => setSendMember(null)} className="text-[13px] text-navy-light/80 hover:text-navy font-body">
                  Cambiar
                </button>
              </div>
            ) : (
              <MemberCombobox
            searchUrl={MEMBER_LOOKUP_URL}
                onSelect={m => setSendMember(m)}
                placeholder="Buscar a quién enviárselo…"
                autoFocus
                dropdown
                secondaryText={m => m.email ?? 'Sin correo registrado'}
              />
            )}
            {sendMember && !sendMember.email && (
              <p className="text-[13px] text-coral font-body">Esa persona no tiene correo registrado en su perfil.</p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={doSendEmail}
                disabled={!sendMember || !sendMember.email || sendBusy}
                className={cn(
                  'flex-1 rounded-full px-4 py-2.5 text-sm text-white transition-opacity font-body inline-flex items-center justify-center gap-2 bg-navy hover:opacity-90',
                  (!sendMember || !sendMember.email || sendBusy) && 'opacity-50 cursor-not-allowed',
                )}
              >
                {sendBusy ? <><Loader2 size={15} className="animate-spin" /> Enviando…</> : sendTarget.email_sent_at ? 'Reenviar correo' : 'Enviar correo'}
              </button>
              <button
                onClick={() => setSendTarget(null)}
                disabled={sendBusy}
                className="rounded-full border border-[var(--outline-variant)] px-4 py-2.5 text-sm text-navy-light hover:bg-surface-low transition-colors font-body"
              >
                Cancelar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function ReviewRequestModal({ request, onClose, onDone }: {
  request: FinanceRequest; onClose: () => void; onDone: () => void
}) {
  const toast = useToast()
  // FIN-5: 'approve' es un solo camino — el tipo (total/parcial) lo DERIVA la
  // cobertura, no una elección aparte que podía contradecir el monto.
  const [action, setAction] = useState<'approve' | 'reject' | null>(null)
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage')
  const [discountValue, setDiscountValue] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  // Vista previa: cuánto cubre y cuánto queda. Misma cuenta que usa el server
  // al aprobar, así que lo que finanzas ve es lo que se guarda.
  const preview = previewApproval({
    cost: request.entity_cost,
    currency: request.entity_currency,
    discountType,
    discountValue,
  })

  async function submit() {
    if (busy || !action) return
    setBusy(true)
    try {
      const body = action === 'reject'
        ? { action: 'reject', reason: reason.trim() }
        : { action: 'approve', discount_type: discountType, discount_value: Number(discountValue), approval_type: preview.approval_type }
      const res = await fetch(`/api/scholarships/requests/${request.id}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'No se pudo procesar la solicitud.')
      toast('Solicitud procesada.', 'success')
      onDone()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error desconocido', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={() => !busy && onClose()} titleId="review-request-title" width={460}>
      <div className="p-6 space-y-4">
        <h3 id="review-request-title" className="text-base font-bold text-navy font-display">Revisar solicitud de beca</h3>
        <p className="text-sm text-navy-light/80 font-body">
          <strong className="text-navy">{request.member_name}</strong> solicitó una beca para <strong className="text-navy">{request.entity_name ?? '—'}</strong>.
        </p>
        <p className="text-[13px] text-navy-light/80 font-body italic">&quot;{request.reason}&quot;</p>

        {!action && (
          <div className="space-y-2 pt-1">
            {/* FIN-5: atajos. El tipo (total/parcial) sale de la cobertura. */}
            <div className="grid grid-cols-2 gap-2">
              {QUICK_PERCENTAGES.map(pct => (
                <button
                  key={pct}
                  onClick={() => { setDiscountType('percentage'); setDiscountValue(String(pct)); setAction('approve') }}
                  className="rounded-xl bg-teal-deep px-4 py-2.5 text-sm text-white hover:opacity-90 transition-opacity font-body"
                >
                  {quickLabel(pct)}
                </button>
              ))}
            </div>
            <button
              onClick={() => { setDiscountValue(''); setAction('approve') }}
              className="w-full rounded-xl border border-teal-deep text-teal-deep px-4 py-2.5 text-sm hover:bg-teal-deep/5 transition-colors font-body"
            >
              Otro porcentaje o monto
            </button>
            <button onClick={() => setAction('reject')} className="w-full rounded-xl border border-coral/40 text-coral px-4 py-2.5 text-sm hover:bg-coral/5 transition-colors font-body">Rechazar</button>
          </div>
        )}

        {action === 'approve' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setDiscountType('percentage')}
                className={cn('rounded-xl border px-3 py-2 text-[13px] font-body', discountType === 'percentage' ? 'border-coral bg-coral/5' : 'border-outline')}
              >Porcentaje</button>
              <button
                onClick={() => setDiscountType('fixed')}
                className={cn('rounded-xl border px-3 py-2 text-[13px] font-body', discountType === 'fixed' ? 'border-coral bg-coral/5' : 'border-outline')}
              >Monto fijo</button>
            </div>
            <input
              type="number" min={0} value={discountValue} onChange={e => setDiscountValue(e.target.value)}
              placeholder={discountType === 'percentage' ? 'Ej. 50' : 'Ej. 10000'}
              aria-label={discountType === 'percentage' ? 'Porcentaje de descuento' : 'Monto del descuento'}
              className="w-full rounded-xl bg-surface-low px-3 py-2 text-sm text-navy outline-none focus:ring-1 focus:ring-coral/30 font-body"
            />

            {/* FIN-5: vista previa — cuánto cubre sobre el costo real. Es la
                misma cuenta que hace el server al aprobar. */}
            {preview.breakdown && (
              <div className="rounded-xl border border-outline px-3 py-2.5 space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] text-navy-light/80 font-body">Costo</span>
                  <span className="text-[13px] text-navy font-body">{formatMoney(preview.breakdown.price, preview.breakdown.currency)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] text-teal-deep font-body">Cubre la beca</span>
                  <span className="text-[13px] text-teal-deep font-body">−{formatMoney(preview.breakdown.discount, preview.breakdown.currency)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-t border-outline pt-1.5">
                  <span className="text-[13px] uppercase tracking-wider text-navy-light/80 font-display">Queda por pagar</span>
                  <span className="text-base font-bold text-navy font-display">{formatMoney(preview.breakdown.final, preview.breakdown.currency)}</span>
                </div>
                <p className="text-[13px] text-navy-light/80 font-body">
                  Se registra como <strong className="text-navy">{preview.approval_type === 'total' ? 'aprobación total' : 'aprobación parcial'}</strong>
                  {preview.approval_type === 'parcial' && ' — se le envía el correo de beca parcial con el monto a pagar.'}
                </p>
              </div>
            )}
            {preview.error === 'sin_costo' && Number(discountValue) > 0 && (
              <p className="text-[13px] text-navy-light/80 font-body">
                Este destino no tiene costo registrado, así que no se puede mostrar el residual.
                Un porcentaje se aplica igual cuando exista el costo.
              </p>
            )}
            {preview.error === 'porcentaje_fuera_de_rango' && (
              <p className="text-[13px] text-coral-deep font-body" role="alert">El porcentaje no puede pasar de 100.</p>
            )}
            {preview.error === 'monto_mayor_al_costo' && (
              <div className="flex items-start gap-2.5 rounded-xl px-3 py-3 bg-amber-50 border border-amber-200">
                <AlertTriangle size={14} className="text-amber-700 shrink-0 mt-0.5" />
                <p className="text-[13px] text-amber-800 font-body">
                  El monto supera el costo, así que la beca cubre el total. Revisá que no sea un cero de más.
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={() => setAction(null)} disabled={busy} className="rounded-full border border-[var(--outline-variant)] px-4 py-2.5 text-sm text-navy-light hover:bg-surface-low transition-colors font-body">Atrás</button>
              <button
                onClick={submit}
                disabled={busy || !discountValue || Number(discountValue) <= 0 || preview.error === 'porcentaje_fuera_de_rango'}
                className={cn('flex-1 rounded-full px-4 py-2.5 text-sm text-white transition-colors font-body bg-teal-deep hover:opacity-90', (busy || !discountValue) && 'opacity-50 cursor-not-allowed')}
              >
                {busy ? 'Aprobando…' : preview.approval_type === 'total' ? 'Aprobar beca completa' : 'Aprobar parcial'}
              </button>
            </div>
          </div>
        )}

        {action === 'reject' && (
          <div className="space-y-3">
            <textarea
              autoFocus value={reason} onChange={e => setReason(e.target.value)} rows={3}
              placeholder="Motivo del rechazo (obligatorio)…" aria-label="Motivo del rechazo"
              className="w-full rounded-xl bg-surface-low px-3 py-2 text-sm text-navy outline-none focus:ring-1 focus:ring-coral/30 resize-none font-body"
            />
            <div className="flex gap-2 pt-1">
              <button onClick={() => setAction(null)} disabled={busy} className="rounded-full border border-[var(--outline-variant)] px-4 py-2.5 text-sm text-navy-light hover:bg-surface-low transition-colors font-body">Atrás</button>
              <button
                onClick={submit} disabled={busy || !reason.trim()}
                className={cn('flex-1 rounded-full px-4 py-2.5 text-sm text-white transition-colors font-body bg-coral hover:bg-coral-deep', (busy || !reason.trim()) && 'opacity-50 cursor-not-allowed')}
              >
                {busy ? 'Rechazando…' : 'Rechazar y avisar'}
              </button>
            </div>
          </div>
        )}

        {!action && (
          <div className="flex justify-end pt-1">
            <button onClick={onClose} className="rounded-full px-4 py-2 text-sm text-navy-light/80 font-body hover:text-navy transition-colors">Cerrar</button>
          </div>
        )}
      </div>
    </Modal>
  )
}
