import Link from 'next/link'
import { useState, useEffect } from 'react'
import { Lock, ChevronDown, ChevronUp, Loader2, GraduationCap } from 'lucide-react'
import { useStudyPlans } from '@/hooks/useStudyPlans'
import { StudyRequestActions } from '@/components/studies/StudyRequestActions'
import { ResolverInscripcion } from '@/components/studies/ResolverInscripcion'
import { FinanceRequestActions } from '@/components/finance/FinanceRequestActions'
import { MemberPaymentsList, PayMatriculaButton, PayEventRegistrationButton } from '@/components/members/MemberPaymentsList'
import { cn } from '@/lib/utils'
import { formatDate, formatCRC } from '@/lib/format'
import { studyGradeDisplay } from '@/lib/studies/grade-display'
import { muestraDeudaDeMatricula } from '@/lib/finance/study-debt-visible'

const LOAD_MORE = 10

const TYPE_BADGE: Record<string, string> = {
  Charla: 'bg-navy/10 text-navy',
  Campamento: 'bg-teal-soft/30 text-teal-deep',
  'Actividad Social': 'bg-coral-soft/20 text-coral',
  United: 'bg-navy-light/10 text-navy-light',
}

const ATTENDANCE_BADGE: Record<string, string> = {
  servidor: 'bg-coral-soft/20 text-coral',
  participante: 'bg-surface-low text-navy-light/80',
}

function formatAmount(n: number | null) {
  // null = monto restringido (solo rol finanzas lo recibe del API).
  if (n == null) return '₡ •••,•••'
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'CRC',
    maximumFractionDigits: 0,
  }).format(n)
}

function studyStageColor(stage: string): string {
  if (stage === 'niveles') return 'bg-navy/10 text-navy'
  if (stage === 'inicial') return 'bg-teal-soft/30 text-teal-deep'
  if (stage === 'campaña') return 'bg-purple-100 text-purple-700' // campañas = morado (consistente con StudyTypeBadge / plan)
  return 'bg-coral-soft/20 text-coral' // intermedia
}

function SectionAccordion({
  title,
  open,
  onToggle,
  children,
  sectionKey,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
  /** Clave del acordeón, para poder llegar por URL (?open=pagos) y que la
   *  pantalla baje hasta acá. Sin esto el enlace abría la sección correcta pero
   *  dejaba a la persona arriba de todo, sin saber que había pasado algo. */
  sectionKey?: string
}) {
  return (
    <div
      id={sectionKey ? `seccion-${sectionKey}` : undefined}
      // Que no quede tapada por la barra de tabs, que en desktop está pegada.
      className="rounded-xl overflow-hidden border border-[var(--outline-variant)] scroll-mt-24">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3.5 bg-surface-card hover:bg-surface-low transition-colors"
      >
        <span
          className="text-sm font-medium text-navy font-display font-extrabold"
        >
          {title}
        </span>
        {open ? (
          <ChevronUp size={16} strokeWidth={1.75} className="text-navy-light/80" />
        ) : (
          <ChevronDown size={16} strokeWidth={1.75} className="text-navy-light/80" />
        )}
      </button>
      {open && <div className="bg-surface-card">{children}</div>}
    </div>
  )
}

export type StudyRow = { code: string; name: string; startYear: number; startLabel: string; duration: string; status: string; groupId: string | null; enrollmentId: string; rawStatus: string; groupStatus: string | null; requiresPayment: boolean; paymentStatus: string | null; paymentsCount: number; cost: number; grade: number | null; notes: string | null; esExterno: boolean; fuenteExterna: string | null; registradoPor: string | null }
export type ServiceRow = { position: string; committee: string; from: string; to: string; status: string }
export type EventoRow = { name: string; type: string; date: string; attendance_type: string }
export type DonacionRow = { date: string; description: string; amount: number | null }
export type EventRegistrationRow = {
  registrationId: string; eventId: string; eventName: string; eventDate: string
  requiresPayment: boolean; cost: number
  paymentStatus: 'pending' | 'paid' | 'exempted' | 'expired'
  reviewStatus: string | null
}

type SortableTableResult<T> = {
  sorted: T[]
  sortKey: keyof T | null
  sortDir: 'asc' | 'desc'
  toggleSort: (key: keyof T) => void
}

