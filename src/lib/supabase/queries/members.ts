import { createAdminClient, type TableName } from '@/lib/supabase/admin'
import type { MemberRole } from '@/types/member'
import type { FilterCondition, ConditionGroup } from '@/types/filters'
import { evaluateUnits } from '@/lib/filter-units'
import { getInitials } from '@/lib/format'
import { getAreaNameMap, parentAreaName } from '@/lib/supabase/queries/_area-map'
import { esComiteDirigentes } from '@/lib/dirigentes'
import { getActiveAttendanceMemberIds } from '@/lib/supabase/queries/members-attendance'
import { ATTENDANCE_MIN_CHARLAS_INTERMEDIA } from '@/lib/attendance'

// NOTA: usamos createAdminClient (service role key) porque la app todavía
// corre con mock auth — sin JWT de Supabase, RLS bloquearía todas las reads.
// Cuando migremos a Supabase Auth real, cambiar a createClient de server.ts
// y dejar que RLS haga su trabajo.

// ── Tipos ──────────────────────────────────────────────────

/** Fila cruda de la tabla `members` en Supabase. Para el tipo de dominio completo
 *  ver `Member` en `@/types/member`. Usar `toDomainMember()` en `@/lib/members/adapter` para convertir. */
export type DbMember = {
  id: string
  cedula: string | null
  /** INT-1: tipo del documento en `cedula` ('cedula'|'dni_nie'|'pasaporte'|'otro'). */
  document_type: string
  first_name: string
  last_name: string
  birth_date: string | null
  gender: 'M' | 'F' | 'otro' | null
  marital_status: string | null
  phone: string | null
  email: string | null
  province: string | null
  canton: string | null
  district: string | null
  address: string | null
  occupation: string | null
  workplace: string | null
  allergies: string | null
  medications: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  photo_url: string | null
  is_donor: boolean
  is_active: boolean
  deactivation_reason: string | null
  deactivated_at: string | null
  sede_id: string | null
  field_updated_at: Record<string, string> | null
  /** Enlace a la cuenta de Supabase Auth (null = sin cuenta de acceso). */
  auth_user_id: string | null
  /** Espejo de auth.users.email_confirmed_at (mig 096). Null = sin confirmar/sin cuenta. */
  account_confirmed_at: string | null
  /** Espejo de auth.users.last_sign_in_at (2026-08-04). Null con auth_user_id =
   *  nunca ha entrado — es lo que separa "nunca entró" de "cuenta activa". */
  last_sign_in_at: string | null
  created_at: string
  updated_at: string
}

/** DbMember + datos relacionados que se traen en una sola query para el list view. */
export type DbMemberEnriched = DbMember & {
  sede: { code: string; name: string } | null
  /** Caso del cálculo de sede (cron refresh_member_sedes, mismo algoritmo que
   *  src/lib/sede-attendance.ts): 'activo' = asistió en los últimos 6 meses;
   *  'inactivo' = se usó su último período activo. null = sin sede. */
  sede_case: 'activo' | 'inactivo' | null
  sede_last_checkin: string | null
  roles: MemberRole[]
  /** Sub-estado del rol 'dirigente' activo (null si no es dirigente). */
  estado_dirigente: 'activo' | 'en_descanso' | 'disponible' | null
  /** Tiene registro de dirigente (fila en study_leaders) o está activo en el
   *  comité Dirigentes. Incluye dirigentes inactivos. Join, no consulta por fila. */
  is_dirigente: boolean
  is_server: boolean
  current_study: string | null
  current_study_week?: number | null
  completed_studies: string[]
  attendance_months?: string[]
  active_service: {
    position: string
    committee: string
    area: string
    from: string | null
  } | null
}

export type MemberFilters = {
  search?: string
  province?: string
  is_active?: boolean
  is_donor?: boolean
  is_server?: boolean
  /** true = criterio general (6 charlas/6 meses + 1 en 60 días);
   *  'estudios' = reforzado de Etapa Intermedia (12 charlas). */
  active_attendance?: boolean | 'estudios'
  gender?: string
  ids?: string[]
  /** Condiciones de los filtros avanzados (se resuelven server-side). */
  conditions?: FilterCondition[]
  /** FIL-3: grupos AND/OR del QueryBar y operador top-level por unidad
   *  ('c<id>' o 'g<id>' → 'AND'|'OR'). Sin ellos, todo se combina con AND. */
  groups?: ConditionGroup[]
  topLevelOps?: Record<string, 'AND' | 'OR'>
  /** Interno: no aplicar el filtro de is_active (los ids ya vienen filtrados). */
  any_active?: boolean
  page?: number
  pageSize?: number
}

/** member_ids con al menos un voluntariado activo (mismo criterio que la página de servidores). */
export async function getServerMemberIds(): Promise<string[]> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('volunteers').select('member_id').eq('status', 'active')
    if (error) {
      console.warn('getServerMemberIds:', error.message)
      return []
    }
    return Array.from(new Set((data ?? []).map((r) => (r as { member_id: string }).member_id)))
  } catch (e) {
    console.warn('getServerMemberIds:', e)
    return []
  }
}

