import { toCurrency } from '@/lib/money'
import { ADMIN_ONLY_STATUSES, type LeaderStatus } from '@/lib/studies/leader-admin-status'
import { isPrematGroup, prematGroupError } from '@/lib/studies/premat-group'
import { createAdminClient, type Insertable } from '@/lib/supabase/admin'
import { groupLocksLeader } from '@/lib/studies/leader-activation'
import { isGroupFull, occupiesSpot, OCCUPYING_STATUSES } from '@/lib/studies/enrollment-capacity'
import { isEnrollmentWindowOpen } from '@/lib/studies/enrollment-window'
import { countBlockingStudyPayments } from '@/lib/supabase/queries/payments'
import { applyMemberSearch } from '@/lib/supabase/queries/members'
import { getGroupRestriction, memberPassesRestriction } from '@/lib/supabase/queries/group-restrictions'
import { hasRestriction, restrictionBlockedMessage, type GroupRestriction } from '@/lib/studies/group-restrictions'
import { ymdCR } from '@/lib/format'
import type { Json } from '@/types/database'
import type { GrupoParaExport, PersonaMin } from '@/lib/studies/participantes-export'
import type { ConteoCierre, ResultadoCierre } from '@/lib/studies/close-result-read'
import { estadoDeBaja, type TipoDeBaja } from '@/lib/studies/baja-matricula'

// NOTA: usamos createAdminClient (service role) porque la app corre con mock auth.
// Migrar a createClient de server.ts cuando haya Supabase Auth real.

// ── Tipos crudos ───────────────────────────────────────────

export type DbStudyPlan = {
  id: string
  code: string | null
  name: string
  description: string | null
  level: 'niveles' | 'etapa_inicial' | 'etapa_intermedia' | 'campanas'
  cost: number
  /** INT-2: moneda del costo (CRC/USD/EUR). */
  currency: string
  duration_weeks: number | null
  max_students: number | null
  requires_donor: boolean
  requires_attendance: boolean
  requires_payment: boolean
  requires_grade: boolean
  requires_server: boolean
  requires_bus_talk: boolean
  auto_promote: boolean
  prerequisite_code: string | null
  next_study_code: string | null
  min_attendance_pct: number
  is_active: boolean
  difficulty: string | null
  commitments: string | null
  mentor_id: string | null
  /** Mentor (dirigente referente) resuelto por join — para mostrar su nombre
   *  sin cargar toda la maquinaria de dirigentes. Solo lo trae getStudyPlans. */
  mentor?: { first_name: string; last_name: string } | null
  /** FALSE = charla introductoria (ej. BUS), fuera de análisis/matrícula/plan. */
  is_curricular: boolean
}

export type DbGroupEnriched = {
  id: string
  plan: { code: string | null } | null
  name: string
  leader_id: string | null
  co_leader_id: string | null
  /** GRU-3: phone/email SOLO vienen en el detalle (GROUP_SELECT), nunca en los
   *  listados — son datos personales y no tienen por qué viajar por lote. */
  leader: { first_name: string; last_name: string; phone?: string | null; email?: string | null } | null
  co_leader: { first_name: string; last_name: string; phone?: string | null; email?: string | null } | null
  zone: string | null
  schedule_days: string[] | null
  schedule_time: string | null
  location: string | null
  max_students: number | null
  starts_at: string | null
  ends_at: string | null
  /** GRU-1: ventana de matrícula (null = modo manual, sin ventana). */
  enrollment_start_date: string | null
  enrollment_end_date: string | null
  status: 'en_matricula' | 'en_curso' | 'finalizado'
  current_week: number
  whatsapp_group_url: string | null
  is_leader_training: boolean | null
  training_modality: string | null
  is_virtual: boolean | null
  /** GRU-2: restricción de audiencia del grupo (shape del filtro del padrón). */
  enrollment_restrictions: unknown
  age_min: number | null
  age_max: number | null
  enrollments: Array<{
    member_id: string
    status: 'enrolled' | 'waitlist' | 'completed' | 'dropped' | 'transferred' | 'pendiente_de_pago' | 'expirada' | 'reprobado' | 'en_revision'
    grade: number | null
    /** Resultado del cierre: 'aprobado' o 'reprobado: <motivo>'. */
    notes: string | null
    member: { first_name: string; last_name: string } | null
  }>
}

// ── Queries ────────────────────────────────────────────────

