import { Loader2 } from 'lucide-react'
import { PhoneInput } from '@/components/shared/PhoneInput'
import { DuplicateWarning } from '@/components/members/DuplicateWarning'
import { CR_PROVINCES } from '@/data/costa-rica-geo'
import { useSedes } from '@/lib/sedes'
import { cn } from '@/lib/utils'
import type { Member } from '@/types/member'
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABEL } from '@/lib/cedula'
import { noLlevaCuenta } from '@/lib/members/alta-persona'

type Step1Data = {
  first_name: string
  last_name: string
  cedula: string
  document_type: string
  email: string
  phone: string
  birth_date: string
  gender: string
  marital_status: string
  province: string
  canton: string
  district: string
  profession: string
  workplace: string
  sede: string
  alergias: string
  medicamentos: string
  señas: string
  emergency_contact_name: string
  emergency_contact_phone: string
}

const inputCls =
  'w-full rounded-xl bg-surface-low px-3 py-2.5 text-sm text-navy placeholder-navy-light/50 outline-none focus:ring-1 focus:ring-coral/30 transition-all border-0 font-body'

const selectCls =
  'w-full rounded-xl bg-surface-low px-3 py-2.5 text-sm text-navy outline-none focus:ring-1 focus:ring-coral/30 transition-all border-0 appearance-none font-body'

function Field({
  label,
  required,
  error,
  htmlFor,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-[13px] font-medium text-navy-light/80 mb-1.5 uppercase tracking-wider font-display"
      >
        {label}
        {required && <span className="text-coral ml-1">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-xs text-coral mt-1 font-body">
          {error}
        </p>
      )}
    </div>
  )
}

type Props = {
  data: Step1Data
  errors: Partial<Record<string, string>>
  duplicate: Member | null
  dismissedDuplicate: boolean
  tseLoading: boolean
  tseBanner: { type: 'success' | 'warn'; text: string } | null
  isMinor: boolean
  availableCantons: string[]
  availableDistricts: string[]
  onData: (field: keyof Step1Data, value: string) => void
  onCedulaBlur: () => void
  onDismissDuplicate: () => void
}

