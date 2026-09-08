'use client'

import { useState, useMemo, useEffect } from 'react'
import { filtrarServidores, type FiltroEstado } from '@/lib/servers/committee-filter'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { CommitteeServer, CommitteeGoal, CommitteeData } from '@/types/server'
import { useServers } from '@/hooks/useServers'
import { useDirigentes } from '@/hooks/useDirigentes'
import { cn } from '@/lib/utils'
import { useSortableTable } from '@/hooks/useSortableTable'
import { ColumnSelector, type ColumnDef } from '@/components/shared/ColumnSelector'
import { useToast } from '@/components/shared/Toast'
import { ExportButton } from '@/components/shared/ExportButton'
import { type FlatServer, SERVER_COLUMNS } from '@/lib/servers/columns'
import { esComiteDirigentes } from '@/lib/dirigentes'
import { CommitteeHeader } from './_components/CommitteeHeader'
import { MembersTab } from './_components/MembersTab'
import { VacanciesTab } from './_components/VacanciesTab'
import { GoalsTab } from './_components/GoalsTab'
import {
  DisconnectModal,
  EditCommitteeModal,
  AddServerModal,
  ChangePositionModal,
  type CommitteeFormState,
} from './_components/CommitteeModals'

type Tab = 'miembros' | 'vacantes' | 'metas' | 'estudios'
type StatusFilter = FiltroEstado
type DisconnectReason = 'renuncia' | 'cambio' | 'fin-periodo' | 'otro'

