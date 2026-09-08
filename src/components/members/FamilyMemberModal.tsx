'use client'

import { useState, useEffect } from 'react'
import { Search, UserCheck, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { validarAltaDePersona, noLlevaCuenta } from '@/lib/members/alta-persona'
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABEL } from '@/lib/cedula'
import { calcAge } from '@/lib/format'
import { Modal } from '@/components/shared/Modal'

// Draft de un integrante de familia, reutilizable en alta de miembro y check-in.
export type FamilyDraft =
  | { kind: 'linked'; member_id: string; first_name: string; last_name: string; cedula: string | null; relation: string }
  | { kind: 'new'; first_name: string; last_name: string; cedula: string | null; document_type: string; birth_date: string | null; phone: string | null; email: string | null; relation: string }

const RELATIONS = ['Cónyuge', 'Hijo/a', 'Padre', 'Madre', 'Hermano/a', 'Otro']

const inputCls = 'w-full rounded-xl bg-surface-low px-3 py-2.5 text-sm text-navy placeholder-navy-light/50 outline-none focus:ring-1 focus:ring-coral/30 transition-all border-0'

type Found = { id: string; first_name: string; last_name: string; cedula: string | null; photo_url?: string | null }

export function FamilyMemberModal({ defaultLastName = '', existingIds = [], onAdd, onClose }: {
  defaultLastName?: string
  existingIds?: string[]
  onAdd: (draft: FamilyDraft) => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<'search' | 'new'>('search')
  const [cedula, setCedula] = useState('')
  const [documentType, setDocumentType] = useState<string>('cedula')
  const [searching, setSearching] = useState(false)
  const [found, setFound] = useState<Found | null>(null)
  const [searched, setSearched] = useState(false)
  const [relation, setRelation] = useState('')

  // Flujo B — nuevo
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState(defaultLastName)
  const [birthDate, setBirthDate] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Búsqueda por cédula (debounced) en la BD real.
  useEffect(() => {
    if (mode !== 'search') return
    const q = cedula.trim()
    if (q.length < 4) { setFound(null); setSearched(false); return }
    let alive = true
    setSearching(true)
    const t = setTimeout(() => {
      fetch(`/api/members?search=${encodeURIComponent(q)}&pageSize=5`)
        .then(r => (r.ok ? r.json() : { members: [] }))
        .then(d => {
          if (!alive) return
          const norm = (s: string) => s.replace(/[-\s]/g, '')
          const match = (d.members ?? []).find((m: Found) => m.cedula && norm(m.cedula) === norm(q))
          setFound(match ?? null)
          setSearched(true)
        })
        .catch(() => { if (alive) { setFound(null); setSearched(true) } })
        .finally(() => { if (alive) setSearching(false) })
    }, 350)
    return () => { alive = false; clearTimeout(t) }
  }, [cedula, mode])

  const isMinor = birthDate ? calcAge(birthDate) < 18 : false
  // El correo se le pide a todo el que pueda tener cuenta (12+), no solo a los
  // adultos: antes el campo ni siquiera aparecía para un chico de 15, así que
  // ese integrante quedaba sin forma de activar su acceso.
  const sinCuenta = noLlevaCuenta(birthDate)

  function addLinked() {
    if (!found || !relation) { setError('Seleccioná la relación.'); return }
    if (existingIds.includes(found.id)) { setError('Esta persona ya está en la lista.'); return }
    onAdd({ kind: 'linked', member_id: found.id, first_name: found.first_name, last_name: found.last_name, cedula: found.cedula, relation })
  }

  function addNew() {
    if (!relation) { setError('Seleccioná la relación.'); return }
    // Misma regla que en el alta desde el check-in: la cédula es obligatoria
    // salvo que la fecha de nacimiento diga que es menor de edad.
    const chequeo = validarAltaDePersona({
      first_name: firstName, last_name: lastName || defaultLastName,
      cedula, birth_date: birthDate, document_type: documentType,
      email, exigirCorreo: true,
    })
    if (!chequeo.ok) {
      setError(chequeo.errores.cedula ?? chequeo.errores.email
        ?? chequeo.errores.first_name ?? chequeo.errores.last_name ?? null)
      return
    }
    onAdd({
      kind: 'new',
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      cedula: cedula.trim() || null,
      document_type: documentType,
      birth_date: birthDate || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      relation,
    })
  }

  return (
    <Modal onClose={onClose} titleId="family-member-title" width={448}>
      <div className="p-5 space-y-4">
        <h3 id="family-member-title" className="text-base font-bold text-navy font-display">
          Agregar integrante
        </h3>

        {/* Tabs flujo A / B */}
        <div className="flex gap-2">
          {([['search', 'Buscar por cédula', Search], ['new', 'Crear nuevo', UserPlus]] as const).map(([m, label, Icon]) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null) }}
              className={cn(
                'flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium border transition-all font-body',
                mode === m ? 'bg-navy text-white border-navy' : 'text-navy-light/80 hover:bg-surface-low',
              )}
              style={{ borderColor: mode === m ? undefined : 'var(--outline-variant)' }}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {/* Flujo A — buscar */}
        {mode === 'search' && (
          <div className="space-y-3">
            <input
              autoFocus
              value={cedula}
              onChange={e => { setCedula(e.target.value); setError(null) }}
              placeholder="Cédula del integrante…"
              className={cn(inputCls, 'font-mono')}
            />
            {searching && <p className="text-[13px] text-navy-light/80 font-body">Buscando…</p>}

            {found && (
              <div className="rounded-xl bg-teal-soft/15 p-3 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-teal-deep flex items-center justify-center text-[13px] font-bold text-white font-display">
                    {(found.first_name[0] + found.last_name[0]).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-navy flex items-center gap-1 font-body">
                      <UserCheck size={13} className="text-teal-deep" /> {found.first_name} {found.last_name}
                    </p>
                    <p className="text-[13px] text-navy-light/80">{found.cedula}</p>
                  </div>
                </div>
                <select value={relation} onChange={e => { setRelation(e.target.value); setError(null) }} className={cn(inputCls, 'font-body')}>
                  <option value="">Relación…</option>
                  {RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                {error && <p className="text-[13px] text-coral font-body">{error}</p>}
                <button onClick={addLinked} className="w-full rounded-xl bg-coral py-2.5 text-sm font-medium text-white hover:bg-coral-deep transition-colors font-body">
                  Vincular integrante
                </button>
              </div>
            )}

            {searched && !found && !searching && cedula.trim().length >= 4 && (
              <div className="rounded-xl bg-surface-low p-3 text-center space-y-2">
                <p className="text-[13px] text-navy-light/80 font-body">
                  No se encontró a nadie con esa cédula.
                </p>
                <button onClick={() => { setMode('new'); setError(null) }} className="text-[13px] font-medium text-coral hover:underline font-body">
                  Crear integrante nuevo →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Flujo B — nuevo */}
        {mode === 'new' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Nombre" className={cn(inputCls, 'font-body')} />
              <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder={defaultLastName || 'Apellidos'} className={cn(inputCls, 'font-body')} />
            </div>
            <select
              value={documentType}
              onChange={e => { setDocumentType(e.target.value); setError(null) }}
              aria-label="Tipo de documento"
              className={cn(inputCls, 'font-body')}
            >
              {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{DOCUMENT_TYPE_LABEL[t]}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input
                value={cedula}
                onChange={e => { setCedula(e.target.value); setError(null) }}
                placeholder={`${documentType === 'cedula' ? 'Cédula' : 'Documento'}${isMinor ? ' (opcional)' : ' *'}`}
                aria-label={isMinor ? 'Documento, opcional para menores' : 'Documento, obligatorio'}
                className={cn(inputCls, 'font-mono')}
              />
              <div className="relative">
                <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} className={cn(inputCls, 'font-body')} />
                {isMinor && (
                  <span className="absolute -top-2 right-2 rounded-full bg-coral px-2 py-0.5 text-[11px] font-bold text-white font-display">Menor</span>
                )}
              </div>
            </div>
            {!sinCuenta && (
              <div className="grid grid-cols-2 gap-3">
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono" className={cn(inputCls, 'font-body')} />
                <input
                  type="email" value={email}
                  onChange={e => { setEmail(e.target.value); setError(null) }}
                  placeholder="Correo *"
                  aria-label="Correo, obligatorio para crearle la cuenta"
                  className={cn(inputCls, 'font-body')}
                />
              </div>
            )}
            <select value={relation} onChange={e => { setRelation(e.target.value); setError(null) }} className={cn(inputCls, 'font-body')}>
              <option value="">Relación…</option>
              {RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            {error && <p className="text-[13px] text-coral font-body">{error}</p>}
            <button onClick={addNew} className="w-full rounded-xl bg-coral py-2.5 text-sm font-medium text-white hover:bg-coral-deep transition-colors font-body">
              Agregar integrante
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