/** UUID v4 (o cualquier UUID): para validar input antes de interpolarlo en
 *  sintaxis de filtro PostgREST (.or), donde comas/paréntesis inyectan. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Criterio de asistencia activa: extraído a ./members-attendance. Re-exportado
// acá para no tocar a los consumidores (que importan del barrel members).
export {
  ATTENDANCE_MONTHS,
  ATTENDANCE_MIN_CHARLAS,
  ATTENDANCE_RECENCY_DAYS,
  meetsAttendanceCriteria,
  getActiveAttendanceMemberIds,
} from '@/lib/supabase/queries/members-attendance'

export type MemberCounts = {
  total: number
  donantes: number
  servidores: number
  activos_asistencia: number
}

/** Conteos para los chips/header. Mismas definiciones que las páginas de cada módulo. */
export async function getMemberCounts(): Promise<MemberCounts> {
  const supabase = createAdminClient()
  const countWhere = async (col: string, val: boolean) => {
    try {
      const { count } = await supabase.from('members').select('id', { count: 'exact', head: true }).eq(col, val)
      return count ?? 0
    } catch (e) {
      console.warn(`getMemberCounts(${col}):`, e)
      return 0
    }
  }
  const totalP = (async () => {
    try {
      const { count } = await supabase.from('members').select('id', { count: 'exact', head: true }).eq('is_active', true)
      return count ?? 0
    } catch (e) {
      console.warn('getMemberCounts(total):', e)
      return 0
    }
  })()
  const [total, donantes, serverIds, attendanceIds] = await Promise.all([
    totalP,
    countWhere('is_donor', true),
    getServerMemberIds(),          // ya resiliente (devuelve [])
    getActiveAttendanceMemberIds(),// ya resiliente (devuelve [])
  ])
  return { total, donantes, servidores: serverIds.length, activos_asistencia: attendanceIds.length }
}

/** Quita acentos/diacríticos (NFD + corta los combining marks). */
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Aplica búsqueda de texto sobre miembros contra la columna normalizada
 *  `search_text` (nombre+apellido+cédula+email+teléfono, sin acentos, minúscula).
 *  Tokeniza por espacios — cada palabra debe aparecer (AND entre palabras), así
 *  "Juan Pérez" matchea nombre+apellido. Insensible a tildes/ñ (buscar "munoz"
 *  encuentra "Muñoz" y viceversa). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyMemberSearch<T extends { ilike: (col: string, pattern: string) => any }>(query: T, search: string, col = 'search_text'): T {
  let q = query
  for (const tok of search.trim().split(/\s+/)) {
    const s = stripAccents(tok).toLowerCase().replace(/[%,()]/g, '')
    if (!s) continue
    q = q.ilike(col, `%${s}%`)
  }
  return q
}


// ── Filtros avanzados server-side ─────────────────────────────────────────────
// Cada condición se traduce a sets de member_ids POR CONDICIÓN; la combinación
// (condiciones sueltas y grupos AND/OR del QueryBar, con operador top-level por
// unidad) la hace evaluateUnits de src/lib/filter-units.ts — la MISMA semántica
// que la UI (FIL-3).

/** Sets resueltos de UNA condición: pasa quien está en todos los include y en
 *  ningún exclude. Sin sets (p. ej. 'status' suelto) la condición no filtra acá. */
type ResolvedCondition = { id: number; include: Array<Set<string>>; exclude: Array<Set<string>> }