export default function CommitteeDetailPage() {
  const { committeeId } = useParams<{ committeeId: string }>()
  const router = useRouter()
  const toast = useToast()
  const { committees, vacancies, goalsByCommittee, refetch } = useServers('committees', 'vacancies', 'goals')

  const committee = useMemo(
    () => committees.find(c => c.id === committeeId),
    [committees, committeeId]
  )
  // El comité de Dirigentes (de estudios) muestra una pestaña extra con el
  // resumen de estudios de cada servidor.
  const isDirigentes = !!committee && esComiteDirigentes(committee.name, { excludeAdministrativo: true })

  const [tab, setTab] = useState<Tab>('miembros')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [visibleColumns, setVisibleColumns] = useState<ColumnDef<FlatServer>[]>(
    SERVER_COLUMNS.filter(c => c.defaultVisible),
  )


  // Disconnect modal
  const [disconnectTarget, setDisconnectTarget] = useState<CommitteeServer | null>(null)
  const [disconnectReason, setDisconnectReason] = useState<DisconnectReason>('renuncia')
  const [disconnectOtherReason, setDisconnectOtherReason] = useState('')
  const [disconnectDate, setDisconnectDate] = useState(new Date().toISOString().split('T')[0])

  // Edit committee modal
  const [editCommitteeOpen, setEditCommitteeOpen] = useState(false)
  const [committeeForm, setCommitteeForm] = useState<CommitteeFormState>({
    name: '', parent_id: '', leader_id: '', leader_name: '',
  })
  useEffect(() => {
    if (!committee) return
    setCommitteeForm({
      name: committee.name,
      parent_id: committee.area_code, // area_code = parent_id en el dominio
      leader_id: committee.leader.member_id ?? '',
      leader_name: committee.leader.name ?? '',
    })
  }, [committee])
  // Áreas reales (tipo area) para el dropdown de área padre.
  const [areas, setAreas] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    let alive = true
    fetch('/api/servers/areas')
      .then(r => (r.ok ? r.json() : []))
      .then((d: Array<{ id: string; name: string }>) => { if (alive) setAreas((Array.isArray(d) ? d : []).map(a => ({ id: a.id, name: a.name }))) })
      .catch(() => {})
    return () => { alive = false }
  }, [])
  const [committeeOverride, setCommitteeOverride] = useState<Partial<CommitteeData>>({})

  // Add server modal
  const [addServerOpen, setAddServerOpen] = useState(false)
  const [serverSearch, setServerSearch] = useState('')
  const [addPositionId, setAddPositionId] = useState('')
  const [candidates, setCandidates] = useState<Array<{ id: string; first_name: string; last_name: string; email: string | null }>>([])

  // Change position modal (newPosition guarda el position_id destino)
  const [changePositionTarget, setChangePositionTarget] = useState<CommitteeServer | null>(null)
  const [newPosition, setNewPosition] = useState('')

  // Goals (local state)
  const [goals, setGoals] = useState<CommitteeGoal[]>([])
  useEffect(() => { setGoals(goalsByCommittee[committeeId] ?? []) }, [goalsByCommittee, committeeId])
  const [newGoalText, setNewGoalText] = useState('')
  const [newGoalDate, setNewGoalDate] = useState('')
  const [showGoalForm, setShowGoalForm] = useState(false)

  const committeeVacancies = useMemo(
    () => vacancies.filter(v => v.committee_id === committeeId),
    [vacancies, committeeId]
  )

  const allCommitteeMembers = useMemo(
    () => committee?.members ?? [],
    [committee]
  )

  // La MISMA lista alimenta la tabla y el export (ver committee-filter.ts: eran
  // dos expresiones distintas y se desalinearon).
  const displayedMembers = useMemo(
    () => filtrarServidores(allCommitteeMembers, { search, status: statusFilter }),
    [allCommitteeMembers, search, statusFilter]
  )

  // Servidores del comité aplanados para exportar (mismas columnas que el
  // listado general).
  //
  // BUG 2026-09-08: esto mapeaba `committee.members`, o sea TODOS, mientras la
  // pantalla mostraba `displayedMembers`. En Sede Meridiano Martes el encabezado
  // decía 67 servidores y el archivo traía 84 filas: los 67 activos más los 17
  // inactivos, que el filtro por defecto esconde. Quien exporta espera bajar lo
  // que está viendo, no la tabla entera — y sin darse cuenta manda una lista con
  // gente que ya no sirve ahí.
  const flatServers = useMemo<FlatServer[]>(
    () => displayedMembers.map(m => ({
      member_id: m.member_id, name: m.name, initials: m.initials,
      position: m.position, start_date: m.start_date, status: m.status,
      committee: committee?.name ?? '', area: committee?.area ?? '',
      leader_name: committee?.leader.name ?? '',
      email: m.email ?? null, phone: m.phone ?? null, birth_date: m.birth_date ?? null,
    })),
    [displayedMembers, committee],
  )

  const activeCount = useMemo(
    () => allCommitteeMembers.filter(m => m.status === 'active').length,
    [allCommitteeMembers]
  )

  const existingMemberIds = useMemo(
    () => new Set(allCommitteeMembers.map(m => m.member_id)),
    [allCommitteeMembers]
  )

  // Búsqueda de candidatos contra la BD (miembros activos que no están ya en el comité).
  useEffect(() => {
    const q = serverSearch.trim()
    if (!q) { setCandidates([]); return }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/members?search=${encodeURIComponent(q)}&pageSize=8`, { signal: ctrl.signal })
        if (!res.ok) return
        const { members } = await res.json()
        setCandidates((members ?? []).filter((m: { id: string }) => !existingMemberIds.has(m.id)))
      } catch { /* abortado */ }
    }, 250)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [serverSearch, existingMemberIds])

  const filteredCandidates = candidates

  const { sorted: sortedMembers, sortKey: memberSortKey, sortDir: memberSortDir, toggleSort: toggleMemberSort } = useSortableTable(displayedMembers)

  if (!committee) {
    return (
      <div className="flex items-center justify-center min-h-60">
        <p className="text-sm text-navy-light/80 font-body">
          Comité no encontrado.
        </p>
      </div>
    )
  }

  async function handleDisconnect() {
    if (!disconnectTarget?.position_id) { setDisconnectTarget(null); return }
    const { position_id, member_id } = disconnectTarget
    setDisconnectTarget(null)
    try {
      const res = await fetch('/api/servers/volunteers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position_id, member_id }),
      })
      if (!res.ok) throw new Error('disconnect failed')
      await refetch()
    } catch {
      toast('No se pudo desconectar al servidor. Intentá de nuevo.', 'error')
    }
  }

  async function updateCommitteeInMock() {
    // Reflejo inmediato del nombre; el área padre y el encargado se ven al refetch.
    setCommitteeOverride({ name: committeeForm.name })
    setEditCommitteeOpen(false)
    try {
      const res = await fetch(`/api/servers/committees/${committeeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: committeeForm.name,
          parent_id: committeeForm.parent_id || null,
          leader_id: committeeForm.leader_id || null,
        }),
      })
      if (!res.ok) throw new Error('update failed')
      await refetch()
    } catch {
      setCommitteeOverride({}) // revertir el nombre optimista
      toast('No se pudieron guardar los cambios del comité. Intentá de nuevo.', 'error')
    }
  }

  async function addServerToCommittee(memberId: string) {
    if (!addPositionId) return
    const position_id = addPositionId
    setServerSearch('')
    setAddServerOpen(false)
    setAddPositionId('')
    try {
      const res = await fetch('/api/servers/volunteers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position_id, member_id: memberId }),
      })
      if (!res.ok) throw new Error('assign failed')
      await refetch()
    } catch {
      toast('No se pudo agregar el servidor al comité. Intentá de nuevo.', 'error')
    }
  }

  // Cambiar puesto = baja del puesto actual + alta en el nuevo (newPosition es el position_id destino).
  async function updateMemberPosition() {
    if (!changePositionTarget || !newPosition) return
    const { member_id, position_id: oldPositionId } = changePositionTarget
    const newPositionId = newPosition
    setChangePositionTarget(null)
    setNewPosition('')
    if (newPositionId === oldPositionId) return
    try {
      if (oldPositionId) {
        await fetch('/api/servers/volunteers', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ position_id: oldPositionId, member_id }),
        })
      }
      const res = await fetch('/api/servers/volunteers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position_id: newPositionId, member_id }),
      })
      if (!res.ok) throw new Error('change position failed')
      await refetch()
    } catch {
      toast('No se pudo cambiar el puesto del servidor. Revisá su asignación e intentá de nuevo.', 'error')
    }
  }

  async function addGoal() {
    const description = newGoalText.trim()
    if (!description) return
    const due_date = newGoalDate || null
    setNewGoalText('')
    setNewGoalDate('')
    setShowGoalForm(false)
    try {
      const res = await fetch('/api/servers/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ committee_id: committeeId, description, due_date }),
      })
      if (!res.ok) throw new Error('create goal failed')
      await refetch()
    } catch {
      toast('No se pudo crear la meta. Intentá de nuevo.', 'error')
    }
  }

  async function toggleGoal(id: string) {
    const goal = goals.find(g => g.id === id)
    if (!goal) return
    const status = goal.status === 'completed' ? 'in_progress' : 'completed'
    setGoals(prev => prev.map(g => g.id === id ? { ...g, status } : g)) // optimista
    try {
      const res = await fetch(`/api/servers/goals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('toggle goal failed')
      await refetch()
    } catch {
      setGoals(prev => prev.map(g => g.id === id ? { ...g, status: goal.status } : g)) // revertir
      toast('No se pudo actualizar la meta.', 'error')
    }
  }

  function handleChangePositionOpen(member: CommitteeServer) {
    setChangePositionTarget(member)
    setNewPosition(member.position_id ?? '')
  }

  return (
    <div className="page">

      {/* ── Header ── */}
      <CommitteeHeader
        committee={committee}
        committeeOverride={committeeOverride}
        activeCount={activeCount}
        onBack={() => router.push('/servidores')}
        onEditClick={() => {
          setCommitteeForm({
            name: committeeOverride.name ?? committee.name,
            parent_id: committee.area_code,
            leader_id: committee.leader.member_id ?? '',
            leader_name: committee.leader.name ?? '',
          })
          setEditCommitteeOpen(true)
        }}
        onAddServerClick={() => setAddServerOpen(true)}
      />

      {/* ── Tabs card ── */}
      <div className="card w-full min-w-0">
        <div className="flex overflow-x-auto border-b border-[rgba(22,20,64,0.09)] py-0 px-1">
          {((['miembros', 'vacantes', 'metas', ...(isDirigentes ? ['estudios'] : [])]) as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'shrink-0 whitespace-nowrap px-5 py-3 text-sm capitalize transition-colors border-b-2 -mb-px font-display',
                tab === t
                  ? 'border-coral text-navy font-semibold'
                  : 'border-transparent text-navy-light/80 hover:text-navy'
              )}
            >
              {t === 'miembros' ? `Miembros` : t === 'vacantes' ? `Puestos de Servicio (${committeeVacancies.length})` : t === 'metas' ? 'Metas' : 'Estudios'}
            </button>
          ))}
        </div>

        {/* Tab: Miembros */}
        {tab === 'miembros' && (
          <MembersTab
            sortedMembers={sortedMembers}
            memberSortKey={memberSortKey}
            memberSortDir={memberSortDir}
            toggleMemberSort={toggleMemberSort}
            search={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            onChangePosition={handleChangePositionOpen}
            onDisconnect={setDisconnectTarget}
            onAddServerClick={() => setAddServerOpen(true)}
            toolbarExtra={
              <>
                <ColumnSelector<FlatServer>
                  columns={SERVER_COLUMNS}
                  storageKey="theos_columns_servers"
                  onChange={setVisibleColumns}
                />
                <ExportButton<FlatServer>
                  data={flatServers}
                  columns={visibleColumns}
                  allColumns={SERVER_COLUMNS}
                  filename={`servidores-${committee.name.replace(/\s+/g, '-').toLowerCase()}`}
                />
              </>
            }
          />
        )}

        {/* Tab: Vacantes */}
        {tab === 'vacantes' && (
          <VacanciesTab
            committeeId={committeeId}
            vacancies={committeeVacancies}
          />
        )}

        {/* Tab: Metas */}
        {tab === 'metas' && (
          <GoalsTab
            goals={goals}
            onToggleGoal={toggleGoal}
            showGoalForm={showGoalForm}
            onShowGoalForm={() => setShowGoalForm(true)}
            onHideGoalForm={() => setShowGoalForm(false)}
            newGoalText={newGoalText}
            onNewGoalTextChange={setNewGoalText}
            newGoalDate={newGoalDate}
            onNewGoalDateChange={setNewGoalDate}
            onAddGoal={addGoal}
          />
        )}

        {/* Tab: Estudios (solo comité de Dirigentes) */}
        {tab === 'estudios' && (
          <DirigentesEstudiosTab members={committee.members ?? []} />
        )}

        {/* Disconnect modal — rendered inside card to preserve original structure */}
        {disconnectTarget && (
          <DisconnectModal
            target={disconnectTarget}
            reason={disconnectReason}
            otherReason={disconnectOtherReason}
            date={disconnectDate}
            onReasonChange={setDisconnectReason}
            onOtherReasonChange={setDisconnectOtherReason}
            onDateChange={setDisconnectDate}
            onConfirm={handleDisconnect}
            onCancel={() => setDisconnectTarget(null)}
          />
        )}

      </div>{/* end .card tabs */}

      {/* ── Modal: Editar comité ── */}
      {editCommitteeOpen && (
        <EditCommitteeModal
          form={committeeForm}
          areas={areas}
          onFormChange={setCommitteeForm}
          onSave={updateCommitteeInMock}
          onCancel={() => setEditCommitteeOpen(false)}
        />
      )}

      {/* ── Modal: Añadir servidor ── */}
      {addServerOpen && (
        <AddServerModal
          serverSearch={serverSearch}
          onServerSearchChange={setServerSearch}
          filteredCandidates={filteredCandidates}
          positions={committee.positions ?? []}
          positionId={addPositionId}
          onPositionChange={setAddPositionId}
          onAddServer={addServerToCommittee}
          onClose={() => { setAddServerOpen(false); setServerSearch(''); setAddPositionId('') }}
        />
      )}

      {/* ── Modal: Cambiar puesto ── */}
      {changePositionTarget && (
        <ChangePositionModal
          target={changePositionTarget}
          newPosition={newPosition}
          positions={committee.positions ?? []}
          onPositionChange={setNewPosition}
          onConfirm={updateMemberPosition}
          onCancel={() => setChangePositionTarget(null)}
        />
      )}

    </div>
  )
}

// ─── Tab Estudios (solo comité de Dirigentes) ───────────────────────────────────
function DirigentesEstudiosTab({ members }: { members: CommitteeServer[] }) {
  const { dirigentes, loading } = useDirigentes()
  const byId = useMemo(() => new Map(dirigentes.map(d => [d.member_id, d])), [dirigentes])

  if (loading) {
    return (
      <div className="py-12 text-center font-body">
        <div className="h-7 w-7 mx-auto mb-3 rounded-full border-2 border-navy-light/20 border-t-coral animate-spin" />
        <p className="text-sm text-navy-light/80">Cargando estudios…</p>
      </div>
    )
  }

  const rows = members.map(m => ({
    member_id: m.member_id,
    name: m.name,
    total: byId.get(m.member_id)?.total_grupos ?? 0,
    activos: byId.get(m.member_id)?.total_activos ?? 0,
  }))

  return (
    <div className="p-4 sm:p-5">
      <p className="text-sm text-navy-light/80 font-body mb-3">
        Resumen de estudios liderados por cada servidor del comité.
      </p>
      <div className="space-y-1">
        {rows.map(r => (
          <Link
            key={r.member_id}
            href={`/estudios/dirigentes/${r.member_id}`}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-low transition-colors"
          >
            <span className="min-w-0 flex-1 text-sm text-navy font-body truncate">{r.name}</span>
            <span className="shrink-0 text-xs text-navy-light/80 font-body">
              {r.total} grupo{r.total === 1 ? '' : 's'} · {r.activos} activo{r.activos === 1 ? '' : 's'}
            </span>
            <span className="shrink-0 inline-flex items-center gap-1 text-xs text-coral font-body">Ver dirigente →</span>
          </Link>
        ))}
        {rows.length === 0 && (
          <p className="py-8 text-center text-sm text-navy-light/80 font-body">Sin servidores en el comité.</p>
        )}
      </div>
    </div>
  )
}
