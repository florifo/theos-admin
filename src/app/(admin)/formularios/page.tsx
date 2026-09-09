'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { type FormTemplate } from '@/types/forms'
import { useForms } from '@/hooks/useForms'
import { useClientPagination } from '@/hooks/useClientPagination'
import { LoadMoreFooter } from '@/components/shared/LoadMoreFooter'
import { FilterChips } from '@/components/shared/FilterChips'
import { cn } from '@/lib/utils'
import {
  Plus,
  Search,
  FileText,
  ClipboardList,
  BarChart2,
  UserCheck,
  MoreHorizontal,
  Link2,
  Eye,
  Copy,
  Archive,
  MessageSquare,
  Trash2,
  Send,
  Inbox,
} from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import { Modal } from '@/components/shared/Modal'
import {
  canPublishForm, deleteWarning, deleteBlockedReason, matchesEstado, canUserDeleteForms,
  FORM_ACTION_MESSAGES, ESTADO_FILTERS, type EstadoFilter,
} from '@/lib/forms/form-actions'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/shared/Toast'
import { sePuedeCompartir, formShareLink } from '@/lib/forms/share-link'
import { formWindowStatus, FORM_WINDOW_LABEL, FORM_WINDOW_BADGE } from '@/lib/forms/active-window'

type CategoryFilter = 'all' | 'event_registration' | 'study_registration' | 'survey' | 'registration' | 'other'

const CATEGORY_FILTERS: { key: CategoryFilter; label: string }[] = [
  { key: 'all',               label: 'Todos' },
  { key: 'event_registration',label: 'Inscripción eventos' },
  { key: 'study_registration',label: 'Inscripción estudios' },
  { key: 'survey',            label: 'Encuestas' },
  { key: 'registration',      label: 'Registro' },
  { key: 'other',             label: 'Otros' },
]

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  event_registration:  ClipboardList,
  study_registration:  FileText,
  survey:              BarChart2,
  registration:        UserCheck,
  other:               FileText,
}

const CATEGORY_LABELS: Record<string, string> = {
  event_registration:  'Inscripción evento',
  study_registration:  'Inscripción estudios',
  survey:              'Encuesta',
  registration:        'Registro',
  other:               'Otro',
}

function thisMonth(dateStr: string | null) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
}