/** Catálogo de planes de estudio (StudyType). */
export async function getStudyPlans(): Promise<DbStudyPlan[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('study_plans')
    .select('*, mentor:members!study_plans_mentor_id_fkey(first_name, last_name)')
    .order('code', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as DbStudyPlan[]
}

/** Métricas del resumen de estudios, calculadas en la BD (no client-side).
 *  Categorías por study_plans.level:
 *    niveles        = N1–N4
 *    capacitaciones = etapa_inicial + etapa_intermedia
 *  Campañas (campanas) quedan FUERA de ambos boxes (se reportan aparte si hace falta).
 *  Estudiantes:
 *    activos (en_curso)   → inscripciones 'enrolled'  (los que cursan hoy)
 *    histórico (finalizado) → inscripciones 'completed' (los que pasaron por el grupo) */
/** Conteo de un box: grupos, inscripciones (participaciones) y estudiantes únicos
 *  (personas distintas). Todos EXCLUYEN a los dirigentes (líder/co-líder). */
export type StudyCount = { grupos: number; inscripciones: number; unicos: number }
export type StudyDashboardStats = {
  activos:   { niveles: StudyCount; capacitaciones: StudyCount }
  historico: { niveles: StudyCount; capacitaciones: StudyCount }
  campanas: StudyCount
}

export async function getStudyDashboardStats(): Promise<StudyDashboardStats> {
  const supabase = createAdminClient()
  // Vía RPC: por estado+categoría → grupos, inscripciones y únicos, excluyendo
  // dirigentes (study_dashboard_stats_v2). Campañas con su propio RPC.
  const [{ data, error }, { data: campRows }] = await Promise.all([
    supabase.rpc('study_dashboard_stats_v2'),
    supabase.rpc('campaign_student_counts'),
  ])
  if (error) throw error

  const c = (campRows?.[0] ?? {}) as Partial<StudyCount>
  const empty: StudyCount = { grupos: 0, inscripciones: 0, unicos: 0 }
  const stats: StudyDashboardStats = {
    activos:   { niveles: { ...empty }, capacitaciones: { ...empty } },
    historico: { niveles: { ...empty }, capacitaciones: { ...empty } },
    campanas: { grupos: Number(c.grupos ?? 0), inscripciones: Number(c.inscripciones ?? 0), unicos: Number(c.unicos ?? 0) },
  }
  for (const r of (data ?? []) as Array<{ estado: string; categoria: string; grupos: number; inscripciones: number; unicos: number }>) {
    const bucket = r.estado === 'en_curso' ? stats.activos : r.estado === 'finalizado' ? stats.historico : null
    if (!bucket) continue
    const val: StudyCount = { grupos: Number(r.grupos), inscripciones: Number(r.inscripciones), unicos: Number(r.unicos) }
    if (r.categoria === 'niveles') bucket.niveles = val
    else if (r.categoria === 'capacitaciones') bucket.capacitaciones = val
  }
  return stats
}

export type DbLeaderEnriched = {
  id: string
  member_id: string
  zone_preference: string[] | null
  availability_status: 'available' | 'assigned' | 'resting' | 'en_revision' | 'inactive'
  is_active: boolean
  qualified_study_codes: string[] | null
  formation_study_codes: string[] | null
  member: { first_name: string; last_name: string; is_donor: boolean } | null
  evaluations: Array<{
    id: string
    group_id: string | null
    score: number
    evaluation_date: string
    comments: string | null
  }>
}

/** Item del LISTADO de grupos: en vez de enrollments embebidos lleva solo
 *  CONTEOS por estado de dominio (C5 auditoría 2026-06-11: el listado pesaba
 *  varios MB y los consumidores solo cuentan). Los enrollments completos se
 *  cargan en el detalle (getGroupById) o vía getStudyGroupsWithEnrollments. */
export type DbGroupListItem = Omit<DbGroupEnriched, 'enrollments'> & {
  enrollment_counts: { enrolled: number; pending: number; withdrawn: number }
}

type RawListGroup = Omit<DbGroupEnriched, 'enrollments'> & {
  enrollments: Array<{ member_id: string; status: DbGroupEnriched['enrollments'][number]['status'] }>
}

// Misma agrupación que mapParticipantStatus del adapter de dominio.
function toListItem(g: RawListGroup): DbGroupListItem {
  const counts = { enrolled: 0, pending: 0, withdrawn: 0 }
  for (const e of g.enrollments) {
    // La capacidad es de ESTUDIANTES: el dirigente/co-dirigente no cuenta aunque
    // tenga inscripción en su propio grupo.
    if (e.member_id === g.leader_id || e.member_id === g.co_leader_id) continue
    if (e.status === 'enrolled' || e.status === 'completed') counts.enrolled++
    else if (e.status === 'waitlist' || e.status === 'pendiente_de_pago') counts.pending++
    else counts.withdrawn++ // dropped | transferred | expirada
  }
  const rest = { ...g }
  delete (rest as { enrollments?: unknown }).enrollments
  return { ...rest, enrollment_counts: counts }
}

/** Grupos de estudio con líder y conteos de participantes.
 *  Sin opts devuelve TODOS (comportamiento histórico, total = data.length);
 *  con page/pageSize devuelve esa página + total exacto. */
/** Filtros del listado de grupos — viajan al servidor (no se filtra en memoria). */
export type GroupFilters = {
  statuses?: string[]
  planCode?: string | null
  /** Varios tipos de estudio a la vez (códigos de plan). Lista vacía = sin
   *  filtrar, igual que no mandarla: un filtro sin nada escogido no esconde
   *  nada. Convive con `planCode` para los llamadores de un solo tipo. */
  planCodes?: string[] | null
  zone?: string | null
  /** true → solo los grupos SIN zona específica (zone IS NULL). */
  zoneNull?: boolean
  /** Día de la semana abreviado (L/M/X/J/V/S/D); match contra schedule_days. */
  day?: string | null
  /** Búsqueda por nombre de grupo o de dirigente/co-dirigente. */
  search?: string | null
  /** Solo grupos sin dirigente asignado (leader_id null). */
  noLeader?: boolean
  /** Solo grupos "prontos a cerrar": ends_at entre hoy y +30 días (mismo criterio
   *  que el conteo del dashboard `closing_soon`). */
  closingSoon?: boolean
  /** Solo grupos del bloque de capacitación (study_groups.bloque_id). */
  bloqueId?: string | null
  /** SEC-1: scope 'own' del dirigente — solo grupos donde es leader o co-leader.
   *  Viene del ctx del guard (uuid confiable), nunca del query string. */
  leaderMemberId?: string | null
  /** Rango por FECHA DE INICIO (starts_at), inclusive. Cualquiera de los dos
   *  puede ir solo: "desde marzo" o "hasta junio" son búsquedas válidas. */
  startFrom?: string | null
  startTo?: string | null
}

/** Resuelve las partes de los filtros que viven en tablas relacionadas:
 *  el plan (code → id) y los dirigentes que matchean la búsqueda (nombre → ids).
 *  Devuelve la cláusula `or` de búsqueda ya armada y el plan_id a igualar. */
async function resolveGroupFilters(
  supabase: ReturnType<typeof createAdminClient>,
  f: GroupFilters,
): Promise<{ planId: string | null; planIds: string[] | null; searchOr: string | null }> {
  let planId: string | null = null
  if (f.planCode) {
    // Plan inexistente → id imposible para forzar resultado vacío.
    planId = (await getPlanIdByCode(f.planCode)) ?? '00000000-0000-0000-0000-000000000000'
  }

  // Varios tipos: una sola consulta al catálogo, no una por código.
  // Un código que no existe simplemente no aporta id; si NINGUNO existe se
  // fuerza el resultado vacío en vez de ignorar el filtro — ignorarlo
  // devolvería todos los grupos, que es lo contrario de lo que se pidió.
  let planIds: string[] | null = null
  const codigos = (f.planCodes ?? []).filter(c => !!c && c.trim() !== '')
  if (codigos.length > 0) {
    const { data, error } = await supabase
      .from('study_plans').select('id').in('code', codigos)
    if (error) throw error
    const ids = ((data ?? []) as Array<{ id: string }>).map(r => r.id)
    planIds = ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000']
  }

  let searchOr: string | null = null
  if (f.search && f.search.trim()) {
    // Sanitizar metacaracteres de PostgREST (.,()%*\) antes de interpolar en .or()
    // — mismo criterio que finance.ts y servers.ts (evita filter injection).
    const like = `%${f.search.trim().replace(/[%,().*\\]/g, '')}%`
    // search_text: normalizado (sin tildes) + índice GIN trgm (migración 083);
    // el .or por first/last no tenía soporte de índice.
    const { data: members } = await applyMemberSearch(
      supabase.from('members').select('id'), f.search,
    ).limit(500)
    const memberIds = ((members ?? []) as Array<{ id: string }>).map(m => m.id)
    const parts = [`name.ilike.${like}`]
    if (memberIds.length > 0) {
      parts.push(`leader_id.in.(${memberIds.join(',')})`, `co_leader_id.in.(${memberIds.join(',')})`)
    }
    searchOr = parts.join(',')
  }
  return { planId, planIds, searchOr }
}

/** Zonas que de verdad aparecen en los grupos: los códigos distintos y si hay
 *  grupos sin zona específica. Alimenta el filtro del listado, para no ofrecer
 *  40 sedes de las cuales solo 2 tienen grupos. Respeta el scope del dirigente. */
export async function getStudyGroupZones(opts?: { leaderMemberId?: string | null }): Promise<{
  zones: string[]
  hasGroupsWithoutZone: boolean
}> {
  const supabase = createAdminClient()
  const zones = new Set<string>()
  let sinZona = false
  // PostgREST corta en 1000 filas y hay >2.000 grupos: se pagina hasta agotar.
  for (let from = 0; ; from += 1000) {
    let q = supabase.from('study_groups').select('zone').order('id').range(from, from + 999)
    if (opts?.leaderMemberId) {
      q = q.or(`leader_id.eq.${opts.leaderMemberId},co_leader_id.eq.${opts.leaderMemberId}`)
    }
    const { data, error } = await q
    if (error) throw error
    const batch = (data ?? []) as Array<{ zone: string | null }>
    for (const r of batch) {
      if (r.zone) zones.add(r.zone)
      else sinZona = true
    }
    if (batch.length < 1000) break
  }
  return { zones: [...zones].sort(), hasGroupsWithoutZone: sinZona }
}

/** Bloques de capacitación que de verdad tienen grupos, para el filtro del
 *  listado (mismo criterio que getStudyGroupZones). Ordenados del más nuevo
 *  al más viejo. Respeta el scope del dirigente. */
export async function getStudyGroupBloques(opts?: { leaderMemberId?: string | null }): Promise<Array<{ id: string; nombre: string }>> {
  const supabase = createAdminClient()
  const usados = new Set<string>()
  for (let from = 0; ; from += 1000) {
    let q = supabase.from('study_groups').select('bloque_id').not('bloque_id', 'is', null).order('id').range(from, from + 999)
    if (opts?.leaderMemberId) {
      q = q.or(`leader_id.eq.${opts.leaderMemberId},co_leader_id.eq.${opts.leaderMemberId}`)
    }
    const { data, error } = await q
    if (error) throw error
    const batch = (data ?? []) as Array<{ bloque_id: string | null }>
    for (const r of batch) if (r.bloque_id) usados.add(r.bloque_id)
    if (batch.length < 1000) break
  }
  if (usados.size === 0) return []
  const { data: bloques, error } = await supabase
    .from('capacitacion_bloques')
    .select('id, nombre, fecha_apertura')
    .in('id', [...usados])
    .order('fecha_apertura', { ascending: false })
  if (error) throw error
  return ((bloques ?? []) as Array<{ id: string; nombre: string }>).map(b => ({ id: b.id, nombre: b.nombre }))
}

export async function getStudyGroups(
  opts: { page?: number; pageSize?: number; filters?: GroupFilters } = {},
): Promise<{ data: DbGroupListItem[]; total: number }> {
  const supabase = createAdminClient()
  const f = opts.filters ?? {}
  const { planId, planIds, searchOr } = await resolveGroupFilters(supabase, f)
  // Ventana "prontos a cerrar": [hoy, hoy+30d] — idéntico al conteo del dashboard.
  // QA 2026-07-17: fechas en zona CR — con toISOString() (UTC) la ventana se
  // corría un día entre 6pm y medianoche hora CR.
  const closeFrom = ymdCR()
  const closeTo = ymdCR(new Date(Date.now() + 30 * 86400000))

  if (opts.page !== undefined || opts.pageSize !== undefined) {
    const page = Math.max(1, opts.page ?? 1)
    const pageSize = Math.max(1, opts.pageSize ?? 50)
    const from = (page - 1) * pageSize
    let query = supabase
      .from('study_groups')
      .select(LIST_GROUP_SELECT, { count: 'exact' })
      .order('ends_at', { ascending: false, nullsFirst: false })
    if (f.statuses?.length) query = query.in('status', f.statuses)
    if (f.zone)  query = query.eq('zone', f.zone)
    if (f.zoneNull) query = query.is('zone', null)
    if (f.day)   query = query.contains('schedule_days', [f.day])
    if (f.noLeader) query = query.is('leader_id', null)
    if (f.closingSoon) query = query.not('ends_at', 'is', null).gte('ends_at', closeFrom).lte('ends_at', closeTo).neq('status', 'finalizado')
    if (f.bloqueId) query = query.eq('bloque_id', f.bloqueId)
    if (f.startFrom) query = query.gte('starts_at', f.startFrom)
    if (f.startTo) query = query.lte('starts_at', f.startTo)
    if (planId)  query = query.eq('plan_id', planId)
    if (planIds) query = query.in('plan_id', planIds)
    if (searchOr) query = query.or(searchOr)
    if (f.leaderMemberId) query = query.or(`leader_id.eq.${f.leaderMemberId},co_leader_id.eq.${f.leaderMemberId}`)
    const { data, error, count } = await query.range(from, from + pageSize - 1)
    if (error) throw error
    return { data: ((data ?? []) as RawListGroup[]).map(toListItem), total: count ?? 0 }
  }

  // Sin page/pageSize: TODOS los grupos (con filtros) — usado por el export.
  // PostgREST corta en 1000 filas; hay >1000 grupos → paginar con range().
  const all: DbGroupListItem[] = []
  for (let from = 0; ; from += 1000) {
    let query = supabase
      .from('study_groups')
      .select(LIST_GROUP_SELECT)
      .order('ends_at', { ascending: false, nullsFirst: false })
    if (f.statuses?.length) query = query.in('status', f.statuses)
    if (f.zone)  query = query.eq('zone', f.zone)
    if (f.zoneNull) query = query.is('zone', null)
    if (f.day)   query = query.contains('schedule_days', [f.day])
    if (f.noLeader) query = query.is('leader_id', null)
    if (f.closingSoon) query = query.not('ends_at', 'is', null).gte('ends_at', closeFrom).lte('ends_at', closeTo).neq('status', 'finalizado')
    if (f.bloqueId) query = query.eq('bloque_id', f.bloqueId)
    if (f.startFrom) query = query.gte('starts_at', f.startFrom)
    if (f.startTo) query = query.lte('starts_at', f.startTo)
    if (planId)  query = query.eq('plan_id', planId)
    if (planIds) query = query.in('plan_id', planIds)
    if (searchOr) query = query.or(searchOr)
    if (f.leaderMemberId) query = query.or(`leader_id.eq.${f.leaderMemberId},co_leader_id.eq.${f.leaderMemberId}`)
    const { data, error } = await query.range(from, from + 999)
    if (error) throw error
    const batch = (data ?? []) as RawListGroup[]
    all.push(...batch.map(toListItem))
    if (batch.length < 1000) break
  }
  return { data: all, total: all.length }
}

/** Variante con enrollments embebidos (member_id + status) para consumidores
 *  que necesitan los IDs de los inscritos por grupo (ej. RecipientSelector de
 *  comunicaciones). Usar solo cuando los conteos no alcanzan. */
export async function getStudyGroupsWithEnrollments(opts: { leaderMemberId?: string | null } = {}): Promise<DbGroupEnriched[]> {
  const supabase = createAdminClient()
  const all: DbGroupEnriched[] = []
  for (let from = 0; ; from += 1000) {
    let query = supabase
      .from('study_groups')
      .select(LIST_GROUP_MEMBERS_SELECT)
      .order('starts_at', { ascending: false })
    // SEC-1: el dirigente solo recibe SUS grupos también en esta variante.
    if (opts.leaderMemberId) query = query.or(`leader_id.eq.${opts.leaderMemberId},co_leader_id.eq.${opts.leaderMemberId}`)
    const { data, error } = await query.range(from, from + 999)
    if (error) throw error
    const batch = (data ?? []) as DbGroupEnriched[]
    all.push(...batch)
    if (batch.length < 1000) break
  }
  return all
}

const GROUP_SELECT = `
  id, name, leader_id, co_leader_id, zone, schedule_days, schedule_time, location,
  max_students, starts_at, ends_at, enrollment_start_date, enrollment_end_date,
  status, current_week, whatsapp_group_url,
  is_leader_training, training_modality, is_virtual, enrollment_restrictions,
  age_min, age_max,
  plan:study_plans(code),
  leader:members!study_groups_leader_id_fkey(first_name, last_name, phone, email),
  co_leader:members!study_groups_co_leader_id_fkey(first_name, last_name, phone, email),
  enrollments:study_enrollments!study_enrollments_group_id_fkey(
    member_id, status, grade, notes,
    member:members!study_enrollments_member_id_fkey(first_name, last_name)
  )
`

// Versión liviana para el LISTADO de grupos: enrollments con solo `status`
// (lo único necesario para CONTAR; los conteos se calculan en toListItem).
// Los nombres/notas se cargan en el detalle (getGroupById).
// OJO: la pantalla de EDITAR un grupo se alimenta de esta lista, no del detalle
// (useStudies('groups') → groups.find(...)). Todo campo que el formulario de
// edición escriba TIENE que venir acá, o el input arranca vacío y al guardar
// manda null: no es que no guarde, es que BORRA lo que había. Pasó con la
// ventana de matrícula, que faltaba en este select (2026-08-24).
// `group-edit-fields.test.ts` lo fija.
const LIST_GROUP_SELECT = `
  id, name, leader_id, co_leader_id, zone, schedule_days, schedule_time, location,
  max_students, starts_at, ends_at, enrollment_start_date, enrollment_end_date,
  status, current_week, whatsapp_group_url,
  is_leader_training, training_modality, is_virtual, enrollment_restrictions,
  age_min, age_max,
  plan:study_plans(code),
  leader:members!study_groups_leader_id_fkey(first_name, last_name),
  co_leader:members!study_groups_co_leader_id_fkey(first_name, last_name),
  enrollments:study_enrollments!study_enrollments_group_id_fkey(member_id, status)
`

// Igual al anterior pero con member_id, para getStudyGroupsWithEnrollments.
const LIST_GROUP_MEMBERS_SELECT = `
  id, name, leader_id, co_leader_id, zone, schedule_days, schedule_time, location,
  max_students, starts_at, ends_at, status, current_week, whatsapp_group_url,
  is_leader_training, training_modality, is_virtual, enrollment_restrictions,
  age_min, age_max,
  plan:study_plans(code),
  leader:members!study_groups_leader_id_fkey(first_name, last_name),
  co_leader:members!study_groups_co_leader_id_fkey(first_name, last_name),
  enrollments:study_enrollments!study_enrollments_group_id_fkey(member_id, status)
`

/** SEC-1: leader/co-leader de un grupo (para el guard por-grupo sin cargar el
 *  detalle completo). null = grupo inexistente. */
export async function getGroupLeaderIds(groupId: string): Promise<{ leader_id: string | null; co_leader_id: string | null } | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('study_groups').select('leader_id, co_leader_id').eq('id', groupId).maybeSingle()
  if (error) throw error
  return (data as { leader_id: string | null; co_leader_id: string | null } | null) ?? null
}

