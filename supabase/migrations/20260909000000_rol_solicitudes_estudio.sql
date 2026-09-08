-- Rol nuevo: solicitudes_estudio.
--
-- POR QUÉ. El comité de estudios bíblicos ya podía atender las solicitudes que
-- le asignan, pero el acceso salía de un flag DERIVADO (`in_study_committee`,
-- calculado de tener puesto activo en el comité). Eso trae dos problemas: no
-- aparece en la pantalla de Accesos, así que nadie ve quién lo tiene ni se lo
-- puede dar a mano; y el menú lo mostraba solo en algunas ramas, así que
-- alguien del comité que además tuviera editor_grupos_estudio caía en otra
-- rama y se quedaba sin el enlace, aunque la página le abriera. Le pasó a Luis
-- Sánchez Flores.
--
-- Ahora es un rol de verdad: se ve, se asigna, y lo otorga automáticamente
-- cualquier puesto activo del comité (POSITION_ROLE_RULES).
alter table member_roles drop constraint if exists member_roles_role_check;

alter table member_roles add constraint member_roles_role_check check (role = any (array[
  'admin', 'direccion', 'finanzas', 'encargado_staff', 'coordinador_servidores',
  'coordinador_estudios', 'coordinador_dirigentes', 'encargado_eventos',
  'lider_comite', 'comunicaciones', 'dirigente', 'editor_perfiles', 'miembro',
  'solo_lectura', 'reportes', 'folletos', 'becas', 'revision_pagos',
  'editor_grupos_estudio', 'forms', 'evaluaciones', 'gestor_accesos',
  'solicitudes_estudio'
]));
