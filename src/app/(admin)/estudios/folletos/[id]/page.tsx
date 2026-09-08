'use client'

import { use, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePermissions } from '@/hooks/usePermissions'
import { AccessDenied } from '@/components/shared/AccessDenied'
import { PageContainer } from '@/components/layout/PageContainer'
import { useToast } from '@/components/shared/Toast'
import { cn } from '@/lib/utils'
import {
  ChevronLeft, Loader2, MapPin, Users, CalendarDays, Printer, ChevronRight,
  GraduationCap, AlertTriangle, Video,
} from 'lucide-react'
import { textoDesglose } from '@/lib/studies/folleto-desglose'
import { textoDesfase, textoHorario } from '@/lib/email/folleto-request-notify'
import { FOLLETO_STATE_LABEL, FOLLETO_STATE_BADGE, nextFolletoState } from '@/lib/studies/folletos'
import { FOLLETO_TIPO_LABEL, FOLLETO_TIPO_BADGE, type FolletoTipo } from '@/lib/studies/bloques'
import type { FolletoDetalle } from '@/lib/supabase/queries/folletos'

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return '—'
  return new Date(y, m - 1, d).toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Una fila etiqueta/valor. `alerta` la pinta en coral: es para los datos que
 *  FALTAN y hay que ir a buscar, no para un dato que no aplica. */
function Dato({ label, children, alerta = false }: {
  label: string; children: React.ReactNode; alerta?: boolean
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 border-b border-[var(--outline-variant)] last:border-0">
      <dt className="text-[11px] uppercase tracking-widest text-navy-light font-display w-full sm:w-44 sm:shrink-0">{label}</dt>
      <dd className={cn('text-sm font-body min-w-0', alerta ? 'text-coral-deep font-semibold' : 'text-navy')}>{children}</dd>
    </div>
  )
}

function Tarjeta({ icon: Icon, title, sub, children }: {
  icon: React.ElementType; title: string; sub?: string; children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl overflow-hidden bg-surface-card shadow-[var(--shadow-md)]">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--outline-variant)]">
        <Icon size={16} className="text-coral shrink-0" aria-hidden />
        <h2 className="text-sm font-semibold text-navy font-display">{title}</h2>
        {sub && <span className="text-[13px] text-navy-light font-body">{sub}</span>}
      </div>
      <dl className="px-5 py-3">{children}</dl>
    </section>
  )
}

