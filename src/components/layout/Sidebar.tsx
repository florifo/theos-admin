'use client'

import { useState, useEffect } from 'react'
import { ACCESOS_SCREEN_ROLES } from '@/lib/auth/roles'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  LayoutDashboard,
  Users,
  Calendar,
  BookOpen,
  UsersRound,
  Briefcase,
  DollarSign,
  MessageCircle,
  FileText,
  X,
  ChevronDown,
  LayoutList,
  BookText,
  UserCheck,
  QrCode,
  ArrowLeftRight,
  Inbox,
  BarChart2,
  Plus,
  Tag,
  Bookmark,
  ClipboardList,
  Send,
  Settings,
  LogOut,
  Heart,
  CreditCard,
  GraduationCap,
  Shield,
  Wrench,
  CalendarRange,
  ClipboardCheck,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { landsOnProfile } from '@/lib/auth/home-route'
import { canSeeSummaryRoute } from '@/lib/auth/module-summary'
import { canSeeServiceApplications } from '@/lib/auth/service-applications'

type SubItem = { href: string; label: string; icon: LucideIcon; badge?: number }
type NavModule = { href: string; label: string; icon: LucideIcon; subs: SubItem[]; module: string | null; summaryLabel?: string; badge?: number; hideSummary?: boolean }

const EVENTOS_SUB: SubItem[] = [
  { href: '/eventos/nuevo',  label: 'Crear evento',     icon: Plus },
  { href: '/eventos/tipos',  label: 'Tipos de evento',  icon: Tag  },
]

const EMPLEADOS_SUB: SubItem[] = [
  { href: '/empleados/puestos', label: 'Puestos pagados', icon: Tag },
]


const FINANZAS_SUB: SubItem[] = [
  { href: '/finanzas/donaciones',  label: 'Donaciones',   icon: Heart           },
  { href: '/finanzas/pagos',       label: 'Pagos',        icon: CreditCard      },
  { href: '/finanzas/devoluciones',label: 'Devoluciones', icon: ArrowLeftRight  },
  { href: '/finanzas/reportes',    label: 'Reportes',     icon: BarChart2       },
  { href: '/finanzas/solicitudes', label: 'Solicitudes',  icon: Inbox           },
]

const COMUNICACIONES_SUB: SubItem[] = [
  { href: '/comunicaciones/nueva',        label: 'Nueva comunicación', icon: Send     },
  { href: '/comunicaciones/plantillas',   label: 'Plantillas',         icon: FileText },
  { href: '/comunicaciones/configuracion',label: 'Configuración',      icon: Settings },
]

const SERVIDORES_SUB: SubItem[] = [
  { href: '/servidores/vacantes',     label: 'Puestos de Servicio', icon: Bookmark      },
]
/** Solicitudes de servicio: solo coordinador de servidores y admin (2026-07-30). */
const SERVIDORES_APPS_SUB: SubItem = { href: '/servidores/aplicaciones', label: 'Solicitudes', icon: ClipboardList }

// Roles que ven la página de mantenimiento (áreas/comités/puestos).
const SERVICE_ADMIN = ['encargado_staff', 'coordinador_servidores', 'direccion', 'admin']