/** SEC-1: ¿el miembro tiene (o tuvo) una inscripción en el grupo? Cualquier
 *  estado cuenta: su propia historia con el grupo justifica la vista read-only. */
export async function isMemberOfGroup(groupId: string, memberId: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('study_enrollments').select('id')
    .eq('group_id', groupId).eq('member_id', memberId).limit(1)
  if (error) throw error
  return (data ?? []).length > 0
}

export async function getGroupById(id: string): Promise<DbGroupEnriched | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('study_groups')
    .select(GROUP_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as DbGroupEnriched) ?? null
}

// ── Análisis de demanda: extraído a ./studies-demand. Re-exportado acá. ────────
export { getStudyDemand } from '@/lib/supabase/queries/studies-demand'
export type { StudyDemandRow, StudyDemandResult } from '@/lib/supabase/queries/studies-demand'


// ── Perfil/elegibilidad: extraídos a ./studies-eligibility. Re-exportados acá. ─
export { getMemberStudyProfile, getEligibleStudiesForMember } from '@/lib/supabase/queries/studies-eligibility'
export type { MemberStudyEligibility } from '@/lib/supabase/queries/studies-eligibility'


/** Sesiones de asistencia de un grupo con conteo de presentes. */
export async function getGroupSessions(groupId: string): Promise<Array<{ id: string; date: string; topic: string | null; present: number; total: number }>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('study_sessions')
    .select('id, session_date, topic, study_attendance(present)')
    .eq('group_id', groupId)
    .order('session_date', { ascending: true })
  if (error) throw error
  const rows = (data ?? []) as Array<{ id: string; session_date: string; topic: string | null; study_attendance: Array<{ present: boolean }> }>
  return rows.map(r => ({
    id: r.id, date: r.session_date, topic: r.topic,
    present: r.study_attendance.filter(a => a.present).length,
    total: r.study_attendance.length,
  }))
}

/** Registra la asistencia de una sesión: crea la sesión y las filas de presencia. */
export async function saveGroupAttendance(
  groupId: string,
  input: { session_date: string; topic?: string | null; notes?: string | null; attendance: { member_id: string; present: boolean }[] },
): Promise<{ session_id: string }> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('study_sessions')
    .insert({ group_id: groupId, session_date: input.session_date, topic: input.topic ?? null, notes: input.notes ?? null })
    .select('id')
    .single()
  if (error) throw error
  const sessionId = (data as { id: string }).id

  if (input.attendance.length > 0) {
    const rows = input.attendance.map(a => ({ session_id: sessionId, member_id: a.member_id, present: a.present }))
    const { error: aErr } = await supabase.from('study_attendance').insert(rows)
    if (aErr) throw aErr
  }
  return { session_id: sessionId }
}

/** Dirigentes de estudio con miembro y evaluaciones. */
export async function getStudyLeaders(): Promise<DbLeaderEnriched[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('study_leaders')
    .select(`
      id, member_id, zone_preference, availability_status, is_active, qualified_study_codes, formation_study_codes,
      member:members(first_name, last_name, is_donor),
      evaluations:leader_evaluations(id, group_id, score, evaluation_date, comments)
    `)
  if (error) throw error
  // formation_study_codes (mig. 079) aún no está en los tipos generados.
  return (data ?? []) as unknown as DbLeaderEnriched[]
}

/** Dirigentes ACTIVOS = servidores activos del comité "Comité de Dirigentes".
 *  Fuente de verdad para el estado "activo" de un dirigente. */
export async function getActiveDirigentes(): Promise<Array<{ member_id: string; member_name: string }>> {
  const supabase = createAdminClient()
  const { data: area, error: aErr } = await supabase
    .from('areas')
    .select('id')
    .eq('area_type', 'committee')
    .ilike('name', 'Comité de Dirigentes')
    .maybeSingle()
  if (aErr) throw aErr
  if (!area) return []

  const { data, error } = await supabase
    .from('volunteers')
    .select('member_id, member:members(first_name, last_name), service_positions!inner(area_id)')
    .eq('status', 'active')
    .eq('service_positions.area_id', (area as { id: string }).id)
  if (error) throw error

  const seen = new Map<string, string>()
  for (const v of (data ?? []) as Array<{ member_id: string; member: { first_name: string; last_name: string } | null }>) {
    if (!seen.has(v.member_id)) {
      seen.set(v.member_id, v.member ? `${v.member.first_name} ${v.member.last_name}`.trim() : '')
    }
  }
  return [...seen].map(([member_id, member_name]) => ({ member_id, member_name }))
}

/** Marca a un miembro como dirigente. Crea la designación (study_leaders).
 *  Si `active`, además lo agrega como servidor activo al Comité de Dirigentes
 *  (puesto "Dirigente"). Inactivo = solo designación, sin comité. */
export async function addDirigente(memberId: string, active: boolean): Promise<void> {
  const supabase = createAdminClient()
  const { error: lErr } = await supabase.from('study_leaders').upsert(
    {
      member_id: memberId,
      is_active: active,
      availability_status: active ? 'available' : 'inactive',
      zone_preference: [],
      qualified_study_codes: [],
    },
    { onConflict: 'member_id' },
  )
  if (lErr) throw lErr

  if (active) {
    const { data: area } = await supabase
      .from('areas').select('id').eq('area_type', 'committee').ilike('name', 'Comité de Dirigentes').maybeSingle()
    if (area) {
      const { data: pos } = await supabase
        .from('service_positions').select('id').eq('area_id', (area as { id: string }).id).eq('is_active', true).limit(1).maybeSingle()
      if (pos) {
        const { error: vErr } = await supabase.from('volunteers').upsert(
          { member_id: memberId, position_id: (pos as { id: string }).id, status: 'active' },
          { onConflict: 'member_id,position_id' },
        )
        if (vErr) throw vErr
      }
    }
  }
}

/** Ids (de `memberIds`) marcados como "no recomendado para dar estudios"
 *  (member_admin_data.not_recommended_to_lead_studies). Usado como guard antes
 *  de activar/asignar a alguien como dirigente. */
async function notRecommendedIds(
  supabase: ReturnType<typeof createAdminClient>,
  memberIds: string[],
): Promise<Set<string>> {
  if (memberIds.length === 0) return new Set()
  const { data, error } = await supabase
    .from('member_admin_data')
    .select('member_id')
    .in('member_id', memberIds)
    .eq('not_recommended_to_lead_studies', true)
  if (error) throw error
  return new Set(((data ?? []) as Array<{ member_id: string }>).map(r => r.member_id))
}

/** DIR-6: ids (de `memberIds`) con availability_status = 'en_revision'.
 *  Espejo de notRecommendedIds: guard antes de activar o de asignar grupo. */
async function enRevisionIds(
  supabase: ReturnType<typeof createAdminClient>,
  memberIds: string[],
): Promise<Set<string>> {
  if (memberIds.length === 0) return new Set()
  const { data, error } = await supabase
    .from('study_leaders')
    .select('member_id')
    .in('member_id', memberIds)
    .eq('availability_status', 'en_revision')
  if (error) throw error
  return new Set(((data ?? []) as Array<{ member_id: string }>).map(r => r.member_id))
}

/** Activa/desactiva manualmente a un dirigente. Estado = servidor activo en el
 *  Comité de Dirigentes. ACTIVAR: study_leaders.is_active + voluntario activo del
 *  comité + rol 'dirigente'. DESACTIVAR: study_leaders inactivo + sale del comité
 *  (voluntariado inactive) + se revoca el rol 'dirigente'. No pisa su config.
 *  Guard: no se puede ACTIVAR a alguien marcado "no recomendado para dar
 *  estudios" (member_admin_data.not_recommended_to_lead_studies) — lanza
 *  'DIRIGENTE_NO_RECOMENDADO'. Desactivar siempre está permitido.
 *  DIR-6: tampoco se puede activar a alguien EN REVISIÓN — lanza
 *  'DIRIGENTE_EN_REVISION'. Sacarlo de revisión es una decisión explícita del
 *  coordinador, no algo que ocurra de rebote al asignarle un grupo. */
export async function setDirigenteActive(memberId: string, active: boolean): Promise<void> {
  const supabase = createAdminClient()

  if (active) {
    const blocked = await notRecommendedIds(supabase, [memberId])
    if (blocked.has(memberId)) throw new Error('DIRIGENTE_NO_RECOMENDADO')
    const enRevision = await enRevisionIds(supabase, [memberId])
    if (enRevision.has(memberId)) throw new Error('DIRIGENTE_EN_REVISION')
  }

  // study_leaders: actualizar estado sin tocar el resto (o crear si no existe).
  const { data: existing } = await supabase
    .from('study_leaders').select('member_id, availability_status').eq('member_id', memberId).maybeSingle()
  if (existing) {
    // DIR-6: desactivar NO borra el matiz. Si estaba EN PAUSA, sigue en pausa —
    // pisarlo con 'inactive' perdería justamente el porqué que DIR-6 agrega.
    // (En revisión no llega acá al activar: lo cortó el guard de arriba.)
    const previo = (existing as { availability_status: string | null }).availability_status
    const conserva = !active && (ADMIN_ONLY_STATUSES as readonly string[]).includes(previo ?? '')
    const { error } = await supabase.from('study_leaders')
      .update({
        is_active: active,
        availability_status: conserva ? previo : (active ? 'available' : 'inactive'),
      })
      .eq('member_id', memberId)
    if (error) throw error
  } else {
    const { error } = await supabase.from('study_leaders').insert({
      member_id: memberId, is_active: active,
      availability_status: active ? 'available' : 'inactive',
      zone_preference: [], qualified_study_codes: [],
    })
    if (error) throw error
  }

  const { data: area } = await supabase
    .from('areas').select('id').eq('area_type', 'committee').ilike('name', 'Comité de Dirigentes').maybeSingle()
  if (!area) return
  const areaId = (area as { id: string }).id
  const { data: positions } = await supabase
    .from('service_positions').select('id').eq('area_id', areaId)
  const posIds = ((positions ?? []) as Array<{ id: string }>).map(p => p.id)

  if (active) {
    const activePos = posIds[0]
    if (activePos) {
      const { error } = await supabase.from('volunteers').upsert(
        { member_id: memberId, position_id: activePos, status: 'active' },
        { onConflict: 'member_id,position_id' },
      )
      if (error) throw error
    }
  } else if (posIds.length > 0) {
    const { error } = await supabase.from('volunteers')
      .update({ status: 'inactive' })
      .eq('member_id', memberId).in('position_id', posIds)
    if (error) throw error
  }

  // Rol 'dirigente' en member_roles: se asigna al activar y se revoca al desactivar.
  const { assignMemberRole, revokeMemberRole } = await import('./members')
  if (active) await assignMemberRole(memberId, 'dirigente')
  else await revokeMemberRole(memberId, 'dirigente')
}