type ConditionResolution = {
  perCondition: ResolvedCondition[]
  isActiveOverride?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pagedIds(build: (q: any) => any, table: TableName, select: string, orderCol = 'member_id', scopeIds?: string[]): Promise<Set<string>> {
  const supabase = createAdminClient()
  const out = new Set<string>()
  for (let from = 0; ; from += 1000) {
    // orderCol: en `members` la columna real es `id` (member_id ahí es alias del
    // select); en volunteers/event_checkins sí existe member_id.
    let q = supabase.from(table).select(select).order(orderCol).range(from, from + 999)
    // GRU-2: con alcance, la misma consulta lee un índice en vez de barrer la
    // tabla entera. `orderCol` es justo la columna de miembro en los dos casos.
    if (scopeIds) q = q.in(orderCol, scopeIds)
    q = build(q)
    const { data, error } = await q
    if (error) throw error
    for (const r of (data ?? []) as unknown as Array<{ member_id: string | null }>) {
      if (r.member_id) out.add(r.member_id)
    }
    if ((data ?? []).length < 1000) break
  }
  return out
}

/** Base de fecha para el rango de un filtro de estudio:
 *  - 'completion': fecha de finalización (graduación) del enrollment.
 *  - 'start':      fecha de inicio (para "en progreso").
 *  La fecha se resuelve con el mismo fallback que el perfil (study_history):
 *  finalización = completed_at ?? fecha del grupo ?? enrolled_at;
 *  inicio       = fecha del grupo ?? enrolled_at. */
type EnrollDateBasis = 'completion' | 'start'
type EnrollRange = { from: string | null; to: string | null; basis: EnrollDateBasis }

/** Fila mínima de enrollment para resolver la fecha en memoria. */
type EnrollDateRow = { member_id: string | null; completed_at: string | null; enrolled_at: string | null; group_starts: string | null }

/** ¿La fecha resuelta del enrollment cae dentro del rango [from, to] (YYYY-MM-DD,
 *  ambos inclusivos)? Sin rango → siempre true. */
function enrollmentInRange(r: EnrollDateRow, range: EnrollRange | undefined): boolean {
  if (!range || (!range.from && !range.to)) return true
  const d = range.basis === 'start'
    ? (r.group_starts ?? r.enrolled_at)
    : (r.completed_at ?? r.group_starts ?? r.enrolled_at)
  if (!d) return false // sin fecha resoluble → no entra a un filtro por fecha
  const day = d.slice(0, 10)
  if (range.from && day < range.from) return false
  if (range.to && day > range.to) return false
  return true
}

/** member_ids con inscripción en un plan (por code) con esos estados, opcionalmente
 *  acotados a un rango de fecha que se evalúa contra el MISMO enrollment (fecha de
 *  finalización o de inicio según `range.basis`) — no como un filtro de fecha
 *  independiente.
 *  Dos fuentes: inscripciones CON grupo (plan vía study_groups) e inscripciones
 *  SIN grupo (plan_id directo, migración 032 — así vino el histórico: ~19k
 *  completados sin grupo que el join !inner descartaba). */
async function idsByEnrollment(planCode: string, statuses: string[], range?: EnrollRange, scopeIds?: string[]): Promise<Set<string>> {
  const supabase = createAdminClient()
  const { data: plan } = await supabase
    .from('study_plans').select('id').eq('code', planCode).maybeSingle()
  const planId = (plan as { id: string } | null)?.id

  const out = new Set<string>()

  // Fuente 1: enrollments CON grupo (la fecha del grupo es starts_at del grupo).
  for (let from = 0; ; from += 1000) {
    let q1 = supabase
      .from('study_enrollments')
      .select('member_id, completed_at, enrolled_at, grp:study_groups!study_enrollments_group_id_fkey!inner(starts_at, plan:study_plans!inner(code))')
      .in('status', statuses)
      .eq('grp.plan.code', planCode)
      .order('id')
      .range(from, from + 999)
    if (scopeIds) q1 = q1.in('member_id', scopeIds)
    const { data, error } = await q1
    if (error) throw error
    const rows = (data ?? []) as unknown as Array<{ member_id: string | null; completed_at: string | null; enrolled_at: string | null; grp: { starts_at: string | null } | null }>
    for (const r of rows) {
      if (!r.member_id) continue
      if (enrollmentInRange({ member_id: r.member_id, completed_at: r.completed_at, enrolled_at: r.enrolled_at, group_starts: r.grp?.starts_at ?? null }, range)) {
        out.add(r.member_id)
      }
    }
    if (rows.length < 1000) break
  }

  // Fuente 2: enrollments SIN grupo (plan_id directo); la fecha es del enrollment.
  if (planId) {
    for (let from = 0; ; from += 1000) {
      let q2 = supabase
        .from('study_enrollments')
        .select('member_id, completed_at, enrolled_at')
        .in('status', statuses)
        .eq('plan_id', planId)
        .is('group_id', null)
        .order('id')
        .range(from, from + 999)
      if (scopeIds) q2 = q2.in('member_id', scopeIds)
      const { data, error } = await q2
      if (error) throw error
      const rows = (data ?? []) as unknown as Array<{ member_id: string | null; completed_at: string | null; enrolled_at: string | null }>
      for (const r of rows) {
        if (!r.member_id) continue
        if (enrollmentInRange({ member_id: r.member_id, completed_at: r.completed_at, enrolled_at: r.enrolled_at, group_starts: null }, range)) {
          out.add(r.member_id)
        }
      }
      if (rows.length < 1000) break
    }
  }

  return out
}

/** Resuelve cada condición avanzada a sus sets de inclusión/exclusión.
 *  `orGroupedIds`: ids de condiciones dentro de grupos OR — para esas, 'status'
 *  se resuelve como set (no como override global del escaneo base). */
export async function resolveAdvancedConditions(
  conditions: FilterCondition[],
  orGroupedIds: Set<number> = new Set(),
  /** GRU-2 · Alcance opcional: resolver SOLO para estos miembros. Los sets salen
   *  igual de correctos (son subconjuntos), pero cada consulta lee un índice en
   *  vez de barrer la tabla. Es lo que hace viable evaluar la restricción de un
   *  grupo en la pantalla de matrícula, sin una segunda implementación. */
  scopeIds?: string[],
): Promise<ConditionResolution> {
  const supabase = createAdminClient()
  const perCondition: ResolvedCondition[] = []
  let isActiveOverride: boolean | undefined

  for (const c of conditions) {
    // Shadow a propósito: cada condición acumula SUS sets; los case de abajo
    // siguen escribiendo en `res` sin saber del cambio de granularidad.
    const res = { include: [] as Array<Set<string>>, exclude: [] as Array<Set<string>>, isActiveOverride: undefined as boolean | undefined }
    switch (c.type) {
      case 'study': {
        // Inverso: NO lo completó y NO lo está cursando ahora — mismo universo
        // que 'any' ('completed'+'enrolled'), pero como EXCLUDE en vez de
        // INCLUDE. Sin rango de fecha (no aplica a "nunca lo llevó").
        if (c.status === 'not_taken') {
          res.exclude.push(await idsByEnrollment(c.study, ['completed', 'enrolled'], undefined, scopeIds))
          break
        }
        const statuses = c.status === 'completed' ? ['completed']
          : c.status === 'in_progress' ? ['enrolled']
          : ['completed', 'enrolled']
        // El rango de fecha se evalúa contra el MISMO enrollment del plan: para
        // "completado" → fecha de finalización; para "en progreso" → fecha de
        // inicio. Así "Nivel 1 completado + rango" devuelve solo a quienes
        // finalizaron Nivel 1 dentro del rango (no un filtro de fecha aparte).
        const basis: EnrollDateBasis = c.status === 'in_progress' ? 'start' : 'completion'
        res.include.push(await idsByEnrollment(c.study, statuses, { from: c.from, to: c.to, basis }, scopeIds))
        break
      }
      case 'service': {
        // El dropdown de áreas manda el UUID real del área (catálogo /api/org).
        // La jerarquía es área → comités hijos → puestos: el puesto puede colgar
        // del área directamente (area_id = área) o de un comité (parent_id = área).
        res.include.push(await pagedIds(q => {
          // 'active' y 'on_leave' cuentan como servicio activo.
          if (c.status === 'active') q = q.in('status', ['active', 'on_leave'])
          else if (c.status === 'historical') q = q.not('status', 'in', '(active,on_leave)')
          if (c.committee) q = q.eq('position.area.name', c.committee)
          if (c.position) q = q.eq('position.title', c.position)
          // c.area viene del input del usuario (filtros avanzados): solo se
          // interpola si es un UUID válido (anti filter-injection, auditoría S4).
          if (c.area && UUID_RE.test(c.area)) q = q.or(`id.eq.${c.area},parent_id.eq.${c.area}`, { referencedTable: 'position.area' })
          return q
        }, 'volunteers', 'member_id, position:service_positions!inner(title, area:areas!service_positions_area_id_fkey!inner(id, name, parent_id))', 'member_id', scopeIds))
        break
      }
      case 'donor': {
        // is_donor es el flag derivado de donante activo (criterio por trimestres).
        const set = await pagedIds(q => q.eq('is_donor', true), 'members', 'member_id:id', 'id', scopeIds)
        if (c.value === 'yes') res.include.push(set)
        else res.exclude.push(set)
        break
      }
      case 'attendance': {
        // FIL-1: con negate=true el set matcheado va a EXCLUDE (anti-join sobre
        // el conjunto base: quedan quienes NO tienen asistencia que cumpla).
        const target = (set: Set<string>) => (c.negate ? res.exclude.push(set) : res.include.push(set))
        // Evento puntual: solo si es un UUID válido (anti filter-injection, mismo criterio que c.area).
        const eventId = c.eventId && UUID_RE.test(c.eventId) ? c.eventId : ''
        // Sin refinamiento → criterio de asistencia activa (≥6 charlas en 6 meses, con al menos una en los últimos 60 días).
        const hasRefine = !!(c.eventType || c.from || c.to || (c.sedes && c.sedes.length) || c.camp || (c.qtyOp && c.qtyOp !== 'any') || eventId)
        if (!hasRefine) {
          target(new Set(await getActiveAttendanceMemberIds()))
          break
        }
        // Cuenta asistencias por miembro filtrando por tipo de evento (id real de
        // la BD), sede(s), nombre de campamento y rango de fechas; luego aplica el
        // operador de cantidad. Dos fuentes según attendanceType:
        //   participante → event_checkins (rango sobre checked_in_at)
        //   servidor     → event_volunteers (rango sobre la fecha del evento)
        //   cualquiera   → suma de ambas
        // event_volunteers hoy está vacía, pero queda previsto para cuando se use.
        const campLike = c.camp ? c.camp.replace(/[%,()*\\]/g, '') : ''
        // c.sedes trae CÓDIGOS de sede (el catálogo usa code como id); events.sede_id
        // es uuid. Resolver code→uuid; si ninguno existe → resultado vacío (no 500).
        let sedeUuids: string[] = []
        if (c.sedes && c.sedes.length) {
          const { data: sd } = await supabase.from('sedes').select('id, code').in('code', c.sedes)
          sedeUuids = ((sd ?? []) as Array<{ id: string }>).map(s => s.id)
          if (sedeUuids.length === 0) { res.include.push(new Set()); break }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const applyEventFilters = (q: any) => {
          if (eventId) q = q.eq('event_id', eventId)
          if (c.eventType) q = q.eq('events.event_type', c.eventType)
          if (sedeUuids.length) q = q.in('events.sede_id', sedeUuids)
          if (campLike) q = q.ilike('events.title', `%${campLike}%`)
          return q
        }
        const countFrom = async (
          table: 'event_checkins' | 'event_volunteers',
          dateField: string, // columna (o ruta embebida) para el rango de fechas
        ): Promise<Map<string, number>> => {
          const m = new Map<string, number>()
          for (let from = 0; ; from += 1000) {
            let q = supabase
              .from(table)
              .select('member_id, events!inner(event_type, sede_id, title, starts_at)')
              .not('member_id', 'is', null)
              .order('id')
              .range(from, from + 999)
            if (scopeIds) q = q.in('member_id', scopeIds)
            q = applyEventFilters(q)
            if (c.from) q = q.gte(dateField, c.from)
            if (c.to) q = q.lte(dateField, `${c.to}T23:59:59.999Z`)
            const { data, error } = await q
            if (error) throw error
            const rows = (data ?? []) as Array<{ member_id: string | null }>
            for (const r of rows) if (r.member_id) m.set(r.member_id, (m.get(r.member_id) ?? 0) + 1)
            if (rows.length < 1000) break
          }
          return m
        }

        let counts: Map<string, number>
        if (c.attendanceType === 'server') {
          counts = await countFrom('event_volunteers', 'events.starts_at')
        } else if (c.attendanceType === 'participant') {
          counts = await countFrom('event_checkins', 'checked_in_at')
        } else {
          counts = await countFrom('event_checkins', 'checked_in_at')
          const serv = await countFrom('event_volunteers', 'events.starts_at')
          for (const [id, n2] of serv) counts.set(id, (counts.get(id) ?? 0) + n2)
        }
        const n = parseInt(c.qty) || 0
        const passes = (count: number) =>
          c.qtyOp === 'gte' ? count >= n
          : c.qtyOp === 'lte' ? count <= n
          : c.qtyOp === 'eq' ? count === n
          : count >= 1 // 'any'
        const set = new Set<string>()
        for (const [id, count] of counts) if (passes(count)) set.add(id)
        target(set)
        break
      }
      case 'registration': {
        // FIL-2: inscripción a eventos (event_registrations), con estado del
        // tiquete y la misma negación anti-join que attendance. El rango de
        // fechas se evalúa sobre la fecha del EVENTO (no de la inscripción).
        const target = (set: Set<string>) => (c.negate ? res.exclude.push(set) : res.include.push(set))
        const eventId = c.eventId && UUID_RE.test(c.eventId) ? c.eventId : ''
        const set = new Set<string>()
        for (let from = 0; ; from += 1000) {
          let q = supabase
            .from('event_registrations')
            .select('member_id, events!inner(event_type, starts_at)')
            .not('member_id', 'is', null)
            .order('id')
            .range(from, from + 999)
          if (scopeIds) q = q.in('member_id', scopeIds)
          if (eventId) q = q.eq('event_id', eventId)
          if (c.eventType) q = q.eq('events.event_type', c.eventType)
          if (c.ticketStatus && c.ticketStatus !== 'any') q = q.eq('payment_status', c.ticketStatus)
          if (c.from) q = q.gte('events.starts_at', c.from)
          if (c.to) q = q.lte('events.starts_at', `${c.to}T23:59:59.999Z`)
          const { data, error } = await q
          if (error) throw error
          const rows = (data ?? []) as Array<{ member_id: string | null }>
          for (const r of rows) if (r.member_id) set.add(r.member_id)
          if (rows.length < 1000) break
        }
        target(set)
        break
      }
      case 'status': {
        // Dentro de un grupo OR el override global no sirve (uniría mal):
        // se resuelve como set de miembros con ese estado.
        if (orGroupedIds.has(c.id)) {
          res.include.push(await pagedIds(q => q.eq('is_active', c.value === 'active'), 'members', 'member_id:id', 'id', scopeIds))
        } else {
          res.isActiveOverride = c.value === 'active'
        }
        break
      }
      case 'age': {
        const now = new Date()
        const set = await pagedIds(q => {
          if (c.min) q = q.lte('birth_date', new Date(now.getFullYear() - parseInt(c.min), now.getMonth(), now.getDate()).toISOString().slice(0, 10))
          if (c.max) q = q.gte('birth_date', new Date(now.getFullYear() - parseInt(c.max) - 1, now.getMonth(), now.getDate() + 1).toISOString().slice(0, 10))
          return q.not('birth_date', 'is', null)
        }, 'members', 'member_id:id', 'id', scopeIds)
        res.include.push(set)
        break
      }
      case 'leader': {
        // Dirigente activo = servidor activo en el comité Dirigentes.
        const set = await pagedIds(
          q => q.eq('status', 'active').ilike('position.area.name', '%dirigente%'),
          'volunteers',
          'member_id, position:service_positions!inner(area:areas!service_positions_area_id_fkey!inner(name))',
          'member_id', scopeIds,
        )
        if (c.value === 'yes') res.include.push(set)
        else res.exclude.push(set)
        break
      }
      case 'server': {
        // Servidor = al menos un voluntariado ACTIVO, sin importar el comité.
        // Mismo criterio que getServerMemberIds() y que el chip rápido; la
        // diferencia es que acá 'no' manda el set a exclude y sí se puede negar.
        const set = await pagedIds(
          q => q.eq('status', 'active'), 'volunteers', 'member_id', 'member_id', scopeIds,
        )
        if (c.value === 'yes') res.include.push(set)
        else res.exclude.push(set)
        break
      }
      case 'marital': {
        res.include.push(await pagedIds(q => q.eq('marital_status', c.value), 'members', 'member_id:id', 'id', scopeIds))
        break
      }
      case 'account': {
        // Estado de cuenta, derivado de columnas denormalizadas (espejo de
        // Auth). Mismos tres casos que accountState():
        //  none → sin usuario de Auth; never_entered → con usuario y sin login;
        //  active → ya entró al menos una vez (last_sign_in_at no nulo).
        res.include.push(await pagedIds(q => {
          if (c.value === 'none') return q.is('auth_user_id', null)
          if (c.value === 'active') return q.not('last_sign_in_at', 'is', null)
          return q.not('auth_user_id', 'is', null).is('last_sign_in_at', null) // never_entered
        }, 'members', 'member_id:id', 'id', scopeIds))
        break
      }
      case 'created': {
        res.include.push(await pagedIds(q => {
          if (c.from) q = q.gte('created_at', c.from)
          if (c.to) q = q.lte('created_at', `${c.to}T23:59:59.999Z`)
          return q
        }, 'members', 'member_id:id', 'id', scopeIds))
        break
      }
      case 'form': {
        // Mismo contrato que el filtro client-side (useMemberFilters):
        // 'not_filled' excluye a quien tenga CUALQUIER respuesta al formulario
        // (sin aplicar fechas/campo); 'filled'/'any' incluyen a quien tenga al
        // menos una respuesta que pase fechas y campo=valor.
        if (!c.formId || !UUID_RE.test(c.formId)) break
        if (c.status === 'not_filled') {
          res.exclude.push(await pagedIds(
            q => q.eq('form_id', c.formId), 'form_responses', 'member_id', 'member_id', scopeIds,
          ))
          break
        }
        const byField = Boolean(c.field && c.fieldVal)
        res.include.push(await pagedIds(q => {
          q = q.eq('form_id', c.formId)
          // Comparación de fechas con la misma semántica que el cliente
          // (submitted_at >= from; to inclusivo hasta el fin del día).
          if (c.from) q = q.gte('submitted_at', c.from)
          if (c.to) q = q.lte('submitted_at', `${c.to}T23:59:59.999Z`)
          if (byField) {
            // Coincidencia completa case-insensitive con comodín '*' (como el
            // cliente). Solo aplica a respuestas de texto (value_text); las
            // compuestas (checkbox/escala) viven en value_json y no se filtran.
            const pattern = c.fieldVal.replace(/([%_\\])/g, '\\$1').replace(/\*/g, '%')
            q = q.eq('vals.field_id', c.field).ilike('vals.value_text', pattern)
          }
          return q
        }, 'form_responses', byField
          ? 'member_id, vals:form_response_values!inner(field_id, value_text)'
          : 'member_id', 'member_id', scopeIds))
        break
      }
    }
    if (res.isActiveOverride !== undefined) isActiveOverride = res.isActiveOverride
    perCondition.push({ id: c.id, include: res.include, exclude: res.exclude })
  }
  void supabase
  return { perCondition, isActiveOverride }
}

/** Trae miembros enriquecidos por ids en chunks (evita URLs gigantes en .in). */
export async function getMembersByIds(allIds: string[], chunk = 100): Promise<DbMemberEnriched[]> {
  const out: DbMemberEnriched[] = []
  for (let i = 0; i < allIds.length; i += chunk) {
    const slice = allIds.slice(i, i + chunk)
    const { members } = await getMembers({ ids: slice, any_active: true, pageSize: slice.length })
    out.push(...members)
  }
  return out
}

/** Solo los IDs (y total) que coinciden con los filtros, sin paginar. Liviano:
 *  select('id'). Sirve para guardar listas / acciones sobre "todos los resultados". */
export async function getMemberIds(filters: MemberFilters = {}): Promise<{ ids: string[]; total: number }> {
  const supabase = createAdminClient()
  const { search, is_donor, is_server, active_attendance, conditions, groups, topLevelOps, province, gender, ids: explicitIds } = filters
  let { is_active = true } = filters

  // Filtros avanzados → sets por condición; la combinación AND/OR va al final
  // con evaluateUnits (FIL-3). Si un 'status' está dentro de un grupo OR, el
  // escaneo base no puede filtrar por is_active (la unión necesita el universo
  // completo): esa condición se resuelve como set y acá se relaja el eq.
  const orGroupedIds = new Set((groups ?? []).filter(g => g.op === 'OR').flatMap(g => g.members))
  const statusInOrGroup = !!conditions?.some(c => c.type === 'status' && orGroupedIds.has(c.id))

  // GRU-2 · Cuando la pregunta es "¿esta persona cumple?" (una, o un puñado), el
  // universo YA está acotado: en vez de resolver cada condición sobre las ~18 mil
  // fichas y después intersectar, se resuelve directo sobre esos ids. Mismo
  // código, mismo resultado, una consulta indexada. El tope existe porque el
  // alcance viaja en la URL de PostgREST.
  const scopeIds = explicitIds && explicitIds.length > 0 && explicitIds.length <= 100
    ? explicitIds
    : undefined

  let resolution: Awaited<ReturnType<typeof resolveAdvancedConditions>> | null = null
  if (conditions?.length) {
    resolution = await resolveAdvancedConditions(conditions, orGroupedIds, scopeIds)
    if (resolution.isActiveOverride !== undefined) is_active = resolution.isActiveOverride
  }

  // Sets que se intersectan EN MEMORIA tras el escaneo de ids — nunca como un
  // .in('id', [...]) en la query (un array de cientos/miles revienta la URL).
  const intersectSets: Array<Set<string>> = []
  if (active_attendance) {
    const aids = await getActiveAttendanceMemberIds(
      active_attendance === 'estudios' ? ATTENDANCE_MIN_CHARLAS_INTERMEDIA : undefined)
    if (aids.length === 0) return { ids: [], total: 0 }
    intersectSets.push(new Set(aids))
  }
  if (explicitIds) {
    if (explicitIds.length === 0) return { ids: [], total: 0 }
    intersectSets.push(new Set(explicitIds))
  }

  // PostgREST corta cada respuesta en ~1000 filas (db-max-rows), así que un
  // range gigante trunca silenciosamente: paginamos hasta agotar, con orden
  // estable para que las páginas no se solapen. El Set dedup ids repetidos
  // por el inner join con volunteers.
  const pageSize = 1000
  const ids = new Set<string>()
  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from('members')
      .select(is_server ? 'id, volunteers!inner(status)' : 'id')
      .order('id')
      .range(from, from + pageSize - 1)
    if (scopeIds) query = query.in('id', scopeIds)
    // any_active: no filtrar por estado (la restricción de un grupo se evalúa
    // sobre la persona, no sobre si su ficha está activa).
    if (!statusInOrGroup && !filters.any_active) query = query.eq('is_active', is_active)

    if (search) {
      query = applyMemberSearch(query, search)
    }
    if (is_donor !== undefined) query = query.eq('is_donor', is_donor)
    if (is_server) query = query.eq('volunteers.status', 'active')
    if (province) query = query.eq('province', province)
    if (gender) query = query.eq('gender', gender)

    const { data, error } = await query
    if (error) throw error
    const rows = (data ?? []) as unknown as Array<{ id: string }>
    rows.forEach((r) => ids.add(r.id))
    if (rows.length < pageSize) break
  }

  let finalIds = Array.from(ids)
  for (const set of intersectSets) finalIds = finalIds.filter(id => set.has(id))
  if (resolution && conditions?.length) {
    // FIL-3: misma semántica de unidades que la UI (grupos AND/OR + operador
    // top-level). Una condición sin resolución conocida no filtra (pasa).
    const rcMap = new Map(resolution.perCondition.map(rc => [rc.id, rc]))
    const passes = (id: string, condId: number) => {
      const rc = rcMap.get(condId)
      if (!rc) return true
      return rc.include.every(s => s.has(id)) && rc.exclude.every(s => !s.has(id))
    }
    finalIds = evaluateUnits(finalIds, conditions, groups ?? [], topLevelOps ?? {}, passes)
  }
  return { ids: finalIds, total: finalIds.length }
}

export type UserAccessRow = {
  id: string
  member_id: string
  member_name: string
  member_email: string
  member_initials: string
  roles: string[]
  /** origen ('manual'|'automatico') de cada rol activo — para la UI de /accesos. */
  role_origins: Record<string, 'manual' | 'automatico'>
  /** Cantidad de puestos activos que respaldan cada rol automático (solo
   *  presente para roles con origen 'automatico'). */
  role_position_counts: Record<string, number>
  granted_by: string
  granted_at: string
  last_login: string | null
  is_active: boolean
}

/** Miembros que tienen al menos un rol asignado en member_roles (gestión de accesos). */
export async function getUserAccess(): Promise<UserAccessRow[]> {
  const supabase = createAdminClient()

  type RoleRow = {
    member_id: string
    role: string
    is_active: boolean
    origen: string
    granted_at: string | null
    member: { first_name: string | null; last_name: string | null; email: string | null } | null
  }

  // PostgREST corta en 1000 filas. member_roles ya pasa de eso, así que sin
  // paginar la pantalla de Accesos perdía en silencio los otorgamientos más
  // viejos: 205 personas con rol activo no aparecían del todo y a otras se les
  // caía alguno. Se pagina hasta agotar; el orden por granted_at se mantiene
  // dentro de cada página y no importa, porque después se agrupa por miembro.
  const rows: RoleRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('member_roles')
      .select('member_id, role, is_active, origen, granted_at, member:members!member_roles_member_id_fkey(first_name, last_name, email)')
      .order('granted_at', { ascending: false })
      // Desempate estable por id: sin él, dos filas con el mismo granted_at
      // (los otorgamientos masivos comparten timestamp) pueden repetirse en una
      // página y faltar en otra.
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (error) throw error
    const page = (data ?? []) as unknown as RoleRow[]
    rows.push(...page)
    if (page.length < 1000) break
  }

  const { data: grantsData } = await supabase
    .from('member_role_position_grants').select('member_id, role')

  // Cantidad de puestos que respaldan cada (member_id, role).
  const grantCounts = new Map<string, number>()
  for (const g of (grantsData ?? []) as Array<{ member_id: string; role: string }>) {
    const key = `${g.member_id}|${g.role}`
    grantCounts.set(key, (grantCounts.get(key) ?? 0) + 1)
  }

  const byMember = new Map<string, UserAccessRow>()
  for (const r of rows) {
    if (!r.member_id) continue
    const name = `${r.member?.first_name ?? ''} ${r.member?.last_name ?? ''}`.trim() || (r.member?.email ?? '')
    const initials = getInitials(name)
    let entry = byMember.get(r.member_id)
    if (!entry) {
      entry = {
        id: r.member_id,
        member_id: r.member_id,
        member_name: name,
        member_email: r.member?.email ?? '',
        member_initials: initials,
        roles: [],
        role_origins: {},
        role_position_counts: {},
        granted_by: 'Sistema',
        granted_at: r.granted_at ?? new Date().toISOString(),
        last_login: null,
        is_active: false,
      }
      byMember.set(r.member_id, entry)
    }
    if (r.is_active && !entry.roles.includes(r.role)) {
      entry.roles.push(r.role)
      entry.role_origins[r.role] = r.origen === 'automatico' ? 'automatico' : 'manual'
      const count = grantCounts.get(`${r.member_id}|${r.role}`) ?? 0
      if (count > 0) entry.role_position_counts[r.role] = count
    }
    if (r.is_active) entry.is_active = true
  }
  // Solo miembros con al menos un rol activo.
  return Array.from(byMember.values()).filter(u => u.roles.length > 0)
}