type OpenSections = {
  estudios: boolean
  ledStudies: boolean
  servicio: boolean
  eventos: boolean
  eventRegistrations: boolean
  misBecas: boolean
  pagos: boolean
  donaciones: boolean
}

type Props = {
  memberId: string
  /** Nombre para el diálogo de "¿cómo terminó?" — sin él el modal preguntaría
   *  por alguien sin decir por quién. */
  memberName: string
  /** Refrescar tras resolver una inscripción "Por confirmar". */
  onResuelto?: () => void
  openSections: OpenSections
  onToggleSection: (key: keyof OpenSections) => void
  estudiosTable: SortableTableResult<StudyRow>
  servicioTable: SortableTableResult<ServiceRow>
  eventosTable: SortableTableResult<EventoRow>
  donacionesTable: SortableTableResult<DonacionRow>
  eventRegistrationTable: SortableTableResult<EventRegistrationRow>
  visibleEstudios: number
  visibleServicio: number
  visibleEventos: number
  visibleDonaciones: number
  visibleEventRegistrations: number
  onLoadMoreEstudios: () => void
  onLoadMoreServicio: () => void
  onLoadMoreEventos: () => void
  onLoadMoreDonaciones: () => void
  onLoadMoreEventRegistrations: () => void
  hasFinanceRole: boolean
  revealDonations: boolean
  onToggleRevealDonations: () => void
  donationsCount: number
  ledStudies?: Array<{ group_id: string; group_name: string; plan_code: string | null; plan_name: string | null; role: 'Dirigente' | 'Co-dirigente'; status: string; date: string | null }>
  onAddStudy?: () => void
}

