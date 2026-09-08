import { useState } from 'react'
import Link from 'next/link'
import { Star, Heart, Hammer, CalendarCheck, BookOpen, UserCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Member } from '@/types/member'
import { initialsFromParts, formatDate } from '@/lib/format'

/**
 * Uno de los cinco indicadores del encabezado (donante, servidor, asistente,
 * estudiante, dirigente).
 *
 * EL APAGADO TIENE QUE VERSE APAGADO. Antes el ícono inactivo iba en
 * navy-light/80 —6,41:1 sobre la tarjeta, o sea bien oscuro— así que se leía
 * como encendido y el único indicio era que no tenía color de marca. Ahora va
 * en /30 (1,76:1 medido con lib/contrast): un gris muy claro que no se puede
 * confundir. Ese contraste bajísimo es correcto acá porque el ícono es
 * DECORATIVO —va aria-hidden— y quien lleva el significado es la etiqueta de
 * abajo, que se queda en /80 y sí pasa AA.
 *
 * Y como la diferencia no puede ser solo el color: el tooltip ahora también
 * aparece apagado y dice por qué, y el estado va en el aria-label para quien
 * no ve la pantalla.
 */
function ActivityIcon({ active, icon: Icon, label, tooltip, inactiveTooltip, activeColor }: {
  active: boolean
  icon: React.ElementType
  label: string
  tooltip: string
  /** Qué decir cuando está apagado. Por defecto, "Sin <etiqueta en minúscula>". */
  inactiveTooltip?: string
  activeColor: string
}) {
  const [show, setShow] = useState(false)
  const texto = active ? tooltip : (inactiveTooltip ?? `Sin ${label.toLowerCase()}`)
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative inline-flex"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        role="img"
        aria-label={`${label}: ${active ? 'sí' : 'no'}`}
      >
        <Icon
          size={18} strokeWidth={1.75} aria-hidden
          className={cn('transition-colors', active ? activeColor : 'text-navy-light/30')}
        />
        {show && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded-md bg-navy px-2 py-1 text-[11px] text-white z-50 shadow-[var(--shadow-md)]">
            {texto}
          </div>
        )}
      </div>
      {/* La ETIQUETA se queda en /80 encendida o apagada: es texto informativo y
          el mínimo del sistema es ese (en /40 daba 2,20:1 y no pasa AA). Lo que
          se apaga es el ícono, que es decorativo. */}
      <span className="text-[11px] font-body text-navy-light/80">{label}</span>
    </div>
  )
}

function MemberActivityIcons({ member }: { member: Member }) {
  // Flag calculado en el servidor con el criterio único del sistema
  // (≥6 check-ins de charla en los últimos 6 meses, con al menos uno en los
  // últimos 60 días).
  const attendanceActive = member.attendance_active ?? false
  const studyingActive = !!member.current_study
  const committee = member.comites?.[0]
  const attendanceTooltip = member.last_charla_checkin
    ? `Asistencia activa · último check-in ${formatDate(member.last_charla_checkin)}`
    : 'Asistencia activa (≥6 charlas en 6 meses, con al menos una en los últimos 60 días)'
  return (
    <div className="mt-3 flex items-center gap-5">
      <ActivityIcon active={member.is_donor} icon={Heart} label="Donante" activeColor="text-coral"
        tooltip="Donante activo" inactiveTooltip="No registra donaciones activas" />
      <ActivityIcon active={member.is_server} icon={Hammer} label="Servidor" activeColor="text-teal-deep"
        tooltip={committee ? `Servidor en ${committee}` : 'Servidor activo'}
        inactiveTooltip="No sirve en ningún comité" />
      <ActivityIcon active={attendanceActive} icon={CalendarCheck} label="Asistente" activeColor="text-navy"
        tooltip={attendanceTooltip} inactiveTooltip="Sin asistencia activa a charlas" />
      <ActivityIcon active={studyingActive} icon={BookOpen} label="Estudiante" activeColor="text-coral"
        tooltip={member.current_study ? `Estudiando ${member.current_study}` : 'Estudiante activo'}
        inactiveTooltip="No lleva ningún estudio ahora" />
      {/* A diferencia de los otros 4, este solo aparece si es dirigente activo
          (servidor activo en el comité Dirigentes). */}
      {member.es_dirigente && (
        <ActivityIcon active icon={UserCheck} label="Dirigente" activeColor="text-navy" tooltip="Dirigente activo" />
      )}
    </div>
  )
}