/**
 * DIR-6 · Fija el estado administrativo del dirigente.
 *
 * Mantiene is_active coherente con el matiz, porque si no quedarían diciendo
 * cosas distintas: 'available' es "está dando" y los otros tres son "no está
 * dando". Nadie tiene que acordarse de mover los dos.
 *
 * Salir de revisión limpia el matiz ANTES de activar, a propósito: el guard de
 * setDirigenteActive rechaza a los en revisión, así que sin esto no se podría
 * sacar a nadie de revisión nunca.
 *
 * Lanza 'DIRIGENTE_CON_GRUPO_ACTIVO' si se lo quiere pausar/revisar teniendo un
 * grupo abierto — misma regla que ya bloquea desactivarlo (EST-1).
 */
export async function setLeaderAdminStatus(
  memberId: string, status: LeaderStatus,
): Promise<void> {
  const supabase = createAdminClient()

  if (status === 'available') {
    await supabase.from('study_leaders')
      .update({ availability_status: 'available' }).eq('member_id', memberId)
    await setDirigenteActive(memberId, true)
    return
  }

  const conGrupo = await membersWithActiveGroups([memberId])
  if (conGrupo.has(memberId)) throw new Error('DIRIGENTE_CON_GRUPO_ACTIVO')

  // Primero desactivar (asegura la fila y lo saca del comité), después sellar el
  // matiz: al revés, una fila que no existía se crearía en 'inactive' y perdería
  // el estado que se pidió.
  await setDirigenteActive(memberId, false)
  const { error } = await supabase.from('study_leaders')
    .update({ availability_status: status }).eq('member_id', memberId)
  if (error) throw error
}

/** Cambio de estado masivo de dirigentes. Se omiten (solo al ACTIVAR) los
 *  marcados "no recomendado para dar estudios" y los que están EN REVISIÓN
 *  (DIR-6); vuelven en `skipped` sin abortar el resto del lote. */
export async function bulkSetDirigenteActive(
  memberIds: string[], active: boolean,
): Promise<{ updated: number; skipped: string[] }> {
  let updated = 0
  const skipped: string[] = []
  for (const id of memberIds) {
    try {
      await setDirigenteActive(id, active)
      updated++
    } catch (e) {
      if (e instanceof Error && (e.message === 'DIRIGENTE_NO_RECOMENDADO' || e.message === 'DIRIGENTE_EN_REVISION')) skipped.push(id)
      else throw e
    }
  }
  return { updated, skipped }
}

// ── Mutaciones ─────────────────────────────────────────────

export type PlanWriteInput = {
  name: string
  code?: string | null
  description?: string | null
  level: DbStudyPlan['level']
  cost?: number
  currency?: string
  duration_weeks?: number | null
  max_students?: number | null
  requires_donor?: boolean
  requires_attendance?: boolean
  requires_payment?: boolean
  requires_grade?: boolean
  requires_server?: boolean
  requires_bus_talk?: boolean
  requires_invitation?: boolean
  auto_promote?: boolean
  prerequisite_code?: string | null
  next_study_code?: string | null
  min_attendance_pct?: number
  is_active?: boolean
  difficulty?: string | null
  commitments?: string | null
  mentor_id?: string | null
}

export type GroupWriteInput = {
  plan_id?: string
  name: string
  leader_id?: string | null
  co_leader_id?: string | null
  zone?: string | null
  schedule_days?: string[] | null
  schedule_time?: string | null
  location?: string | null
  sede?: string | null
  /** Sede a la que se envían los folletos ('TBD' | sede activa | 'Otro: …'). */
  folletos_sede?: string | null
  max_students?: number | null
  starts_at?: string | null
  ends_at?: string | null
  /** GRU-1: ventana de matrícula (YYYY-MM-DD, nullable = modo manual). */
  enrollment_start_date?: string | null
  enrollment_end_date?: string | null
  status?: DbGroupEnriched['status']
  age_min?: number | null
  age_max?: number | null
  current_week?: number
  whatsapp_group_url?: string | null
  /** GRU-2: restricción de audiencia ya normalizada (null = grupo abierto).
   *  Se serializa a jsonb al escribir; `undefined` = no tocar la columna. */
  enrollment_restrictions?: GroupRestriction | null
}

/** Prepara el patch/insert para Supabase: la restricción viaja como jsonb.
 *  `undefined` se saca del objeto para que un PATCH parcial NO la borre. */
function toGroupRow(input: Partial<GroupWriteInput>): Record<string, unknown> {
  const { enrollment_restrictions, ...rest } = input
  const row: Record<string, unknown> = { ...rest }
  if (enrollment_restrictions !== undefined) {
    row.enrollment_restrictions = enrollment_restrictions as unknown as Json
  }
  return row
}

/** Resuelve el UUID de un plan a partir de su `code` (el frontend usa code). */
export async function getPlanIdByCode(code: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('study_plans').select('id').eq('code', code).maybeSingle()
  if (error) throw error
  return data ? (data as { id: string }).id : null
}

// Planes
export async function createPlan(input: PlanWriteInput): Promise<DbStudyPlan> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('study_plans').insert(input).select('*').single()
  if (error) throw error
  return data as DbStudyPlan
}

export async function updatePlan(id: string, patch: Partial<PlanWriteInput>): Promise<DbStudyPlan> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('study_plans').update(patch).eq('id', id).select('*').single()
  if (error) throw error
  return data as DbStudyPlan
}

// Grupos
/** D1 / Punto 1: al asignarle un grupo a un dirigente, pasa a ACTIVO. La regla:
 *  activo = voluntario activo del Comité de Dirigentes. Por eso, además de
 *  study_leaders.is_active, se agrega al comité (igual que setDirigenteActive).
 *  Nunca revierte a inactivo automáticamente. */
async function activateLeaders(
  _supabase: ReturnType<typeof createAdminClient>,
  memberIds: Array<string | null | undefined>,
): Promise<void> {
  const ids = Array.from(new Set(memberIds.filter((x): x is string => !!x)))
  for (const memberId of ids) await setDirigenteActive(memberId, true)
}

/** Guard previo a crear/editar un grupo con leader_id/co_leader_id: rechaza si
 *  alguno está marcado "no recomendado para dar estudios" — ANTES de escribir
 *  el grupo (evita dejarlo a medias con un dirigente bloqueado ya asignado). */
async function assertLeadersRecommended(
  supabase: ReturnType<typeof createAdminClient>,
  memberIds: Array<string | null | undefined>,
): Promise<void> {
  const ids = Array.from(new Set(memberIds.filter((x): x is string => !!x)))
  if (ids.length === 0) return
  const blocked = await notRecommendedIds(supabase, ids)
  if (blocked.size > 0) throw new Error('DIRIGENTE_NO_RECOMENDADO')
  // DIR-6: asignarle un grupo a alguien en revisión lo activaría en silencio
  // (EST-1), que es exactamente lo que la revisión tiene que impedir.
  const enRevision = await enRevisionIds(supabase, ids)
  if (enRevision.size > 0) throw new Error('DIRIGENTE_EN_REVISION')
}

/** Miembros (de `ids`) que son leader o co-líder de un grupo en curso/abierto.
 *  Para bloquear su desactivación (punto 1). */
/** Contacto + sede de un conjunto de miembros (para enriquecer la exportación de
 *  dirigentes on-demand). PII → solo se llama desde el endpoint role-gated. */
export type DirigenteContact = { email: string | null; phone: string | null; sede: string | null }
export async function getDirigentesContact(ids: string[]): Promise<Record<string, DirigenteContact>> {
  const out: Record<string, DirigenteContact> = {}
  if (ids.length === 0) return out
  const supabase = createAdminClient()
  for (let i = 0; i < ids.length; i += 200) {
    const slice = ids.slice(i, i + 200)
    const { data, error } = await supabase
      .from('members')
      .select('id, email, phone, sede:sedes(code, name)')
      .in('id', slice)
    if (error) throw error
    for (const r of (data ?? []) as Array<{ id: string; email: string | null; phone: string | null; sede: { name: string } | null }>) {
      out[r.id] = { email: r.email, phone: r.phone, sede: r.sede?.name ?? null }
    }
  }
  return out
}

export async function membersWithActiveGroups(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('study_groups')
    .select('leader_id, co_leader_id, plan:study_plans(level)')
    .in('status', ['en_matricula', 'en_curso'])
  if (error) throw error
  const idSet = new Set(ids)
  const out = new Set<string>()
  type Row = { leader_id: string | null; co_leader_id: string | null; plan: { level: string | null } | { level: string | null }[] | null }
  for (const g of (data ?? []) as Row[]) {
    // EST-1: un grupo de campaña NO bloquea la desactivación del dirigente.
    const plan = Array.isArray(g.plan) ? g.plan[0] : g.plan
    if (!groupLocksLeader(plan?.level)) continue
    if (g.leader_id && idSet.has(g.leader_id)) out.add(g.leader_id)
    if (g.co_leader_id && idSet.has(g.co_leader_id)) out.add(g.co_leader_id)
  }
  return out
}

/** Bulk: agrega/quita uno o varios códigos de estudio a la FORMACIÓN o la
 *  DISPONIBILIDAD de varios dirigentes (un grupo "Niveles"/"Discípulos" expande a
 *  sus códigos). Crea la fila study_leaders si falta. */