export default function FormulariosPage() {
  const { forms, refetch } = useForms()
  const toast = useToast()

  /** Copia el link del formulario al portapapeles.
   *
   *  Se usa window.location.origin y no una constante: así un deployment de
   *  preview copia SU propio link y no el de producción (mismo criterio que el
   *  compartir de eventos).
   *
   *  El clipboard puede fallar sin permiso o sin HTTPS; en ese caso se muestra
   *  el link para copiarlo a mano, en vez de fallar en silencio. */
  async function copiarLink(form: { id: string; is_public: boolean; requires_auth?: boolean }) {
    setMenuOpen(null)
    // formShareLink elige: si el formulario se puede contestar sin cuenta,
    // copia el link público; si no, el de siempre. El aviso cambia con el link
    // porque no es lo mismo pegar en WhatsApp uno que cualquiera abre que uno
    // que pide cuenta, y quien comparte tiene que saber cuál mandó.
    const { url, kind } = formShareLink(form, window.location.origin)
    const aviso = kind === 'publico'
      ? 'Link copiado. Se puede contestar sin cuenta.'
      : 'Link copiado. Ojo: para responder hay que entrar con cuenta.'
    try {
      await navigator.clipboard.writeText(url)
      toast(aviso, 'success')
    } catch {
      toast(`No se pudo copiar solo. El link es: ${url}`, 'error')
    }
  }
  const [localTemplates, setLocalTemplates] = useState<FormTemplate[]>([])
  useEffect(() => { setLocalTemplates(forms) }, [forms])
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>('all')
  const [deleteTarget, setDeleteTarget] = useState<FormTemplate | null>(null)
  const [deleting, setDeleting] = useState(false)
  // Borrar es más acotado que editar (se lleva las respuestas): mismo criterio
  // que el endpoint, para no mostrar un botón que va a devolver 403.
  const { user } = useAuth()
  const puedeBorrar = canUserDeleteForms(user?.roles)
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  async function handleDuplicate(formId: string) {
    const template = localTemplates.find(t => t.id === formId)
    if (!template) return
    setMenuOpen(null)
    try {
      const res = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${template.name} (copia)`,
          description: template.description,
          category: template.category,
          entity_type: template.entity_type,
          entity_id: template.entity_id,
          is_active: false,
          fields: template.fields,
        }),
      })
      if (!res.ok) throw new Error()
      await refetch()
    } catch {
      toast('No se pudo duplicar el formulario', 'error')
    }
  }

  /** Apaga o enciende el formulario. Desactivar NO borra nada: deja de recibir
   *  respuestas y se puede volver a publicar. */
  async function handleToggleActive(formId: string, activar: boolean) {
    setMenuOpen(null)
    try {
      const res = await fetch(`/api/forms/${formId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: activar }),
      })
      if (!res.ok) throw new Error()
      await refetch()
      toast(activar ? 'Formulario publicado' : 'Formulario desactivado', 'success')
    } catch {
      toast(activar ? 'No se pudo publicar el formulario' : 'No se pudo desactivar el formulario', 'error')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/forms/${deleteTarget.id}`, { method: 'DELETE' })
      const d = await res.json().catch(() => null) as { error?: string } | null
      if (!res.ok) throw new Error(d?.error ?? '')
      setDeleteTarget(null)
      await refetch()
      toast('Formulario eliminado', 'success')
    } catch (e) {
      toast((e as Error).message || 'No se pudo eliminar el formulario', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const stats = useMemo(() => {
    const active = localTemplates.filter(f => formWindowStatus(f) === 'activo').length
    // Aproximación: respuestas de formularios cuya última respuesta cae este mes.
    const responsesThisMonth = localTemplates
      .filter(f => f.last_response_at && thisMonth(f.last_response_at))
      .reduce((s, f) => s + f.responses_count, 0)
    const noResponses = localTemplates.filter(f => f.responses_count === 0).length
    const avg = localTemplates.reduce((sum, f) => sum + f.responses_count, 0) / Math.max(localTemplates.length, 1)
    return { active, responsesThisMonth, noResponses, avg: Math.round(avg * 10) / 10 }
  }, [localTemplates])

  const filtered = useMemo(() => {
    return localTemplates.filter(f => {
      if (categoryFilter !== 'all' && f.category !== categoryFilter) return false
      if (!matchesEstado(f, estadoFilter)) return false
      if (query.trim()) {
        const q = query.toLowerCase()
        return f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q)
      }
      return true
    })
  }, [localTemplates, categoryFilter, estadoFilter, query])

  const { visible, shown, total, hasMore, loadMore } = useClientPagination(filtered, 25)

  return (
    <div className="space-y-6" onClick={() => setMenuOpen(null)}>
      {/* Header */}
      <div
        className="rounded-2xl bg-navy px-6 py-5 flex items-start justify-between gap-4 shadow-[var(--shadow-md)]"
      >
        <div>
          <h1
            className="text-2xl text-white font-display font-extrabold tracking-[-0.02em]"
          >
            Formularios
          </h1>
          <p className="mt-1 text-sm text-white/80 font-body">
            Constructor de formularios de inscripción y encuestas
          </p>
        </div>
        <Link
          href="/formularios/nuevo"
          className="inline-flex items-center gap-1.5 rounded-full bg-coral px-4 py-2 text-sm text-white hover:bg-coral-deep transition-all duration-150 shrink-0 font-body"
        >
          <Plus size={14} />
          Nuevo formulario
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Formularios activos',      value: stats.active,             color: 'text-navy' },
          { label: 'Respuestas este mes',       value: stats.responsesThisMonth, color: 'text-teal-deep' },
          { label: 'Sin respuestas',            value: stats.noResponses,        color: stats.noResponses > 0 ? 'text-coral' : 'text-navy' },
          { label: 'Promedio respuestas',       value: stats.avg,                color: 'text-navy' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-2xl p-5 bg-surface-card shadow-[var(--shadow-md)]">
            <p className="text-[11px] tracking-widest uppercase text-navy-light/80 font-display">
              {label}
            </p>
            <p className={cn('mt-2 text-4xl font-extrabold tabular-nums font-display', color)}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <FilterChips
          chips={CATEGORY_FILTERS}
          activeKey={categoryFilter}
          onSelect={k => setCategoryFilter(k as CategoryFilter)}
          ariaLabel="Filtrar formularios por categoría"
          className="flex-1"
        />
        <FilterChips
          chips={ESTADO_FILTERS}
          activeKey={estadoFilter}
          onSelect={k => setEstadoFilter(k as EstadoFilter)}
          ariaLabel="Filtrar formularios por estado"
        />
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-light/80" />
          <input
            className="rounded-xl bg-surface-low pl-8 pr-3 py-2 text-sm text-navy outline-none focus:ring-1 focus:ring-coral/30 w-full sm:w-56 font-body"
            placeholder="Buscar formulario..."
            aria-label="Buscar formulario"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
      </div>

      {deleteTarget && (
        <Modal onClose={() => setDeleteTarget(null)} titleId="del-form-title" width={440}>
          {/* El Modal compartido NO trae padding: lo pone cada uso (p-6 es la
              convención del resto del sistema). Sin esto el contenido quedaba
              pegado a los bordes del panel. */}
          <div className="p-6 space-y-4">
            <h2 id="del-form-title" className="pr-6 text-lg font-display font-extrabold text-navy">
              Eliminar “{deleteTarget.name}”
            </h2>
            <p className="text-[13px] text-navy-light/80 font-body">
              {deleteWarning(deleteTarget)}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-full px-4 py-2 text-[13px] text-navy-light hover:bg-surface-low transition-colors font-body"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className="inline-flex items-center gap-1.5 rounded-full bg-coral px-4 py-2 text-[13px] text-white hover:bg-coral-deep transition-colors disabled:opacity-40 font-body"
              >
                <Trash2 size={13} />
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* List */}
      <div className="rounded-2xl overflow-hidden bg-surface-card shadow-[var(--shadow-md)]">
        {filtered.length === 0 ? (
          <EmptyState icon={FileText} title="No hay formularios con ese filtro" />
        ) : (
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Formulario', 'Categoría', 'Respuestas', 'Última respuesta', 'Estado', ''].map(h => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[11px] tracking-widest uppercase text-navy-light/80 font-display"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((form, idx) => {
                  const CatIcon = CATEGORY_ICONS[form.category] ?? FileText
                  return (
                    <tr
                      key={form.id}
                      onClick={() => window.location.href = `/formularios/${form.id}`}
                      className={cn(
                        'hover:bg-navy/5 transition-colors cursor-pointer group',
                        idx % 2 === 1 ? 'bg-surface-low/40' : ''
                      )}
                    >
                      {/* Nombre */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-surface-low">
                            <CatIcon size={15} className="text-navy-light/80" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-navy font-body">
                              {form.name}
                            </p>
                            {form.entity_name && (
                              <span className="text-[13px] text-navy-light/80 font-body">
                                {form.entity_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Categoría */}
                      <td className="px-4 py-3">
                        <span className="text-[13px] text-navy-light/80 font-body">
                          {CATEGORY_LABELS[form.category] ?? form.category}
                        </span>
                      </td>

                      {/* Respuestas */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <MessageSquare size={12} className="text-navy-light/80" />
                          <span className="text-sm text-navy tabular-nums font-mono">
                            {form.responses_count}
                          </span>
                        </div>
                      </td>

                      {/* Última respuesta */}
                      <td className="px-4 py-3">
                        <span className="text-[13px] text-navy-light/80 whitespace-nowrap font-body">
                          {form.last_response_at
                            ? new Date(form.last_response_at).toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' })
                            : '—'}
                        </span>
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'rounded-full px-2.5 py-0.5 text-[11px] font-semibold font-display',
                            FORM_WINDOW_BADGE[formWindowStatus(form)]
                          )}
                        >
                          {FORM_WINDOW_LABEL[formWindowStatus(form)]}
                        </span>
                      </td>

                      {/* Acciones */}
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link
                            href={`/formularios/${form.id}`}
                            className="rounded-lg px-2.5 py-1 text-[13px] text-navy-light border border-[var(--outline-variant)] hover:bg-surface-low transition-colors font-body"
                          >
                            Editar
                          </Link>
                          <Link
                            href={`/formularios/${form.id}/respuestas`}
                            className="rounded-lg px-2.5 py-1 text-[13px] text-navy-light border border-[var(--outline-variant)] hover:bg-surface-low transition-colors font-body"
                          >
                            Respuestas
                          </Link>
                          <Link
                            href={`/formularios/${form.id}/preview`}
                            className="rounded-lg p-1.5 text-navy-light border border-[var(--outline-variant)] hover:bg-surface-low transition-colors"
                          >
                            <Eye size={12} />
                          </Link>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setMenuOpen(menuOpen === form.id ? null : form.id)}
                              className="rounded-lg p-1.5 text-navy-light border border-[var(--outline-variant)] hover:bg-surface-low transition-colors"
                            >
                              <MoreHorizontal size={12} />
                            </button>
                            {menuOpen === form.id && (
                              <div
                                className="absolute right-0 top-8 z-20 rounded-xl border py-1 min-w-36 shadow-lg bg-surface-card border-[var(--outline-variant)]"
                              >
                                {/* Compartir: solo en los formularios ABIERTOS
                                    ("cualquiera con el link") y activos. En los
                                    demás, formFillAccess rechaza a quien llegue
                                    y el link sería una puerta cerrada.
                                    Cuál de los dos links copia lo decide
                                    formShareLink según requires_auth. */}
                                {sePuedeCompartir(form) && (
                                  <button
                                    type="button"
                                    onClick={() => copiarLink(form)}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-navy-light hover:bg-surface-low transition-colors font-body"
                                  >
                                    <Link2 size={13} className="text-navy-light/80" />
                                    Compartir link
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDuplicate(form.id)}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-navy-light hover:bg-surface-low transition-colors font-body"
                                >
                                  <Copy size={13} className="text-navy-light/80" />
                                  Duplicar
                                </button>
                                {canPublishForm(form) ? (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleActive(form.id, true)}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-teal-deep hover:bg-teal-soft/20 transition-colors font-body"
                                  >
                                    <Send size={13} className="text-teal-deep/60" />
                                    Publicar
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleActive(form.id, false)}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-navy-light hover:bg-surface-low transition-colors font-body"
                                  >
                                    <Archive size={13} className="text-navy-light/80" />
                                    Desactivar
                                  </button>
                                )}
                                {/* Eliminar: desactivado y SIN respuestas. El
                                    backend lo vuelve a validar (409). Cuando no
                                    se puede, el botón se muestra apagado con el
                                    motivo — esconderlo dejaba a quien lo busca
                                    sin saber por qué no está. */}
                                {puedeBorrar && (() => {
                                  const motivo = deleteBlockedReason(form)
                                  return (
                                    <button
                                      type="button"
                                      disabled={!!motivo}
                                      title={motivo ? FORM_ACTION_MESSAGES[motivo] : undefined}
                                      onClick={() => { setMenuOpen(null); setDeleteTarget(form) }}
                                      className={cn(
                                        'w-full flex items-center gap-2 px-3 py-2 text-[13px] transition-colors font-body',
                                        motivo
                                          ? 'text-navy-light/40 cursor-not-allowed'
                                          : 'text-coral hover:bg-coral/5',
                                      )}
                                    >
                                      <Trash2 size={13} className={motivo ? 'text-navy-light/40' : 'text-coral/60'} />
                                      Eliminar
                                    </button>
                                  )
                                })()}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobile: tarjetas */}
        {filtered.length > 0 && (
          <ul className="md:hidden divide-y divide-[var(--outline-variant)]">
            {visible.map(form => {
              const CatIcon = CATEGORY_ICONS[form.category] ?? FileText
              return (
                // En celular la tarjeta entera llevaba al EDITOR y no había
                // ninguna forma de llegar a las respuestas: en escritorio hay
                // una columna de acciones que en móvil no existe. Ahora son dos
                // destinos explícitos, y de paso enlaces de verdad en vez de un
                // div con onClick — se abren en pestaña nueva y funcionan con
                // teclado, que antes no.
                <li key={form.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 bg-surface-low">
                      <CatIcon size={16} className="text-navy-light/80" />
                    </div>
                    <Link
                      href={`/formularios/${form.id}`}
                      className="min-w-0 flex-1 -my-1 py-1 active:bg-surface-low rounded-lg"
                    >
                      <p className="truncate text-sm font-medium text-navy font-body">{form.name}</p>
                      <p className="truncate text-[13px] text-navy-light/80 font-body">
                        {CATEGORY_LABELS[form.category] ?? form.category}
                      </p>
                    </Link>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold font-display',
                        FORM_WINDOW_BADGE[formWindowStatus(form)]
                      )}
                    >
                      {FORM_WINDOW_LABEL[formWindowStatus(form)]}
                    </span>
                  </div>
                  {/* El conteo ES el enlace a las respuestas: quien mira cuántas
                      hay es porque las quiere ver. */}
                  <Link
                    href={`/formularios/${form.id}/respuestas`}
                    className="mt-2 ml-12 inline-flex items-center gap-1.5 rounded-full border border-[var(--outline-variant)] px-3 py-1.5 text-[13px] text-navy-light active:bg-surface-low font-body"
                  >
                    <Inbox size={13} aria-hidden />
                    Ver {form.responses_count} respuesta{form.responses_count !== 1 ? 's' : ''}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        {filtered.length > 0 && (
          <LoadMoreFooter
            shown={shown}
            total={total}
            hasMore={hasMore}
            loading={false}
            onLoadMore={loadMore}
            noun="formularios"
            increment={25}
          />
        )}
      </div>
    </div>
  )
}
