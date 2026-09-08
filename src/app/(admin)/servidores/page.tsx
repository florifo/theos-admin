'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { type CommitteeData } from '@/types/server'
import { useServers } from '@/hooks/useServers'
import { useOrg } from '@/lib/org'
import { ColumnSelector, type ColumnDef } from '@/components/shared/ColumnSelector'
import { ExportButton } from '@/components/shared/ExportButton'
import { type FlatServer, SERVER_COLUMNS } from '@/lib/servers/columns'
import { cn } from '@/lib/utils'
import { Plus, Users, Briefcase, ClipboardList, AlertCircle } from 'lucide-react'

function CommitteeCard({ committee, onClick }: { committee: CommitteeData; onClick: () => void }) {
  const activeMembers = committee.members.filter(m => m.status === 'active')
  const avatars = activeMembers.slice(0, 4)

  return (
    <div
      onClick={onClick}
      className="rounded-2xl p-5 space-y-4 cursor-pointer hover:shadow-lg transition-all duration-150 group bg-surface-card shadow-[var(--shadow-md)]"
    >
      {/* Name + vacancy badge */}
      <div className="flex items-start justify-between gap-2">
        <p
          className="text-sm font-semibold text-navy leading-snug group-hover:text-coral transition-colors font-display"
        >
          {committee.name}
        </p>
        {committee.open_vacancies > 0 && (
          <span
            className="shrink-0 rounded-full bg-coral/10 px-2 py-0.5 text-[11px] font-semibold text-coral font-display"
          >
            {committee.open_vacancies} vacante{committee.open_vacancies !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Leader */}
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-full bg-navy/10 flex items-center justify-center shrink-0">
          <span className="text-[11px] font-bold text-navy font-display">
            {committee.leader.initials}
          </span>
        </div>
        <p className="text-[13px] text-navy-light/80 truncate font-body">
          {committee.leader.name}
        </p>
      </div>

      {/* Avatars + count */}
      <div className="flex items-center justify-between">
        <div className="flex -space-x-1.5">
          {avatars.map(m => (
            <div
              // Mismo cuidado que en la tabla del comité: quien sirve en dos
              // puestos aparece dos veces y con solo el member_id compartirían
              // clave.
              key={`${m.member_id}-${m.position_id}`}
              className="h-7 w-7 rounded-full bg-navy flex items-center justify-center ring-2 ring-white"
              title={m.name}
            >
              <span className="text-[11px] font-bold text-white font-display">
                {m.initials}
              </span>
            </div>
          ))}
          {activeMembers.length > 4 && (
            <div className="h-7 w-7 rounded-full bg-surface-low flex items-center justify-center ring-2 ring-white">
              <span className="text-[11px] font-medium text-navy-light/80 font-display">
                +{activeMembers.length - 4}
              </span>
            </div>
          )}
        </div>
        <span className="text-[13px] text-navy-light/80 font-body">
          {activeMembers.length} activo{activeMembers.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}

export default function ServidoresPage() {
  const router = useRouter()
  const { committees, vacancies, applications } = useServers('committees', 'vacancies', 'applications')
  const { areas: AREAS } = useOrg()
  const AREA_FILTERS = useMemo(
    () => [{ key: 'all', label: 'Todos' }, ...AREAS.map(a => ({ key: a.code, label: a.name }))],
    [AREAS],
  )
  const [areaFilter, setAreaFilter] = useState('all')
  const [visibleColumns, setVisibleColumns] = useState<ColumnDef<FlatServer>[]>(
    SERVER_COLUMNS.filter(c => c.defaultVisible)
  )

  // Puestos ocupados = asignaciones activas (una persona en 2 puestos cuenta 2).
  // Personas únicas = member_id distintos entre los activos.
  const { puestosOcupados, personasUnicas } = useMemo(() => {
    const ids = new Set<string>()
    let count = 0
    for (const c of committees) {
      for (const m of c.members) {
        if (m.status === 'active') { count++; ids.add(m.member_id) }
      }
    }
    return { puestosOcupados: count, personasUnicas: ids.size }
  }, [committees])
  const totalCommittees = committees.length
  const openVacancies   = vacancies.filter(v => v.status === 'aprobado').length
  const pendingApps     = applications.filter(a => a.status === 'pending').length

  const filteredAreas = useMemo(() => {
    return AREAS.map(area => ({
      ...area,
      committees: committees.filter(
        c => c.area_code === area.code && (areaFilter === 'all' || c.area_code === areaFilter)
      ),
    })).filter(a => a.committees.length > 0)
  }, [AREAS, committees, areaFilter])

  const flatServers = useMemo<FlatServer[]>(() => {
    const visibleCommittees = committees.filter(
      c => areaFilter === 'all' || c.area_code === areaFilter
    )
    return visibleCommittees.flatMap(c =>
      c.members.map(m => ({
        ...m,
        committee: c.name,
        area: c.area,
        leader_name: c.leader.name,
        email: m.email ?? null,
        phone: m.phone ?? null,
        birth_date: m.birth_date ?? null,
      }))
    )
  }, [committees, areaFilter])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className="rounded-2xl bg-navy px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-start sm:justify-between gap-4 shadow-[var(--shadow-md)]"
      >
        <div>
          <h1
            className="text-2xl text-white font-display font-extrabold tracking-[-0.02em]"
          >
            Servidores
          </h1>
          <p className="mt-1 text-sm text-white/80 font-body">
            {personasUnicas} personas en {puestosOcupados} puestos · {totalCommittees} comités
          </p>
        </div>
        <Link
          href="/servidores/vacantes/solicitar"
          className="inline-flex items-center gap-1.5 rounded-full bg-coral px-4 py-2 text-sm text-white hover:bg-coral-deep transition-all duration-150 shrink-0 font-body"
        >
          <Plus size={14} />
          Nuevo puesto de servicio
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Puestos ocupados',   value: puestosOcupados,   icon: Users,         color: 'text-navy' },
          { label: 'Personas únicas',    value: personasUnicas,    icon: Users,         color: 'text-teal-deep' },
          { label: 'Comités activos',    value: totalCommittees,   icon: Briefcase,     color: 'text-navy' },
          { label: 'Vacantes abiertas',  value: openVacancies,     icon: AlertCircle,   color: openVacancies > 0 ? 'text-coral' : 'text-navy' },
          { label: 'Apps pendientes',    value: pendingApps,       icon: ClipboardList, color: 'text-navy' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="rounded-2xl p-5 bg-surface-card shadow-[var(--shadow-md)]"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] tracking-widest uppercase text-navy-light/80 font-display">
                {label}
              </p>
              <Icon size={14} className="text-navy-light/80" />
            </div>
            <p className={cn('text-4xl font-extrabold tabular-nums font-display', color)}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Area chips + export actions */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {AREA_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setAreaFilter(f.key)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-[13px] font-medium border transition-all duration-150 font-display',
              areaFilter === f.key
                ? 'bg-navy text-white border-navy'
                : 'text-navy-light/80 hover:text-navy hover:bg-surface-low border-transparent'
            )}
          >
            {f.label}
          </button>
        ))}
        <div className="w-full sm:w-auto sm:ml-auto flex items-center gap-2">
          <ColumnSelector<FlatServer>
            columns={SERVER_COLUMNS}
            storageKey="theos_columns_servers"
            onChange={setVisibleColumns}
          />
          <ExportButton<FlatServer>
            data={flatServers}
            columns={visibleColumns}
            allColumns={SERVER_COLUMNS}
            filename="servidores-theos"
          />
        </div>
      </div>

      {/* Committees grouped by area */}
      <div className="space-y-8">
        {filteredAreas.map(area => (
          <div key={area.code} className="space-y-3">
            <div className="flex items-center gap-3">
              <p
                className="text-[13px] tracking-widest uppercase font-semibold text-navy-light/80 font-display"
              >
                {area.name}
              </p>
              <div className="flex-1 h-px bg-[var(--outline-variant)]" />
              <span className="text-[13px] text-navy-light/80 font-mono">
                {area.committees.length}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {area.committees.map(c => (
                <CommitteeCard
                  key={c.id}
                  committee={c}
                  onClick={() => router.push(`/servidores/${c.id}`)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