export async function bulkUpdateLeaderStudies(
  memberIds: string[],
  field: 'formation' | 'availability',
  codes: string[],
  action: 'add' | 'remove',
): Promise<number> {
  const supabase = createAdminClient()
  const col = field === 'formation' ? 'formation_study_codes' : 'qualified_study_codes'
  const codeSet = new Set(codes)
  let n = 0
  for (const memberId of memberIds) {
    const { data: row } = await supabase
      .from('study_leaders')
      .select('id, qualified_study_codes, formation_study_codes')
      .eq('member_id', memberId).maybeSingle()
    const current = (row?.[col] as string[] | null) ?? []
    const next = action === 'add'
      ? Array.from(new Set([...current, ...codes]))
      : current.filter((c: string) => !codeSet.has(c))
    if (row) {
      const patch = col === 'formation_study_codes'
        ? { formation_study_codes: next }
        : { qualified_study_codes: next }
      const { error } = await supabase.from('study_leaders').update(patch).eq('member_id', memberId)
      if (error) throw error
    } else if (action === 'add') {
      const base = {
        member_id: memberId, is_active: false, availability_status: 'inactive',
        zone_preference: [], qualified_study_codes: [] as string[], formation_study_codes: [] as string[],
      }
      const patch = col === 'formation_study_codes'
        ? { ...base, formation_study_codes: next }
        : { ...base, qualified_study_codes: next }
      const { error } = await supabase.from('study_leaders').insert(patch)
      if (error) throw error
    }
    n++
  }
  return n
}

/** Nivel del plan (para la excepción de campañas de EST-1). */
async function planLevelById(supabase: ReturnType<typeof createAdminClient>, planId: string | null | undefined): Promise<string | null> {
  if (!planId) return null
  const { data } = await supabase.from('study_plans').select('level').eq('id', planId).maybeSingle()
  return (data as { level: string | null } | null)?.level ?? null
}

/** El CODE de un plan por su id. PRE-11 decide por code (PREMAT), pero el input
 *  de escritura trae plan_id. */
async function planCodeOf(
  supabase: ReturnType<typeof createAdminClient>,
  planId: string | null | undefined,
): Promise<string | null> {
  if (!planId) return null
  const { data } = await supabase.from('study_plans').select('code').eq('id', planId).maybeSingle()
  return (data as { code: string | null } | null)?.code ?? null
}

/**
 * PRE-11 · Guard de los grupos de prematrimonial: dirigente Y co-dirigente
 * obligatorios, y los dos habilitados. Lanza 'PREMAT_PAREJA: <mensaje>' para que
 * el handler devuelva el texto tal cual — es un mensaje para una persona, no un
 * código que la UI tenga que traducir.
 */
async function assertPrematPair(
  supabase: ReturnType<typeof createAdminClient>,
  planCode: string | null | undefined,
  leaderId: string | null | undefined,
  coLeaderId: string | null | undefined,
): Promise<void> {
  if (!isPrematGroup(planCode)) return

  const ids = [leaderId, coLeaderId].filter((x): x is string => !!x)
  const caps = new Map<string, { formacion: string[]; disponibilidad: string[] }>()
  if (ids.length > 0) {
    const { data } = await supabase
      .from('study_leaders')
      .select('member_id, formation_study_codes, qualified_study_codes')
      .in('member_id', ids)
    for (const r of (data ?? []) as Array<{
      member_id: string; formation_study_codes: string[] | null; qualified_study_codes: string[] | null
    }>) {
      caps.set(r.member_id, {
        formacion: r.formation_study_codes ?? [],
        disponibilidad: r.qualified_study_codes ?? [],
      })
    }
  }
  const err = prematGroupError({
    planCode, leaderId, coLeaderId,
    capabilityOf: id => caps.get(id) ?? null,
  })
  if (err) throw new Error(`PREMAT_PAREJA: ${err}`)
}

export async function createGroup(input: GroupWriteInput): Promise<{ id: string }> {
  const supabase = createAdminClient()
  await assertLeadersRecommended(supabase, [input.leader_id, input.co_leader_id])
  await assertPrematPair(supabase, await planCodeOf(supabase, input.plan_id), input.leader_id, input.co_leader_id)
  const { data, error } = await supabase.from('study_groups').insert(toGroupRow(input) as Insertable<'study_groups'>).select('id').single()
  if (error) throw error
  // EST-1: asignar dirigente lo activa automáticamente — salvo campañas.
  if (groupLocksLeader(await planLevelById(supabase, input.plan_id))) {
    await activateLeaders(supabase, [input.leader_id, input.co_leader_id])
  }
  return data as { id: string }
}

export async function updateGroup(id: string, patch: Partial<GroupWriteInput>): Promise<void> {
  const supabase = createAdminClient()
  // Solo valida/activa si el patch trae una asignación de dirigente.
  if ('leader_id' in patch || 'co_leader_id' in patch) {
    await assertLeadersRecommended(supabase, [patch.leader_id, patch.co_leader_id])
    // El patch puede no traer el plan: se lee el del grupo. Y puede traer solo
    // uno de los dos dirigentes, así que el otro sale del grupo actual — si no,
    // editar el horario de un PREMAT parecería dejarlo sin co-dirigente.
    const { data: actual } = await supabase
      .from('study_groups')
      .select('leader_id, co_leader_id, plan:study_plans!study_groups_plan_id_fkey(code)')
      .eq('id', id).maybeSingle()
    const row = actual as {
      leader_id: string | null; co_leader_id: string | null
      plan: { code: string | null } | { code: string | null }[] | null
    } | null
    const planCode = (Array.isArray(row?.plan) ? row?.plan[0] : row?.plan)?.code ?? null
    await assertPrematPair(
      supabase, planCode,
      'leader_id' in patch ? patch.leader_id : row?.leader_id,
      'co_leader_id' in patch ? patch.co_leader_id : row?.co_leader_id,
    )
  }
  const { error } = await supabase.from('study_groups').update(toGroupRow(patch) as Insertable<'study_groups'>).eq('id', id)
  if (error) throw error
  if ('leader_id' in patch || 'co_leader_id' in patch) {
    // EST-1: excepción de campañas — el plan sale del grupo (el patch no lo trae).
    const { data: g } = await supabase.from('study_groups').select('plan_id').eq('id', id).maybeSingle()
    if (groupLocksLeader(await planLevelById(supabase, (g as { plan_id: string | null } | null)?.plan_id))) {
      await activateLeaders(supabase, [patch.leader_id, patch.co_leader_id])
    }
  }
}

/** Inscripciones vigentes de un grupo (para la regla de borrado): cuenta a las
 *  personas que siguen en el grupo (matriculadas, en lista de espera o con pago
 *  pendiente); completed/dropped/transferred/expirada no cuentan. */
export async function countActiveEnrollments(groupId: string): Promise<number> {
  const supabase = createAdminClient()
  const { count, error } = await supabase
    .from('study_enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', groupId)
    .in('status', ['enrolled', 'waitlist', 'pendiente_de_pago'])
  if (error) throw error
  return count ?? 0
}

/** Elimina un grupo. Primero borra sus inscripciones (la FK no es cascade); el
 *  resto de referencias a study_groups son ON DELETE SET NULL. El guard del
 *  endpoint ya garantiza que no queden personas activas. */
export async function deleteGroup(id: string): Promise<void> {
  const supabase = createAdminClient()
  const { error: eEnr } = await supabase.from('study_enrollments').delete().eq('group_id', id)
  if (eEnr) throw eEnr
  const { error } = await supabase.from('study_groups').delete().eq('id', id)
  if (error) throw error
}

/** Agrega un estudio al historial de un miembro SIN grupo (ej. estudios viejos,
 *  cuando el sistema no existía). group_id queda nulo; el plan va directo. */
/** Los estudios que una persona ya tiene registrados, en la forma mínima que
 *  necesita el aviso de "Agregar estudio": qué plan, en qué estado, cuándo y de
 *  qué grupo. No trae el expediente completo — para eso está el detalle. */
export async function getMemberStudyCodes(memberId: string): Promise<Array<{
  code: string; status: string; date: string | null; group: string | null; es_externo: boolean
}>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('study_enrollments')
    .select(`
      status, completed_at, enrolled_at, es_externo,
      plan:study_plans!study_enrollments_plan_id_fkey(code),
      group:study_groups!study_enrollments_group_id_fkey(name, plan:study_plans(code))
    `)
    .eq('member_id', memberId)
  if (error) throw error
  const uno = (x: unknown) => (Array.isArray(x) ? x[0] : x) as Record<string, unknown> | null
  return (data ?? []).map(r => {
    const row = r as Record<string, unknown>
    const grupo = uno(row.group)
    // El código sale del plan directo o, si la matrícula va por grupo, del plan
    // del grupo — igual que en el resto del sistema.
    const code = (uno(row.plan)?.code ?? uno(grupo?.plan)?.code ?? null) as string | null
    return {
      code: code ?? '',
      status: String(row.status ?? ''),
      date: ((row.completed_at ?? row.enrolled_at) as string | null)?.slice(0, 10) ?? null,
      group: (grupo?.name as string | null) ?? null,
      es_externo: !!row.es_externo,
    }
  }).filter(x => x.code)
}

/** Registra a mano un estudio en el expediente: el que la persona llevó por
 *  fuera de Theos, o uno viejo que no quedó en el sistema.
 *
 *  `es_externo` NO se deduce de `group_id IS NULL`: al 2026-08-24 hay 25.610
 *  matrículas sin grupo de 40.474 (el import histórico de CCB), así que esa
 *  señal no distingue nada. Se marca explícito o no se marca.
 *
 *  `recorded_by` es quién lo digitó, que acá SIEMPRE es alguien distinto de la
 *  persona (el rol base no puede registrar estudios). Sin ese rastro no se
 *  puede auditar por qué alguien quedó habilitado para un estudio avanzado. */
export async function addMemberStudy(input: {
  member_id: string
  plan_id: string
  completed_at: string | null
  status?: string
  es_externo?: boolean
  fuente_externa?: string | null
  recorded_by?: string | null
}): Promise<void> {
  const supabase = createAdminClient()
  const esExterno = input.es_externo ?? false
  const { error } = await supabase.from('study_enrollments').insert({
    member_id: input.member_id,
    plan_id: input.plan_id,
    group_id: null,
    status: input.status ?? 'completed',
    completed_at: input.completed_at,
    es_externo: esExterno,
    // La procedencia solo se guarda si es externo — igual que el CHECK de la
    // base. Así el 400 lo da zod con un mensaje claro y no el motor con uno
    // ilegible, pero si algo se escapa la base tampoco lo acepta.
    fuente_externa: esExterno ? (input.fuente_externa?.trim() || null) : null,
    recorded_by: input.recorded_by ?? null,
  })
  if (error) throw error
}

export type CloseResult = {
  member_id: string
  status_result: 'aprobado' | 'reprobado' | 'retirado'
  grade?: number | null
  /** Justificación obligatoria cuando status_result === 'reprobado'. */
  fail_reason?: string | null
  /** Motivo OBLIGATORIO cuando status_result === 'retirado' (obligatorio desde
   *  2026-08-04; antes era opcional). El RPC lo guarda en
   *  study_enrollments.drop_reason. */
  withdraw_reason?: string | null
  /** Recomendaciones opcionales del cierre (tabla member_recommendations). */
  recommendations?: {
    oracion?: boolean
    servicio?: boolean
    dirigente?: boolean
    justification?: string | null
  } | null
}

/**
 * Cierre de estudio: finaliza cada matrícula según su resultado y marca el
 * grupo como 'finalizado'. aprobado/reprobado → 'completed' (la nota distingue
 * el resultado; en notes va la etiqueta y, para reprobados, la justificación).
 * retirado → 'dropped'. Las recomendaciones se insertan en
 * member_recommendations con recommended_by = quien cierra.
 */
