'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { normalizePhoneOrNull } from '@/lib/phone'
import { Check } from 'lucide-react'
import { type Member } from '@/types/member'
import { CR_CANTONS, CR_DISTRICTS } from '@/data/costa-rica-geo'
import { cn } from '@/lib/utils'
import { REDIRECT_LONG_AFTER_SAVE_MS } from '@/lib/constants'
import { FamilyMemberModal, type FamilyDraft } from '@/components/members/FamilyMemberModal'
import { validarAltaDePersona, esMenorDeEdad } from '@/lib/members/alta-persona'
import { NewMemberStep1 } from './_components/NewMemberStep1'
import { NewMemberStep2 } from './_components/NewMemberStep2'
import { NewMemberStep3 } from './_components/NewMemberStep3'

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function draftName(d: FamilyDraft): string {
  return `${d.first_name} ${d.last_name}`.trim()
}
function draftInitials(d: FamilyDraft): string {
  return ((d.first_name[0] ?? '?') + (d.last_name[0] ?? '?')).toUpperCase()
}
function draftIsMinor(d: FamilyDraft): boolean {
  return d.kind === 'new' && esMenorDeEdad(d.birth_date)
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

const STEP_LABELS = ['Datos del miembro', 'Núcleo familiar', 'Confirmación']

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center mb-8">
      {STEP_LABELS.map((label, i) => {
        const num = i + 1
        const done = num < current
        const active = num === current

        return (
          <div key={num} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-xs text-white transition-all font-display font-extrabold',
                  done ? 'bg-coral' : active ? 'bg-navy' : 'bg-surface-low text-navy-light/80'
                )}
              >
                {done ? <Check size={14} strokeWidth={2.5} /> : num}
              </div>
              <span
                className={cn(
                  'mt-1 text-[11px] text-center whitespace-nowrap font-body',
                  active ? 'text-navy font-medium' : 'text-navy-light/80'
                )}
              >
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div
                className={cn(
                  'h-0.5 flex-1 mx-2 mb-4 transition-colors',
                  done ? 'bg-coral' : 'bg-surface-low'
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NuevoMiembroPage() {
  const router = useRouter()

  const [step, setStep] = useState(1)

  // Step 1
  const [data, setData] = useState<Step1Data>({
    first_name: '',
    last_name: '',
    cedula: '',
    document_type: 'cedula',
    email: '',
    phone: '',
    birth_date: '',
    gender: '',
    marital_status: '',
    province: '',
    canton: '',
    district: '',
    profession: '',
    workplace: '',
    sede: '',
    alergias: '',
    medicamentos: '',
    señas: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
  })
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})
  const [duplicate, setDuplicate] = useState<Member | null>(null)
  const [dismissedDuplicate, setDismissedDuplicate] = useState(false)
  const [tseLoading, setTseLoading] = useState(false)
  const [tseBanner, setTseBanner] = useState<{ type: 'success' | 'warn'; text: string } | null>(null)

  // Step 2 — ¿viene con familia?
  const [comesWithFamily, setComesWithFamily] = useState<boolean | null>(null)
  const [familyMembers, setFamilyMembers] = useState<FamilyDraft[]>([])
  const [showFamilyModal, setShowFamilyModal] = useState(false)

  // Step 3
  const [sendWhatsapp, setSendWhatsapp] = useState(true)
  const [sendEmail, setSendEmail] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [showToast, setShowToast] = useState(false)

  // ── Derived values ────────────────────────────────────────────────────────

  // Una sola definición de "menor de edad": la del módulo que decide si el
  // documento es obligatorio. Antes esto se calculaba acá con calculateAge y
  // podía discrepar de la validación.
  const isMinor = esMenorDeEdad(data.birth_date)
  const availableCantons = data.province ? (CR_CANTONS[data.province] ?? []) : []
  const availableDistricts = data.canton ? (CR_DISTRICTS[data.canton] ?? []) : []

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleData(field: keyof Step1Data, value: string) {
    setData(prev => {
      const updated = { ...prev, [field]: value }
      if (field === 'province') {
        updated.canton = ''
        updated.district = ''
      }
      if (field === 'canton') {
        updated.district = ''
      }
      return updated
    })
  }

  async function handleCedulaBlur() {
    const cedula = data.cedula.trim()
    if (!cedula) return
    // INT-1: la consulta a Hacienda (autocompletar por cédula) solo aplica a
    // cédulas CR; el chequeo de duplicado de abajo sí corre para todo tipo.
    const isCedulaCR = (data.document_type || 'cedula') === 'cedula'
    // Duplicado real: busca la cédula en la BD.
    try {
      const norm = (s: string) => s.replace(/[-\s]/g, '')
      const res = await fetch(`/api/members?search=${encodeURIComponent(cedula)}&pageSize=5`)
      if (res.ok) {
        const d = await res.json()
        const found = (d.members ?? []).find((m: Member) => m.cedula != null && norm(m.cedula) === norm(cedula))
        setDuplicate(found ?? null)
      } else {
        setDuplicate(null)
      }
    } catch {
      setDuplicate(null)
    }
    setDismissedDuplicate(false)
    setTseLoading(true)
    setTseBanner(null)
    try {
      if (!isCedulaCR) return
      const res = await fetch(`https://api.hacienda.go.cr/fe/ae?identificacion=${cedula}`)
      if (res.ok) {
        const json = await res.json()
        const nombre: string = json?.nombre ?? ''
        if (nombre) {
          const parts = nombre.split(' ')
          handleData('first_name', parts[0] ?? '')
          setTseBanner({ type: 'success', text: `Nombre obtenido del TSE: ${nombre}` })
        } else {
          setTseBanner({ type: 'warn', text: 'Cédula no encontrada en el TSE' })
        }
      } else {
        setTseBanner({ type: 'warn', text: 'No se pudo consultar el TSE' })
      }
    } catch {
      setTseBanner({ type: 'warn', text: 'No se pudo consultar el TSE' })
    } finally {
      setTseLoading(false)
    }
  }

  function proceedFromStep1() {
    const e: Record<string, string> = {}
    if (!data.first_name.trim()) e.first_name = 'Requerido'
    if (!data.last_name.trim()) e.last_name = 'Requerido'
    // Documento obligatorio salvo menores de edad — misma regla y mismo módulo
    // que el alta desde el check-in y que el modal de familia.
    const chequeo = validarAltaDePersona({
      first_name: data.first_name, last_name: data.last_name,
      cedula: data.cedula, birth_date: data.birth_date,
      document_type: data.document_type,
    })
    if (chequeo.errores.cedula) e.cedula = chequeo.errores.cedula
    if (Object.keys(e).length > 0) {
      setErrors(e)
      return
    }
    setErrors({})
    setStep(2)
  }

  function addFamilyDraft(draft: FamilyDraft) {
    setFamilyMembers(prev => [...prev, draft])
    setShowFamilyModal(false)
  }

  function removeFamilyMember(idx: number) {
    setFamilyMembers(prev => prev.filter((_, i) => i !== idx))
  }

  async function createMember(payload: Record<string, unknown>): Promise<string> {
    const res = await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      throw new Error(json?.code === 'duplicate'
        ? `Ya existe un miembro con la cédula o correo de ${payload.first_name}.`
        : `No se pudo crear a ${payload.first_name}.`)
    }
    return json.id as string
  }

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError(null)
    const principalPayload = {
      first_name: data.first_name.trim(),
      last_name: data.last_name.trim(),
      cedula: data.cedula.trim().toUpperCase() || null,
      document_type: data.document_type || 'cedula',
      email: data.email.trim() || null,
      phone: normalizePhoneOrNull(data.phone),
      birth_date: data.birth_date || null,
      gender: data.gender || null,
      marital_status: data.marital_status || null,
      province: data.province || null,
      canton: data.canton || null,
      district: data.district || null,
      occupation: data.profession.trim() || null,
      workplace: data.workplace.trim() || null,
      address: data.señas.trim() || null,
      allergies: data.alergias.trim() || null,
      medications: data.medicamentos.trim() || null,
      emergency_contact_name: data.emergency_contact_name.trim() || null,
      emergency_contact_phone: normalizePhoneOrNull(data.emergency_contact_phone),
      is_donor: false,
      is_active: true,
      send_invite: !!data.email.trim(),
    }
    try {
      // 1. Miembro principal
      const principalId = await createMember(principalPayload)

      // 2. Integrantes: linked se reusan, new se crean
      const familyEntries: Array<{ member_id: string; relation: string }> = [
        { member_id: principalId, relation: 'Titular' },
      ]
      for (const item of familyMembers) {
        if (item.kind === 'linked') {
          familyEntries.push({ member_id: item.member_id, relation: item.relation })
        } else {
          const id = await createMember({
            first_name: item.first_name,
            last_name: item.last_name || data.last_name,
            cedula: item.cedula,
            document_type: item.document_type,
            birth_date: item.birth_date,
            phone: item.phone,
            email: item.email,
            is_active: true,
            send_invite: !!item.email,
          })
          familyEntries.push({ member_id: id, relation: item.relation })
        }
      }

      // 3. Crear la familia (solo si hay más de un integrante o vino con familia)
      if (familyEntries.length > 1) {
        const famRes = await fetch('/api/families', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: `Familia ${data.last_name.trim()}`, members: familyEntries }),
        })
        if (!famRes.ok) throw new Error('Se crearon los miembros pero falló la creación de la familia.')
      }

      setShowToast(true)
      setTimeout(() => router.push('/miembros'), REDIRECT_LONG_AFTER_SAVE_MS)
    } catch (e) {
      console.error(e)
      setSubmitError(e instanceof Error ? e.message : 'No se pudo guardar. Intentá de nuevo.')
      setSubmitting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-6">
        <h1
          className="text-2xl text-navy font-display font-extrabold tracking-[-0.02em]"
        >
          Nuevo miembro
        </h1>
        <p className="mt-1 text-sm text-navy-light/80 font-body">
          Completa los tres pasos para crear el perfil.
        </p>
      </div>

      {/* Card */}
      <div
        className="rounded-2xl bg-surface-card p-4 sm:p-6 shadow-[var(--shadow-md)]"
      >
        <StepIndicator current={step} />

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <NewMemberStep1
            data={data}
            errors={errors}
            duplicate={duplicate}
            dismissedDuplicate={dismissedDuplicate}
            tseLoading={tseLoading}
            tseBanner={tseBanner}
            isMinor={isMinor}
            availableCantons={availableCantons}
            availableDistricts={availableDistricts}
            onData={handleData}
            onCedulaBlur={handleCedulaBlur}
            onDismissDuplicate={() => setDismissedDuplicate(true)}
          />
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <NewMemberStep2
            comesWithFamily={comesWithFamily}
            onComesWithFamilyChange={setComesWithFamily}
            familyMembers={familyMembers}
            onOpenModal={() => setShowFamilyModal(true)}
            onRemoveFamilyMember={removeFamilyMember}
            draftName={draftName}
            draftInitials={draftInitials}
            draftIsMinor={draftIsMinor}
          />
        )}

        {/* ── STEP 3 ── */}
        {step === 3 && (
          <NewMemberStep3
            data={data}
            isMinor={isMinor}
            familyMembers={familyMembers}
            sendWhatsapp={sendWhatsapp}
            onSendWhatsappChange={setSendWhatsapp}
            sendEmail={sendEmail}
            onSendEmailChange={setSendEmail}
            submitting={submitting}
            submitError={submitError}
            onSubmit={handleSubmit}
            draftName={draftName}
            draftInitials={draftInitials}
            draftRelation={(d: FamilyDraft) => d.relation}
          />
        )}

        {showFamilyModal && (
          <FamilyMemberModal
            defaultLastName={data.last_name}
            existingIds={familyMembers.filter((f): f is Extract<FamilyDraft, { kind: 'linked' }> => f.kind === 'linked').map(f => f.member_id)}
            onAdd={addFamilyDraft}
            onClose={() => setShowFamilyModal(false)}
          />
        )}

        {/* ── Navigation ── */}
        <div className="mt-8 flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              className="rounded-xl border border-[var(--outline-variant)] px-4 py-2 text-sm text-navy-light hover:bg-surface-low transition-colors font-body"
            >
              Atrás
            </button>
          ) : (
            <button
              type="button"
              onClick={() => router.push('/miembros')}
              className="rounded-xl border border-[var(--outline-variant)] px-4 py-2 text-sm text-navy-light hover:bg-surface-low transition-colors font-body"
            >
              Cancelar
            </button>
          )}

          {step < 3 && (
            <button
              type="button"
              onClick={step === 1 ? proceedFromStep1 : () => setStep(3)}
              className="rounded-xl bg-navy px-5 py-2 text-sm text-white transition-all hover:bg-navy-light active:scale-95 font-body"
            >
              Siguiente
            </button>
          )}
        </div>
      </div>

      {/* Toast */}
      {showToast && (
        <div
          className="fixed bottom-6 right-6 flex items-center gap-3 rounded-2xl bg-navy px-5 py-3.5 text-white shadow-[var(--shadow-lg)]"
        >
          <Check size={16} className="text-teal" strokeWidth={2.5} />
          <span className="text-sm font-body">
            ¡Perfil creado exitosamente!
          </span>
        </div>
      )}
    </div>
  )
}