export function MemberParticipationTab({
  memberId,
  memberName,
  onResuelto,
  openSections,
  onToggleSection,
  estudiosTable,
  servicioTable,
  eventosTable,
  donacionesTable,
  eventRegistrationTable,
  visibleEstudios,
  visibleServicio,
  visibleEventos,
  visibleDonaciones,
  visibleEventRegistrations,
  onLoadMoreEstudios,
  onLoadMoreServicio,
  onLoadMoreEventos,
  onLoadMoreDonaciones,
  onLoadMoreEventRegistrations,
  hasFinanceRole,
  revealDonations,
  onToggleRevealDonations,
  donationsCount,
  ledStudies = [],
  onAddStudy,
}: Props) {
  const { studyTypes } = useStudyPlans()
  return (
    <div className="space-y-3">
      {/* Solicitudes de estudios y finanzas — disponibles para cualquier rol.
          (Invitar a estudio y excepción de matrícula viven en el tab Administrativo.) */}
      <div className="flex gap-2 flex-wrap">
        <StudyRequestActions memberId={memberId} />
        <FinanceRequestActions memberId={memberId} />
      </div>

      {/* Historial de estudios */}
      <SectionAccordion
        title="Historial de estudios"
        open={openSections.estudios}
        sectionKey="estudios"
        onToggle={() => onToggleSection('estudios')}
      >
        {onAddStudy && (
          <div className="flex justify-end px-4 pt-3">
            <button
              type="button"
              onClick={onAddStudy}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--outline-variant)] px-3 py-1.5 text-xs text-navy-light hover:bg-surface-low transition-colors font-body"
            >
              + Agregar estudio
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--outline-variant)]">
                {([['name', 'Estudio'], ['startYear', 'Inicio'], ['status', 'Estado'], ['grade', 'Nota']] as [keyof StudyRow, string][]).map(([key, label]) => (
                  <th
                    key={key}
                    onClick={() => estudiosTable.toggleSort(key)}
                    className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wider text-navy-light/80 cursor-pointer hover:text-navy transition-colors select-none font-display"
                  >
                    {label}{' '}
                    <span className="opacity-50">
                      {estudiosTable.sortKey === key ? (estudiosTable.sortDir === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </th>
                ))}
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {estudiosTable.sorted.slice(0, visibleEstudios).map((row, i) => {
                const entry = studyTypes.find(s => s.code === row.code)
                return (
                  <tr
                    key={row.code}
                    style={i < Math.min(visibleEstudios, estudiosTable.sorted.length) - 1 ? { borderBottom: '1px solid var(--outline-variant)' } : {}}
                    className="hover:bg-surface-low transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn('rounded px-1.5 py-0.5 text-[11px] font-mono', entry ? studyStageColor(entry.stage) : 'bg-surface-low text-navy-light/80')}
                        >
                          {row.code}
                        </span>
                        <span className="text-navy-light/80 font-body">{row.name}</span>
                        {/* Llevado FUERA de Theos y registrado a mano. Se marca
                            porque cuenta como prerrequisito igual que uno
                            interno: quien lea el expediente tiene que poder
                            distinguirlo sin abrir la base. */}
                        {row.esExterno && (
                          <span
                            className="rounded px-1.5 py-0.5 text-[11px] bg-teal-soft/30 text-teal-deep font-body whitespace-nowrap"
                            title={[
                              row.fuenteExterna ? `Lo llevó en: ${row.fuenteExterna}` : 'No se registró dónde lo llevó',
                              row.registradoPor ? `Registrado por ${row.registradoPor}` : null,
                            ].filter(Boolean).join(' · ')}
                          >
                            Externo
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-navy-light/80 text-xs font-body">
                      {row.startLabel}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn('rounded-full px-2.5 py-0.5 text-xs font-body', (row.status === 'Completado' || row.status === 'Aprobado') ? 'bg-teal-soft/30 text-teal-deep' : 'bg-coral-soft/20 text-coral')}
                      >
                        {row.status}
                      </span>
                    </td>
                    {/* EST-8: nota del cierre (study_enrollments.grade); el
                        motivo de reprobado va como title (tooltip). */}
                    {(() => {
                      const g = studyGradeDisplay(row.grade, row.notes)
                      return (
                        <td className="px-4 py-2.5 text-navy-light/80 text-xs font-body" title={g.tooltip}>
                          {g.text}
                        </td>
                      )
                    })()}
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-3 flex-wrap">
                        {/* Inscripción que quedó sin resultado al cerrarse el
                            grupo: se resuelve desde acá o desde el detalle del
                            grupo, lo que le quede más a mano a quien revisa. */}
                        {row.rawStatus === 'en_revision' && row.groupId && (
                          <ResolverInscripcion
                            groupId={row.groupId}
                            memberId={memberId}
                            memberName={memberName}
                            onResuelto={onResuelto}
                          />
                        )}
                        {/* Más de un pago colgando de la misma matrícula: pasa
                            cuando finanzas agrega un cobro de seguimiento. El
                            badge de al lado es el estado del más nuevo. */}
                        {row.paymentsCount > 1 && (
                          <span className="text-[13px] text-navy-light/80 font-body whitespace-nowrap">
                            {row.paymentsCount} pagos
                          </span>
                        )}
                        {/* Se pide el pago solo si EXISTE el cobro — la regla
                            entera está en muestraDeudaDeMatricula, con sus
                            tests. Antes se deducía del costo del plan y la
                            pantalla inventaba la deuda: 521 participantes de
                            grupos EN CURSO, importados de PCO y sin una sola
                            fila en `payments`, veían "Pendiente: ₡X" y un botón
                            de pagar. El freno anterior solo tapaba los grupos
                            finalizados (caso Hermenéutica 2024 de Lucía
                            Porras). */}
                        {muestraDeudaDeMatricula(row) && (
                          row.paymentStatus === 'en_revision' ? (
                            <span className="rounded-full bg-amber-50 text-amber-700 px-2.5 py-0.5 text-[13px] font-semibold font-display">Pago en revisión</span>
                          ) : row.paymentStatus === 'aprobado' ? (
                            <span className="rounded-full bg-teal-soft/30 text-teal-deep px-2.5 py-0.5 text-[13px] font-semibold font-display">Pagado</span>
                          ) : (
                            <span className="inline-flex items-center gap-2">
                              {row.cost > 0 && (
                                <span className="text-[13px] text-navy-light/80 font-body whitespace-nowrap">
                                  Pendiente: {formatCRC(row.cost)}
                                </span>
                              )}
                              <PayMatriculaButton
                                enrollmentId={row.enrollmentId}
                                retry={row.paymentStatus === 'rechazado'}
                              />
                            </span>
                          )
                        )}
                        {row.groupId ? (
                          <Link
                            href={`/estudios/grupos/${row.groupId}`}
                            className="inline-flex items-center gap-1 text-xs text-coral hover:text-coral-deep transition-colors whitespace-nowrap font-body"
                          >
                            Ver grupo →
                          </Link>
                        ) : (
                          <span className="text-xs text-navy-light/80 whitespace-nowrap font-body">Sin grupo</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {visibleEstudios < estudiosTable.sorted.length && (
          <div className="px-4 py-3 border-t border-[var(--outline-variant)]">
            <button
              onClick={onLoadMoreEstudios}
              className="text-xs text-navy-light/80 hover:text-coral transition-colors font-body"
            >
              Cargar {LOAD_MORE} más (quedan {estudiosTable.sorted.length - visibleEstudios})
            </button>
          </div>
        )}
      </SectionAccordion>

      {/* Estudios dados como dirigente (D10) — acordeón, debajo del historial de estudios */}
      {ledStudies.length > 0 && (
        <SectionAccordion
          title={`Estudios dados como dirigente (${ledStudies.length})`}
          open={openSections.ledStudies}
          onToggle={() => onToggleSection('ledStudies')}
        >
          <div className="divide-y divide-[var(--outline-variant)]">
            {ledStudies.map(g => (
              <div key={g.group_id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-navy truncate font-body">{g.plan_name ?? g.plan_code ?? g.group_name}</p>
                  <p className="text-[13px] text-navy-light/80 font-body">
                    {g.role}{g.date ? ` · ${formatDate(g.date)}` : ''}
                  </p>
                </div>
                <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-medium shrink-0 font-display',
                  g.status === 'finalizado' ? 'bg-surface-low text-navy-light/80' : 'bg-teal-soft/30 text-teal-deep')}>
                  {g.status === 'finalizado' ? 'Finalizado' : g.status === 'en_curso' ? 'En curso' : 'En matrícula'}
                </span>
              </div>
            ))}
          </div>
        </SectionAccordion>
      )}

      {/* Historial de servicio */}
      <SectionAccordion
        title="Historial de servicio"
        open={openSections.servicio}
        sectionKey="servicio"
        onToggle={() => onToggleSection('servicio')}
      >
        {servicioTable.sorted.length === 0 ? (
          <p className="px-4 py-6 text-sm text-navy-light/80 font-body">
            Sin historial de servicio
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[var(--outline-variant)]">
                    {([['position', 'Puesto'], ['committee', 'Comité'], ['from', 'Desde'], ['to', 'Hasta'], ['status', 'Estado']] as [keyof ServiceRow, string][]).map(([key, label]) => (
                      <th
                        key={key}
                        onClick={() => servicioTable.toggleSort(key)}
                        className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wider text-navy-light/80 cursor-pointer hover:text-navy transition-colors select-none font-display"
                      >
                        {label}{' '}
                        <span className="opacity-50">
                          {servicioTable.sortKey === key ? (servicioTable.sortDir === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {servicioTable.sorted.slice(0, visibleServicio).map((row, i) => (
                    <tr
                      key={i}
                      className="hover:bg-surface-low transition-colors"
                      style={i < Math.min(visibleServicio, servicioTable.sorted.length) - 1 ? { borderBottom: '1px solid var(--outline-variant)' } : {}}
                    >
                      <td className="px-4 py-2.5 text-navy font-body">{row.position}</td>
                      <td className="px-4 py-2.5 text-navy-light/80 font-body">{row.committee}</td>
                      <td className="px-4 py-2.5 text-navy-light/80 text-xs font-body">{formatDate(row.from)}</td>
                      <td className="px-4 py-2.5 text-navy-light/80 text-xs font-body">
                        {row.to ? formatDate(row.to) : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn('rounded-full px-2.5 py-0.5 text-xs font-body', row.status === 'activo' ? 'bg-teal-soft/30 text-teal-deep' : 'bg-surface-low text-navy-light/80')}
                        >
                          {row.status === 'activo' ? 'Activo' : 'Finalizado'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visibleServicio < servicioTable.sorted.length && (
              <div className="px-4 py-3 border-t border-[var(--outline-variant)]">
                <button
                  onClick={onLoadMoreServicio}
                  className="text-xs text-navy-light/80 hover:text-coral transition-colors font-body"
                >
                  Cargar {LOAD_MORE} más (quedan {servicioTable.sorted.length - visibleServicio})
                </button>
              </div>
            )}
          </>
        )}
      </SectionAccordion>

      {/* Asistencia a eventos */}
      <SectionAccordion
        title="Asistencia a eventos"
        open={openSections.eventos}
        sectionKey="eventos"
        onToggle={() => onToggleSection('eventos')}
      >
        {eventosTable.sorted.length === 0 ? (
          <p className="px-4 py-6 text-sm text-navy-light/80 font-body">
            Sin registros de asistencia
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[var(--outline-variant)]">
                    {([['name', 'Evento'], ['type', 'Tipo'], ['date', 'Fecha'], ['attendance_type', 'Asistencia']] as [keyof EventoRow, string][]).map(([key, label]) => (
                      <th
                        key={key}
                        onClick={() => eventosTable.toggleSort(key)}
                        className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wider text-navy-light/80 cursor-pointer hover:text-navy transition-colors select-none font-display"
                      >
                        {label}{' '}
                        <span className="opacity-50">
                          {eventosTable.sortKey === key ? (eventosTable.sortDir === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {eventosTable.sorted.slice(0, visibleEventos).map((row, i) => (
                    <tr
                      key={i}
                      className="hover:bg-surface-low transition-colors"
                      style={i < Math.min(visibleEventos, eventosTable.sorted.length) - 1 ? { borderBottom: '1px solid var(--outline-variant)' } : {}}
                    >
                      <td className="px-4 py-2.5 text-navy font-body">{row.name}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn('rounded-full px-2 py-0.5 text-[11px] font-body', TYPE_BADGE[row.type] ?? 'bg-surface-low text-navy-light/80')}
                        >
                          {row.type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-navy-light/80 text-xs whitespace-nowrap font-body">
                        {formatDate(row.date)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn('rounded-full px-2 py-0.5 text-[11px] font-body', ATTENDANCE_BADGE[row.attendance_type] ?? 'bg-surface-low text-navy-light/80')}
                        >
                          {row.attendance_type === 'servidor' ? 'Servidor' : 'Participante'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visibleEventos < eventosTable.sorted.length && (
              <div className="px-4 py-3 border-t border-[var(--outline-variant)]">
                <button
                  onClick={onLoadMoreEventos}
                  className="text-xs text-navy-light/80 hover:text-coral transition-colors font-body"
                >
                  Cargar {LOAD_MORE} más (quedan {eventosTable.sorted.length - visibleEventos})
                </button>
              </div>
            )}
          </>
        )}
      </SectionAccordion>

      {/* Mis inscripciones a eventos (con pago) */}
      <SectionAccordion
        title="Mis inscripciones a eventos"
        open={openSections.eventRegistrations}
        onToggle={() => onToggleSection('eventRegistrations')}
      >
        {eventRegistrationTable.sorted.length === 0 ? (
          <p className="px-4 py-4 text-sm text-navy-light/80 font-body">Sin inscripciones a eventos.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[var(--outline-variant)]">
                    {([['eventName', 'Evento'], ['eventDate', 'Fecha']] as [keyof EventRegistrationRow, string][]).map(([key, label]) => (
                      <th
                        key={key}
                        onClick={() => eventRegistrationTable.toggleSort(key)}
                        className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wider text-navy-light/80 cursor-pointer hover:text-navy transition-colors select-none font-display"
                      >
                        {label}{' '}
                        <span className="opacity-50">
                          {eventRegistrationTable.sortKey === key ? (eventRegistrationTable.sortDir === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </th>
                    ))}
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {eventRegistrationTable.sorted.slice(0, visibleEventRegistrations).map((row, i) => (
                    <tr
                      key={row.registrationId}
                      style={i < Math.min(visibleEventRegistrations, eventRegistrationTable.sorted.length) - 1 ? { borderBottom: '1px solid var(--outline-variant)' } : {}}
                      className="hover:bg-surface-low transition-colors"
                    >
                      <td className="px-4 py-2.5 text-navy-light/80 font-body">{row.eventName}</td>
                      <td className="px-4 py-2.5 text-navy-light/80 text-xs font-body">{formatDate(row.eventDate)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {row.requiresPayment && (
                            row.paymentStatus === 'paid' ? (
                              <span className="rounded-full bg-teal-soft/30 text-teal-deep px-2.5 py-0.5 text-[13px] font-semibold font-display">Pagado</span>
                            ) : row.paymentStatus === 'exempted' ? (
                              <span className="rounded-full bg-teal-soft/30 text-teal-deep px-2.5 py-0.5 text-[13px] font-semibold font-display">Exento</span>
                            ) : row.paymentStatus === 'expired' ? (
                              <span className="rounded-full bg-coral-soft/20 text-coral px-2.5 py-0.5 text-[13px] font-semibold font-display">Reserva vencida</span>
                            ) : row.reviewStatus === 'en_revision' ? (
                              <span className="rounded-full bg-amber-50 text-amber-700 px-2.5 py-0.5 text-[13px] font-semibold font-display">Pago en revisión</span>
                            ) : (
                              <span className="inline-flex items-center gap-2">
                                {row.cost > 0 && (
                                  <span className="text-[13px] text-navy-light/80 font-body whitespace-nowrap">
                                    Pendiente: {formatCRC(row.cost)}
                                  </span>
                                )}
                                <PayEventRegistrationButton
                                  registrationId={row.registrationId}
                                  retry={row.reviewStatus === 'rechazado'}
                                />
                              </span>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visibleEventRegistrations < eventRegistrationTable.sorted.length && (
              <div className="px-4 py-3 border-t border-[var(--outline-variant)]">
                <button
                  onClick={onLoadMoreEventRegistrations}
                  className="text-xs text-navy-light/80 hover:text-coral transition-colors font-body"
                >
                  Cargar {LOAD_MORE} más (quedan {eventRegistrationTable.sorted.length - visibleEventRegistrations})
                </button>
              </div>
            )}
          </>
        )}
      </SectionAccordion>

      {/* Mis becas (solicitudes de beca: solicitada/aprobada/rechazada) */}
      <SectionAccordion
        title="Mis becas"
        open={openSections.misBecas}
        sectionKey="misBecas"
        onToggle={() => onToggleSection('misBecas')}
      >
        <MemberScholarshipRequests memberId={memberId} />
      </SectionAccordion>

      {/* Pagos y cobros (matrícula, eventos, prematrimonial): pendientes con
          botón para pagar (subir comprobante), en revisión, y cerrados. */}
      <SectionAccordion
        title="Pagos y cobros"
        open={openSections.pagos}
        sectionKey="pagos"
        onToggle={() => onToggleSection('pagos')}
      >
        <MemberPaymentsList memberId={memberId} />
      </SectionAccordion>

      {/* Donaciones */}
      <SectionAccordion
        title="Donaciones"
        open={openSections.donaciones}
        sectionKey="donaciones"
        onToggle={() => onToggleSection('donaciones')}
      >
        {hasFinanceRole ? (
          <div>
            <div
              className="flex items-center justify-between px-4 py-3 border-b border-[var(--outline-variant)]"
            >
              <p className="text-xs text-navy-light/80 font-body">
                {donationsCount} registros
              </p>
              <button
                type="button"
                onClick={onToggleRevealDonations}
                className="rounded-lg border border-[var(--outline-variant)] px-3 py-1 text-xs text-navy-light hover:bg-surface-low transition-colors font-body"
              >
                {revealDonations ? 'Ocultar montos' : 'Mostrar montos'}
              </button>
            </div>
            {donacionesTable.sorted.length === 0 ? (
              <p className="px-4 py-6 text-sm text-navy-light/80 font-body">
                Sin registros de donaciones
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--outline-variant)]">
                        {([['date', 'Fecha'], ['description', 'Descripción'], ['amount', 'Monto']] as [keyof DonacionRow, string][]).map(([key, label]) => (
                          <th
                            key={key}
                            onClick={() => donacionesTable.toggleSort(key)}
                            className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wider text-navy-light/80 cursor-pointer hover:text-navy transition-colors select-none font-display"
                          >
                            {label}{' '}
                            <span className="opacity-50">
                              {donacionesTable.sortKey === key ? (donacionesTable.sortDir === 'asc' ? '↑' : '↓') : '↕'}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {donacionesTable.sorted.slice(0, visibleDonaciones).map((row, i) => (
                        <tr
                          key={i}
                          className="hover:bg-surface-low transition-colors"
                          style={i < Math.min(visibleDonaciones, donacionesTable.sorted.length) - 1 ? { borderBottom: '1px solid var(--outline-variant)' } : {}}
                        >
                          <td className="px-4 py-2.5 text-navy-light/80 text-xs whitespace-nowrap font-body">
                            {formatDate(row.date)}
                          </td>
                          <td className="px-4 py-2.5 text-navy-light/80 font-body">
                            {row.description}
                          </td>
                          <td
                            className={`px-4 py-2.5 text-right tabular-nums text-[13px] ${revealDonations ? 'font-mono' : 'font-body'}`}
                          >
                            {row.amount === 0 ? (
                              // Histórico importado sin monto: el período va en la descripción.
                              <span className="text-navy-light/80">—</span>
                            ) : revealDonations ? (
                              <span className="text-navy">{formatAmount(row.amount)}</span>
                            ) : (
                              <span className="text-navy-light/80 tracking-widest">••••••</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {visibleDonaciones < donacionesTable.sorted.length && (
                  <div className="px-4 py-3 border-t border-[var(--outline-variant)]">
                    <button
                      onClick={onLoadMoreDonaciones}
                      className="text-xs text-navy-light/80 hover:text-coral transition-colors font-body"
                    >
                      Cargar {LOAD_MORE} más (quedan {donacionesTable.sorted.length - visibleDonaciones})
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 px-4 py-6">
            <Lock size={16} className="text-navy-light/80" strokeWidth={1.75} />
            <p className="text-sm text-navy-light/80 font-body">
              No tenés permisos para ver esta información.
            </p>
          </div>
        )}
      </SectionAccordion>
    </div>
  )
}


// ── "Mis becas": solicitudes de beca del miembro (solicitada/aprobada/rechazada) ──
type ScholarshipRequestRow = {
  id: string
  entity_name: string | null
  status: 'open' | 'in_review' | 'resolved' | 'rejected'
  reason: string
  review_notes: string | null
  created_at: string
}

const REQUEST_STATUS_LABEL: Record<string, string> = {
  open: 'Solicitada', in_review: 'En revisión', resolved: 'Aprobada', rejected: 'Rechazada',
}
const REQUEST_STATUS_BADGE: Record<string, string> = {
  open: 'bg-amber-50 text-amber-700', in_review: 'bg-amber-50 text-amber-700',
  resolved: 'bg-teal-soft/30 text-teal-deep', rejected: 'bg-coral-soft/20 text-coral',
}

function MemberScholarshipRequests({ memberId }: { memberId: string }) {
  const [rows, setRows] = useState<ScholarshipRequestRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`/api/finance/requests?type=scholarship&member_id=${memberId}`)
      .then(r => (r.ok ? r.json() : []))
      .then((d: ScholarshipRequestRow[]) => { if (alive) setRows(Array.isArray(d) ? d : []) })
      .catch(() => { if (alive) setRows([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [memberId])

  if (loading) {
    return <p className="px-4 py-6 text-center text-sm text-navy-light/80 font-body inline-flex items-center gap-2 justify-center w-full"><Loader2 size={15} className="animate-spin" /> Cargando…</p>
  }
  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-navy-light/80 font-body flex items-center gap-2">
        <GraduationCap size={14} /> Sin solicitudes de beca.
      </p>
    )
  }
  return (
    <div className="divide-y divide-[var(--outline-variant)]">
      {rows.map(r => (
        <div key={r.id} className="px-4 py-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-navy font-body">{r.entity_name ?? '—'}</p>
            <p className="text-[13px] text-navy-light/80 font-body">{formatDate(r.created_at)}</p>
            {r.status === 'rejected' && r.review_notes && (
              <p className="text-[13px] text-coral font-body mt-1">Motivo: {r.review_notes}</p>
            )}
          </div>
          <span className={cn('rounded-full px-2.5 py-0.5 text-[13px] font-semibold font-display shrink-0', REQUEST_STATUS_BADGE[r.status])}>
            {REQUEST_STATUS_LABEL[r.status]}
          </span>
        </div>
      ))}
    </div>
  )
}