export async function closeGroup(groupId: string, results: CloseResult[], closedBy: string | null = null): Promise<void> {
  const supabase = createAdminClient()
  // RPC TRANSACCIONAL (migración 113): claim 'finalizado' + updates de las
  // inscripciones + recomendaciones en una sola transacción. Antes eran N
  // pasos sueltos: un fallo a mitad dejaba el grupo cerrado con inscripciones
  // a medias y el retry rebotaba con YA_CERRADO sin camino de reparación.
  // Los tipos generados marcan p_closed_by como requerido (se generaron antes
  // del DEFAULT NULL); omitirlo cuando es null aplica el default en la BD.
  const args: { p_group_id: string; p_results: Json; p_closed_by?: string } = {
    p_group_id: groupId,
    p_results: results as unknown as Json,
  }
  if (closedBy) args.p_closed_by = closedBy
  const { data, error } = await supabase.rpc('close_group', args as unknown as { p_group_id: string; p_results: Json; p_closed_by: string })
  if (error) throw error
  if (!data) throw new Error('YA_CERRADO')
}

export type MemberRecommendation = {
  id: string
  recommended_for: 'oracion' | 'servicio' | 'dirigente'
  justification: string | null
  /** member_id de quien la hizo — la ficha lo enlaza a su perfil. */
  recommended_by: string | null
  recommended_by_name: string | null
  group_name: string | null
  created_at: string
}

/** Recomendaciones de un miembro (cierres de estudio). Solo para roles de
 *  estudios/admin — el guard vive en la ruta API. */
/** ¿El dirigente (dirigenteMemberId) dirige —actual o históricamente— un grupo
 *  donde el miembro (targetMemberId) es/fue estudiante? Cubre grupos de cualquier
 *  estado (histórico): leadership por leader_id o co_leader_id. Se usa para que un
 *  dirigente solo vea recomendaciones de SUS miembros. */
export async function dirigenteLeadsMember(dirigenteMemberId: string, targetMemberId: string): Promise<boolean> {
  const supabase = createAdminClient()
  // Grupos que dirige (leader o co-leader), cualquier estado.
  const { data: groups, error: gErr } = await supabase
    .from('study_groups')
    .select('id')
    .or(`leader_id.eq.${dirigenteMemberId},co_leader_id.eq.${dirigenteMemberId}`)
  if (gErr) throw gErr
  const groupIds = (groups ?? []).map(g => (g as { id: string }).id)
  if (groupIds.length === 0) return false
  // ¿El miembro es/fue estudiante de alguno de esos grupos?
  const { data: enr, error: eErr } = await supabase
    .from('study_enrollments')
    .select('id')
    .eq('member_id', targetMemberId)
    .in('group_id', groupIds)
    .limit(1)
  if (eErr) throw eErr
  return (enr ?? []).length > 0
}

export async function getMemberRecommendations(memberId: string): Promise<MemberRecommendation[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('member_recommendations')
    .select('id, recommended_for, justification, created_at, recommended_by, recommender:members!member_recommendations_recommended_by_fkey(first_name, last_name), group:study_groups(name)')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as Array<{
    id: string
    recommended_for: 'oracion' | 'servicio' | 'dirigente'
    justification: string | null
    created_at: string
    recommended_by: string | null
    recommender: { first_name: string | null; last_name: string | null } | null
    group: { name: string | null } | null
  }>).map(r => ({
    id: r.id,
    recommended_for: r.recommended_for,
    justification: r.justification,
    recommended_by: r.recommended_by,
    recommended_by_name: r.recommender
      ? [r.recommender.first_name, r.recommender.last_name].filter(Boolean).join(' ') || null
      : null,
    group_name: r.group?.name ?? null,
    created_at: r.created_at,
  }))
}