/** Asigna (o reactiva) un rol a un miembro en member_roles. Siempre queda como
 *  origen 'manual' — es la vía explícita de /accesos; si el rol venía de un
 *  puesto (automático), esta acción lo "adopta" como manual para que no se
 *  retire solo si luego se libera el puesto que lo respaldaba. */
export async function assignMemberRole(memberId: string, role: string): Promise<void> {
  const supabase = createAdminClient()
  const { data: existing } = await supabase
    .from('member_roles').select('id').eq('member_id', memberId).eq('role', role).maybeSingle()
  if (existing) {
    const { error } = await supabase.from('member_roles')
      .update({ is_active: true, revoked_at: null, origen: 'manual' }).eq('id', (existing as { id: string }).id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('member_roles')
      .insert({ member_id: memberId, role, is_active: true, origen: 'manual' })
    if (error) throw error
  }
}

/** Revoca un rol (is_active=false, conserva el historial). */
export async function revokeMemberRole(memberId: string, role: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.from('member_roles')
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq('member_id', memberId).eq('role', role)
  if (error) throw error
}

// ── Queries ────────────────────────────────────────────────

/** Lista paginada de miembros con datos relacionados ligeros para el list view.
 *  Incluye: sede, roles activos, flag is_server, estudio actual/completados, servicio activo. */
export async function getMembers(filters: MemberFilters = {}): Promise<{ members: DbMemberEnriched[]; total: number }> {
  // Con filtros avanzados o asistencia activa: resolver primero los ids
  // (server-side) y traer solo la página pedida por ids — así el conteo y la
  // paginación reflejan los filtros y nunca pasamos miles de uuids en un .in()
  // (URL gigante → "fetch failed"). El criterio de asistencia puede devolver
  // cientos/miles de ids, por eso también entra por acá.
  if (filters.conditions?.length || filters.active_attendance) {
    const { ids: allIds, total } = await getMemberIds(filters)
    const page = filters.page ?? 1
    const pageSize = filters.pageSize ?? 50
    const pageIds = allIds.slice((page - 1) * pageSize, page * pageSize)
    if (pageIds.length === 0) return { members: [], total }
    const members = await getMembersByIds(pageIds)
    return { members, total }
  }

  const supabase = createAdminClient()
  const {
    search,
    province,
    is_active = true,
    is_donor,
    is_server,
    gender,
    ids,
    page = 1,
    pageSize = 50,
  } = filters

  // ids explícitos: solo una página ya resuelta (p. ej. desde getMembersByIds,
  // chunks ≤100). active_attendance/conditions se resuelven y paginan arriba
  // (vía getMemberIds) para no pasar miles de ids en un .in() → URL gigante.
  let idFilter: string[] | null = null
  if (ids) {
    if (ids.length === 0) return { members: [], total: 0 }
    idFilter = ids
  }

  // is_server: inner join a volunteers activos (evita listas de ids enormes en la URL).
  const volunteersEmbed = is_server
    ? `volunteers!inner(status, start_date, service_positions(title, area:areas!service_positions_area_id_fkey(id, name)))`
    : `volunteers(status, start_date, service_positions(title, area:areas!service_positions_area_id_fkey(id, name)))`

  let query = supabase
    .from('members')
    .select(
      `
      *,
      sede:sedes(code, name),
      member_roles!member_roles_member_id_fkey(role, is_active, status_detail),
      ${volunteersEmbed},
      study_enrollments!study_enrollments_member_id_fkey(
        status,
        study_groups!study_enrollments_group_id_fkey(plan:study_plans(name))
      ),
      study_leaders(member_id),
      event_checkins(checked_in_at)
    `,
      { count: 'exact' },
    )
    .order('last_name', { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (!filters.any_active) query = query.eq('is_active', is_active)

  if (is_server) query = query.eq('volunteers.status', 'active')

  if (search) {
    query = applyMemberSearch(query, search)
  }
  if (province) query = query.eq('province', province)
  if (is_donor !== undefined) query = query.eq('is_donor', is_donor)
  if (gender) query = query.eq('gender', gender)
  if (idFilter) query = query.in('id', idFilter)

  const { data, error, count } = await query

  if (error) throw error

  // Área padre del comité de servicio: resuelta vía mapa (el embed parent del
  // self-FK no es fiable en PostgREST).
  const areaMap = await getAreaNameMap(supabase)

  // ─── Aplanar las relaciones a un shape simple ───
  // Supabase devuelve arrays para todas las relaciones. Las agrupamos / pickeamos acá.
  const enriched: DbMemberEnriched[] = (data ?? []).map((row: Record<string, unknown>) => {
    const memberRoles = (row.member_roles as Array<{
      role: MemberRole
      is_active: boolean
      status_detail: 'activo' | 'en_descanso' | 'disponible' | null
    }> | null) ?? []
    const volunteers = (row.volunteers as Array<{
      status: string
      start_date: string | null
      service_positions: {
        title: string
        area: { id: string; name: string } | null
      } | null
    }> | null) ?? []
    const enrollments = (row.study_enrollments as Array<{
      status: string
      study_groups: { plan: { name: string } | null } | null
    }> | null) ?? []

    const activeRoles = memberRoles.filter(r => r.is_active).map(r => r.role)
    const activeDirigente = memberRoles.find(r => r.is_active && r.role === 'dirigente')
    const estadoDirigente = activeDirigente?.status_detail ?? null
    const activeVolunteer = volunteers.find(v => v.status === 'active') ?? null

    const completedStudies = enrollments
      .filter(e => e.status === 'completed' && e.study_groups?.plan?.name)
      .map(e => e.study_groups!.plan!.name)

    const currentStudy = enrollments
      .find(e => e.status === 'enrolled' && e.study_groups?.plan?.name)
      ?.study_groups?.plan?.name ?? null

    const sede = (row.sede as { code: string; name: string } | null) ?? null
    const sedeCase = (row.sede_case as 'activo' | 'inactivo' | null) ?? null
    const sedeLastCheckin = (row.sede_last_checkin as string | null) ?? null

    // Meses (YYYY-MM) con al menos una asistencia — para el filtro "Activo (asistencia)".
    const checkins = (row.event_checkins as Array<{ checked_in_at: string | null }> | null) ?? []
    const attendanceMonths = Array.from(new Set(
      checkins.map(c => (c.checked_in_at ?? '').slice(0, 7)).filter(Boolean),
    ))

    // Dirigente = tiene registro en study_leaders (activo o inactivo) o está
    // activo en el comité Dirigentes. Join, no consulta por fila.
    const hasLeaderRecord = ((row.study_leaders as unknown[] | null)?.length ?? 0) > 0
    const isDirigente = hasLeaderRecord
      || esComiteDirigentes(activeVolunteer?.service_positions?.area?.name)

    return {
      ...(row as DbMember),
      sede,
      sede_case: sedeCase,
      sede_last_checkin: sedeLastCheckin,
      roles: activeRoles,
      estado_dirigente: estadoDirigente,
      is_dirigente: isDirigente,
      is_server: volunteers.some(v => v.status === 'active'),
      current_study: currentStudy,
      completed_studies: completedStudies,
      attendance_months: attendanceMonths,
      active_service: activeVolunteer && activeVolunteer.service_positions
        ? {
            position: activeVolunteer.service_positions.title,
            committee: activeVolunteer.service_positions.area?.name ?? '',
            area: parentAreaName(areaMap, activeVolunteer.service_positions.area?.id)
              || activeVolunteer.service_positions.area?.name
              || '',
            from: activeVolunteer.start_date,
          }
        : null,
    }
  })

  return { members: enriched, total: count ?? 0 }
}

export async function getMemberById(id: string) {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as DbMember
}

// ── Detail view: extraído a ./members-detail (loadFamily + getMemberFullById +
// tipos de detalle). Re-exportado acá para no tocar a los consumidores. ──────
export { getMemberFullById } from '@/lib/supabase/queries/members-detail'
export type {
  DbAttendance, DbService, DbDonation, DbFormResponse, DbFamilyMember, DbMemberFull,
} from '@/lib/supabase/queries/members-detail'

// ── Mutaciones (alta/edición/baja, fusión de duplicados, familia): extraídas a
// ./members-mutations. Re-exportadas acá para no tocar a los consumidores. ─────
export {
  findMemberByCedulaOrEmail, mergeMembers, getDuplicatePairs, dismissDuplicatePair,
  createMember, createFamily, getMemberFamily, linkFamilyMember, unlinkFamilyMember,
  updateMember, deactivateMember,
  MEMBER_WRITE_FIELDS, normalizeEmail,
} from '@/lib/supabase/queries/members-mutations'
export type { DuplicateMember, DuplicatePair } from '@/lib/supabase/queries/members-mutations'

/** Buscador MÍNIMO de personas para elegir a alguien en una pantalla de gestión
 *  (check-in, becas, agregar a un grupo, dar acceso a un formulario). Nombre,
 *  cédula y correo de miembros ACTIVOS; nada más. No es el padrón: sin filtros,
 *  sin paginar y con tope duro. Lo autoriza GET /api/members/lookup. */
export async function searchMembersForLookup(
  search: string, limit = 8,
): Promise<Array<{ id: string; first_name: string; last_name: string; cedula: string | null; document_type: string | null; email: string | null }>> {
  const q = search.trim()
  if (q.length < 2) return []
  const supabase = createAdminClient()
  // search_text: nombre + apellidos + cédula + correo + teléfono, normalizado
  // (sin tildes). Tokeniza por espacios con AND, así "maria rodriguez"
  // (nombre + apellido juntos) SÍ encuentra — el .or() por columna separada
  // no podía (2026-08-19).
  const { data, error } = await applyMemberSearch(
    supabase
      .from('members')
      // document_type va incluido porque el documento dedupea por PAREJA
      // (tipo, número) — INT-1: sin el tipo, un pasaporte y una cédula con el
      // mismo número parecerían la misma persona.
      .select('id, first_name, last_name, cedula, document_type, email')
      .eq('is_active', true),
    q,
  )
    .order('first_name')
    .limit(Math.min(limit, 20))
  if (error) throw error
  return (data ?? []) as Array<{ id: string; first_name: string; last_name: string; cedula: string | null; document_type: string | null; email: string | null }>
}