export default function FolletoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { can, loaded } = usePermissions()
  const puedeVer = can('folletos', 'view')
  const puedeEditar = can('folletos', 'edit')
  const toast = useToast()

  const [d, setD] = useState<FolletoDetalle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // `setLoading(true)` no va acá: el estado ya arranca en true y llamarlo
  // sincrónicamente desde el effect encadena renders (react-hooks lo marca).
  // En la recarga después de avanzar el estado, la pantalla se queda con los
  // datos viejos un instante en vez de parpadear a "Cargando…", que se lee
  // mejor.
  const cargar = useCallback(() => {
    fetch(`/api/studies/folletos/${id}`)
      .then(async r => {
        const body = await r.json().catch(() => null)
        if (!r.ok) throw new Error(body?.error ?? 'No se pudo cargar la solicitud.')
        return body as FolletoDetalle
      })
      .then(setD)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { if (puedeVer) cargar() }, [puedeVer, cargar])

  async function avanzar() {
    if (!d) return
    const next = nextFolletoState(d.status)
    if (!next) return
    setBusy(true)
    try {
      const r = await fetch('/api/studies/folletos/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [d.id], status: next }),
      })
      const body = await r.json().catch(() => null)
      if (!r.ok) throw new Error(body?.error ?? 'No se pudo cambiar el estado.')
      toast(`Pasó a ${FOLLETO_STATE_LABEL[next]}.`, 'success')
      cargar()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo cambiar el estado.', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loaded && !puedeVer) return <AccessDenied />

  const next = d ? nextFolletoState(d.status) : null

  return (
    <PageContainer width="work" className="space-y-6">
      <Link
        href="/estudios/folletos"
        className="inline-flex items-center gap-1 text-[13px] text-navy-light/80 hover:text-navy transition-colors font-body"
      >
        <ChevronLeft size={14} aria-hidden /> Volver a folletos
      </Link>

      {/* El h1 va fuera del condicional para que exista también mientras carga
          o si falla: es el encabezado de la pantalla, no del contenido. */}
      <h1 className="text-2xl text-navy font-display font-extrabold tracking-[-0.02em]">
        Solicitud de folletos
      </h1>

      {loading ? (
        <p className="py-10 text-center text-sm text-navy-light font-body inline-flex items-center gap-2 justify-center w-full">
          <Loader2 size={15} className="animate-spin" aria-hidden /> Cargando…
        </p>
      ) : error || !d ? (
        <div className="rounded-2xl bg-surface-card shadow-[var(--shadow-md)] p-6">
          <p className="text-sm text-coral-deep font-body">{error ?? 'Esa solicitud no existe.'}</p>
        </div>
      ) : (
        <>
          {/* Encabezado: el total a imprimir y a dónde va, que es la decisión
              que toma quien abre esta pantalla. */}
          <div className="rounded-2xl bg-surface-card shadow-[var(--shadow-md)] p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold font-display', FOLLETO_TIPO_BADGE[d.tipo as FolletoTipo] ?? '')}>
                {FOLLETO_TIPO_LABEL[d.tipo as FolletoTipo] ?? d.tipo}
              </span>
              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold font-display', FOLLETO_STATE_BADGE[d.status])}>
                {FOLLETO_STATE_LABEL[d.status]}
              </span>
            </div>

            <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
              <p className="text-4xl font-bold text-coral font-display tabular-nums">{d.desglose.total}</p>
              <p className="text-lg text-navy font-display font-semibold min-w-0">
                folletos de {d.nivel ?? 'estudio'}
              </p>
            </div>
            <p className="text-[13px] text-navy-light font-body">{textoDesglose(d.desglose)}</p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <MapPin size={15} className={cn('shrink-0', d.sede_entrega ? 'text-teal-deep' : 'text-coral-deep')} aria-hidden />
              {d.sede_entrega ? (
                <p className="text-sm text-navy font-body">
                  Enviar a <strong>{d.sede_entrega}</strong>
                </p>
              ) : (
                <p className="text-sm text-coral-deep font-semibold font-body">
                  Sin destino — hay que preguntarle a quien cerró el grupo
                </p>
              )}
            </div>

            {puedeEditar && next && (
              <button
                onClick={avanzar}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full bg-teal-deep px-4 py-2 text-sm text-white hover:opacity-90 transition-opacity disabled:opacity-60 font-body"
              >
                {busy ? <><Loader2 size={15} className="animate-spin" aria-hidden /> Aplicando…</> : <>Pasar a {FOLLETO_STATE_LABEL[next]} <ChevronRight size={14} aria-hidden /></>}
              </button>
            )}
          </div>

          {/* A quién se le entrega */}
          <Tarjeta icon={Users} title="A quién se le entrega">
            <Dato label="Grupo">
              {d.grupo
                ? <Link href={`/estudios/grupos/${d.grupo.id}`} className="text-teal-deep hover:underline">{d.grupo.name ?? 'sin nombre'}</Link>
                : <span className="text-navy-light">{d.target_leader_name ? 'Solicitud manual, sin grupo' : '—'}</span>}
            </Dato>
            <Dato label="Dirigente" alerta={!d.grupo?.dirigente && !d.target_leader_name}>
              {d.grupo?.dirigente ?? d.target_leader_name ?? 'Sin asignar — nadie va a recibir los folletos'}
            </Dato>
            {d.grupo?.co_dirigente && <Dato label="Co-dirigente">{d.grupo.co_dirigente}</Dato>}
            <Dato label="Se da en" alerta={!!d.grupo && !d.grupo.es_virtual && !d.grupo.ubicacion && !d.grupo.zona}>
              {d.grupo?.es_virtual ? (
                <span className="inline-flex items-center gap-1.5"><Video size={13} aria-hidden /> Virtual</span>
              ) : (
                [d.grupo?.ubicacion, d.grupo?.zona].filter(Boolean).join(' · ') || 'Sin definir'
              )}
            </Dato>
            {textoHorario(d.grupo) && <Dato label="Horario">{textoHorario(d.grupo)}</Dato>}
          </Tarjeta>

          {/* `available_at` es cuándo estarían en la sede: el cierre más los
              días de imprenta. No se muestra "se necesitan para" porque el
              curso arranca dos semanas después del cierre por estándar, así
              que la fecha de necesidad no aporta nada. */}
          <Tarjeta icon={CalendarDays} title="Fechas y pagos">
            <Dato label="Estarían listos">{fmtDate(d.available_at)}</Dato>
            <Dato label="Solicitud creada">{fmtDate(d.created_at)}</Dato>
            {d.pagos.total > 0 && (
              <Dato label="Pagos" alerta={d.pagos.pagados < d.pagos.total}>
                {d.pagos.pagados} de {d.pagos.total} ya pagaron su folleto
              </Dato>
            )}
            {d.note && <Dato label="Nota">“{d.note}”</Dato>}
          </Tarjeta>

          {/* De dónde vienen: solo el tiquete de cierre lo sabe. */}
          {d.cierre ? (
            <Tarjeta icon={GraduationCap} title="De dónde vienen estos estudiantes" sub="cierre del grupo anterior">
              <Dato label="Grupo que cerró">
                <Link href={`/estudios/grupos/${d.cierre.grupo.id}`} className="text-teal-deep hover:underline">
                  {d.cierre.grupo.name ?? 'sin nombre'}
                </Link>
              </Dato>
              {d.cierre.grupo.dirigente && <Dato label="Lo dirigía">{d.cierre.grupo.dirigente}</Dato>}
              <Dato label="Aprobados">
                {d.cierre.aprobados}{textoDesfase(d) ? ' pasaron de nivel' : ' — son los que necesitan folleto'}
              </Dato>
              {d.cierre.reprobados > 0 && <Dato label="Reprobados">{d.cierre.reprobados} (no avanzan, no llevan folleto)</Dato>}
              {d.cierre.retirados > 0 && <Dato label="Retirados">{d.cierre.retirados} (dejaron el estudio)</Dato>}
              {d.cierre.sin_evaluar > 0 && (
                <Dato label="Sin evaluar" alerta>
                  {d.cierre.sin_evaluar} — la cantidad puede subir si los evalúan y aprueban
                </Dato>
              )}
              {d.cierre.historicos > 0 && (
                <Dato label="Ya tenían el nivel">
                  {d.cierre.historicos} de la importación de datos viejos — no avanzan ni llevan folleto
                </Dato>
              )}
              {textoDesfase(d) && (
                <p className="pt-3 text-[13px] text-coral-deep font-body">{textoDesfase(d)}</p>
              )}
              <div className="pt-3">
                <Link
                  href={`/estudios/grupos/${d.cierre.grupo.id}/resumen-cierre`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-navy/15 px-4 py-2 text-sm text-navy hover:bg-surface-low transition-colors font-body"
                >
                  Ver el detalle del cierre <ChevronRight size={14} aria-hidden />
                </Link>
              </div>
            </Tarjeta>
          ) : (
            <div className="rounded-2xl bg-surface-card shadow-[var(--shadow-md)] p-5">
              <p className="flex items-start gap-2 text-[13px] text-navy-light font-body">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-navy-light" aria-hidden />
                <span>
                  Esta solicitud se generó antes de que el grupo arranque
                  ({FOLLETO_TIPO_LABEL[d.tipo as FolletoTipo] ?? d.tipo}), así que todavía no hay
                  resultados de cierre — ni aprobados ni reprobados que reportar.
                </span>
              </p>
            </div>
          )}

          <p className="flex items-start gap-2 text-[13px] text-navy-light font-body">
            <Printer size={14} className="mt-0.5 shrink-0 text-navy-light" aria-hidden />
            <span>El total incluye el folleto del dirigente y del co-dirigente: ellos también dan el estudio.</span>
          </p>
        </>
      )}
    </PageContainer>
  )
}