// Inscripciones
export async function enrollMember(
  groupId: string, memberId: string,
  scholarshipInput?: { scholarship_id?: string; coupon_code?: string },
  opts?: {
    enforceEnrollmentWindow?: boolean
    allowPendingStudyPayments?: boolean
    /** FRM-4: quién matriculó, si no fue la propia persona. NULL en el caso normal. */
    recordedBy?: string | null
    /** GRU-2: el staff puede matricular a alguien que NO cumple la restricción
     *  de audiencia del grupo, pero solo con este override explícito (la UI se
     *  lo confirma y queda en la bitácora — nunca silencioso). */
    allowRestrictionOverride?: boolean
    /**
     * Matricular SIN generar cobro, aunque el plan tenga costo.
     *
     * Es para las REUBICACIONES: cambiar de grupo no es matricularse de nuevo,
     * la persona ya pagó donde estaba. enrollMember no puede deducirlo solo —
     * solo ve el plan y su costo—, así que lo decide quien resuelve la
     * solicitud (ver lib/studies/reubicacion-cobro.ts).
     *
     * Con esto la matrícula queda 'enrolled' de una y no se crea fila en
     * payments. NO usar para saltarse un cobro real: para eso están las becas,
     * que dejan rastro.
     */
    sinCobro?: boolean
  },
  // `status` puede ser 'pendiente_de_pago': con costo la matrícula no se
  // confirma hasta el comprobante (regla 2026-09-01). El caller lo usa para
  // saber si ya está adentro o si falta pagar.
): Promise<{ status: 'enrolled' | 'pendiente_de_pago'; enrollment_id: string; amount: number; currency: string | null; requires_payment: boolean }> {
  const supabase = createAdminClient()
  // La columna del cupo en study_groups es `max_students` (no max_capacity: eso
  // es el nombre del TIPO DE DOMINIO). BUG 2026-08-06: se pedía `max_capacity`,
  // PostgREST devolvía error 42703, el error NO se miraba y `group` quedaba
  // null. Consecuencia: todo lo que depende del grupo se apagaba en silencio —
  // no se creaba el pago de matrícula (estudios de ₡25.000 quedaban gratis), ni
  // se validaba el cupo, ni el grupo virtual, ni la ventana de matrícula.
  const { data: g, error: gErr } = await supabase
    .from('study_groups')
    .select('is_virtual, leader_id, co_leader_id, status, max_students, enrollment_start_date, enrollment_end_date, plan:study_plans!study_groups_plan_id_fkey(id, code, requires_invitation, cost, currency, requires_payment)')
    .eq('id', groupId).maybeSingle()
  // Si la consulta falla, NO se sigue: matricular sin saber el plan es
  // matricular sin cobrar.
  if (gErr) throw gErr
  const group = g as { is_virtual: boolean | null; leader_id: string | null; co_leader_id: string | null; status: string; max_students: number | null; enrollment_start_date: string | null; enrollment_end_date: string | null; plan: { id: string; code: string | null; requires_invitation: boolean | null; cost: number | null; currency: string | null; requires_payment: boolean | null } | null } | null
  // Un grupo que no existe tampoco se matricula.
  if (!group) throw new Error('GRUPO_NO_ENCONTRADO')
  const plan = group?.plan

  // Guard GRU-1 (solo autoservicio; el staff puede matricular fuera de la
  // ventana): el grupo debe estar dentro de su período de matrícula.
  if (opts?.enforceEnrollmentWindow && group
    && !isEnrollmentWindowOpen(group.enrollment_start_date, group.enrollment_end_date, ymdCR())) {
    throw new Error('MATRICULA_CERRADA')
  }

  // Guard PAG-2: con pagos de ESTUDIOS pendientes no se puede matricular otro
  // estudio (eventos/otros conceptos no bloquean). Se excluyen los pagos del
  // MISMO plan (ese caso lo maneja PAGO_PENDIENTE con su mensaje). El staff
  // puede saltarlo con un override explícito (allowPendingStudyPayments).
  if (!opts?.allowPendingStudyPayments) {
    const pendientes = await countBlockingStudyPayments(memberId, plan?.id ?? null)
    if (pendientes > 0) throw new Error(`PAGO_ESTUDIOS_PENDIENTE:${pendientes}`)
  }
  // FIN-4: un TRACTO VENCIDO impago bloquea matricularse en otro estudio. Es un
  // guard aparte del de PAG-2 porque un arreglo puede ser de un evento (no de
  // matrícula) y aun así debe bloquear; y porque el mensaje lleva el detalle de
  // lo que se debe. Mismo override del staff.
  if (!opts?.allowPendingStudyPayments) {
    const { getOverdueInstallments } = await import('./payment-plans')
    const { overdueBlockMessage } = await import('@/lib/finance/installments')
    const vencidos = await getOverdueInstallments(memberId, ymdCR())
    if (vencidos.length > 0) throw new Error(`TRACTO_VENCIDO:${overdueBlockMessage(vencidos)}`)
  }
  // El DIRIGENTE del grupo (dirigente/co-dirigente) no paga matrícula del grupo
  // que dirige. Un dirigente que se inscribe como ALUMNO en otro grupo sí paga
  // (ahí es estudiante), por eso el criterio es por-grupo, no "es dirigente".
  const esDirigenteDelGrupo = !!group && (memberId === group.leader_id || memberId === group.co_leader_id)

  // Guard: el documento de identidad es OBLIGATORIO para matricularse en
  // cualquier estudio (FIN-2 — antes solo lo exigían los planes de
  // REQUIRES_CEDULA_CODES, ej. PREMAT). Bloqueante server-side; la UI lo pide
  // antes, en el propio wizard de matrícula.
  {
    const { data: mem } = await supabase.from('members').select('cedula').eq('id', memberId).maybeSingle()
    const ced = (mem as { cedula?: string | null } | null)?.cedula
    if (!ced || !String(ced).trim()) throw new Error('CEDULA_REQUERIDA')
  }
  // Guard GRU-2: restricción de audiencia del grupo. Server-side porque
  // esconderlo de la UI no alcanza: el staff matricula a terceros por el mismo
  // endpoint y el deep link al grupo también llega acá.
  if (!opts?.allowRestrictionOverride) {
    const restriction = await getGroupRestriction(groupId)
    if (hasRestriction(restriction) && !(await memberPassesRestriction(memberId, restriction))) {
      throw new Error(`RESTRICCION_GRUPO:${restrictionBlockedMessage(restriction)}`)
    }
  }

  // Guard: grupo virtual sin autorización del miembro — server-side, no
  // depende de que la UI ya lo haya filtrado (se puede saltar el fetch).
  if (group?.is_virtual) {
    const { data: adminData } = await supabase
      .from('member_admin_data')
      .select('authorized_virtual_studies')
      .eq('member_id', memberId)
      .maybeSingle()
    const authorized = !!(adminData as { authorized_virtual_studies?: boolean } | null)?.authorized_virtual_studies
    if (!authorized) throw new Error('GRUPO_VIRTUAL_NO_AUTORIZADO')
  }
  // (2026-08-04) Se fue el guard que bloqueaba si ya había una matrícula
  // 'pendiente_de_pago' del plan: ese estado dejó de escribirse, la matrícula
  // nace efectiva. Lo que cuida el dinero sigue en pie: PAG-2 arriba (pagos de
  // estudios pendientes) y A3 acá abajo (deuda del MISMO plan).
  if (plan?.id) {
    // A3 (auditoría BE): retirar la matrícula pendiente y re-inscribirse por
    // acá saltaba el cobro (el guard anterior solo ve 'pendiente_de_pago').
    /**
     * Si quedó una inscripción RETIRADA de este plan con el cobro todavía
     * VIVO, la re-inscripción tiene que pasar por el comprobante.
     *
     * Deuda es solo 'pending'. Antes la condición era `status !== 'paid'`, y
     * con eso un cobro CANCELADO contaba como deuda: al retirar a alguien su
     * cobro se cancela, así que el propio retiro le dejaba una "deuda" que le
     * impedía volver a matricularse. Un cobro cancelado no lo debe nadie.
     *
     * Pasó con Celina Rodríguez (2026-09-05): la retiraron para reinscribirla
     * y el sistema la bloqueó con "pago pendiente" por el cobro que la propia
     * baja había cancelado — teniendo ella su matrícula YA pagada y aprobada
     * en otro registro.
     */
    const { data: droppedDebt } = await supabase
      .from('study_enrollments')
      .select('id, payments!payments_enrollment_id_fkey(id, status, concept)')
      .eq('member_id', memberId)
      .eq('plan_id', plan.id)
      .eq('status', 'dropped')
    const hasUnpaidDebt = ((droppedDebt ?? []) as Array<{ payments: Array<{ status: string; concept: string | null }> | null }>)
      .some(e => (e.payments ?? []).some(pay => pay.concept === 'matricula' && pay.status === 'pending'))
    if (hasUnpaidDebt) throw new Error('PAGO_PENDIENTE')
  }
  // El upsert re-activa una fila existente (group,member). Legítimo para
  // 'dropped' (reincorporación); una inscripción 'completed' no se resucita.
  const { data: existing } = await supabase
    .from('study_enrollments')
    .select('status')
    .eq('group_id', groupId)
    .eq('member_id', memberId)
    .maybeSingle()
  const existingStatus = (existing as { status: string } | null)?.status
  if (existingStatus === 'completed') throw new Error('YA_COMPLETADO')

  // CUPO (2026-08-04): validación server-side. Antes solo la UI filtraba los
  // grupos llenos; con la matrícula efectiva de inmediato eso alcanza para
  // pasarse del tope (dos personas a la vez, o el staff matriculando de una).
  // No cuenta a quien ya está en el grupo: re-matricularse no consume un cupo.
  if (!occupiesSpot(existingStatus)) {
    const { data: ocupados } = await supabase
      .from('study_enrollments')
      .select('member_id, status')
      .eq('group_id', groupId)
      .in('status', OCCUPYING_STATUSES as unknown as string[])
    const activeCount = ((ocupados ?? []) as Array<{ member_id: string }>)
      .filter(e => e.member_id !== memberId).length
    if (isGroupFull({ activeCount, maxCapacity: group?.max_students })) {
      throw new Error(`CUPO_LLENO:${group?.max_students ?? 0}`)
    }
  }

  // Costo real: sale siempre del plan (study_groups no tiene columnas propias
  // de costo). Cualquier matrícula con costo queda pendiente de comprobante,
  // sin importar si la hace el propio miembro o el staff.
  const amount = Number(plan?.cost ?? 0)
  // INT-3: el cobro va en la moneda DEL PLAN, no en colones por defecto.
  const planCurrency = toCurrency(plan?.currency)
  const requiresPayment = !!plan?.requires_payment && amount > 0
  // Nombre del estudio para la descripción del cobro (el `code` no le dice nada
  // a nadie en una lista de pagos).
  let planName: string | null = null
  if (requiresPayment && plan?.id) {
    const { data: pl } = await supabase.from('study_plans').select('name').eq('id', plan.id).maybeSingle()
    planName = (pl as { name?: string } | null)?.name ?? plan.code ?? null
  }

  // Beca/cupón (opcional): recalcula el monto ANTES de decidir el estado. Se
  // resuelve incluso si el resultado queda en 0 — la matrícula gratis por beca
  // igual consume el uso (registrar que se usó, sin importar el residual).
  let finalAmount = amount
  let appliedScholarship: { id: string; kind: 'asignada' | 'generica' } | null = null
  if (requiresPayment && scholarshipInput && (scholarshipInput.scholarship_id || scholarshipInput.coupon_code) && plan?.id) {
    const { resolveScholarshipForApplication, computeDiscountedAmount } = await import('./scholarships')
    const resolved = await resolveScholarshipForApplication(memberId, 'study_plan', plan.id, scholarshipInput)
    finalAmount = computeDiscountedAmount(amount, resolved.discount_type, resolved.discount_value, planCurrency)
    appliedScholarship = { id: resolved.id, kind: resolved.kind }
  }
  // El dirigente del grupo no paga la matrícula de su propio grupo.
  // `sinCobro` es el caso de la reubicación: se cambia de grupo, no se matricula
  // de nuevo (ver el comentario de la opción).
  const requiresPaymentFinal =
    requiresPayment && finalAmount > 0 && !esDirigenteDelGrupo && !opts?.sinCobro
  // REGLA 2026-09-01: con costo, la matrícula nace PENDIENTE DE PAGO y solo se
  // confirma cuando entra el comprobante (approve_payment la pasa a 'enrolled').
  //
  // Esto revierte la decisión del 2026-08-04, que la dejaba efectiva de
  // inmediato. El caso que la tumbó: alguien empieza a matricularse, llega a la
  // pantalla del comprobante, se arrepiente y cierra — y quedaba matriculada,
  // ocupando cupo, con un cobro abierto y un correo de bienvenida a un curso
  // que nunca llevó. Pasó con Alexandra Forero y hubo que retirarla a mano.
  //
  // El estado 'pendiente_de_pago' nunca se removió del modelo: sigue ocupando
  // cupo (OCCUPYING_STATUSES), cuenta como "cursando" en elegibilidad, tiene su
  // etiqueta en las pantallas y el cierre lo contempla. Lo único que había
  // cambiado era que dejó de escribirse.
  const status = requiresPaymentFinal ? 'pendiente_de_pago' as const : 'enrolled' as const

  const { data: enr, error } = await supabase
    .from('study_enrollments')
    .upsert({ group_id: groupId, member_id: memberId, status, recorded_by: opts?.recordedBy ?? null }, { onConflict: 'group_id,member_id' })
    .select('id').single()
  if (error) throw error
  const enrollmentId = (enr as { id: string }).id

  if (requiresPaymentFinal) {
    // Pago pendiente sin comprobante todavía (mismo patrón que
    // autoEnrollApprovedToNextLevel) — se completa cuando suba el comprobante.
    // QA 2026-07-17: si el pago no se pudo crear, revertir la inscripción —
    // una matrícula pendiente_de_pago sin fila en payments es invisible para
    // finanzas y la API habría respondido éxito igual.
    const { error: payErr } = await supabase.from('payments').insert({
      member_id: memberId, amount: finalAmount, currency: planCurrency, payment_method: 'comprobante',
      concept: 'matricula', enrollment_id: enrollmentId,
      study_group_id: groupId, entity_type: 'study_group', status: 'pending',
      scholarship_id: appliedScholarship?.id ?? null,
      // Descripción legible desde el minuto cero (2026-08-06). La lista de pagos
      // igual la sabe derivar, pero guardarla sirve para exports y para finanzas
      // mirando la tabla directo.
      description: `Matrícula · ${planName ?? 'estudio'}`,
    })
    if (payErr) {
      if (existingStatus) {
        await supabase.from('study_enrollments').update({ status: existingStatus }).eq('id', enrollmentId)
      } else {
        await supabase.from('study_enrollments').delete().eq('id', enrollmentId)
      }
      throw payErr
    }
    // NO se notifica acá el cobro pendiente. Se hacía, y salía mal siempre:
    // apenas vuelve esta función la UI abre el modal del comprobante, la
    // persona lo sube en el momento y el pago pasa a revisión — con la
    // notificación diciéndole que debe algo que ya pagó. Medido antes de
    // quitarla: los 4 comprobantes de matrícula que existen se subieron en
    // menos de 10 minutos (promedio 3), o sea 4 de 4 avisos equivocados.
    //
    // Quien de verdad no pague queda cubierto por el recordatorio semanal
    // (/api/cron/payment-reminders), que es el lugar correcto porque MIRA el
    // comprobante: isRemindablePayment descarta los pagos en revisión. Esa es
    // la validación pedida —avisar solo si no adjuntó— y ya existía.
    //
    // OJO: esto es solo la matrícula interactiva. La auto-matrícula al cerrar
    // un grupo (autoEnrollApprovedToNextLevel, en payments.ts) conserva SU
    // notificación: ahí no hay nadie frente a una pantalla y es el único aviso.
  }
  if (appliedScholarship) {
    const { consumeScholarship } = await import('./scholarships')
    await consumeScholarship(appliedScholarship, memberId, finalAmount, { enrollmentId })
  }

  // Consumir invitación/excepción activa del plan del grupo al matricularse.
  if (plan?.id) {
    if (plan.requires_invitation) {
      const { markInvitationUsed } = await import('./study-invitations')
      await markInvitationUsed(memberId, plan.id)
    }
    // Excepción de matrícula: marcarla usada (no-op si no hay activa).
    const { markExceptionUsed } = await import('./study-exceptions')
    await markExceptionUsed(memberId, plan.id)
  }

  // La moneda viaja con el monto: el modal de comprobante la necesita para no
  // mostrar un cobro en euros formateado como colones (INT-3).
  return { status, enrollment_id: enrollmentId, amount: finalAmount, currency: planCurrency, requires_payment: requiresPaymentFinal }
}

/**
 * Saca una inscripción ACTIVA (enrolled/pendiente_de_pago/waitlist) del grupo.
 *
 * DOS TIPOS (2026-09-05). 'retirar' deja constancia de que la persona cursaba
 * y se fue ('dropped', la ficha lo muestra como "Se retiró"). 'cancelar' anula
 * una matrícula que no debió existir ('cancelada'), y esa no sale en el
 * historial: decir que alguien se retiró de un estudio que nunca empezó es
 * escribirle una historia que no vivió. La regla está en baja-matricula.ts.
 *
 * A11: 'completed' es terminal — un retiro accidental ya no borra registro
 * académico. A3: el pago de matrícula sin comprobante se cancela para que no
 * quede huérfano y aprobable en la cola.
 */
export async function withdrawMember(
  groupId: string,
  memberId: string,
  reason?: string,
  tipo: TipoDeBaja = 'retirar',
): Promise<void> {
  const supabase = createAdminClient()
  const { data: updated, error } = await supabase
    .from('study_enrollments')
    .update({ status: estadoDeBaja(tipo), dropped_at: new Date().toISOString(), drop_reason: reason ?? null })
    .eq('group_id', groupId)
    .eq('member_id', memberId)
    .in('status', ['enrolled', 'pendiente_de_pago', 'waitlist'])
    .select('id, status')
  if (error) throw error
  if ((updated ?? []).length === 0) throw new Error('NO_RETIRABLE')

  // Cancelar el pago de matrícula pendiente asociado (si existía y no estaba
  // en revisión ni pagado). Best-effort: un fallo acá no revierte el retiro.
  const enrollmentId = (updated as Array<{ id: string }>)[0].id
  const { error: payErr } = await supabase
    .from('payments')
    // 'cancelado', no 'failed': la persona se retiró, no se rompió nada.
    .update({ status: 'cancelado' })
    .eq('enrollment_id', enrollmentId)
    .eq('concept', 'matricula')
    .eq('status', 'pending')
    .is('review_status', null)
  if (payErr) console.warn('withdrawMember cancelar pago:', payErr.message)
}

