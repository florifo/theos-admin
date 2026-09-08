// Fuente de verdad de los permisos por rol (cliente via usePermissions y
// servidor via requireModuleView). Antes vivía en src/data/mock-auth.ts.
import type { RoleId, Permission, Role, UserAccess, AccessHistoryEntry } from '@/types/auth'
export type { RoleId, Permission, Role, UserAccess, AccessHistoryEntry }

/** Roles con acceso completo a estudios (gestión del plan, detalle de grupos,
 *  crear/editar tipos de estudio). 'dirigente' y 'miembro' quedan fuera: solo
 *  ven el currículo público. Reutilizar en guards de UI y de API. */
export const STUDY_ADMIN_ROLES: RoleId[] = [
  'coordinador_estudios', 'coordinador_dirigentes', 'direccion', 'admin',
]

/** Roles que pueden crear/editar/eliminar GRUPOS de estudio. Es STUDY_ADMIN más
 *  el rol acotado 'editor_grupos_estudio' (solo grupos, nada más de estudios).
 *  Reutilizar en los guards de UI y de API de grupos (crear/editar/eliminar). */
export const GROUP_ADMIN_ROLES: RoleId[] = [...STUDY_ADMIN_ROLES, 'editor_grupos_estudio']

/** Quién puede REGISTRAR A MANO un estudio en el expediente de alguien — el
 *  caso de quien lo llevó por fuera de Theos.
 *
 *  Es la lista más corta del módulo a propósito: un estudio registrado a mano
 *  cuenta como prerrequisito, así que quien puede escribirlo puede habilitar a
 *  cualquiera para cualquier estudio posterior. No es edición de perfil, es
 *  decidir la ruta de formación de una persona.
 *
 *  Antes lo permitían además editor_perfiles, encargado_staff y direccion; se
 *  acotó a admin + coordinador de estudios por decisión del 2026-08-24. */
export const EXTERNAL_STUDY_ROLES: RoleId[] = ['coordinador_estudios', 'admin']

/** DIR-5 · Quiénes entran a la cola de evaluaciones del dirigente.
 *
 *  Lista corta y a propósito: 'direccion' NO está, aunque sí esté en
 *  STUDY_ADMIN_ROLES. La retro de un dirigente es material sensible y quién la
 *  ve se decide explícito, no se hereda por ser el rol más alto de estudios.
 *  Tampoco 'coordinador_estudios': el dueño de este proceso es dirigentes. */
export const EVALUATION_ROLES: RoleId[] = ['evaluaciones', 'coordinador_dirigentes', 'admin']

/**
 * ¿Estos roles alcanzan SOLO la sección de grupos dentro de estudios?
 * El rol 'editor_grupos_estudio' tiene el módulo `estudios` con alcance 'all'
 * (lo necesita para ver el listado y el detalle de cualquier grupo), pero eso
 * NO lo habilita al resto del módulo: plan, bloques, dirigentes, análisis,
 * solicitudes y folletos son de STUDY_ADMIN_ROLES.
 *
 * Falso si además trae un rol que sí abre estudios completo (coordinadores,
 * dirección, admin) o 'solo_lectura' (que ve todo por el módulo 'all').
 * Fuente única para el sidebar, el ModuleGuard de las páginas y los guards de
 * API que hoy se apoyan en el permiso de módulo.
 */
export function isStudyGroupsOnly(roles: readonly RoleId[] | null | undefined): boolean {
  const list = roles ?? []
  if (!list.includes('editor_grupos_estudio')) return false
  return !list.some(r => STUDY_ADMIN_ROLES.includes(r) || r === 'solo_lectura')
}

/** Delegación acotada de permisos: el coordinador de estudios puede asignar/quitar
 *  SOLO estos tres roles a otras personas (poder de administración acotado). El
 *  resto de los permisos siguen siendo exclusivos de 'admin'. Fuente única para
 *  UI y validación server-side — no escalable a otros roles. */
export const COORDINADOR_ESTUDIOS_DELEGABLE: RoleId[] = [
  'editor_perfiles', 'editor_grupos_estudio', 'folletos', 'solicitudes_estudio',
]

