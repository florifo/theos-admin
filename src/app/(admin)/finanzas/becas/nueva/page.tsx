'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, Check, X } from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'
import { AccessDenied } from '@/components/shared/AccessDenied'
import { useToast } from '@/components/shared/Toast'
import { usePublicEvents } from '@/hooks/useEvents'
import { useStudyPlans } from '@/hooks/useStudyPlans'
import { REDIRECT_AFTER_SAVE_MS } from '@/lib/constants'
import { formatCRC } from '@/lib/format'

type EntityOption = { id: string; name: string; amount: number }

export default function NuevoCuponPage() {
  const router = useRouter()
  const { can, loaded } = usePermissions()
  // usePublicEvents (no requiere permiso 'eventos'): finanzas/becas puede no
  // tener acceso al módulo de eventos, pero igual necesita listar destinos.
  const { events } = usePublicEvents()
  const { studyTypes } = useStudyPlans()

  const [entityType, setEntityType] = useState<'event' | 'study_plan'>('study_plan')
  const [entityQuery, setEntityQuery] = useState('')
  const [selectedEntity, setSelectedEntity] = useState<EntityOption | null>(null)
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage')
  const [percentage, setPercentage] = useState(50)
  const [fixedAmount, setFixedAmount] = useState('')
  const [code, setCode] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const toast = useToast()
  const [saving, setSaving] = useState(false)

  const PLANS: EntityOption[] = useMemo(
    () => studyTypes
      .filter(p => !p.is_archived && p.requires_payment && p.plan_id)
      .map(p => ({ id: p.plan_id!, name: `${p.code ?? ''} — ${p.name}`.trim(), amount: p.cost })),
    [studyTypes],
  )
  const EVENTS: EntityOption[] = useMemo(
    () => events.filter(e => e.requires_payment).map(e => ({ id: e.id, name: e.name, amount: e.payment_amount ?? 0 })),
    [events],
  )

  const entityList = entityType === 'study_plan' ? PLANS : EVENTS
  const entityResults = useMemo(() => {
    if (selectedEntity) return []
    const q = entityQuery.trim().toLowerCase()
    if (!q) return entityList.slice(0, 8)
    return entityList.filter(e => e.name.toLowerCase().includes(q)).slice(0, 8)
  }, [entityQuery, selectedEntity, entityList])

  const originalAmount = selectedEntity?.amount ?? 0
  const discountAmount = discountType === 'percentage'
    ? Math.round(originalAmount * percentage / 100)
    : Math.min(Number(fixedAmount) || 0, originalAmount)
  const finalAmount = Math.max(0, originalAmount - discountAmount)
  const isFullScholarship = originalAmount > 0 && finalAmount === 0

  function generateCode() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
    setCode(Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''))
  }

  async function handleCreate() {
    if (!selectedEntity || !code.trim() || !expiresAt || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/scholarships/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: entityType,
          plan_id: entityType === 'study_plan' ? selectedEntity.id : null,
          event_id: entityType === 'event' ? selectedEntity.id : null,
          discount_type: discountType,
          discount_value: discountType === 'percentage' ? percentage : discountAmount,
          code: code.trim(),
          expires_at: new Date(expiresAt).toISOString(),
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error)
      toast('Cupón creado exitosamente', 'success')
      setTimeout(() => router.push('/finanzas/becas'), REDIRECT_AFTER_SAVE_MS)
    } catch (e) {
      setSaving(false)
      toast(e instanceof Error && e.message ? e.message : 'No se pudo crear el cupón. Revisá los datos e intentá de nuevo.', 'error')
    }
  }

  if (loaded && !can('becas', 'edit')) return <AccessDenied />

  return (
    <div className="space-y-6">
      <div className="rounded-2xl px-6 py-5 flex items-center gap-3 bg-navy shadow-[var(--shadow-md)]">
        <button
          onClick={() => router.push('/finanzas/becas')}
          className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-white/10 transition-all text-white/80"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl text-white font-display font-extrabold tracking-[-0.02em]">Crear cupón</h1>
          <p className="text-[13px] text-white/80 mt-0.5 font-body">Cupón genérico de descuento, con código y vencimiento</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 rounded-2xl p-6 space-y-6 bg-surface-card shadow-[var(--shadow-md)]">

          <div>
            <span className="text-[13px] uppercase tracking-widest mb-2 block font-display text-navy-light/80">1. Destino</span>
            <div className="grid grid-cols-2 gap-2">
              {([['study_plan', 'Estudio'], ['event', 'Evento']] as const).map(([v, l]) => (
                <button key={v} onClick={() => { setEntityType(v); setSelectedEntity(null); setEntityQuery('') }}
                  className={`rounded-xl p-3 text-sm font-medium border transition-all text-left font-body ${entityType === v ? 'border-coral bg-coral/5 text-coral' : 'border-outline bg-surface-low text-navy/80'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-[13px] uppercase tracking-widest mb-2 block font-display text-navy-light/80">
              2. {entityType === 'study_plan' ? 'Estudio' : 'Evento'}
            </span>
            {selectedEntity ? (
              <div className="flex items-center gap-3 rounded-xl p-3.5 bg-teal-soft/10 border border-teal-deep/25">
                <div className="flex-1">
                  <p className="text-sm font-medium font-body text-navy">{selectedEntity.name}</p>
                  <p className="text-[13px] text-navy-light/80 font-body">{formatCRC(selectedEntity.amount)}</p>
                </div>
                <button onClick={() => { setSelectedEntity(null); setEntityQuery('') }} aria-label="Quitar destino seleccionado">
                  <X size={16} className="text-navy-light/80" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="flex items-center gap-2 rounded-xl border px-3 py-2.5 border-[var(--outline-variant)]">
                  <Search size={14} className="text-navy-light/80" />
                  <input
                    type="text"
                    placeholder={`Buscar ${entityType === 'study_plan' ? 'estudio' : 'evento'}...`}
                    value={entityQuery}
                    onChange={e => setEntityQuery(e.target.value)}
                    className="flex-1 bg-transparent text-sm outline-none font-body text-navy"
                  />
                </div>
                {entityResults.length > 0 && (
                  <div className="mt-1 rounded-xl border overflow-hidden border-[var(--outline-variant)]">
                    {entityResults.map(e => (
                      <button key={e.id} onClick={() => { setSelectedEntity(e); setEntityQuery('') }}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface-low transition-colors border-b last:border-0 text-left border-[var(--outline-variant)]">
                        <p className="text-[13px] font-body text-navy">{e.name}</p>
                        <p className="text-[13px] text-teal-deep font-body">{formatCRC(e.amount)}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <span className="text-[13px] uppercase tracking-widest mb-2 block font-display text-navy-light/80">3. Tipo de descuento</span>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {([['percentage', 'Porcentaje'], ['fixed', 'Monto fijo']] as const).map(([v, l]) => (
                <button key={v} onClick={() => setDiscountType(v)}
                  className={`rounded-xl p-3 text-sm font-medium border transition-all text-left font-body ${discountType === v ? 'border-coral bg-coral/5 text-coral' : 'border-outline bg-surface-low text-navy/80'}`}>
                  {l}
                </button>
              ))}
            </div>
            {discountType === 'percentage' ? (
              <div className="flex items-center gap-3">
                <input type="range" min={0} max={100} step={5} value={percentage} onChange={e => setPercentage(Number(e.target.value))} className="flex-1 accent-coral" />
                <input type="number" min={0} max={100} value={percentage} onChange={e => setPercentage(Math.max(0, Math.min(100, Number(e.target.value))))}
                  className="w-20 rounded-xl border px-3 py-2 text-sm text-center outline-none border-[var(--outline-variant)] font-body text-navy" />
                <span className="text-sm font-medium text-navy font-body">%</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-navy font-display">₡</span>
                <input type="number" min={0} value={fixedAmount} onChange={e => setFixedAmount(e.target.value)} placeholder="Monto del descuento"
                  className="flex-1 rounded-xl border px-4 py-2.5 text-sm outline-none border-[var(--outline-variant)] font-body text-navy" />
              </div>
            )}
          </div>

          <div>
            <label htmlFor="4-codigo" className="text-[13px] uppercase tracking-widest mb-2 block font-display text-navy-light/80">4. Código</label>
            <div className="flex gap-2">
              <input id="4-codigo"
                value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Ej. BECA2026"
                className="flex-1 rounded-xl border px-4 py-2.5 text-sm outline-none font-mono border-[var(--outline-variant)] text-navy"
              />
              <button onClick={generateCode} type="button" className="rounded-xl border border-outline px-4 py-2.5 text-sm text-navy-light hover:bg-surface-low transition-colors font-body">
                Generar
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="expires" className="text-[13px] uppercase tracking-widest mb-2 block font-display text-navy-light/80">5. Vencimiento</label>
            <input
              id="expires" type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
              className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none border-[var(--outline-variant)] font-body text-navy"
            />
          </div>

          <button
            onClick={handleCreate}
            disabled={!selectedEntity || !code.trim() || !expiresAt || saving}
            className="w-full rounded-full py-3 text-sm text-white font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-coral font-body"
          >
            {saving ? 'Creando…' : 'Crear cupón'}
          </button>
        </div>

        <div className="lg:sticky lg:top-6">
          {selectedEntity ? (
            <div className="rounded-2xl overflow-hidden border border-navy/10 bg-surface-card shadow-[var(--shadow-md)]">
              <div className="px-5 py-4 space-y-2 bg-navy/[0.03]">
                <div className="flex justify-between text-sm font-body">
                  <span className="text-navy-light/80">Costo original:</span>
                  <span className="text-navy">{formatCRC(originalAmount)}</span>
                </div>
                <div className="flex justify-between text-sm font-body">
                  <span className="text-navy-light/80">Descuento ({discountType === 'percentage' ? `${percentage}%` : 'fijo'}):</span>
                  <span className="text-coral">-{formatCRC(discountAmount)}</span>
                </div>
                <div className="h-px bg-navy/10" />
                <div className="flex justify-between text-sm font-bold font-body">
                  <span className="text-navy">Costo final por persona:</span>
                  <span className="text-teal-deep">{formatCRC(finalAmount)}</span>
                </div>
              </div>
              {isFullScholarship && (
                <div className="px-5 py-3 flex items-center gap-2 bg-teal-soft/20">
                  <Check size={14} className="text-teal-deep shrink-0" />
                  <p className="text-[13px] font-medium text-teal-deep font-body">Descuento completo — inscripción gratuita para quien lo use</p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed p-6 text-center border-[var(--outline-variant)] bg-surface-card">
              <p className="text-[13px] text-navy/80 font-body">Seleccioná un estudio o evento para ver el cálculo del descuento.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
