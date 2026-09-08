'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { ShieldCheck, X } from 'lucide-react'
import { Modal } from '@/components/shared/Modal'
import { useToast } from '@/components/shared/Toast'
import { useStudyPlans } from '@/hooks/useStudyPlans'
import { useAuth } from '@/hooks/useAuth'
import { STUDY_ADMIN_ROLES } from '@/lib/auth/roles'
import { etiquetaVigencia } from '@/lib/studies/exception-scope'
import {
  validateExceptionReason, isValidExceptionReason, REASON_MAX,
} from '@/lib/studies/exception-reason'

type Exception = {
  id: string; plan_code: string; plan_name: string
  waived_requirements: string[]; reason: string | null
  bloque_nombre?: string | null; cierre_matricula?: string | null; vigente?: boolean
  granted_by_name: string | null; status: string; created_at: string
}

const REQS: { key: string; label: string }[] = [
  { key: 'donor', label: 'Donante activo' },
  { key: 'attendance', label: 'Asistencia a charlas' },
  { key: 'server', label: 'Servidor en comité' },
  { key: 'prerequisite', label: 'Prerequisito (estudio previo)' },
  { key: 'age', label: 'Rango de edad del grupo' },
]
const REQ_LABEL: Record<string, string> = {
  ...Object.fromEntries(REQS.map(r => [r.key, r.label])), all: 'Todos los requisitos',
  repetir: 'Repetir el curso',
}

/** "Crear excepción de matrícula" en el perfil — solo roles de estudios. Exime a un
 *  miembro de requisitos de un estudio para que se matricule él mismo. */