export function NewMemberStep1({
  data,
  errors,
  duplicate,
  dismissedDuplicate,
  tseLoading,
  tseBanner,
  isMinor,
  availableCantons,
  availableDistricts,
  onData,
  onCedulaBlur,
  onDismissDuplicate,
}: Props) {
  const { activeSedes: SEDES } = useSedes()
  const sinCuenta = noLlevaCuenta(data.birth_date)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Nombre" htmlFor="member-first-name" required error={errors.first_name}>
          <input
            id="member-first-name"
            type="text"
            className={inputCls}
            placeholder="Ej: Alejandro"
            value={data.first_name}
            onChange={e => onData('first_name', e.target.value)}
          />
        </Field>
        <Field label="Apellidos" htmlFor="member-last-name" required error={errors.last_name}>
          <input
            id="member-last-name"
            type="text"
            className={inputCls}
            placeholder="Ej: Ruiz Moreno"
            value={data.last_name}
            onChange={e => onData('last_name', e.target.value)}
          />
        </Field>
      </div>

      {/* INT-1: tipo de documento (internacionalización). */}
      <Field label="Tipo de documento" htmlFor="member-document-type">
        <select
          id="member-document-type"
          className={selectCls}
          value={data.document_type || 'cedula'}
          onChange={e => onData('document_type', e.target.value)}
        >
          {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{DOCUMENT_TYPE_LABEL[t]}</option>)}
        </select>
      </Field>

      {/* Obligatorio salvo menores: la fecha de nacimiento de más abajo es la
          que libera el campo (regla en lib/members/alta-persona.ts). */}
      <Field
        label={`${data.document_type === 'cedula' || !data.document_type ? 'Cédula' : 'Número de documento'}${
          isMinor ? ' (opcional para menores)' : ' *'
        }`}
        htmlFor="member-cedula"
        error={errors.cedula}
      >
        <div className="relative">
          <input
            id="member-cedula"
            type="text"
            className={cn(inputCls, tseLoading ? 'pr-9' : '', 'font-mono')}
            placeholder={data.document_type === 'dni_nie' ? 'Ej: 12345678Z' : data.document_type === 'pasaporte' ? 'Ej: AB123456' : 'Ej: 108470291'}
            value={data.cedula}
            onChange={e => onData('cedula', e.target.value)}
            onBlur={onCedulaBlur}
          />
          {tseLoading && (
            <Loader2
              size={15}
              strokeWidth={2}
              className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-navy-light/80"
            />
          )}
        </div>
        {tseBanner && (
          <div
            className={cn(
              'mt-1.5 rounded-lg px-3 py-2 text-xs',
              tseBanner.type === 'success'
                ? 'bg-teal-soft/20 text-teal-deep'
                : 'bg-amber-50 text-amber-700'
            )}
          >
            {tseBanner.text}
          </div>
        )}
        {duplicate && !dismissedDuplicate && (
          <DuplicateWarning
            member={duplicate}
            onDismiss={onDismissDuplicate}
          />
        )}
      </Field>

      <Field label="Sede" htmlFor="member-sede" error={errors.sede}>
        <select
          id="member-sede"
          className={selectCls}
          value={data.sede}
          onChange={e => onData('sede', e.target.value)}
        >
          <option value="">Seleccionar sede…</option>
          {SEDES.map(s => (
            <option key={s.id} value={s.id}>{s.name} — {s.day} {s.time}</option>
          ))}
        </select>
      </Field>

      {isMinor ? (
        <div
          className="rounded-xl bg-teal-soft/20 px-3 py-2.5 text-sm text-teal-deep"
        >
          Modo menor de edad — correo y teléfono opcionales
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Con el correo se le crea la cuenta de acceso; los menores de 12 no
              llevan cuenta (AUTH-1) y por eso ahí es opcional. */}
          <Field
            label={`Correo electrónico${sinCuenta ? ' (opcional para menores de 12)' : ' *'}`}
            htmlFor="member-email"
            error={errors.email}
          >
            <input
              id="member-email"
              type="email"
              className={inputCls}
              placeholder="correo@ejemplo.com"
              value={data.email}
              onChange={e => onData('email', e.target.value)}
            />
          </Field>
          <PhoneInput
            label="Teléfono"
            value={data.phone}
            onChange={val => onData('phone', val)}
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Fecha de nacimiento" htmlFor="member-birth-date">
          <input
            id="member-birth-date"
            type="date"
            className={inputCls}
            value={data.birth_date}
            onChange={e => onData('birth_date', e.target.value)}
          />
        </Field>
        <Field label="Género" htmlFor="member-gender">
          <select
            id="member-gender"
            className={selectCls}
            value={data.gender}
            onChange={e => onData('gender', e.target.value)}
          >
            <option value="">Seleccionar…</option>
            <option value="M">Masculino</option>
            <option value="F">Femenino</option>
            <option value="otro">Otro / No indica</option>
          </select>
        </Field>
      </div>

      <Field label="Estado civil" htmlFor="member-marital-status">
        <select
          id="member-marital-status"
          className={selectCls}
          value={data.marital_status}
          onChange={e => onData('marital_status', e.target.value)}
        >
          <option value="">Seleccionar…</option>
          <option value="Soltero/a">Soltero/a</option>
          <option value="Casado/a">Casado/a</option>
          <option value="Divorciado/a">Divorciado/a</option>
          <option value="Viudo/a">Viudo/a</option>
        </select>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Provincia" htmlFor="member-province">
          <select
            id="member-province"
            className={selectCls}
            value={data.province}
            onChange={e => onData('province', e.target.value)}
          >
            <option value="">Provincia…</option>
            {CR_PROVINCES.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field label="Cantón" htmlFor="member-canton">
          <select
            id="member-canton"
            className={selectCls}
            value={data.canton}
            onChange={e => onData('canton', e.target.value)}
            disabled={!data.province}
          >
            <option value="">Cantón…</option>
            {availableCantons.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Distrito" htmlFor="member-district">
          <select
            id="member-district"
            className={selectCls}
            value={data.district}
            onChange={e => onData('district', e.target.value)}
            disabled={!data.canton}
          >
            <option value="">Distrito…</option>
            {availableDistricts.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Señas" htmlFor="member-senas">
        <textarea
          id="member-senas"
          className={`${inputCls} resize-none`}
          placeholder="Ej: Casa amarilla con portón negro, 100m norte del parque"
          rows={2}
          value={data.señas}
          onChange={e => onData('señas', e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Profesión / Ocupación" htmlFor="member-profession">
          <input
            id="member-profession"
            type="text"
            className={inputCls}
            placeholder="Ej: Ingeniero en Sistemas"
            value={data.profession}
            onChange={e => onData('profession', e.target.value)}
          />
        </Field>
        <Field label="Lugar de trabajo" htmlFor="member-workplace">
          <input
            id="member-workplace"
            type="text"
            className={inputCls}
            placeholder="Ej: Intel Costa Rica"
            value={data.workplace}
            onChange={e => onData('workplace', e.target.value)}
          />
        </Field>
      </div>

      <Field label="Alergias" htmlFor="member-alergias">
        <textarea
          id="member-alergias"
          className={`${inputCls} resize-none`}
          placeholder="Ej: Polen, mariscos, penicilina…"
          rows={2}
          value={data.alergias}
          onChange={e => onData('alergias', e.target.value)}
        />
      </Field>

      <Field label="Medicamentos" htmlFor="member-medicamentos">
        <textarea
          id="member-medicamentos"
          className={`${inputCls} resize-none`}
          placeholder="Ej: Atorvastatina 20mg, Metformina…"
          rows={2}
          value={data.medicamentos}
          onChange={e => onData('medicamentos', e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Nombre contacto de emergencia" htmlFor="member-emergency-name">
          <input
            id="member-emergency-name"
            type="text"
            className={inputCls}
            placeholder="Nombre completo..."
            value={data.emergency_contact_name}
            onChange={e => onData('emergency_contact_name', e.target.value)}
          />
        </Field>
        <PhoneInput
          label="Teléfono de emergencia"
          value={data.emergency_contact_phone}
          onChange={val => onData('emergency_contact_phone', val)}
        />
      </div>
    </div>
  )
}
