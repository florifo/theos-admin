// Access control / roles domain types.

export type RoleId =
  | 'admin'
  | 'direccion'
  | 'finanzas'
  | 'encargado_staff'
  | 'coordinador_servidores'
  | 'coordinador_estudios'
  | 'coordinador_dirigentes'
  | 'encargado_eventos'
  | 'lider_comite'
  | 'comunicaciones'
  | 'dirigente'
  | 'editor_perfiles'
  | 'miembro'
  | 'solo_lectura'
  | 'reportes'
  | 'folletos'
  | 'revision_pagos'
  | 'becas'
  | 'editor_grupos_estudio'
  | 'forms'
  | 'evaluaciones'
  | 'gestor_accesos'
  | 'solicitudes_estudio'

export type Permission = {
  module: string
  actions: ('view' | 'create' | 'edit' | 'delete' | 'export')[]
  scope?: 'own' | 'committee' | 'all'
}

export type Role = {
  id: RoleId
  name: string
  description: string
  color: string
  permissions: Permission[]
}

export type UserAccess = {
  id: string
  member_id: string
  member_name: string
  member_email: string
  member_initials: string
  roles: RoleId[]
  /** origen ('manual'|'automatico') de cada rol activo — para mostrar de dónde
   *  viene un rol (asignado a mano vs. otorgado por un puesto de servicio). */
  role_origins?: Partial<Record<RoleId, 'manual' | 'automatico'>>
  /** Cantidad de puestos activos que respaldan un rol automático. */
  role_position_counts?: Partial<Record<RoleId, number>>
  granted_by: string
  granted_at: string
  last_login: string | null
  is_active: boolean
  history?: AccessHistoryEntry[]
}

export type AccessHistoryEntry = {
  date: string
  actor: string
  action: 'assigned' | 'revoked'
  role: RoleId
}
