'use client'

import { usePathname } from 'next/navigation'
import { AccessDenied } from '@/components/shared/AccessDenied'
import { useAuth } from '@/lib/auth/auth-context'
import { AppShell } from '@/components/layout/AppShell'
import { usePermissions } from '@/hooks/usePermissions'
import { canSeeSummaryRoute } from '@/lib/auth/module-summary'
import { isStudyGroupsOnly, EVALUATION_ROLES } from '@/lib/auth/roles'
import { studyGroupsOnlyAllows } from '@/lib/auth/studies-scope'
import { SELECTION_REVIEW_ROLES } from '@/lib/forms/selection-rules'

const pageTitles: Record<string, string> = {
  '/dashboard':      'Dashboard',
  '/miembros':       'Miembros',
  '/eventos':        'Eventos',
  '/estudios':       'Estudios',
  '/servidores':     'Servidores',
  '/dirigentes':     'Dirigentes',
  '/empleados':      'Empleados',
  '/finanzas':       'Finanzas',
  '/finanzas/becas': 'Becas',
  '/comunicaciones': 'Comunicaciones',
  '/formularios':    'Formularios',
  '/reportes':       'Reportes',
  '/matricula':      'Matrícula',
  '/notificaciones': 'Notificaciones',
  '/accesos':        'Accesos',
  '/configuracion':  'Configuración',
  // REV-3: /pagos/revision ahora redirige a /finanzas/pagos (página unificada).
  '/finanzas/pagos': 'Pagos',
  '/mis-pagos':      'Pagos pendientes',
}

function getTitle(pathname: string): string {
  const match = Object.keys(pageTitles)
    .sort((a, b) => b.length - a.length)
    .find(key => pathname === key || pathname.startsWith(key + '/'))
  return match ? pageTitles[match] : 'Admin'
}

// Módulo de permisos por prefijo de ruta — acceso por URL directa incluido.
// (Las rutas API son el enforcement real; esto evita pantallas vacías/rotas.)
const MODULE_BY_PREFIX: Record<string, string> = {
  '/miembros':       'miembros',
  '/matricula':      'estudios',
  '/eventos':        'eventos',
  '/estudios':       'estudios',
  '/servidores':     'servidores',
  '/empleados':      'empleados',
  '/finanzas':       'finanzas',
  '/comunicaciones': 'comunicaciones',
  '/formularios':    'formularios',
  '/reportes':       'reportes',
  '/accesos':        'accesos',
}