const ESTUDIOS_SUB: SubItem[] = [
  { href: '/estudios/grupos',      label: 'Grupos',               icon: LayoutList },
  { href: '/estudios/plan',        label: 'Plan de Estudios',     icon: BookText   },
  { href: '/estudios/analisis',    label: 'Análisis de estudios', icon: BarChart2  },
  { href: '/estudios/dirigentes',  label: 'Dirigentes',           icon: UserCheck  },
  { href: '/estudios/solicitudes', label: 'Solicitudes',          icon: Inbox      },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

// Nombres bonitos desde la fuente de verdad (ROLES): el mapa manual anterior
// solo cubría 3 roles y el resto veía su slug crudo (p. ej. coordinador_estudios).
import { ROLES, isStudyGroupsOnly, EVALUATION_ROLES } from '@/lib/auth/roles'
import { formsNavPlacement } from '@/lib/auth/forms-scope'
import type { RoleId } from '@/types/auth'
const ROLE_LABELS: Record<string, string> = Object.fromEntries(ROLES.map(r => [r.id, r.name]))

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useAuth()
  const { can, getScope } = usePermissions()

  // Conteos de solicitudes abiertas para los badges.
  //
  // Antes se pedían siempre y el 403 se descartaba en silencio. Con el rol base
  // 'miembro' —que es casi todo el padrón— eso son DOS 403 por navegación que
  // nunca podían dar un badge: ruido en la consola de la persona y en el
  // monitoreo de errores, multiplicado por 18 mil cuentas. Se piden solo si el
  // rol puede llegar a verlos, con el mismo permiso que decide si el badge se
  // dibuja (medido en navegador el 2026-08-24).
  const [openRequests, setOpenRequests] = useState(0)
  const [openFinanceRequests, setOpenFinanceRequests] = useState(0)
  // La condición tiene que cubrir TODOS los casos donde el badge se dibuja, no
  // solo el obvio: el comité de estudios bíblicos también lo ve, y tiene alcance
  // 'own'. Gatear solo por alcance le apagaba el badge (encontrado al revisar
  // los tres sitios que usan openRequests, no al escribir la condición).
  // Quién tiene COLA de solicitudes: el rol explícito o el puesto en el comité.
  // Estaba solo como `in_study_committee` y el ítem del menú se agregaba en dos
  // de las cuatro ramas del submenú de Estudios. Quien además tenía
  // editor_grupos_estudio caía en la rama de "solo grupos", que no lo agrega, y
  // se quedaba sin el enlace aunque la página le abriera (Luis Sánchez Flores,
  // 2026-09-08). Con una sola variable el ítem se decide en un lugar.
  const tieneColaSolicitudes = !!user?.in_study_committee
    || (user?.roles ?? []).includes('solicitudes_estudio')
  const puedeVerEstudios = (can('estudios', 'view') && getScope('estudios') !== 'own')
    || tieneColaSolicitudes
  const puedeVerFinanzas = can('finanzas', 'view')
  useEffect(() => {
    let alive = true
    if (puedeVerEstudios) {
      fetch('/api/studies/requests?count=open')
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (alive && d) setOpenRequests(d.count ?? 0) })
        .catch(() => {})
    }
    if (puedeVerFinanzas) {
      fetch('/api/finance/requests?count=open')
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (alive && d) setOpenFinanceRequests(d.count ?? 0) })
        .catch(() => {})
    }
    return () => { alive = false }
  }, [pathname, puedeVerEstudios, puedeVerFinanzas])

  const userName  = user?.name ?? ''
  const userRole  = user?.role ?? ''
  const userRoles = user?.roles ?? []

  // Quién entra a accesos: coordinador_estudios para sus permisos delegados,
  // gestor_accesos para dar y quitar. La lista vive en roles.ts, no acá.
  const canViewAccesos = userRoles.some(r => (ACCESOS_SCREEN_ROLES as string[]).includes(r))
  const canViewListas = userRoles.some(r => ['admin', 'direccion', 'comunicaciones'].includes(r))
  const canViewDuplicados = userRoles.some(r => ['admin', 'editor_perfiles'].includes(r))

  // Submenú de Miembros según rol.
  const miembrosSub: SubItem[] = [
    ...(canViewListas ? [{ href: '/miembros/listas', label: 'Listas guardadas', icon: Bookmark }] : []),
    ...(canViewDuplicados ? [{ href: '/miembros/duplicados', label: 'Duplicados', icon: Users }] : []),
  ]

  // SEC-1: el submenú completo de Estudios es solo para alcance más allá de
  // 'own'; el dirigente ve únicamente "Grupos" (el API le filtra los suyos) y
  // el rol miembro no ve el módulo (su grupo se abre por deep link del perfil).
  const studiesBeyondOwn = can('estudios', 'view') && getScope('estudios') !== 'own'
  // El rol acotado de grupos tiene alcance 'all' en estudios, pero solo para
  // grupos: sin resumen ni el resto del submenú (espejo del ModuleGuard y de
  // los guards de API).
  const groupsOnly = isStudyGroupsOnly(userRoles as RoleId[])
  // El currículo: mismo ítem para todos los casos de abajo.
  const CURRICULO: SubItem = { href: '/estudios/plan', label: 'Plan de Estudios', icon: BookText }
  // Las solicitudes asignadas: se agregan en CUALQUIER rama, no solo en dos.
  const SOLICITUDES_ASIGNADAS: SubItem[] = tieneColaSolicitudes
    ? [{ href: '/estudios/solicitudes', label: 'Solicitudes', icon: Inbox, badge: openRequests }]
    : []
  const estudiosSub: SubItem[] = groupsOnly
    // El CURRÍCULO va en TODAS las ramas: es información para quien se va a
    // matricular, no gestión, y la página está abierta a cualquier sesión.
    // El rol acotado de grupos era el único que se quedaba sin el enlace
    // (2026-08-25): la página le abría, pero no había cómo llegar desde el menú.
    ? [{ href: '/estudios/grupos', label: 'Grupos', icon: LayoutList }, CURRICULO, ...SOLICITUDES_ASIGNADAS]
    : studiesBeyondOwn
    ? [
      ...ESTUDIOS_SUB.map(s => s.href === '/estudios/solicitudes' ? { ...s, badge: openRequests } : s),
      // Bloques de capacitación: solo coordinador de estudios y admin.
      ...(userRoles.some(r => ['coordinador_estudios', 'admin'].includes(r))
        ? [{ href: '/estudios/bloques', label: 'Bloques', icon: CalendarRange }] : []),
      // Folletos: quienes tienen el permiso folletos (dentro del módulo Estudios).
      ...(can('folletos', 'view') ? [{ href: '/estudios/folletos', label: 'Folletos', icon: FileText }] : []),
    ]
    : userRoles.includes('dirigente')
      ? [
        { href: '/estudios/grupos', label: 'Grupos', icon: LayoutList },
        CURRICULO,
        // Comité de estudios bíblicos: además, las solicitudes que le asignaron.
        ...SOLICITUDES_ASIGNADAS,
      ]
      // Sin rol de estudios: igual ve el CURRÍCULO. Es qué estudios hay y qué
      // pide cada etapa — información para quien se va a matricular, no gestión
      // (decisión 2026-07-29, completada el 2026-08-06: antes solo lo veía el
      // dirigente y la página estaba cerrada por el ModuleGuard).
      : [
        CURRICULO,
        ...SOLICITUDES_ASIGNADAS,
      ]
  // DIR-5: la cola de evaluaciones vive dentro de Estudios, pero se gatea por
  // ROL y no por el módulo — el criterio es el mismo de la página y del API
  // (EVALUATION_ROLES), donde coordinador_dirigentes entra sin tener el permiso
  // 'evaluaciones' y 'direccion' no entra aunque sí tenga el módulo estudios.
  if (userRoles.some(r => (EVALUATION_ROLES as string[]).includes(r))) {
    estudiosSub.push({ href: '/estudios/evaluaciones', label: 'Evaluaciones', icon: ClipboardCheck })
  }

  const finanzasSub: SubItem[] = [
    // Suite completa de finanzas: solo con el módulo 'finanzas' (becas/revision_pagos
    // solas NO destapan donaciones/devoluciones/reportes/solicitudes).
    // REV-3: la página unificada /finanzas/pagos (listado + cola de revisión)
    // sí se destapa con el permiso revision_pagos aunque falte el módulo.
    ...(can('finanzas', 'view')
      ? FINANZAS_SUB.map(s => s.href === '/finanzas/solicitudes' ? { ...s, badge: openFinanceRequests } : s)
      : can('revision_pagos', 'view')
        ? [{ href: '/finanzas/pagos', label: 'Pagos', icon: CreditCard }]
        : []),
    // Becas: quienes tienen el permiso becas (dentro de Finanzas, aunque no tengan el módulo completo).
    ...(can('becas', 'view') ? [{ href: '/finanzas/becas', label: 'Becas', icon: GraduationCap }] : []),
  ]

  // Mantenimiento de áreas/comités/puestos: solo para roles de admin de servidores.
  const canServiceAdmin = userRoles.some(r => SERVICE_ADMIN.includes(r))
  const servidoresSub: SubItem[] = [
    ...SERVIDORES_SUB,
    ...(canSeeServiceApplications(userRoles) ? [SERVIDORES_APPS_SUB] : []),
    ...(canServiceAdmin ? [{ href: '/servidores/admin', label: 'Áreas y comités', icon: Wrench }] : []),
  ]

  // Formularios vive dentro de Comunicaciones (sub-ítem), no como módulo aparte.
  // COM-1: "Configuración" (remitentes/SMTP) es SOLO admin — se filtra del sub.
  const comunicacionesBase = userRoles.includes('admin')
    ? COMUNICACIONES_SUB
    : COMUNICACIONES_SUB.filter(s => s.href !== '/comunicaciones/configuracion')
  // Dónde va Formularios: adentro de Comunicaciones para quien tiene ese módulo,
  // y como entrada propia de primer nivel para quien llega por otro camino —el
  // rol 'forms' o un acceso puntual a un formulario—, que no ve Comunicaciones.
  // Regla única y testeada: formsNavPlacement (bug 2026-08-04: el rol forms se
  // quedaba sin entrada porque el padre no se pintaba).
  const formsNav = formsNavPlacement({
    roles: userRoles as RoleId[],
    grantedFormIds: user?.granted_form_ids,
  })
  const comunicacionesSub: SubItem[] = formsNav === 'submenu'
    ? [{ href: '/formularios', label: 'Formularios', icon: FileText }, ...comunicacionesBase]
    : comunicacionesBase

  // "Crear evento"/"Tipos de evento" son de gestión — ocultos si no se tiene
  // el módulo, aunque el ítem padre "Eventos" sí se muestre a todos.
  const eventosSub: SubItem[] = can('eventos', 'view') ? EVENTOS_SUB : []

  // Cada módulo se muestra solo si el rol tiene 'view' sobre él (can combina
  // múltiples roles: coordinador_estudios + comunicaciones ve comunicaciones).
  // SEC-1 (ampliado 2026-07-29): miembro, dirigente y líder de comité no
  // tienen dashboard — su página default es su perfil, y así se llama en el menú.
  const isMemberOnly = landsOnProfile(userRoles)
  const homeItem: NavModule = isMemberOnly && user?.member_id
    ? { href: `/miembros/${user.member_id}`, label: 'Mi perfil', icon: LayoutDashboard, subs: [], module: null }
    : { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, subs: [], module: null }
  const ALL_NAV: NavModule[] = [
    homeItem,
    { href: '/miembros',       label: 'Miembros',       icon: Users,           subs: miembrosSub,        module: 'miembros', summaryLabel: 'Buscar miembros' },
    // Matrícula: autoservicio, visible para CUALQUIER sesión. module: null
    // porque no depende del módulo de estudios — ver el guard del layout.
    { href: '/matricula',      label: 'Matrícula',      icon: GraduationCap,   subs: [],                 module: null },
    // PAG-1/PAG-4: pagos pendientes propios (y de la familia) — cualquier
    // sesión con perfil de miembro (el endpoint gatea a self/familia/staff);
    // va debajo de Matrícula a propósito.
    { href: '/mis-pagos',      label: 'Pagos pendientes', icon: CreditCard,    subs: [],                 module: null },
    // Eventos es visible para cualquier autenticado: sin el permiso del módulo,
    // la propia página muestra solo la inscripción a eventos (antes vivía
    // aparte en /mis-eventos); "Crear evento"/"Tipos de evento" siguen ocultos.
    { href: '/eventos',        label: 'Eventos',        icon: Calendar,        subs: eventosSub,        module: 'eventos', summaryLabel: 'Calendario' },
    { href: '/estudios',       label: 'Estudios',       icon: BookOpen,        subs: estudiosSub,        module: 'estudios', hideSummary: groupsOnly || !canSeeSummaryRoute('/estudios', getScope('estudios')) },
    { href: '/servidores',     label: 'Servidores',     icon: UsersRound,      subs: servidoresSub,      module: 'servidores', hideSummary: !canSeeSummaryRoute('/servidores', getScope('servidores')) },
    { href: '/empleados',      label: 'Empleados',      icon: Briefcase,       subs: EMPLEADOS_SUB,      module: 'empleados' },
    { href: '/finanzas',       label: 'Finanzas',       icon: DollarSign,      subs: finanzasSub,        module: 'finanzas' },
    { href: '/comunicaciones', label: 'Comunicaciones', icon: MessageCircle,   subs: comunicacionesSub,  module: 'comunicaciones' },
    { href: '/reportes',       label: 'Reportes',       icon: BarChart2,       subs: [],                 module: 'reportes' },
    ...(formsNav === 'top_level'
      ? [{ href: '/formularios', label: 'Formularios', icon: FileText, subs: [], module: null } as NavModule]
      : []),
  ]
  // El padrón (listado de miembros) exige alcance más allá de 'own' — el rol
  // base 'miembro' ve su perfil, no el listado (espejo del guard de la API).
  // Estudios/Finanzas también se muestran si el usuario tiene un permiso que vive
  // adentro (folletos → Estudios; revision_pagos → Finanzas), aunque no tenga el módulo.
  const NAV = ALL_NAV.filter(m => {
    if (!m.module) return true
    // SEC-1: estudios con scope 'own' solo aparece para el dirigente (sus
    // grupos); el rol miembro no ve la entrada.
    // El comité de estudios bíblicos entra por su cola de solicitudes asignadas,
    // aunque no tenga rol de estudios (decisión 2026-07-31).
    // 2026-08-06: el CURRÍCULO es para cualquiera, así que la entrada de
    // Estudios se muestra siempre — adentro, quien no gestiona ve solo "Plan de
    // Estudios" (y su resumen queda oculto por hideSummary).
    if (m.href === '/estudios') return true
    if (m.href === '/finanzas') return can('finanzas', 'view') || can('revision_pagos', 'view') || can('becas', 'view')
    // SEC-1: el padrón es solo para alcance 'all' (lider_comite ve a su gente
    // en /servidores, no en el listado completo).
    if (m.href === '/miembros') return can('miembros', 'view') && getScope('miembros') === 'all'
    // Eventos: visible para cualquier autenticado (auto-inscripción), aunque
    // no tenga el módulo de gestión.
    if (m.href === '/eventos') return true
    return can(m.module, 'view')
  })

  // Item destacado de Check-in (encargado_eventos, dirección, admin). Para el
  // encargado_eventos puro es el ítem MÁS prominente (arriba de todo).
  const roles = user?.roles ?? []
  const canCheckin = roles.some(r => ['encargado_eventos', 'direccion', 'admin'].includes(r))
  const onlyEncargado = roles.filter(r => r !== 'miembro').length === 1 && roles.includes('encargado_eventos')
  if (canCheckin) {
    const checkinItem: NavModule = { href: '/eventos/checkin', label: 'Check-in', icon: QrCode, subs: [], module: null }
    if (onlyEncargado) NAV.unshift(checkinItem)
    else NAV.splice(1, 0, checkinItem) // tras Dashboard
  }

  // ── Acordeón exclusivo (mobile y desktop) ──
  const moduleOfPath = NAV.find(m => m.subs.length > 0 && (pathname === m.href || pathname.startsWith(m.href + '/')))?.href ?? null
  const [expandedModule, setExpandedModule] = useState<string | null>(moduleOfPath)
  // Al abrir el menú (mobile) o navegar arranca expandido el módulo de la ruta
  // actual (ajuste de estado durante render — el patrón de React, sin effects).
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setExpandedModule(moduleOfPath)
  }
  const [prevPath, setPrevPath] = useState(pathname)
  if (pathname !== prevPath) {
    setPrevPath(pathname)
    setExpandedModule(moduleOfPath)
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      router.push('/login')
      router.refresh()
    }
  }

  function SubLink({ sub, exactActive }: { sub: SubItem; exactActive?: boolean }) {
    const subActive = exactActive ?? (pathname === sub.href)
    const SubIcon = sub.icon
    return (
      <Link
        href={sub.href}
        onClick={onClose}
        className={cn(
          'group flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] transition-all duration-150 min-h-[44px] lg:min-h-0',
          subActive ? 'bg-white/15 text-white' : 'text-white/55 hover:bg-white/10 hover:text-white',
        )}
      >
        <SubIcon
          size={14}
          strokeWidth={1.75}
          className={cn('shrink-0', subActive ? 'text-white' : 'text-white/80 group-hover:text-white')}
        />
        <span className="flex-1 font-body font-light">{sub.label}</span>
        {(sub.badge ?? 0) > 0 && (
          <span className="inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-coral px-1 text-[11px] font-bold text-white font-display">
            {sub.badge}
          </span>
        )}
      </Link>
    )
  }

  function ModuleSection({ mod }: { mod: NavModule }) {
    const Icon = mod.icon
    const moduleActive = pathname === mod.href || pathname.startsWith(mod.href + '/')
    const expanded = expandedModule === mod.href

    const headerCls = cn(
      'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-left transition-all duration-150 min-h-[44px] lg:min-h-0',
      moduleActive ? 'bg-coral text-white' : 'text-white/80 hover:bg-white/10 hover:text-white',
    )
    const headerContent = (chevronOpen: boolean) => (
      <>
        <Icon
          size={18}
          strokeWidth={1.75}
          className={cn('shrink-0 transition-colors', moduleActive ? 'text-white' : 'text-white/80 group-hover:text-white')}
        />
        <span className="flex-1 truncate font-body font-light">{mod.label}</span>
        <ChevronDown
          size={14}
          className={cn('transition-transform duration-200', chevronOpen ? 'rotate-180' : 'rotate-0', moduleActive ? 'text-white' : 'text-white/80')}
        />
      </>
    )

    // El módulo NO navega — expande/colapsa su submenú (acordeón exclusivo,
    // mismo comportamiento en mobile y desktop). El primer sub-item ("Resumen")
    // es el acceso a la página principal del módulo.
    return (
      <div>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpandedModule(prev => (prev === mod.href ? null : mod.href))}
          className={headerCls}
        >
          {headerContent(expanded)}
        </button>
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-200 ease-out',
            expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="overflow-hidden min-h-0">
            <div className="ml-3 mt-0.5 space-y-0.5 border-l border-white/10 pl-3 pb-1">
              {/* SEC-1: sin alcance 'all' no hay resumen del módulo. */}
              {!mod.hideSummary && (
                <SubLink
                  sub={{ href: mod.href, label: mod.summaryLabel ?? 'Resumen', icon: Icon }}
                  exactActive={pathname === mod.href}
                />
              )}
              {mod.subs.map(sub => <SubLink key={sub.href} sub={sub} />)}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-navy-ink/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-40 h-full w-60 flex flex-col bg-navy transition-transform duration-300 ease-out',
          'lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-6 py-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image
              src="/logo-theos-white.png"
              alt="Theos Place"
              width={120}
              height={32}
              className="object-contain"
              priority
            />
          </Link>
          <button
            onClick={onClose}
            className="lg:hidden rounded-md p-1 text-white/80 hover:text-white transition-colors"
            aria-label="Cerrar menú"
          >
            <X size={20} />
          </button>
        </div>

        {/* Divider */}
        <div className="mx-6 h-px bg-white/10" />

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {NAV.map(mod => {
            if (mod.subs.length === 0) {
              // Sin subpáginas: navega directo y cierra el menú (igual en mobile).
              const active = pathname === mod.href || pathname.startsWith(mod.href + '/')
              const Icon = mod.icon
              return (
                <Link
                  key={mod.href}
                  href={mod.href}
                  onClick={onClose}
                  className={cn(
                    'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-150 min-h-[44px] lg:min-h-0',
                    active ? 'bg-coral text-white' : 'text-white/80 hover:bg-white/10 hover:text-white',
                  )}
                >
                  <Icon
                    size={18}
                    strokeWidth={1.75}
                    className={cn('shrink-0 transition-colors', active ? 'text-white' : 'text-white/80 group-hover:text-white')}
                  />
                  <span className="flex-1 truncate font-body font-light">{mod.label}</span>
                  {(mod.badge ?? 0) > 0 && (
                    <span className="inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-coral px-1 text-[11px] font-bold text-white font-display">
                      {mod.badge}
                    </span>
                  )}
                </Link>
              )
            }
            return <ModuleSection key={mod.href} mod={mod} />
          })}
        </nav>

        {/* Accesos — solo admin/direccion */}
        {canViewAccesos && (
          <div className="px-3 pb-2">
            <div className="h-px bg-white/10 mb-2" />
            <Link
              href="/accesos"
              onClick={onClose}
              className={cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-150 min-h-[44px] lg:min-h-0',
                pathname === '/accesos' || pathname.startsWith('/accesos/')
                  ? 'bg-coral text-white'
                  : 'text-white/80 hover:bg-white/10 hover:text-white'
              )}
            >
              <Shield
                size={18}
                strokeWidth={1.75}
                className={cn(
                  'shrink-0 transition-colors',
                  pathname === '/accesos' || pathname.startsWith('/accesos/')
                    ? 'text-white'
                    : 'text-white/80 group-hover:text-white'
                )}
              />
              <span className="font-body font-light">Accesos</span>
            </Link>
          </div>
        )}

        {/* Footer — usuario + logout */}
        <div className="px-4 py-4 border-t border-white/10">
          {userName && (
            <div className="flex items-center gap-3 px-2 py-2 mb-2">
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-[13px] font-bold text-white bg-[rgba(255,255,255,0.15)] font-display"
              >
                {userName.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-white truncate font-body font-normal">
                  {userName}
                </p>
                <p className="text-[13px] text-white/80 truncate font-body">
                  {ROLE_LABELS[userRole] ?? userRole}
                </p>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] text-white/80 hover:bg-white/10 hover:text-white transition-all font-body"
          >
            <LogOut size={14} className="shrink-0" />
            Cerrar sesión
          </button>
          <Link
            href="/terminos"
            className="mt-1 block px-3 py-1 text-[13px] text-white/80 hover:text-white transition-colors font-body"
          >
            Términos y Condiciones
          </Link>
        </div>
      </aside>
    </>
  )
}