const AVATAR_COLORS = ['bg-navy', 'bg-coral', 'bg-teal-deep', 'bg-navy-light']

function avatarColor(id: string) {
  const n = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return AVATAR_COLORS[n % AVATAR_COLORS.length]
}

function initials(firstName: string, lastName: string) {
  return initialsFromParts(firstName, lastName)
}



type Props = {
  member: Member
  onEdit: () => void
  menuOpen: boolean
  onMenuToggle: () => void
  onMenuClose: () => void
  /** Solo admin/comunicaciones pueden dar de baja al miembro. */
  canDeactivate?: boolean
  onDeactivate: () => void
  onMerge: () => void
}

export function MemberHeader({
  member,
  onEdit,
  menuOpen,
  onMenuToggle,
  canDeactivate = false,
  onDeactivate,
  onMerge,
}: Props) {
  return (
    <div
      className="rounded-2xl bg-surface-card p-5 shadow-[var(--shadow-md)]"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-4 min-w-0 flex-1">
        {/* Avatar */}
        <div
          className={cn(
            'flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-white text-lg font-display font-extrabold',
            avatarColor(member.id)
          )}
        >
          {initials(member.first_name, member.last_name)}
        </div>

        {/* Name + details */}
        <div className="flex-1 min-w-0">
          <h1
            className="text-xl sm:text-2xl text-navy leading-tight font-display font-extrabold tracking-[-0.02em] break-words"
          >
            {member.first_name} {member.last_name}
          </h1>
          <p className="text-xs text-navy-light/80 mt-0.5 font-mono">
            {member.cedula ? `Cédula: ${member.cedula}` : 'Sin cédula'}
            {member.join_date ? ` · Se unió el ${formatDate(member.join_date)}` : ''}
          </p>

          {/* Badges */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {/* "Activo" es el default (solo se listan activos); el tag solo
                aparece para los pocos perfiles inactivos (fallecidos/se fueron). */}
            {!member.is_active && (
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-body bg-surface-low text-navy-light/80">
                <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-navy-light/30" />
                Inactivo
              </span>
            )}
            {member.is_donor && (
              <span
                className="rounded-full bg-coral-soft/20 px-2.5 py-0.5 text-xs text-coral font-body"
              >
                Donante
              </span>
            )}
            {member.is_server && (
              <span
                className="rounded-full bg-teal-soft/30 px-2.5 py-0.5 text-xs text-teal-deep font-body"
              >
                Servidor
              </span>
            )}
            {member.is_dirigente && (
              <Link
                href={`/estudios/dirigentes/${member.id}`}
                title="Ver perfil de dirigente"
                aria-label="Ver perfil de dirigente"
                className="inline-flex items-center gap-1 rounded-full bg-navy/10 px-2.5 py-0.5 text-xs text-navy font-body hover:bg-navy/15 transition-colors"
              >
                <Star size={10} strokeWidth={2} />
                Dirigente
              </Link>
            )}
            {member.roles.includes('admin') && (
              <span
                className="rounded-full bg-coral-soft/20 px-2.5 py-0.5 text-xs text-coral font-body"
              >
                Admin
              </span>
            )}
          </div>

          {/* Iconos de actividad */}
          <MemberActivityIcons member={member} />
        </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            onClick={onEdit}
            className="rounded-xl border border-[var(--outline-variant)] px-3.5 py-2 text-sm text-navy-light hover:bg-surface-low transition-colors font-body"
          >
            Editar
          </button>
          <div className="relative">
            <button
              onClick={onMenuToggle}
              className="rounded-xl border border-[var(--outline-variant)] px-3 py-2 text-sm text-navy-light hover:bg-surface-low transition-colors font-body"
            >
              ···
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-1 w-48 rounded-xl bg-surface-card py-1 z-20 shadow-[var(--shadow-lg)] border border-[var(--outline-variant)]"
              >
                {canDeactivate && (
                  <button
                    onClick={onDeactivate}
                    className="w-full px-4 py-2 text-left text-sm text-coral hover:bg-coral/5 transition-colors font-body"
                  >
                    Dar de baja al miembro
                  </button>
                )}
                <button
                  onClick={onMerge}
                  className="w-full px-4 py-2 text-left text-sm text-navy-light/80 hover:bg-surface-low transition-colors font-body"
                >
                  Fusionar duplicado
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