/** Bloquea el contenido del módulo si el rol no tiene 'view' sobre él. */
function ModuleGuard({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const { user, loaded } = useAuth()
  const { can, getScope } = usePermissions()
  const prefix = Object.keys(MODULE_BY_PREFIX)
    .sort((a, b) => b.length - a.length)
    .find(p => pathname === p || pathname.startsWith(p + '/'))
  if (!prefix) return <>{children}</>
  // Hasta que carguen los roles no se decide (evita denegar en falso).
  if (!loaded || !user) return <>{children}</>
  // Excepción (2026-08-06): /estudios/plan es el CURRÍCULO — qué estudios hay,
  // en qué orden y qué pide cada etapa. Es información para cualquiera que vaya
  // a matricularse, no gestión. La decisión venía del 2026-07-29 pero solo se
  // había aplicado al sidebar del dirigente: la página seguía cerrada.
  // El DETALLE (/estudios/plan/[id]) es el editor y sigue exigiendo el módulo.
  // /matricula es el AUTOSERVICIO de la persona: es donde se inscribe a sí
  // misma. Tiene que estar abierta a cualquier sesión, no al módulo de estudios.
  //
  // El bug que arregla (2026-08-25): mapeaba al módulo 'estudios', así que 12 de
  // los 21 roles la tenían cerrada — finanzas, comunicaciones, encargado_staff,
  // lider_comite, forms y demás. 88 personas reales no podían matricularse en un
  // estudio por tener un rol de staff que no es de estudios, siendo que también
  // son miembros. El rol base 'miembro' sí pasaba, y por eso no se notó antes:
  // solo fallaba para quien tiene un rol explícito.
  //
  // Las APIs ya estaban bien (requireRoles() sin roles = solo sesión), así que
  // esto era puramente el guard de la pantalla.
  if (pathname === '/matricula' || pathname.startsWith('/matricula/')) return <>{children}</>
  if (pathname === '/estudios/plan') return <>{children}</>
  // Excepción: /estudios/grupos/[id]/evaluar es la encuesta del ESTUDIANTE
  // sobre su dirigente al cerrar el grupo — cualquier sesión entra; el endpoint
  // decide si esa persona puede responder ese grupo.
  if (/^\/estudios\/grupos\/[0-9a-f-]{36}\/evaluar$/i.test(pathname)) return <>{children}</>
  // Excepción: /estudios/folletos tiene su propio permiso (rol 'folletos' sin
  // módulo estudios) — espejo del sidebar, que muestra el ítem con ese permiso.
  if (pathname.startsWith('/estudios/folletos') && can('folletos', 'view')) return <>{children}</>
  // Excepción: /finanzas/becas tiene su propio permiso ('becas'), asignable sin
  // depender del módulo finanzas completo.
  if (pathname.startsWith('/finanzas/becas') && can('becas', 'view')) return <>{children}</>
  // Excepción (REV-3): /finanzas/pagos es la página unificada de pagos — los
  // roles de revisión (revision_pagos, folletos, coordinadores) la ven sin el
  // módulo finanzas completo. Espejo del guard de GET /api/finance/payments.
  if (pathname.startsWith('/finanzas/pagos') && can('revision_pagos', 'view')) return <>{children}</>
  // Excepción: /formularios/[id]/responder es el llenado de un formulario —
  // cualquier sesión autenticada (las convocatorias por correo apuntan ahí).
  // El módulo formularios (dirección/admin) sigue exigiéndose para el resto.
  if (/^\/formularios\/[0-9a-f-]{36}\/responder$/i.test(pathname)) return <>{children}</>
  // Excepción (2026-08-04): acceso puntual a UN formulario. Quien tenga grants
  // entra al listado (la API le devuelve solo los suyos) y a las respuestas de
  // esos formularios. Sin el módulo NO abre el editor ni ningún otro form.
  if ((user.granted_form_ids ?? []).length > 0) {
    if (pathname === '/formularios') return <>{children}</>
    const m = pathname.match(/^\/formularios\/([0-9a-f-]{36})\/respuestas$/i)
    if (m && (user.granted_form_ids ?? []).includes(m[1])) return <>{children}</>
  }
  // Excepción (EST-10): /formularios/[id]/seleccion es la revisión del comité de
  // una preinscripción — la ven los coordinadores de dirigentes/estudios sin el
  // módulo formularios. Espejo del gate de /api/forms/[id]/selection.
  if (/^\/formularios\/[0-9a-f-]{36}\/seleccion$/i.test(pathname)
      && (user.roles ?? []).some(r => (SELECTION_REVIEW_ROLES as readonly string[]).includes(r))) {
    return <>{children}</>
  }
  // Excepción: /eventos (raíz) es también la pantalla de auto-inscripción de
  // cualquier miembro (antes /mis-eventos aparte); la propia página decide qué
  // mostrar según el permiso. Las subrutas de gestión (/eventos/nuevo,
  // /eventos/[id]/editar, etc.) siguen exigiendo el módulo normalmente.
  if (pathname === '/eventos') return <>{children}</>
  // Excepción (FRM-1 B): quien tiene eventos A CARGO entra al detalle de ESOS
  // eventos —y a su check-in y edición— sin el módulo. El resto sigue cerrado.
  {
    const aCargo = user.managed_event_ids ?? []
    if (aCargo.length > 0) {
      const m = pathname.match(/^\/eventos\/([0-9a-f-]{36})(?:\/|$)/i)
      if (m && aCargo.includes(m[1])) return <>{children}</>
    }
  }
  // Excepción (2026-07-31): la FICHA de un evento muestra su información general
  // a cualquier sesión — la propia página deja solo el tab de Información a quien
  // no gestiona, y el API no le manda inscritos ni check-ins. Las subrutas de
  // gestión (/editar, /checkin) siguen exigiendo el módulo.
  if (/^\/eventos\/[0-9a-f-]{36}$/i.test(pathname)) return <>{children}</>
  // Excepción: /estudios/solicitudes también la abre el COMITÉ de estudios
  // bíblicos (sin rol): la pantalla y la API le muestran solo lo que le
  // asignaron. Espejo de requestQueueScope.
  if (pathname === '/estudios/solicitudes'
      && (user.in_study_committee || (user.roles ?? []).includes('solicitudes_estudio'))) {
    return <>{children}</>
  }
  // Excepción (DIR-5): la cola de evaluaciones se gatea por ROL, no por módulo.
  // El rol acotado 'evaluaciones' no tiene el módulo estudios y aun así entra;
  // 'direccion' sí lo tiene y NO entra. La propia página repite el chequeo.
  if (pathname === '/estudios/evaluaciones') {
    return (user.roles ?? []).some(r => (EVALUATION_ROLES as string[]).includes(r))
      ? <>{children}</>
      : <AccessDenied />
  }
  if (!can(MODULE_BY_PREFIX[prefix], 'view')) return <AccessDenied />
  // El rol acotado de grupos (editor_grupos_estudio) tiene el módulo estudios
  // con alcance 'all' pero SOLO para grupos: nada de resumen, plan, bloques,
  // dirigentes, análisis, solicitudes ni folletos. Espejo de los guards de API.
  if (prefix === '/estudios' && isStudyGroupsOnly(user.roles ?? [])
      && !studyGroupsOnlyAllows(pathname)) {
    return <AccessDenied />
  }
  // SEC-1: la RAÍZ de estudios/servidores es un resumen de toda la organización
  // — exige alcance 'all' (dirigente ve sus grupos; lider_comite, su comité).
  // La regla es por RUTA: /matricula mapea al módulo estudios pero es el
  // autoservicio del miembro, no un resumen.
  if (!canSeeSummaryRoute(pathname, getScope(MODULE_BY_PREFIX[prefix]))) return <AccessDenied />
  // SEC-1: estudios con alcance 'own' (can() no mira scope, así que dirigente
  // y miembro pasan el chequeo de arriba). Dirigente: solo la raíz, sus grupos
  // y el detalle/asistencia de un grupo (el API ya filtra a los suyos).
  // Miembro: el detalle de un grupo (vista read-only de SU grupo, gateada por
  // inscripción en el API). /estudios/plan (el CURRÍCULO) es abierto para
  // cualquier sesión — decisión 2026-07-29; el detalle/edición de un plan
  // sigue gateado en su propia página (STUDY_ADMIN).
  if (prefix === '/estudios' && getScope('estudios') === 'own') {
    // El dirigente también cierra SUS grupos (2026-08-20): /cierre entra acá;
    // el API del grupo y el del cierre validan que sea el dirigente de ESE grupo.
    const groupDetail = /^\/estudios\/grupos\/[0-9a-f-]{36}(\/asistencia|\/cierre)?$/i.test(pathname)
    const isDirigente = (user.roles ?? []).includes('dirigente')
    const isPlanCurriculum = pathname === '/estudios/plan'
    // (El resumen /estudios ya quedó bloqueado arriba: exige alcance 'all'.)
    const allowed = isPlanCurriculum || (isDirigente
      ? pathname === '/estudios/grupos' || groupDetail
      : /^\/estudios\/grupos\/[0-9a-f-]{36}$/i.test(pathname))
    if (!allowed) return <AccessDenied />
  }
  // SEC-1: el LISTADO del padrón exige alcance 'all' — lider_comite (scope
  // 'committee') ve a su gente en /servidores; el detalle de un perfil sí le
  // queda accesible por link directo (mismo criterio del API).
  if (pathname === '/miembros' && getScope('miembros') !== 'all') return <AccessDenied />
  // El padrón exige alcance más allá de 'own' (espejo del guard de la API);
  // el rol base 'miembro' ve su perfil o el de su familia desde ACÁ mismo
  // (/miembros/{id} de detalle), no el listado completo (/miembros).
  if (prefix === '/miembros' && getScope('miembros') === 'own') {
    // Detalle: propio o familia. Editar (/editar): SOLO la propia ficha
    // (self-service para completar cédula/datos), no la de familia.
    const m = pathname.match(/^\/miembros\/([0-9a-f-]{36})(\/editar)?$/i)
    const targetId = m?.[1]
    const isEdit = !!m?.[2]
    const allowedIds = [user.member_id, ...(user.family_member_ids ?? [])]
    const ok = !!targetId && (isEdit ? targetId === user.member_id : allowedIds.includes(targetId))
    if (!ok) return <AccessDenied />
  }
  return <>{children}</>
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // El cascarón (sidebar + topbar + providers) vive en AppShell, compartido con
  // /ayuda cuando hay sesión. Acá solo se agrega el gate de módulo.
  return (
    <AppShell title={getTitle(pathname)}>
      <ModuleGuard pathname={pathname}>
        {children}
      </ModuleGuard>
    </AppShell>
  )
}