/**
 * Quién ENTRA a la pantalla de accesos.
 *
 * Estaba escrita a mano en tres lugares —el sidebar, GET /api/accesos y el
 * POST/DELETE de roles— y son el mismo invariante: agregar un rol y olvidarse
 * de uno de los tres deja la pantalla visible sin datos, o los datos sin
 * pantalla. Acá se decide una sola vez.
 */
export const ACCESOS_SCREEN_ROLES: RoleId[] = ['admin', 'coordinador_estudios', 'gestor_accesos']

/** Qué roles puede asignar/quitar un actor según SUS roles:
 *   · 'all'  → admin: cualquiera.
 *   · Set    → gestor_accesos: todos MENOS 'admin'.
 *              coordinador_estudios: solo los delegados.
 *   · Set()  → nadie (sin permiso de gestión de accesos).
 *  La usan el endpoint de accesos (server) y la UI de accesos (para filtrar). */
export function assignableRoleIds(actorRoles: RoleId[]): 'all' | Set<RoleId> {
  if (actorRoles.includes('admin')) return 'all'
  // 'gestor_accesos' da y quita accesos, pero NO reparte 'admin': poder
  // otorgarse admin a uno mismo vuelve al rol indistinguible de admin, y
  // entonces no habría por qué tenerlo aparte. Es el único que se le niega.
  if (actorRoles.includes('gestor_accesos')) {
    return new Set(ROLES.map(r => r.id).filter(id => id !== 'admin'))
  }
  if (actorRoles.includes('coordinador_estudios')) return new Set(COORDINADOR_ESTUDIOS_DELEGABLE)
  return new Set<RoleId>()
}

/** Roles que administran servidores: comités, áreas, puestos y aplicaciones
 *  (mantenimiento CRUD, importación, asignación de responsables). Reutilizar en
 *  guards de UI (usePermissions/hasRole) y de API (requireRoles). */
export const SERVICE_ADMIN_ROLES: RoleId[] = [
  'encargado_staff', 'coordinador_servidores', 'direccion', 'admin',
]

/** "Coordinación de staff": roles que pueden IMPORTAR puestos/vacantes y solicitar
 *  puestos nuevos para cualquier comité. Subconjunto de SERVICE_ADMIN_ROLES que
 *  EXCLUYE 'direccion' a propósito (decisión 2026-06-25: la importación y la
 *  solicitud global son de staff, no de dirección). 'admin' pasa siempre aparte. */
export const STAFF_IMPORT_ROLES: RoleId[] = ['encargado_staff', 'coordinador_servidores']

/** Roles que NO son de gestión: el rol base 'miembro' (autoservicio de su propio
 *  perfil). Todo lo demás implica trabajar algo del sistema para otras personas.
 *  Se agregó para el centro de ayuda (visibilidad 'gestion'), que necesita
 *  distinguir "cualquier persona con sesión" de "cualquier persona que gestiona". */
/** El piso de permisos de cualquier persona con ficha. Ver `withBaseRole`. */
export const BASE_ROLE: RoleId = 'miembro'

export const SELF_SERVICE_ROLES: RoleId[] = [BASE_ROLE]

/** El rol MÍNIMO de cualquier persona con ficha: ver su propio perfil, el de su
 *  familia y el currículo (/estudios/plan). Nadie lo tiene escrito en
 *  member_roles —el alta de cuentas no asigna roles— así que la garantía no
 *  puede vivir en los datos: se aplica acá, al leer.
 *
 *  Por qué una función y no la expresión suelta: el default estaba copiado en
 *  getAuthContext() y en /api/auth/me, sin test. Dos copias de un invariante es
 *  tenerlo mal en una de las dos en cuanto alguien agregue un tercer lector.
 *  Este es el único lugar donde se decide, y `base-role.test.ts` lo fija.
 *
 *  Ojo con el caso que NO cubre, y es a propósito: una sesión de Auth sin ficha
 *  de miembro no recibe el rol base. Sin ficha no hay perfil propio que ver, y
 *  darle 'miembro' la dejaría entrar a una pantalla sin datos.
 *
 *  BUG 2026-08-29: esto solo aplicaba el rol base a quien NO tenía ninguno, así
 *  que un rol operativo que no declara el módulo `miembros` DEJABA a la persona
 *  sin su propio perfil. Le pegaba a 72 personas —71 encargados de eventos y un
 *  editor de grupos— y también a `folletos`, `reportes`, `revision_pagos`,
 *  `becas`, `forms` y `evaluaciones`. Un rol se AGREGA a lo que sos, no te
 *  reemplaza: el piso ahora es de todos, tengan lo que tengan encima.
 *
 *  Los dos lectores que podrían confundirse ya no lo hacen: hasManagementRole
 *  excluye 'miembro' (SELF_SERVICE_ROLES) y landsOnProfile exige que TODOS los
 *  roles sean de perfil, así que un admin sigue cayendo en su dashboard. */