export function StudyExceptionButton({ memberId, memberName = 'esta persona' }: { memberId: string; memberName?: string }) {
  const toast = useToast()
  const { hasRole, loaded } = useAuth()
  const { studyTypes } = useStudyPlans()
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<Exception[]>([])
  const [planId, setPlanId] = useState('')
  const [waiveAll, setWaiveAll] = useState(false)
  const [waived, setWaived] = useState<Set<string>>(new Set())
  // Aparte de los requisitos: no es perdonar algo que falta, es habilitar un
  // curso que la persona YA aprobó. Por eso no entra en "todos los requisitos".
  const [repetir, setRepetir] = useState(false)
  /** Códigos que la persona YA completó. Se usan solo para avisar: sin esto,
   *  quien otorga marca "todos los requisitos" creyendo que cubre todo y la
   *  excepción no sirve — el estudio sigue bloqueado por "ya lo completaste".
   *  Pasó la primera vez que se usó la función. */
  const [completados, setCompletados] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Planes curriculares activos (la excepción es por plan específico).
  const plans = useMemo(
    () => studyTypes.filter(s => !s.is_archived && s.is_curricular !== false && s.plan_id),
    [studyTypes],
  )

  /** ¿El estudio elegido YA lo completó? Ese es el caso que necesita 'repetir'
   *  y el que se confundía con "todos los requisitos". */
  const yaLoCompleto = useMemo(() => {
    const p = plans.find(x => (x.plan_id ?? '') === planId)
    return !!p && completados.includes(p.code)
  }, [plans, planId, completados])

  const refetch = useCallback(() => {
    fetch(`/api/studies/exceptions?member_id=${memberId}`)
      .then(r => (r.ok ? r.json() : []))
      .then((d: Exception[]) => setList(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [memberId])

  useEffect(() => { if (open) refetch() }, [open, refetch])
  useEffect(() => {
    if (!open) return
    fetch(`/api/matricula/eligibility?member_id=${memberId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setCompletados(d?.profile?.completed_codes ?? []))
      .catch(() => setCompletados([]))
  }, [open, memberId])

  if (loaded && !hasRole(...STUDY_ADMIN_ROLES)) return null

  // `vigente` lo calcula el servidor con el bloque: una excepción puede seguir
  // en 'active' y estar vencida. Mostrar solo el status mentiría.
  const activeList = list.filter(e => e.status === 'active')
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' })

  async function submit() {
    const reqs = [...(waiveAll ? ['all'] : [...waived]), ...(repetir ? ['repetir'] : [])]
    if (!planId || reqs.length === 0 || saving) return
    // La razón es obligatoria (2026-08-04): misma regla que valida el API.
    const reasonError = validateExceptionReason(reason)
    if (reasonError) { setError(reasonError); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/studies/exceptions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId, plan_id: planId, waived_requirements: reqs, reason: reason.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(data?.error || `HTTP ${res.status}`)
      }
      setPlanId(''); setWaiveAll(false); setWaived(new Set()); setReason('')
      refetch()
    } catch (e) {
      console.error('No se pudo crear la excepción:', e)
      setError(e instanceof Error && e.message && !e.message.startsWith('HTTP')
        ? e.message
        : 'No se pudo crear la excepción. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function revoke(id: string) {
    try {
      const res = await fetch(`/api/studies/exceptions/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(data?.error || `HTTP ${res.status}`)
      }
      refetch()
    } catch (e) {
      console.error('No se pudo revocar:', e)
      toast('No se pudo revocar la excepción de matrícula. Intentá de nuevo.', 'error')
    }
  }

  function toggle(key: string) {
    setWaived(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })
  }
  // `repetir` también se limpia: si no, quedaba marcado de la vez anterior y la
  // siguiente excepción salía con permiso para repetir sin que nadie lo pidiera.
  function close() {
    setOpen(false); setPlanId(''); setWaiveAll(false); setWaived(new Set())
    setRepetir(false); setReason(''); setError(null)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-[var(--outline-variant)] px-4 py-2 text-sm text-navy hover:bg-surface-low transition-colors font-body"
      >
        <ShieldCheck size={15} /> Crear excepción de matrícula
      </button>

      {open && (
        <Modal onClose={close} titleId="excepcion-titulo" width={460}>
          <div className="p-6 space-y-5">
            <h3 id="excepcion-titulo" className="text-lg font-extrabold text-navy font-display">Excepciones de matrícula</h3>

            {/* Excepciones activas */}
            {activeList.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] tracking-widest uppercase text-navy-light/80 font-display">Activas</p>
                {activeList.map(e => (
                  <div key={e.id} className="flex items-start justify-between gap-3 rounded-xl bg-surface-low px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-navy font-body">{e.plan_code} — {e.plan_name}</p>
                      <p className="text-[13px] text-navy-light/80 font-body">
                        Exime: {e.waived_requirements.map(r => REQ_LABEL[r] ?? r).join(', ')}
                      </p>
                      <p className={`text-[13px] font-body ${e.vigente === false ? 'text-coral' : 'text-navy-light/80'}`}>
                        {etiquetaVigencia({ cierreMatricula: e.cierre_matricula, bloqueNombre: e.bloque_nombre, hoy })}
                      </p>
                      {e.granted_by_name && <p className="text-[13px] text-navy-light/80 font-body">Otorgada por {e.granted_by_name}</p>}
                    </div>
                    <button onClick={() => revoke(e.id)} aria-label="Revocar excepción" className="shrink-0 rounded-lg p-1 text-navy-light/80 hover:text-coral hover:bg-coral/10 transition-colors">
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Crear nueva */}
            <div className="space-y-3 border-t border-[var(--outline-variant)] pt-4">
              <p className="text-sm text-navy-light/80 font-body">
                Eximí a {memberName} de requisitos de un estudio para que pueda matricularse.
              </p>
              <div className="space-y-1">
                <label htmlFor="estudio" className="text-[11px] tracking-widest uppercase text-navy-light/80 font-display">Estudio</label>
                <select id="estudio"
                  value={planId}
                  onChange={e => setPlanId(e.target.value)}
                  className="w-full rounded-xl bg-surface-low px-3 py-2.5 text-sm text-navy outline-none focus:ring-1 focus:ring-coral/30 font-body"
                >
                  <option value="">Seleccionar estudio…</option>
                  {plans.map(p => <option key={p.plan_id ?? p.code} value={p.plan_id ?? ''}>{p.code} — {p.name}</option>)}
                </select>
                {/* El aviso que faltaba. "Todos los requisitos" NO habilita
                    repetir —son decisiones distintas— y sin decirlo acá la
                    excepción se otorga, se guarda bien, y el estudio sigue sin
                    aparecer en Matrícula sin que nadie entienda por qué. */}
                {yaLoCompleto && !repetir && (
                  <p role="alert" className="mt-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[13px] text-navy font-body">
                    <strong className="text-amber-700">Ya completó este estudio.</strong>{' '}
                    Marcá <strong>«Repetir el curso»</strong> abajo, o no le va a aparecer en Matrícula.
                    «Todos los requisitos» no alcanza para eso.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <span className="text-[11px] tracking-widest uppercase text-navy-light/80 font-display">Requisitos a eximir</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="accent-coral" checked={waiveAll} onChange={e => setWaiveAll(e.target.checked)} />
                  <span className="text-[13px] text-navy font-body font-medium">Eximir de todos los requisitos</span>
                </label>
                {!waiveAll && REQS.map(r => (
                  <label key={r.key} className="flex items-center gap-2 cursor-pointer pl-4">
                    <input type="checkbox" className="accent-coral" checked={waived.has(r.key)} onChange={() => toggle(r.key)} />
                    <span className="text-[13px] text-navy-light/80 font-body">{r.label}</span>
                  </label>
                ))}
              </div>

              {/* "Repetir el curso" va APARTE de la lista de arriba, y no lo
                  arrastra "eximir de todos": no es perdonar un requisito que
                  falta, es habilitar un estudio que la persona YA aprobó.
                  Mezclarlo haría que "todos los requisitos" habilitara repetir
                  sin que nadie lo decidiera.

                  Faltaba renderizarlo: el estado existía y el aviso de arriba
                  mandaba a marcar «Repetir el curso», pero la casilla no estaba
                  en la pantalla. Quedaba una instrucción imposible de seguir. */}
              <div className="space-y-1.5 pt-1 border-t border-t-[var(--outline-variant)]">
                <span className="text-[11px] tracking-widest uppercase text-navy-light/80 font-display">
                  Estudios ya aprobados
                </span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox" className="accent-coral"
                    checked={repetir}
                    onChange={e => setRepetir(e.target.checked)}
                  />
                  <span className="text-[13px] text-navy font-body font-medium">Repetir el curso</span>
                </label>
                <p className="text-[13px] text-navy-light/80 font-body pl-6">
                  Déjalo sin marcar salvo que ya lo haya completado y lo quiera llevar de nuevo.
                </p>
              </div>

              <div className="space-y-1">
                <label htmlFor="exc-reason" className="text-[11px] tracking-widest uppercase text-navy-light/80 font-display">
                  Razón *
                </label>
                <textarea
                  id="exc-reason"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  rows={2}
                  maxLength={REASON_MAX}
                  aria-required="true"
                  aria-invalid={reason.trim() !== '' && !isValidExceptionReason(reason) ? true : undefined}
                  className="w-full rounded-xl bg-surface-low px-3 py-2.5 text-sm text-navy outline-none focus:ring-1 focus:ring-coral/30 font-body resize-none"
                  placeholder="Ej.: lleva 3 años sirviendo en alabanza y el sistema no registra su asistencia a charlas."
                />
                <p className="text-[13px] text-navy-light/80 font-body">
                  Queda registrada con tu nombre: explicá por qué se hace la excepción.
                </p>
              </div>

              {error && <p className="text-[13px] text-coral font-body">{error}</p>}
              <div className="flex gap-2">
                <button onClick={close} className="flex-1 rounded-full border border-[var(--outline-variant)] py-2.5 text-sm text-navy-light hover:bg-surface-low transition-colors font-body">Cerrar</button>
                <button
                  onClick={submit}
                  // Con SOLO "repetir" ya hay algo que otorgar: es una excepción
                  // válida por sí sola (la persona cumple todo, solo necesita
                  // permiso para repetir). Antes el botón exigía además un
                  // requisito eximido, así que ese caso no se podía guardar.
                  disabled={!planId || (!waiveAll && waived.size === 0 && !repetir) || !isValidExceptionReason(reason) || saving}
                  className="flex-1 rounded-full bg-coral py-2.5 text-sm text-white hover:bg-coral-deep transition-colors disabled:opacity-40 font-body"
                >
                  {saving ? 'Creando…' : 'Crear excepción'}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