export async function setEnrollmentGrade(groupId: string, memberId: string, grade: number): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('study_enrollments')
    .update({ grade })
    .eq('group_id', groupId)
    .eq('member_id', memberId)
    // A11: la nota solo aplica a inscripciones vivas o completadas — no a
    // retiradas/pendientes de pago.
    .in('status', ['enrolled', 'completed'])
  if (error) throw error
}

// Líderes
export type LeaderWriteInput = {
  member_id: string
  zone_preference?: string[]
  availability_status?: DbLeaderEnriched['availability_status']
  is_active?: boolean
  qualified_study_codes?: string[]
}

export async function createLeader(input: LeaderWriteInput): Promise<{ id: string }> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('study_leaders').insert(input).select('id').single()
  if (error) throw error
  return data as { id: string }
}

/** Actualiza (o crea) la configuración de un dirigente por member_id: estudios
 *  que imparte (qualified_study_codes) y zonas dispuesto (zone_preference). */
export async function updateDirigenteConfig(
  memberId: string,
  patch: { qualified_study_codes?: string[]; zone_preference?: string[] },
): Promise<void> {
  const supabase = createAdminClient()
  const { data: existing } = await supabase
    .from('study_leaders').select('id').eq('member_id', memberId).maybeSingle()
  if (existing) {
    const { error } = await supabase.from('study_leaders').update(patch).eq('member_id', memberId)
    if (error) throw error
  } else {
    const { error } = await supabase.from('study_leaders').insert({
      member_id: memberId,
      is_active: false,
      availability_status: 'inactive',
      zone_preference: patch.zone_preference ?? [],
      qualified_study_codes: patch.qualified_study_codes ?? [],
    })
    if (error) throw error
  }
}

export async function updateLeader(id: string, patch: Partial<LeaderWriteInput>): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.from('study_leaders').update(patch).eq('id', id)
  if (error) throw error
}

/**
 * Grupos con TODA su gente, para el export "grupos y participantes".
 *
 * Consulta aparte y no un campo más en la lista: trae nombres, correos y el
 * costo del plan, que la tabla no necesita y que en 2.196 grupos serían miles de
 * filas de más en cada carga de pantalla.
 *
 * `ids` limita a los grupos marcados con checkbox; sin `ids`, van todos los que
 * pasen los filtros.
 */
export async function getGroupsWithParticipants(
  opts: { ids?: string[]; filters?: GroupFilters } = {},
): Promise<{ grupos: GrupoParaExport[]; personas: Map<string, PersonaMin> }> {
  const supabase = createAdminClient()
  const SELECT = `
    id, name, status, starts_at, ends_at, leader_id, co_leader_id,
    plan:study_plans(code, name, cost, currency),
    enrollments:study_enrollments!study_enrollments_group_id_fkey(member_id, status)
  `
  // PostgREST corta en 1000 filas SIN avisar y acá hay más de 2.000 grupos:
  // paginar es obligatorio, no una optimización.
  const grupos: GrupoParaExport[] = []
  const tam = 500
  for (let p = 0; ; p++) {
    let q = supabase.from('study_groups').select(SELECT).order('name').range(p * tam, p * tam + tam - 1)
    if (opts.ids?.length) q = q.in('id', opts.ids)
    const f = opts.filters
    if (f?.statuses?.length) q = q.in('status', f.statuses)
    if (f?.zone) q = q.eq('zone', f.zone)
    if (f?.bloqueId) q = q.eq('bloque_id', f.bloqueId)
    if (f?.startFrom) q = q.gte('starts_at', f.startFrom)
    if (f?.startTo) q = q.lte('starts_at', f.startTo)
    const { data, error } = await q
    if (error) throw error
    grupos.push(...((data ?? []) as unknown as GrupoParaExport[]))
    if (!data || data.length < tam) break
  }

  // Las personas en un solo viaje, troceado: `.in()` con miles de ids revienta
  // la URL (mismo motivo que en el resto del repo).
  const ids = [...new Set(grupos.flatMap(g =>
    [g.leader_id, g.co_leader_id, ...g.enrollments.map(e => e.member_id)].filter(Boolean) as string[]))]
  const personas = new Map<string, PersonaMin>()
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await supabase
      .from('members').select('id, first_name, last_name, email, phone, cedula')
      .in('id', ids.slice(i, i + 300))
    if (error) throw error
    for (const m of (data ?? []) as PersonaMin[]) personas.set(m.id, m)
  }
  return { grupos, personas }
}

/**
 * Suelta el cupo de las matrículas que quedaron a medio camino: creadas con
 * costo, sin comprobante y pasada la ventana de gracia. La regla —y qué NO se
 * toca— está en enrollment-hold.ts.
 *
 * Se apoya en withdrawMember en vez de escribir el UPDATE a mano: esa función
 * ya cancela el pago pendiente asociado, así que no queda un cobro huérfano
 * aprobable en la cola de finanzas. Duplicarlo acá sería el clásico segundo
 * lugar donde arreglar un bug.
 */
export async function expirePendingStudyEnrollments(
  ahora: Date = new Date(),
): Promise<{ expired: number; detalle: Array<{ member_id: string; group_id: string }> }> {
  const supabase = createAdminClient()
  const { reservaExpirada, MOTIVO_EXPIRADA } = await import('@/lib/studies/enrollment-hold')

  const { data, error } = await supabase
    .from('study_enrollments')
    .select('id, member_id, group_id, status, created_at, payments!payments_enrollment_id_fkey(concept, review_status)')
    .eq('status', 'pendiente_de_pago')
  if (error) throw error

  const candidatas = ((data ?? []) as unknown as Array<{
    id: string; member_id: string; group_id: string | null; status: string; created_at: string
    payments: Array<{ concept: string | null; review_status: string | null }> | null
  }>).filter(e => {
    // El review_status que importa es el del pago de MATRÍCULA; puede haber
    // otros conceptos colgando de la misma persona.
    const matricula = (e.payments ?? []).filter(p => p.concept === 'matricula')
    const conAlgoEnviado = matricula.find(p => p.review_status)
    return !!e.group_id && reservaExpirada({
      status: e.status,
      reviewStatus: conAlgoEnviado?.review_status ?? null,
      creadaEn: e.created_at,
      ahora,
    })
  })

  const detalle: Array<{ member_id: string; group_id: string }> = []
  for (const e of candidatas) {
    try {
      await withdrawMember(e.group_id!, e.member_id, MOTIVO_EXPIRADA)
      detalle.push({ member_id: e.member_id, group_id: e.group_id! })
    } catch (err) {
      // Una que falle no puede frenar el barrido: la siguiente corrida la agarra.
      console.warn('expirePendingStudyEnrollments:', err instanceof Error ? err.message : err)
    }
  }
  return { expired: detalle.length, detalle }
}

/* ────────────────────────────────────────────────────────────────────────────
 * FOL-3 (2026-09-02) · Detalle de un cierre ya hecho
 *
 * El cierre es irreversible y la pantalla de cierre solo abre para grupos EN
 * CURSO, así que una vez cerrado no había dónde ver qué se decidió: quién
 * aprobó, quién no y por qué. Esto lo reconstruye desde las inscripciones.
 *
 * La reprobación se lee con close-result-read porque el RPC la guarda en
 * `notes` y no en el status — leer el status pelado cuenta reprobados como
 * aprobados.
 * ──────────────────────────────────────────────────────────────────────────── */

export type CierreParticipante = {
  member_id: string
  nombre: string
  resultado: ResultadoCierre
  /** El motivo tal como lo escribió el dirigente, sin el prefijo de la base. */
  motivo: string | null
  nota: number | null
}

export type CierreDetalle = {
  grupo: {
    id: string
    name: string | null
    nivel: string | null
    status: string
    dirigente: string | null
    co_dirigente: string | null
    ubicacion: string | null
    zona: string | null
    starts_at: string | null
    ends_at: string | null
  }
  conteo: ConteoCierre
  participantes: CierreParticipante[]
  /** Tiquete de folletos que salió de este cierre, si lo hubo. */
  folleto_request_id: string | null
}

export async function getCierreDetalle(groupId: string): Promise<CierreDetalle | null> {
  const { contarResultadosCierre, clasificarResultado, motivoLegible } =
    await import('@/lib/studies/close-result-read')
  const supabase = createAdminClient()

  const { data: g } = await supabase
    .from('study_groups')
    .select('id, name, status, location, zone, starts_at, ends_at, plan:study_plans(name),'
      + ' leader:members!study_groups_leader_id_fkey(first_name, last_name),'
      + ' co_leader:members!study_groups_co_leader_id_fkey(first_name, last_name)')
    .eq('id', groupId).maybeSingle()
  if (!g) return null
  const row = g as unknown as Record<string, unknown>
  const primero = <T,>(v: unknown): T | null => (Array.isArray(v) ? ((v[0] as T) ?? null) : ((v as T) ?? null))
  const persona = (v: unknown): string | null => {
    const p = primero<{ first_name: string | null; last_name: string | null }>(v)
    if (!p) return null
    const n = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
    return n || null
  }

  const { data: enr } = await supabase
    .from('study_enrollments')
    .select('member_id, status, notes, completed_at, drop_reason, grade, member:members!study_enrollments_member_id_fkey(first_name, last_name)')
    .eq('group_id', groupId)
  const filas = (enr ?? []) as Array<{
    member_id: string; status: string | null; notes: string | null; completed_at: string | null
    drop_reason: string | null; grade: number | null
    member: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null
  }>

  const { data: fol } = await supabase
    .from('folleto_requests').select('id').eq('origin_group_id', groupId).limit(1).maybeSingle()

  // El arranque del grupo separa a quien aprobó ACÁ de quien venía con el nivel
  // aprobado desde antes (arrastre de la importación de PCO).
  const inicioGrupo = ((row.starts_at as string | null) ?? '').slice(0, 10) || null

  const participantes: CierreParticipante[] = filas.map(f => ({
    member_id: f.member_id,
    nombre: persona(f.member) ?? 'sin nombre',
    resultado: clasificarResultado(f, inicioGrupo),
    motivo: motivoLegible(f),
    nota: f.grade,
  }))
  // Los resultados primero (aprobado, reprobado, retirado, sin evaluar) y
  // dentro de cada grupo por nombre: quien revisa un cierre busca por persona.
  const orden: Record<string, number> = { aprobado: 0, reprobado: 1, retirado: 2, sin_evaluar: 3, historico: 4, otro: 5 }
  participantes.sort((a, b) =>
    (orden[a.resultado] - orden[b.resultado]) || a.nombre.localeCompare(b.nombre, 'es-CR'))

  return {
    grupo: {
      id: String(row.id),
      name: (row.name as string | null) ?? null,
      nivel: primero<{ name: string | null }>(row.plan)?.name ?? null,
      status: String(row.status),
      dirigente: persona(row.leader),
      co_dirigente: persona(row.co_leader),
      ubicacion: (row.location as string | null) ?? null,
      zona: (row.zone as string | null) ?? null,
      starts_at: (row.starts_at as string | null) ?? null,
      ends_at: (row.ends_at as string | null) ?? null,
    },
    conteo: contarResultadosCierre(filas, inicioGrupo),
    participantes,
    folleto_request_id: (fol as { id: string } | null)?.id ?? null,
  }
}