export function withBaseRole(roles: readonly RoleId[] | null | undefined): RoleId[] {
  const explicitos = (roles ?? []).filter(Boolean)
  if (explicitos.includes(BASE_ROLE)) return [...explicitos]
  return [...explicitos, BASE_ROLE]
}

/** ¿Alguno de estos roles es de gestión (algo más que el autoservicio)? */
export function hasManagementRole(roleIds: readonly RoleId[] | null | undefined): boolean {
  return (roleIds ?? []).some(r => !SELF_SERVICE_ROLES.includes(r))
}

/** Roles que operan el check-in y los reportes de eventos (ver detalle, hacer
 *  check-in, exportar). Reutilizar en guards de UI (usePermissions/hasRole) y de
 *  API (requireRoles) de eventos/check-in/reportes. */
export const EVENT_CHECKIN_ROLES: RoleId[] = ['encargado_eventos', 'direccion', 'admin']

/** Quién puede CREAR y EDITAR eventos (y sus tipos y flyers).
 *
 *  Estaba escrito a mano en cinco rutas como
 *  requireRoles('direccion','encargado_staff','comunicaciones'), y por eso el
 *  2026-08-26 casi quedó un callejón sin salida: al darle `create` a
 *  'encargado_eventos' la pantalla le mostraba los botones y la API los
 *  rechazaba con 403. Centralizado acá para que el permiso y el guard no puedan
 *  volver a discrepar.
 *
 *  'admin' no va en la lista: requireRoles ya lo trata aparte. */
export const EVENT_WRITE_ROLES: RoleId[] = [
  'encargado_eventos', 'direccion', 'encargado_staff', 'comunicaciones',
]

/** Quién puede BORRAR un evento. Es MÁS corto que EVENT_WRITE_ROLES a propósito.
 *
 *  Se separó el 2026-08-26 después de un error propio: la lista escrita a mano
 *  que se centralizó era la de DELETE, no la de editar (editar usa
 *  requireEventAccess, y cancelar es solo direccion). Al unificarlas le quedó
 *  permiso de borrar a 'encargado_eventos', que no era la intención — el propio
 *  PUT lo dice en un comentario: "Borrarlo y cancelarlo NO".
 *
 *  Cancelar un evento conserva el historial; borrarlo no. Por eso son listas
 *  distintas y no una sola. */
export const EVENT_DELETE_ROLES: RoleId[] = [
  'direccion', 'encargado_staff', 'comunicaciones',
]

/**
 * Alcance efectivo de un módulo para un set de roles (espejo server-side de
 * getScope() del cliente): el más amplio gana. null = sin el módulo.
 * SEC-1: lo usan endpoints que deben acotar el payload por alcance
 * (p. ej. lider_comite ve solo SUS comités en /api/servers/committees).
 */
export function moduleScope(roleIds: RoleId[], module: string): 'all' | 'committee' | 'own' | null {
  const scopes = roleIds.flatMap(roleId => {
    const role = ROLES.find(r => r.id === roleId)
    if (!role) return []
    return role.permissions
      .filter(p => p.module === module || p.module === 'all')
      .map(p => p.scope ?? 'all')
  })
  if (scopes.includes('all')) return 'all'
  if (scopes.includes('committee')) return 'committee'
  if (scopes.includes('own')) return 'own'
  return null
}

/**
 * ¿Alguno de los roles otorga `action` sobre alguno de los `modules`?
 * Lógica pura compartida por el guard server-side (requireModuleView) y
 * testeable sin Supabase. `modules` acepta uno o varios (semántica any-of:
 * REV-3 usa ['finanzas','revision_pagos'] para la página unificada de pagos).
 * `beyondOwn` excluye permisos con scope 'own' (espejo del guard).
 */
export function hasModulePermission(
  roleIds: RoleId[],
  modules: string | string[],
  action: string = 'view',
  opts: { beyondOwn?: boolean } = {},
): boolean {
  const wanted = Array.isArray(modules) ? modules : [modules]
  return roleIds.some(roleId => {
    const role = ROLES.find(r => r.id === roleId)
    return role?.permissions.some(p =>
      (p.module === 'all' || wanted.includes(p.module))
      && p.actions.includes(action as never)
      && (!opts.beyondOwn || p.scope !== 'own'))
  })
}

// Orden de menor a mayor privilegio
export const ROLES: Role[] = [
  {
    id: 'miembro',
    name: 'Miembro',
    description: 'Solo su perfil, sus grupos y su familia',
    color: '#9CA0B4',
    permissions: [
      { module: 'miembros', actions: ['view'], scope: 'own' },
      { module: 'estudios', actions: ['view'], scope: 'own' },
    ],
  },
  {
    id: 'solo_lectura',
    name: 'Solo lectura',
    description: 'Ver todo el sistema, sin editar nada',
    color: '#C9CCD9',
    permissions: [
      { module: 'all', actions: ['view'], scope: 'all' },
    ],
  },
  {
    id: 'reportes',
    name: 'Reportes',
    description: 'Acceso a todos los reportes del sistema',
    color: '#7FB2D4',
    permissions: [
      { module: 'reportes', actions: ['view', 'export'], scope: 'all' },
    ],
  },
  {
    id: 'gestor_accesos',
    name: 'Gestor de accesos',
    description: 'Dar y quitar accesos, y cambiar el correo con el que una persona entra',
    color: '#8E7CC3',
    // Sin permisos de MÓDULO a propósito: lo que habilita no son pantallas de
    // datos sino dos capacidades sobre las cuentas —repartir roles
    // (assignableRoleIds, todo menos 'admin') y cambiar el correo de acceso
    // (access-email.ts)—, cada una con su regla y sus tests.
    permissions: [],
  },
  {
    id: 'folletos',
    name: 'Folletos',
    description: 'Gestión y seguimiento de folletos de estudios',
    color: '#7FB2D4',
    permissions: [
      { module: 'folletos', actions: ['view', 'edit'], scope: 'all' },
      { module: 'revision_pagos', actions: ['view', 'edit'], scope: 'all' },
    ],
  },
  {
    id: 'revision_pagos',
    name: 'Revisión de pagos',
    description: 'Revisar y aprobar/rechazar pagos por comprobante',
    color: '#3DB97A',
    permissions: [
      { module: 'revision_pagos', actions: ['view', 'edit'], scope: 'all' },
    ],
  },
  {
    id: 'becas',
    name: 'Becas',
    description: 'Gestión de becas y cupones de descuento',
    color: '#3DB97A',
    permissions: [
      { module: 'becas', actions: ['view', 'edit'], scope: 'all' },
    ],
  },
  {
    id: 'editor_perfiles',
    name: 'Editor de Perfiles',
    description: 'Crear y editar perfiles de miembros',
    color: '#E9B949',
    permissions: [
      { module: 'miembros', actions: ['view', 'create', 'edit'], scope: 'all' },
    ],
  },
  {
    id: 'solicitudes_estudio',
    name: 'Solicitudes de estudio',
    description: 'Atender las solicitudes de estudio que le asignen',
    color: '#7FB2D4',
    // Ve la sección de estudios SOLO para llegar a su cola. Lo que puede hacer
    // con cada solicitud lo decide requestQueueScope: alcance 'assigned', o sea
    // únicamente las que le asignaron. Asignar y repartir sigue siendo de los
    // coordinadores — el comité recibe trabajo, no lo distribuye.
    permissions: [
      { module: 'estudios', actions: ['view'], scope: 'own' },
    ],
  },
  {
    id: 'editor_grupos_estudio',
    name: 'Editor de Grupos de Estudio',
    description: 'Ver, crear, editar y eliminar grupos de estudio',
    color: '#3B7579',
    // Solo 'view' a nivel módulo (para ver la sección/detalle de grupos). El
    // crear/editar/eliminar se autoriza por rol explícito (GROUP_ADMIN_ROLES) en
    // los endpoints de grupos, así el poder queda acotado a grupos y no se
    // extiende al plan ni a los tipos de estudio.
    permissions: [
      { module: 'estudios', actions: ['view'], scope: 'all' },
    ],
  },
  {
    id: 'forms',
    name: 'Formularios',
    description: 'Todos los formularios y sus respuestas (ver, crear, editar, exportar)',
    color: '#9B7FD4',
    // El módulo completo, sin 'delete': borrar un formulario (con sus respuestas
    // detrás) sigue siendo de comunicaciones/staff/dirección/admin.
    permissions: [
      { module: 'formularios', actions: ['view', 'create', 'edit', 'export'], scope: 'all' },
    ],
  },
  {
    id: 'evaluaciones',
    name: 'Evaluaciones de dirigentes',
    description: 'Revisar el compilado de las evaluaciones y compartirlo con el dirigente',
    color: '#7FA8D4',
    // Rol acotado: solo la cola de evaluaciones. No abre el resto de estudios.
    permissions: [
      { module: 'evaluaciones', actions: ['view', 'edit'], scope: 'all' },
    ],
  },
  {
    id: 'comunicaciones',
    name: 'Comunicaciones',
    description: 'Envío de mensajes y ver miembros',
    color: '#F78382',
    permissions: [
      { module: 'comunicaciones', actions: ['view', 'create', 'edit'], scope: 'all' },
      { module: 'miembros',       actions: ['view'],                   scope: 'all' },
      // 2026-08-04: ya podía crear/editar formularios por rol explícito en
      // /api/forms pero no veía el listado ni las respuestas. Se alinea.
      { module: 'formularios',    actions: ['view', 'create', 'edit', 'export'], scope: 'all' },
    ],
  },
  {
    id: 'lider_comite',
    name: 'Líder de Comité',
    description: 'Su comité y sus miembros',
    color: '#C43635',
    permissions: [
      { module: 'servidores', actions: ['view', 'edit'], scope: 'committee' },
      { module: 'miembros',   actions: ['view'],         scope: 'committee' },
    ],
  },
  {
    id: 'dirigente',
    name: 'Dirigente',
    description: 'Sus grupos actuales e históricos + detalle de sus estudiantes',
    color: '#9B7FD4',
    permissions: [
      { module: 'estudios', actions: ['view', 'edit'], scope: 'own' },
      { module: 'miembros', actions: ['view'],         scope: 'own' },
    ],
  },
  {
    id: 'coordinador_dirigentes',
    name: 'Coordinador de Dirigentes',
    description: 'Dirigentes y grupos, sin crear tipos de estudio',
    color: '#B5DDE0',
    permissions: [
      { module: 'estudios', actions: ['view', 'edit'], scope: 'all' },
      { module: 'miembros', actions: ['view'],         scope: 'all' },
      { module: 'reportes', actions: ['view', 'export'], scope: 'all' },
      { module: 'revision_pagos', actions: ['view', 'edit'], scope: 'all' },
    ],
  },
  {
    id: 'coordinador_estudios',
    name: 'Coordinador de Estudios',
    description: 'Estudios, dirigentes y grupos',
    color: '#3B7579',
    permissions: [
      { module: 'estudios', actions: ['view', 'create', 'edit', 'export'], scope: 'all' },
      { module: 'miembros', actions: ['view'],                             scope: 'all' },
      { module: 'reportes', actions: ['view', 'export'],                   scope: 'all' },
      { module: 'revision_pagos', actions: ['view', 'edit'],               scope: 'all' },
    ],
  },
  {
    id: 'encargado_staff',
    name: 'Encargado de Staff',
    description: 'Servidores, vacantes y empleados',
    color: '#70BDC2',
    permissions: [
      { module: 'servidores', actions: ['view', 'create', 'edit', 'export'], scope: 'all' },
      { module: 'empleados',  actions: ['view', 'create', 'edit'],           scope: 'all' },
      { module: 'miembros',   actions: ['view'],                             scope: 'all' },
      // 2026-08-04: mismo desalineamiento que comunicaciones (ver arriba).
      { module: 'formularios', actions: ['view', 'create', 'edit', 'export'], scope: 'all' },
    ],
  },
  {
    id: 'coordinador_servidores',
    name: 'Coordinador de Servidores',
    description: 'Comités, áreas, puestos y aplicaciones de servicio',
    color: '#7FB2D4',
    permissions: [
      { module: 'servidores', actions: ['view', 'create', 'edit'], scope: 'all' },
      { module: 'miembros',   actions: ['view'],                   scope: 'all' },
      { module: 'reportes',   actions: ['view', 'export'],         scope: 'all' },
    ],
  },
  {
    id: 'encargado_eventos',
    name: 'Encargado de Eventos',
    description: 'Gestión completa de eventos: crear, editar, inscripciones, check-in y reportes',
    color: '#E0823D',
    permissions: [
      // 2026-08-26: se agregó 'create'. Antes tenía view/edit/export, y los tabs
      // de gestión (Inscripciones, Servidores, Comunicaciones) cuelgan de
      // 'create' — así que la persona a cargo de los eventos veía solo
      // Información, Check-in y Reportes. Los DATOS ya le llegaban del API
      // (canSeeEventManagementData es true con edit u export): lo único oculto
      // eran los tabs. Con 'create' también puede crear y editar eventos, que es
      // lo que corresponde al rol (decisión del usuario).
      { module: 'eventos', actions: ['view', 'create', 'edit', 'export'], scope: 'all' },
    ],
  },
  {
    id: 'finanzas',
    name: 'Finanzas',
    description: 'Módulo de finanzas + ver perfiles sin montos',
    color: '#3DB97A',
    permissions: [
      { module: 'finanzas', actions: ['view', 'create', 'edit', 'export'], scope: 'all' },
      { module: 'miembros', actions: ['view'],                             scope: 'all' },
      { module: 'revision_pagos', actions: ['view', 'edit'],               scope: 'all' },
      { module: 'becas', actions: ['view', 'edit'],                        scope: 'all' },
    ],
  },
  {
    id: 'direccion',
    name: 'Dirección',
    description: 'Todo el sistema excepto configuración técnica',
    color: '#29365C',
    permissions: [
      // Todos los módulos del sistema, todas las acciones EXCEPTO delete.
      // Excluido a propósito: 'accesos' (solo admin — el mapa de privilegios no se
      // expone a dirección, decisión 2026-06-11). 'delete' queda solo para admin.
      { module: 'miembros',       actions: ['view', 'create', 'edit', 'export'], scope: 'all' },
      { module: 'estudios',       actions: ['view', 'create', 'edit', 'export'], scope: 'all' },
      { module: 'eventos',        actions: ['view', 'create', 'edit', 'export'], scope: 'all' },
      { module: 'servidores',     actions: ['view', 'create', 'edit', 'export'], scope: 'all' },
      { module: 'empleados',      actions: ['view', 'create', 'edit', 'export'], scope: 'all' },
      { module: 'finanzas',       actions: ['view', 'create', 'edit', 'export'], scope: 'all' },
      { module: 'comunicaciones', actions: ['view', 'create', 'edit', 'export'], scope: 'all' },
      { module: 'formularios',    actions: ['view', 'create', 'edit', 'export'], scope: 'all' },
      { module: 'reportes',       actions: ['view', 'export'],                   scope: 'all' },
      { module: 'revision_pagos', actions: ['view', 'edit'],                     scope: 'all' },
    ],
  },
  {
    id: 'admin',
    name: 'Administrador',
    description: 'Acceso completo a todo el sistema',
    color: '#161440',
    permissions: [{ module: 'all', actions: ['view', 'create', 'edit', 'delete', 'export'], scope: 'all' }],
  },
]
