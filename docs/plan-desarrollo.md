# Plan unificado de mejoras — jul 2026

> Une dos fuentes: (a) el feedback de usuarios (filtros, matrícula, prematrimonial, estudios, folletos, pagos) y (b) la deuda técnica/operativa detectada en la auditoría del código (docs/sistema-overview.md §6).
>
> Cada punto con código tiene un prompt listo para pegar en Claude Code. Trabajarlos **uno por uno, en orden dentro de cada fase**. Marcar `[x]` al completar y anotar commit/PR.
>
> Decisiones ya confirmadas:
> - Prematrimonial: la regla nueva es **N1 completado + al menos inscrito en N2** (ambos de la pareja). Relaja la actual (N2 completado).
> - Folletos: las 3 reglas nuevas **reemplazan** la generación por cierre de grupo y por hitos de bloque.
> - Bloqueo de matrícula por pago pendiente: aplica **solo a pagos de estudios/capacitaciones**.

---

## Fase 0 — Operativo (sin código, sesión de configuración)

Checklist de administración; nada de esto pasa por Claude Code:

- [ ] Agregar las env `HEALTHCHECK_URL_*` en Vercel. **La lista completa (9, una por cron)
  quedó en `.env.example` con su horario al lado** — antes solo estaban 4 y por eso "las
  faltantes" no se sabía cuáles eran. Crear un check por cron en healthchecks.io y pegar la
  URL. Sin la variable el cron corre igual; solo no avisa si falla.
  · `report-snapshots` **SÍ debe pingear** — decidido e implementado 2026-08-06: su modo de
  fallo es silencioso (los reportes siguen abriendo, con datos viejos). Ya no queda ningún
  cron sin ping, y hay un test que lo vigila (`src/lib/health.test.ts`).
- [ ] Configurar Sentry (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`).
- [ ] Copiar las env vars de Supabase a los deploys **Preview** de Vercel (hoy solo están en Production y los previews fallan).
- [x] Verificar que la edge function `process-email-queue` de Supabase no duplique los crons
  de vercel.json — **VERIFICADO 2026-08-06: no hay ninguna edge function desplegada** en el
  proyecto, así que no existe tal duplicación. Los 3 jobs de pg_cron que sí existen
  (`refresh_donor_flags` 6:30, `refresh_member_sedes` 6:45, `prune_audit_log` 4:00) son
  funciones SQL y no se solapan con ningún cron HTTP de vercel.json.
- [ ] Confirmar el SMTP de Supabase Auth.

---

## Fase 1 — Deuda rápida + quick wins de UI

### Deuda técnica (de la auditoría)

### [x] DEU-1 · Unificar vocabulario de `vacancies.status` — PR #35 (migración 20260725120000; mapeo draft→creado, published→aprobado, filled/closed→cerrada)

```
En vacancies.status conviven dos vocabularios: legacy (draft/published/filled/closed) y nuevo
(creado/enviado_lider/aprobado/denegado); el código trata published como aprobado. Unificá al
vocabulario nuevo: migración SQL que mapee los valores legacy (published→aprobado; decidí y
documentá el mapeo de draft/filled/closed mirando cómo los consume el código), actualizá el
CHECK de la columna, y limpiá las ramas de compatibilidad en src/app/api/servers/vacancies/* y
componentes de /servidores/vacantes. Revisá también el SELECT público de vacantes
(/api/public/vacancies y la página /vacantes) para que solo exponga aprobadas.
Correr tsc, lint y vitest; agregá test del mapeo si hay lógica de estado.
```

### [x] DEU-2 · Flag `events.is_public` — CERRADO SIN CÓDIGO (decisión 2026-07-26)

> Decisión confirmada: la página de eventos debe ser pública sin auth y mostrar **todos** los
> eventos. Es el comportamiento actual (`/calendario` es ruta pública en el proxy;
> `/api/public/events` expone todo evento no cancelado/archivado, con rate limit y whitelist
> de campos). No se agrega flag `is_public`. Deja de ser deuda.

### [x] DEU-3 · Columna legacy `employees.position` — PR #36 (migración 20260726100000, DROP COLUMN; decisión 2026-07-25: eliminarla, tabla vacía en producción)

```
employees.position es una columna legacy NOT NULL que se rellena desde el puesto por
compatibilidad. Evaluá si ya nada la lee (grep de usos en src/): si es así, migración para
hacerla nullable o eliminarla, y limpiá el código de relleno. Si algo la lee todavía, migrá ese
consumo a paid_positions primero. Cambio pequeño pero tocá con cuidado: es RRHH.
```

### Quick wins del feedback (prematrimonial, revisión de pagos, cierres)

### [x] PRE-1 · Búsqueda de cónyuge por correo — VERIFICADO 2026-07-26: no reproducible
Archivos: `src/app/(admin)/matricula/prematrimonial/page.tsx`, `src/app/api/studies/prematrimonial/spouse-search/route.ts`

> Resultado: la búsqueda por correo **ya funciona** — el form envía el texto tal cual (placeholder
> ya dice "Cédula, correo o teléfono") y `findSpouseByContact` matchea email con `ilike`
> case-insensitive; probado contra datos de producción con mayúsculas mezcladas. Se agregó test
> de regresión (`prematrimonial-spouse-search.test.ts`, 5 casos). Si el reporte persiste,
> conseguir el correo exacto que falló: lo probable es que ese correo no esté registrado en el
> perfil del cónyuge (o esté en otro campo).

```
En el wizard prematrimonial (src/app/(admin)/matricula/prematrimonial/page.tsx), la búsqueda
de cónyuge del paso 2 solo funciona con cédula, pero el endpoint
src/app/api/studies/prematrimonial/spouse-search/route.ts ya soporta cédula, correo y teléfono.
Arreglá el form para que también acepte correo: revisá si el problema es validación del input,
normalización (la cédula se normaliza, el correo debe compararse case-insensitive) o el payload
que se envía. Ajustá el placeholder/label del campo para indicar "cédula o correo".
No cambiés el contrato de respuesta (solo nombre + has_n2, por privacidad).
Verificá con un test del endpoint buscando por correo con mayúsculas mezcladas.
```

### [x] PRE-2 · Zonas fijas del form prematrimonial — HECHO 2026-07-26 (se quitó 'Virtual'; las otras 6 ya estaban en el orden pedido; 0 registros viejos en prod)
Archivos: `src/app/(admin)/matricula/prematrimonial/page.tsx` (constante `ZONES`, línea ~13)

```
En src/app/(admin)/matricula/prematrimonial/page.tsx hay un array ZONES hardcodeado.
Reemplazá sus valores por exactamente estas 6 opciones, en este orden:
Este de San José, Oeste de San José, Alajuela, Cartago, Liberia, Heredia.
Revisá que los valores guardados hasta ahora en prematrimonial_requests no se rompan al
mostrarse en la cola (src/components/studies/PrematrimonialQueue.tsx): si un registro viejo
tiene una zona que ya no está en la lista, debe seguir mostrándose tal cual.
No conectés esto al catálogo de sedes; la lista es fija a propósito.
```

### [x] PRE-3 · Fecha de boda: mínimo y default +6 meses — HECHO 2026-07-26 (módulo puro `premat-dates.ts` con meses calendario + ajuste fin de mes; 400 `boda_muy_pronto` server-side; min/default en el input; 5 tests)
Archivos: `src/app/(admin)/matricula/prematrimonial/page.tsx` (campo `ceremonyDate`), `src/app/api/studies/prematrimonial/route.ts`

```
Regla de negocio: la fecha de la boda no puede ser menor a 6 meses desde hoy.
En el wizard prematrimonial (src/app/(admin)/matricula/prematrimonial/page.tsx):
1) El input de fecha de boda debe tener min = hoy + 6 meses y su valor default debe
   inicializarse en hoy + 6 meses (respetando el flag dateDefined si la fecha aún no está definida).
2) Agregá la validación server-side en src/app/api/studies/prematrimonial/route.ts:
   si viene fecha definida y es menor a hoy + 6 meses, devolver 400 con código claro
   (patrón del repo: errores con code, como el 409 requisito_n2).
Usá cálculo de meses calendario, no 180 días. Agregá test unitario de la validación.
```

### [x] PRE-4 · Cambiar pregunta del oficiante — HECHO 2026-07-26
Archivos: `src/app/(admin)/matricula/prematrimonial/page.tsx`

```
En src/app/(admin)/matricula/prematrimonial/page.tsx, cambiá el texto de la pregunta sobre
quién oficia la ceremonia a exactamente: "¿Quién te gustaría que dirigiera la ceremonia?".
Solo cambia el label/copy; las opciones (OFFICIANTS) quedan igual.
```

### [x] REV-1 · Filtros extra en revisión de pagos — HECHO 2026-07-26 (params `planId`/`leaderId` con embed `!inner`, endpoint nuevo `/api/payments/queue/options` para roles de revisión, selects deshabilitados fuera de Matrícula; verificado contra producción)
Archivos: `src/app/(admin)/pagos/revision/page.tsx`, `src/app/api/payments/queue/route.ts`, `src/lib/supabase/queries/payments.ts` (`getPendingPaymentsQueue`)

```
En la página de revisión de pagos (src/app/(admin)/pagos/revision/page.tsx) hoy solo se filtra
por estado de cola y concepto. Agregá dos filtros más:
1) Tipo de estudio/capacitación: para pagos de matrícula, filtrar por el plan del grupo
   (study_plans vía study_enrollments -> study_groups). Un select con los planes.
2) Dirigente del grupo: select/búsqueda por dirigente (study_leaders) del grupo asociado al pago.
Extendé el API src/app/api/payments/queue/route.ts (query params planId y leaderId) y la query
getPendingPaymentsQueue en src/lib/supabase/queries/payments.ts. Los filtros aplican solo a
pagos de concepto matrícula; para otros conceptos se ignoran (deshabilitá los selects en la UI
cuando el concepto no aplique). Mantené el guard de permisos existente
(requireModuleView('revision_pagos','edit')). Seguí el patrón de filtros server-side del repo.
```

### [x] EST-3 · Recomendaciones solo en cierres N4+ y capacitaciones — HECHO 2026-07-26 (módulo puro `close-recommendations.ts`: N4+ o DIS*; gate en UI + server ignora recomendaciones de planes no permitidos; 4 tests)
Archivos: `src/app/(admin)/estudios/grupos/[id]/cierre/page.tsx` (bloque "Recomendar para", líneas ~314-345)

```
En el flujo de cierre de grupo (src/app/(admin)/estudios/grupos/[id]/cierre/page.tsx) el bloque
"Recomendar para (opcional)" (rec_oracion, rec_servicio, rec_dirigente, rec_justification)
debe mostrarse ÚNICAMENTE cuando el plan del grupo es nivel N4 o posterior en la cadena
N1→N2→N3→N4, o cuando es una capacitación (cadena DIS1→DIS3 / bloques de capacitación).
Para N1-N3 el bloque no se muestra ni se envía en el POST. Determiná el nivel desde el plan
del grupo (ver cadenas de niveles en src/lib/studies/, p. ej. la lógica de nextLevelCode en
src/lib/studies/folletos.ts como referencia de cómo se modelan las cadenas). Validá también
server-side: si llega recommendations para un grupo N1-N3, ignorarlas o rechazarlas.
Agregá test de la condición de visibilidad/aceptación.
```

### [x] FIN-1 · Donaciones: stat de donantes activos + total al filtrar — HECHO 2026-07-27 (RPC `donation_stats` gana `active_donors` = members.is_donor, migración 20260727150000 aplicada — 694 hoy; card "Sin identificar" reemplazada, banner+modal intactos; suma del filtro completo server-side vía `?with_sum=1` paginado, con AmountDisplay y solo para rol finanzas)

> OJO dato, no bug: las 14,710 donaciones en prod tienen amount=0 (los montos de QuickBooks
> son la tarea de datos pendiente) — el "Total filtrado" mostrará ₡0 hasta importarlos,
> igual que ya pasaba con "Total donado este mes".
Archivos: `src/app/(admin)/finanzas/donaciones/page.tsx` (stat card línea ~131, lista y filtros), `src/app/api/finance/donations/*`, `src/lib/supabase/queries/finance.ts`

```
Dos cambios en la página de donaciones (src/app/(admin)/finanzas/donaciones/page.tsx):
1) Reemplazar la stat card "Sin identificar" (línea ~131) por "Donantes activos": cantidad
   de miembros con members.is_donor = true. Ese flag YA se recalcula como "donó en los
   últimos ~2 trimestres" (ver RPC de is_donor en la migración baseline y el trigger que lo
   marca en cada donación) — usalo, no inventés otra definición. Exponer el conteo desde el
   API/query que alimenta las stats de la página (o donation_stats si es RPC).
   OJO: solo se quita la CARD; el banner de alerta de donaciones sin identificar y el modal
   para identificarlas (líneas ~154 y ~344) se mantienen, porque son accionables.
2) Total al filtrar: cuando la lista tiene cualquier filtro aplicado (búsqueda, fechas,
   identificado/no, etc.), mostrar junto al conteo de resultados la SUMA de los montos
   filtrados (usar AmountDisplay con el mismo comportamiento de ocultar/revelar montos que
   ya tiene la página). Si la lista está paginada server-side, la suma debe calcularse
   server-side sobre el filtro completo, no solo la página visible.
Permisos sin cambio (finanzas, direccion). Test del total filtrado con paginación.
```

### [x] MAT-1 · Resumen de compromisos entendible en matrícula — HECHO 2026-07-27 (computeEligibility expone `requirements` estructurado; módulo puro `stage-requirements-summary.ts`: mínimo real por cadena de prerequisitos + compromisos deduplicados con etiquetas cortas y detalle secundario; mismas dos columnas; 6 tests)
Archivos: `src/app/(admin)/matricula/page.tsx` (`StageRequirementsEmptyState`, líneas ~540-616), `src/lib/studies/eligibility.ts`, referencia de estilo: `RequirementChips` en `src/app/(admin)/estudios/analisis/page.tsx` y `CommitmentRow` en la misma página de matrícula

```
En la página de matrícula, cuando una etapa está bloqueada, el bloque
StageRequirementsEmptyState (src/app/(admin)/matricula/page.tsx líneas ~540-616) une los
textos crudos de reasons_blocked de todos los estudios gateway de la etapa. Resultado
confuso: aparecen prerequisitos mezclados ("Necesitás completar Nivel 4 primero" Y
"Necesitás completar Nivel 2 primero" a la vez) más un párrafo largo de asistencia.
Reemplazá esa unión de strings por un resumen estructurado y mínimo:
1) No agregues strings: usá los datos estructurados del EligibilityResult (o extendé
   computeEligibility en src/lib/studies/eligibility.ts para exponer flags por tipo de
   requisito: prerequisite, donor, server, attendance, age) en vez de parsear texto.
2) Prerequisitos: mostrar solo el MÍNIMO real de la cadena — si entre los gateway faltan
   N2 y N4, el mínimo es el nivel más bajo que le falta al miembro según su avance
   (o un genérico "Completar los estudios de niveles" si aplica a toda la cadena).
   Nunca listar dos niveles de la misma cadena a la vez.
3) Compromisos: mostrarlos con las mismas etiquetas cortas que ya se usan en el resto del
   sistema (CommitmentRow en matrícula y RequirementChips en /estudios/analisis):
   "Donante/a activo/a", "Servidor/a en comité", "Asistencia activa". El detalle largo
   ("al menos 6 charlas con check-in...") va como tooltip o texto secundario, no como
   ítem principal. Deduplicar: cada compromiso aparece una sola vez.
4) Mantener las dos columnas "Ya cumplís" / "Te falta" con el mismo estilo visual.
No cambiés la lógica de elegibilidad, solo cómo se resume y presenta.
Tests del resumen: etapa con gateways que piden N2 y N4 → muestra solo el mínimo;
compromisos repetidos entre estudios → aparecen una vez.
```

### Estudios, solicitudes y comunicaciones (feedback 2026-07-26, segunda tanda)

### [x] EST-4 · Grupo virtual ⇒ zona "Virtual" automática — HECHO 2026-07-27 (seed sede VIRTUAL con is_active=false — no aparece en combos de charlas/activeSedes, migración 20260727170000 aplicada; módulo puro `virtual-zone.ts`: marcar fija la zona y muestra pill fija en vez del combobox, desmarcar limpia solo si era Virtual; aplicado en crear Y editar; el nombre queda "COD — Virtual"; 3 tests)
Archivos: `src/app/(admin)/estudios/grupos/nuevo/page.tsx` (checkbox is_virtual líneas ~346-358, zona ~236-248), `src/app/(admin)/estudios/grupos/[id]/editar/page.tsx` (~271), `src/lib/zones.ts` (`resolveZoneCode`)

```
En crear/editar grupo de estudio, el checkbox "Grupo virtual" (is_virtual) y la zona son
campos independientes; hoy un grupo virtual obliga a elegir una zona geográfica.
Cambio: al marcar "Grupo virtual", la zona debe fijarse automáticamente en "Virtual" y el
selector de zona deshabilitarse (al desmarcar, se rehabilita y limpia). La zona "Virtual" no
existe en el catálogo de sedes: crearla vía resolveZoneCode de src/lib/zones.ts (que ya crea
zonas al vuelo) o con una migración/seed — decidí mirando cómo se listan las sedes en
useSedes y evitá que "Virtual" aparezca como sede de charlas en otros combos si eso genera
ruido (revisá consumidores de activeSedes). El nombre generado del grupo debe quedar tipo
"HER — Virtual". Aplica en nuevo Y editar. No toqués la lógica de autorización de estudios
virtuales (authorized_virtual_studies), solo la zona. Test del comportamiento del form.
```

### [x] EST-5 · Nueva etapa "Avanzada" — HECHO 2026-07-27 (migración 20260727180000 aplicada: CHECK +etapa_avanzada, CDEB/HER/CDC movidos y marcados invitation-only; LEVEL_TO_STAGE + requisitos = intermedia + asistencia reforzada; tipo stage ampliado; catálogo estático + STUDY_STAGES; UI: matrícula (tab/meta), form de grupo nuevo (optgroup), /estudios/plan (sección propia "solo por invitación"), /estudios/analisis (optgroup), StudyTypeBadge; 3 tests de elegibilidad)
Archivos: migración SQL (`study_plans.level` CHECK), `src/lib/studies/eligibility.ts` (`LEVEL_TO_STAGE` líneas 9-14 y requisitos por etapa ~28-30), `src/types/study.ts:13`, `src/data/study-catalog.ts` (HER línea ~238, CDEB ~252, CDC ~253, `STUDY_STAGES` ~262), forms y agrupadores de matrícula/análisis

```
Crear la etapa "Avanzada" y mover ahí CDEB (Cómo Dar Estudios Bíblicos), HER (Hermenéutica)
y CDC (Cómo Dar Charlas), que hoy están en etapa intermedia.
Reglas de la etapa avanzada (decisión confirmada): los MISMOS compromisos que intermedia
(donante activo + servidor en comité + asistencia reforzada de 12 charlas) Y además solo por
invitación (el mecanismo invitation-only ya existe: planes ocultos sin invitación activa en
study_invitations — reutilizalo, no lo dupliqués).
1) Migración: agregar 'etapa_avanzada' al CHECK de study_plans.level y actualizar esos 3
   planes (por code: CDEB, HER, CDC). Marcarlos invitation-only si no lo están ya.
2) src/lib/studies/eligibility.ts: agregar el mapeo en LEVEL_TO_STAGE
   (etapa_avanzada → 'avanzada') y los requisitos de la etapa (iguales a intermedia).
   Actualizar el tipo stage en src/types/study.ts.
3) Catálogo estático src/data/study-catalog.ts: stage 'avanzada' en los 3 y nuevo grupo en
   STUDY_STAGES.
4) UI: agregar el optgroup/tab "Etapa Avanzada" donde se agrupa por etapa — form de nuevo
   grupo (optgroups líneas ~153-155 y ~224-232), página de matrícula (tabs/STAGE_META),
   /estudios/analisis y /estudios/plan.
Ojo: hay dos campos con nombre parecido — study_plans.level es la ETAPA;
study_plans.difficulty ('Básico/Intermedio/Avanzado') es dificultad y NO se toca.
Tests: elegibilidad de un plan etapa_avanzada (compromisos de intermedia + invitación).
```

### [x] EST-6 · Solicitudes de interés: texto claro + solo lectura — HECHO 2026-07-27 (disclaimer/toast/aviso de duplicado sin promesa de contacto y apuntando a Matrícula; RequestBoard gana prop `readOnly` — tab de intereses sin Tomar/Asignar/Resolver/Rechazar; API rechaza acciones para study_interest con 400 `solo_lectura`; reubicaciones intactas; históricas resueltas se siguen mostrando; /estudios/analisis no leía study_requests — sin impacto)
Archivos: `src/components/studies/StudyRequestActions.tsx` (disclaimer ~195-199, toast ~148), `src/app/(admin)/estudios/solicitudes/page.tsx`, `src/components/shared/RequestBoard.tsx`, `src/app/api/studies/requests/*`, `src/lib/supabase/queries/study-requests.ts`

```
Dos cambios sobre las solicitudes de estudio tipo "me interesa" (study_interest). Decisión
confirmada: quedan como DATOS DE DEMANDA de solo lectura, sin flujo de gestión. Las de
REUBICACIÓN (relocation) mantienen su flujo completo tal cual.
BUG REPORTADO (2026-07-28) que este punto debe dejar resuelto: en la vista de reubicaciones
aparecen mezcladas las solicitudes de interés de estudio. Son dos cosas distintas que
comparten la tabla study_requests: la separación por tipo debe ser estricta en TODAS las
vistas — la vista/tab de reubicaciones filtra SOLO relocation, y la de intereses SOLO
study_interest (revisá el filtro por tipo en la página y en el API /api/studies/requests;
lo ideal es que queden como dos vistas claramente separadas, no un board mezclado).
1) Texto del form (src/components/studies/StudyRequestActions.tsx): dejar claro que NO vamos
   a contactar a la persona. Reemplazar el disclaimer (~195-199) por algo como: "Esta
   solicitud es informativa: nos ayuda a ver qué estudios tienen demanda para abrir grupos
   nuevos. No te vamos a contactar — revisá la página de Matrícula, ahí van a aparecer los
   grupos nuevos cuando se abran." Y el toast de éxito (~148) por: "¡Gracias! Registramos tu
   interés. Revisá la página de Matrícula para ver cuándo se abren grupos nuevos." (quitar
   "Un coordinador la revisará pronto"). Ajustar también el mensaje de solicitud duplicada
   para no prometer gestión de un coordinador.
2) Quitar el flujo de gestión SOLO para study_interest en /estudios/solicitudes: sin asignar,
   sin tomar, sin resolver/rechazar — la lista queda de lectura (con sus datos: plan, días,
   horario, zona, fecha) como insumo de demanda. En RequestBoard es genérico: condicioná las
   acciones por tipo o no pasés assigneesUrl/acciones para interest; las relocation siguen
   con take/assign/resolve/reject. En el API (/api/studies/requests/[id]) rechazá las
   acciones de gestión para study_interest con 400 claro (o dejá solo un archivado simple si
   la UI lo necesita para limpiar la lista — decidilo mirando qué usa la página).
   No borrés datos históricos: las interest ya resueltas se muestran igual.
Revisá que /estudios/analisis (demanda) siga leyendo estas solicitudes igual. Tests del guard.
```

### [x] EST-7 · Bug: no deja resolver solicitud — HECHO 2026-07-27 (causa raíz: el submit se deshabilitaba con solo EXISTIR la prop `renderResolveExtra`, aunque devolviera null para ese tipo — quedaba deshabilitado para siempre en tipos sin picker; ahora solo exige `resolveExtra` si el form extra se renderiza. Además el picker ya avisa cuando no hay grupos elegibles, los 409 del server ya llegan al toast, y `direccion` ahora ve la página (podía ejecutar el PATCH sin verla))
Archivos: `src/components/shared/RequestBoard.tsx` (botón deshabilitado línea ~582), `src/components/studies/RelocationResolveGroupPicker.tsx`, `src/app/api/studies/requests/[id]/route.ts`, `src/lib/supabase/queries/study-requests.ts` (`resolveStudyRequest` ~356-522)

```
Bug reportado: "no me deja resolver solicitud de grupo" (reubicación). Diagnosticá y arreglá.
Causas candidatas ya identificadas (verificá en orden):
1) El botón "Confirmar resolución" queda deshabilitado mientras resolveExtra === null
   (RequestBoard ~582); lo llena RelocationResolveGroupPicker — si el picker no encuentra
   grupos elegibles (filtros muy estrictos, grupos no en_matricula, sin cupo), el botón
   nunca se habilita Y NO SE EXPLICA POR QUÉ. Como mínimo: mostrar un mensaje claro cuando
   el picker no tiene opciones ("No hay grupos abiertos elegibles para reubicar...").
2) Guards 409 de resolveStudyRequest: YA_RESUELTA (lista sin refrescar), YA_COMPLETADO,
   PAGO_PENDIENTE, YA_MATRICULADO — verificá que el toast muestre el mensaje del server.
3) Inconsistencia de roles: la página /estudios/solicitudes gatea con
   hasRole('coordinador_estudios','coordinador_dirigentes','admin') pero el PATCH exige
   requireRoles('direccion','coordinador_estudios','coordinador_dirigentes') — admin pasa
   cualquier guard, pero revisá que 'direccion' vea la página y que no haya rol que vea
   botones sin poder ejecutar.
Reproducí el escenario, arreglá la causa raíz y dejá mensajes de error accionables en la UI.
Nota: coordinar con EST-6 — esto aplica solo a reubicaciones, que mantienen su flujo.
```

### [x] EST-8 · Notas de estudios en el perfil — HECHO 2026-07-27 (grade/notes en el select de studyHistory + columna "Nota" ordenable en el historial; regla pura `grade-display.ts`: nota numérica manda, sin nota muestra el resultado, motivo de reprobado como tooltip; misma visibilidad del perfil, sin gate extra; sin migración; 4 tests)
Archivos: `src/lib/supabase/queries/members-detail.ts` (`studyHistory` ~360-382), `src/app/(admin)/miembros/[id]/_components/MemberParticipationTab.tsx` (`StudyRow` ~77, tabla ~186-272)

```
Las notas de los estudiantes ya se guardan al cerrar un grupo (study_enrollments.grade
numérica y study_enrollments.notes con "aprobado"/"reprobado: motivo") pero NO se muestran
en ningún lado del perfil del miembro. Agregalas al historial de estudios:
1) src/lib/supabase/queries/members-detail.ts: incluir grade y notes en el select de
   studyHistory (~360-382).
2) MemberParticipationTab.tsx: agregar grade/notes al tipo StudyRow y una columna "Nota" en
   la tabla de historial de estudios (~186-272): mostrar la nota numérica cuando exista;
   si no hay nota pero hay resultado en notes, mostrar el resultado; vacío → "—".
   El motivo de reprobado puede ir como tooltip o texto secundario.
Visibilidad: el historial ya respeta los permisos del perfil (scope own para miembro,
beyondOwn para staff); las notas siguen esa misma visibilidad, sin gate adicional.
Sin migración: las columnas ya existen. Test del mapeo grade/notes en members-detail.
```

### [x] COM-1 · Configuración de comunicaciones solo admin — HECHO 2026-07-27 (página con gate AccessDenied, link filtrado del sidebar, y POST/PUT/DELETE/verify de configs → requireRoles('admin'); decisión documentada: el GET queda para el módulo porque componer un mensaje elige remitente de ahí y la tabla no guarda secretos — las credenciales SMTP viven en env)
Archivos: `src/app/(admin)/comunicaciones/configuracion/page.tsx`, `src/app/api/communications/configs/route.ts`, sidebar/nav

```
La pantalla /comunicaciones/configuracion (remitentes/SMTP, channel_configs) debe quedar
accesible ÚNICAMENTE para el rol admin. Hoy el módulo de comunicaciones lo ven los roles
comunicaciones y direccion. Cambios:
1) Gate de la página /comunicaciones/configuracion: solo admin (los demás ni la ven en el
   menú/tabs de comunicaciones ni pueden entrar por URL — redirect o 404 consistente con el
   patrón del repo).
2) API /api/communications/configs (GET/POST/PUT): requireRoles('admin') — hoy
   probablemente acepta comunicaciones/direccion; verificá también endpoints hermanos de
   configuración de remitentes si existen.
3) El resto de comunicaciones (mensajes, plantillas, audiencias) queda igual para
   comunicaciones y direccion.
Test del guard (403 para comunicaciones/direccion, 200 para admin).
```

### [x] REV-3 · Unificar página de pagos y revisión de pagos — HECHO 2026-07-28 (página unificada en /finanzas/pagos con pestañas "Todos los pagos" / "En revisión (n)"; la cola completa (filtros REV-1, bulk, comprobante, recordatorio REV-2, modal de acciones) se extrajo a `PaymentReviewQueue` con handle imperativo — desde "Todos" un pago pendiente abre el modal de la cola con acciones, el resto abre detalle plano; /pagos/revision quedó como redirect a /finanzas/pagos?tab=revision; guard de GET /api/finance/payments ahora any-of ['finanzas','revision_pagos'] vía `hasModulePermission` (lógica pura nueva en roles.ts que requireModuleView delegó); excepción en ModuleGuard del layout espejo del guard; sidebar: una sola entrada "Pagos"; Devolver/Confirmar SINPE gateados por finanzas:edit para que los roles de revisión no vean acciones que les darían 403; tests de la matriz de acceso en payments-access.test.ts. BONUS: se arregló el lint roto del repo — el override de reglas react-hooks de eslint.config.mjs aplicaba a scripts/*.cjs donde el plugin no está registrado y ESLint abortaba; se acotó al patrón de eslint-config-next)
Archivos: `src/app/(admin)/finanzas/pagos/page.tsx` (+`[id]`), `src/app/(admin)/pagos/revision/page.tsx` (absorbe y desaparece), `src/app/api/payments/queue/route.ts`, `src/app/api/finance/payments/route.ts`, `src/lib/auth/roles.ts`, sidebar

```
Unificar /pagos/revision dentro de /finanzas/pagos: las dos páginas trabajan sobre la misma
tabla payments y casi la misma funcionalidad; la diferencia es que revisión tiene el modal de
acciones (aprobar/rechazar/iniciar revisión/reabrir/cerrar, vía /api/payments/[id]/review).
Decisiones confirmadas:
- La página unificada vive en /finanzas/pagos; /pagos/revision hace redirect ahí (mantener el
  redirect para links guardados y notificaciones internas que apunten a la ruta vieja).
- Los roles que hoy solo ven revisión (revision_pagos, folletos, coordinador_dirigentes,
  coordinador_estudios) pasan a ver TODOS los pagos en la página unificada. Actualizá el
  módulo/permiso en src/lib/auth/roles.ts para que esos roles tengan view del módulo de pagos
  completo, y el guard del API /api/finance/payments acorde. Las acciones de revisión siguen
  gateadas por requireModuleView('revision_pagos','edit') como hoy.
Implementación:
1) En /finanzas/pagos: integrar la cola de revisión como pestaña o filtro destacado
   ("En revisión" con contador), conservando los filtros que ya tiene revisión (estado de
   cola, concepto, y los de REV-1: plan y dirigente) más los propios de la página de pagos.
2) Traer el modal de detalle/acciones de revisión a la página unificada: cualquier pago se
   abre en el modal; si está en cola de revisión muestra las acciones de cambio de estado y
   el comprobante; si no, solo el detalle. Mantener los guards 409 anti-carrera existentes.
3) Eliminar la página vieja /pagos/revision (dejando el redirect) y actualizar el sidebar:
   una sola entrada "Pagos" visible para todos los roles involucrados.
4) Revisar consumidores: notificaciones internas con links a /pagos/revision, y el punto
   REV-2 pendiente del plan (botón de recordatorio) que ahora se implementa sobre la página
   unificada.
No cambiar la lógica de aprobar/rechazar ni la propagación por concept (RPC approve_payment).
Tests: acceso por rol (revision_pagos ve todos los pagos, miembro común no), redirect, y
que las acciones de revisión sigan funcionando desde la página unificada.
```

### [x] BEC-1 · Cupón/beca en el modal de pagos + correo al asignar cupón — HECHO 2026-07-28 (migración 20260728180000 aplicada: scholarships.email_sent_at/email_sent_to + plantilla `cupon_asignado` en BD. 1) Panel "Aplicar beca / cupón" en el modal de la cola (pagos pendiente/en_revision, roles becas|revision_pagos con edit): precarga la beca asignada vía GET /api/payments/[id]/scholarship-options y acepta código; POST /api/payments/[id]/apply-scholarship reusa resolveScholarshipForApplication + consumeScholarship (guard atómico, 409) con UPDATE optimista del pago y reversión si el cupón pierde la carrera; reglas puras en `scholarship-payment-rules.ts` (elegibilidad por concepto matricula/evento, moneda de becas fijas INT-2). 2) Botón "Enviar por correo"/"Reenviar" en cupones genéricos de /finanzas/becas con MemberCombobox; POST /api/scholarships/[id]/send-email registra email_sent_at/to y la UI avisa antes de reenviar; la aprobación de solicitudes ahora también registra su envío automático de beca_aprobada — decisión de alcance: para becas asignadas NO hay botón aparte porque el correo ya sale automático al aprobar. 3) Beca 100%: monto→0, method='scholarship', review_status='en_revision' y approve_payment (mismo RPC de revisión) — el pago queda aprobado sin comprobante y libera la matrícula/inscripción; parcial queda pendiente por el resto. BONUS: BECA_YA_USADA ahora mapea a 409 (antes caía como 500 en matrícula/eventos). 15 tests nuevos)
Archivos: modal de pagos de REV-3 (`src/app/(admin)/finanzas/pagos/*`), `src/lib/supabase/queries/scholarships.ts`, `src/app/api/scholarships/*`, `src/app/(admin)/finanzas/becas/*`, plantillas de email (`beca_aprobada`, `beca_aprobada_parcial`), `src/lib/supabase/queries/payments.ts`
Depende de: REV-3 (el modal unificado de pagos)

```
Tres mejoras al flujo de becas/cupones sobre pagos:
1) Aplicar cupón o beca desde el modal de pagos: en el modal unificado (REV-3), para un pago
   pendiente, agregar la opción de aplicar una beca asignada del miembro o un código de cupón
   (el canje ya existe para matrícula: /api/scholarships/applicable y el flujo de
   scholarship_redemptions — reutilizalo, incluyendo el guard atómico active→used con 409 si
   ya se usó). Al aplicar, recalcular el monto del pago con el descuento y registrar la
   redención vinculada al pago.
2) Botón "Enviar cupón por correo": cuando finanzas crea un cupón/beca y lo asigna a una
   persona (becas asignadas, y cupones genéricos si se asignan a alguien), agregar en
   /finanzas/becas un botón para mandarle un correo con el código y el mensaje de que la
   beca fue otorgada. Reutilizar las plantillas existentes (beca_aprobada /
   beca_aprobada_parcial, BD con fallback hardcodeado) o crear una hermana "cupon_asignado"
   siguiendo ese mismo patrón. Registrar cuándo se envió (no reenviar sin confirmación) y
   respetar el límite diario de email.
3) Beca completa (100%): al aplicarla en el modal, el monto del pago baja a 0 (o al
   equivalente si la beca es por monto fijo que cubre todo) y el sistema debe confirmar
   explícitamente que NO se necesita comprobante de pago: el pago queda aprobado/pagado sin
   pasar por la cola de revisión, el objeto pagado (matrícula, inscripción) se libera igual
   que con approve_payment, y la UI lo dice claro ("Cubierto por beca — no requiere
   comprobante"). Para becas parciales, el pago queda pendiente por el monto restante y el
   flujo de comprobante sigue normal.
Permisos: aplicar beca/cupón en el modal con los roles de becas/finanzas/revisión según
requireModuleView('becas') + revisión; enviar correo solo becas/finanzas/direccion.
Tests: beca completa → pago 0 aprobado sin comprobante; parcial → pendiente por el resto;
cupón ya usado → 409; correo se registra y no duplica.
```

### [x] REU-1 · Reubicación: días y zonas con selección múltiple — HECHO 2026-07-29 (migración 20260729100000 aplicada: study_requests.proposed_zones text[]; el form de reubicación pregunta día(s) libres (pills, sin el tope de 2 del interés), horario single (consistente con interés) y zona(s) múltiples desde activeSedes + "Cualquiera"; API valida/sanea server-side (dedupe, tope 10, 60 chars); las solicitudes VIEJAS con una zona en proposed_location se leen igual vía regla pura `request-prefs.ts` (requestZones con fallback); la cola muestra días/horario/zonas también para reubicaciones; el RelocationResolveGroupPicker ORDENA los grupos candidatos por coincidencia (zona pedida pesa 2, día 1 — relocationGroupScore mapea nombres de día → iniciales L/M/X/J/V del grupo y resuelve el CODE de sede a nombre con sedeLabel); 9 tests de las reglas puras. Solo flujo relocation — interés intacto)
Archivos: form de solicitar reubicación (flujo relocation en `src/components/studies/StudyRequestActions.tsx` o componente hermano), `src/app/api/studies/requests/route.ts`, esquema de `study_requests`

```
En el form de "Solicitar reubicación" (solicitudes tipo relocation de study_requests), debe
preguntarse qué días y qué zonas le sirven a la persona, ambos con SELECCIÓN MÚLTIPLE
(hoy el patrón del form de interés permite hasta 2 días y una sola zona). Cambios:
1) UI: checkboxes o multi-select de días de la semana y de zonas (zonas desde el catálogo
   activo vía useSedes, más "cualquiera"). Horario (mañana/tarde/noche) puede quedar como
   está o hacerse múltiple también — mantenete consistente con el form de interés.
2) Persistencia: revisar cómo guarda study_requests los días/zona (¿columnas simples o
   jsonb?); si es campo simple, migrar a array/jsonb sin romper las solicitudes existentes
   (las viejas con un solo valor se leen igual).
3) La cola de gestión de reubicaciones y el RelocationResolveGroupPicker (EST-7) deben
   mostrar los múltiples días/zonas y, idealmente, usar esas preferencias para ordenar o
   filtrar los grupos candidatos.
Coordinar con EST-6/EST-7: esto aplica SOLO al flujo relocation, que mantiene su gestión.
Tests del guardado múltiple y de lectura de solicitudes viejas.
```

### [x] PRE-7 · Prematrimonial: validación de género de la pareja + mensaje claro de documento — HECHO 2026-07-29 (1) Género: regla pura `premat-gender.ts` (5 tests) — M+F ok; mismo género → 409 `mismo_genero` con el mensaje de "error de selección" de la spec; género vacío o fuera de M/F → 409 `genero_faltante` que pide completar el perfil (nunca se trata como mismo género). Validado en spouse-search (devuelve FLAGS same_gender/gender_missing, nunca el género — privacidad), en el paso 1 del wizard (aviso + "Continuar" deshabilitado) y server-side en el POST. (2) Documento: la pantalla de bloqueo por cédula ahora captura el documento AHÍ MISMO (selector de tipo INT-1 + número, validación por tipo client-side) y lo guarda vía PATCH /api/members/[id] — que ya normaliza, valida por tipo y dedupea con 409 si pertenece a otro miembro; funciona en autoservicio (self) y onBehalf (staff). Mensaje según spec)
Archivos: `src/app/(admin)/matricula/prematrimonial/page.tsx` (wizard, paso 2), `src/app/api/studies/prematrimonial/route.ts`, `src/app/api/studies/prematrimonial/spouse-search/route.ts`

```
Dos validaciones en el wizard prematrimonial:
1) Género de la pareja: solo se realizan matrimonios entre hombre y mujer. Si la pareja
   seleccionada tiene el mismo género que quien se matricula (members.gender), bloquear con
   una validación clara pensada para el caso de ERROR de selección: mensaje tipo "La persona
   seleccionada tiene el mismo género registrado. Verificá que seleccionaste a la persona
   correcta; si el género en el perfil está incorrecto, contactá al equipo para corregirlo."
   Validar en ambos lados: UI (paso 2, al confirmar la pareja) y server-side en el POST de
   /api/studies/prematrimonial (409 con code, patrón del repo). Contemplar el caso de género
   vacío en alguno de los dos perfiles: en ese caso pedir que se complete el dato en el
   perfil antes de continuar, no bloquear como "mismo género".
   Para spouse-search: evaluar si conviene devolver el gender (o un flag same_gender) en la
   respuesta SIN exponer más datos personales de los necesarios.
2) Documento de identidad al matricular a nombre de otra persona: la regla existente exige
   que ambos tengan cédula registrada. Cuando quien está haciendo la matrícula es staff (o
   un familiar) y la persona matriculada aún no tiene cédula, el form debe pedir que se
   rellene ahí mismo, con mensaje CLARO: "Esta persona no tiene documento registrado. Ingresá
   su cédula o número de documento de identidad para continuar." — y guardar el documento en
   el perfil (normalizado, con el dedup 409 existente si ya pertenece a otro miembro).
   Nota: cuando se implemente INT-1 (documento por tipo), este campo hereda el selector de
   tipo; mientras tanto el texto ya habla de "cédula o número de documento".
Tests: mismo género → 409; género vacío → pide completar perfil; matrícula a tercero sin
cédula → pide documento y lo guarda con dedup.
```

### Feedback 2026-07-28

### [x] PAG-4 · Página de mis pagos: responsive, renombrar y link al historial — HECHO 2026-07-29 (1) full-width responsive: grid 2/3 pagos + 1/3 becas en desktop, apilado en móvil; las filas de MemberPaymentsList se apilan en pantallas angostas. (2) Renombrada a "Pagos pendientes" (título, pageTitles del layout y entrada del menú) — la ruta /mis-pagos NO cambió, así que los deep links de notificaciones siguen intactos sin redirect. (3) "Ver historial de pagos" → /miembros/[id]?tab=participacion&open=pagos; el perfil soporta ?open=<sección> vía regla pura `profile-deeplink.ts` con whitelist (3 tests) — abre el acordeón "Pagos y cobros" al cargar; el link respeta la pestaña de familia seleccionada (scope self/familia del guard existente). (4) Menú: debajo de Matrícula, visible para cualquier sesión. (5) Sección "Mis becas": endpoint nuevo GET /api/members/[id]/scholarships (guard self/familia/staff, espejo del de pagos) que lista solo becas ASIGNADAS (kind asignada) con concepto, descuento y estado; hint de beca activa ("se aplica automáticamente al pagar X"). EXTRA de la sesión: /estudios/plan (currículo) reabierto para cualquier sesión (decisión 2026-07-29 — el ModuleGuard de SEC-1 lo había cerrado y matrícula linkea ahí) + entrada "Plan de Estudios" en el submenú del dirigente.
Archivos: página de mis pagos (`/mis-pagos`, creada en PAG-1), sidebar/nav, `src/app/(admin)/miembros/[id]/_components/MemberParticipationTab.tsx` (acordeón de pagos)
Depende de: PAG-1

```
Cuatro ajustes a la página de mis pagos (la de PAG-1, visible para todos los miembros):
1) Layout full width y responsive: hoy no aprovecha el ancho ni se adapta bien a celular.
   Revisala en móvil (la mayoría de miembros entra desde el teléfono): tabla → cards en
   pantallas angostas, siguiendo el patrón responsive que ya usan otras páginas del admin.
2) Renombrarla a "Pagos pendientes" (título de la página, breadcrumb y entrada del menú).
   Mantener la ruta actual con redirect si se cambia el path, para no romper los deep links
   de las notificaciones de PAG-1/PAG-3.
3) Agregar un link "Ver historial de pagos" que lleve al historial que vive en el perfil
   del miembro, tab Participación, con el acordeón de pagos ABIERTO directamente: agregá
   soporte de query param en el perfil (p. ej. /miembros/[id]?tab=participacion&open=pagos)
   que seleccione el tab y expanda ese acordeón al cargar. Para el miembro común el link va
   a su propio perfil (respetando el scope own existente).
4) Posición en el menú: debajo de "Matrícula", visible para cualquier sesión (rol miembro
   incluido).
5) Sección "Mis becas" (agregado 2026-07-28): dentro de la misma página, una sección donde
   el miembro vea las becas y cupones ASIGNADOS a él: nombre/concepto, monto o porcentaje,
   estado (activa / usada / revocada) y a qué se aplica. Fuente: scholarships del miembro
   (kind asignada; las genéricas con código no se listan). Solo lectura y solo las propias
   (mismo scope self/familia del resto de la página). Si tiene una beca activa aplicable,
   un hint que la conecte con el pago pendiente correspondiente ("Tenés una beca activa
   para X — se aplica al pagar").
Tests: el deep link del acordeón, el acceso self-only y que solo listen becas propias.
```

### [x] EVE-3 · Página de eventos: renombrar "Resumen" a "Calendario" + permisos de botones — HECHO 2026-07-29 (1) el "Resumen" era el label default del primer sub-ítem del sidebar → Eventos usa summaryLabel "Calendario" (los tabs internos ya se llamaban Calendario/Lista/Cuadrícula). (2) Visibilidad para todos ya estaba (sidebar siempre + excepción del ModuleGuard para /eventos raíz; la página tiene vista de solo-inscripción para no-gestores) — verificado. (3) Botones por regla pura `page-actions.ts` (3 tests): "Compartir calendario" SOLO admin+comunicaciones (dirección quedó FUERA — antes la tenía) y /eventos/embed gana gate propio con AccessDenied (antes cualquier rol con módulo eventos entraba por URL); check-in usa EVENT_CHECKIN_ROLES (incluye direccion a propósito — es la constante que ya exigen los endpoints de check-in). El API de check-in ya exigía esos roles; compartir no tiene API (el embed construye el link del calendario público).
Archivos: `src/app/(admin)/eventos/page.tsx`, `src/lib/auth/roles.ts` (visibilidad del módulo), sidebar

```
Tres cambios en la página de eventos del admin (/eventos):
1) La vista/tab que se llama "Resumen" pasa a llamarse "Calendario" (título, tab y cualquier
   referencia en el menú).
2) Visibilidad: la página debe ser visible para TODOS los usuarios autenticados, incluido el
   rol miembro (ya funciona como vista de inscripción para no-gestores — verificá que el
   módulo eventos tenga view para cualquier sesión en roles.ts y que aparezca en el sidebar
   del miembro; cada bloque interno respeta su permiso).
3) Permisos de botones dentro de la página:
   - Botón "Compartir calendario" (el del embed/link público): visible SOLO para admin y
     comunicaciones.
   - Botón de check-in: visible SOLO para los roles de check-in (encargado_eventos y los que
     define EVENT_CHECKIN_ROLES — mantené admin, que siempre pasa; si direccion está en esa
     constante, decidí con el patrón actual y anotalo).
   Los gates son de UI Y de API: verificá que los endpoints detrás de cada botón ya exijan
   esos roles (el de check-in ya usa EVENT_CHECKIN_ROLES; el de compartir/embed revisalo).
Tests: página visible como miembro sin botones de gestión; botones visibles según rol.
```

### [x] SEC-1 · Fugas de permisos para el rol miembro — HECHO 2026-07-29, actualizado mismo día con la spec nueva: el rol miembro NO tiene dashboard — /dashboard lo redirige a su PERFIL (cubre post-login y raíz en un solo punto), el ítem del sidebar pasa a llamarse "Mi perfil", y se eliminó la vista simplificada (eventos y grupos viven en el perfil y /eventos); el punto 6 (ocultar /estudios, /estudios/solicitudes y resúmenes de gestión al miembro) ya quedaba cubierto por el ModuleGuard de la primera pasada. (Detalle de la primera pasada: auditado con 2 barridos + matriz automatizada. (1) DASHBOARD: /api/dashboard recorta el payload por módulo con beyondOwn (403 si nada aplica) y /api/dashboard/activity exige un módulo administrativo — antes cualquier sesión recibía KPIs de finanzas y audit_log; la vista de miembro ya no dispara esos fetches y sus paneles usan datos reales (eventos del endpoint PÚBLICO — antes 403 y bloque siempre vacío — y "Mis grupos" del propio perfil con deep link read-only). (2) ESTUDIOS: raíz del problema = NINGÚN endpoint honraba scope own; nuevo `studies-scope.ts` (puro, 9 tests): lista de grupos filtrada a leader/co-leader para dirigente (todas las variantes: paginada, ?all=1, ?include=enrollments, y la rama sin filtros que se escapaba), detalle+sessions con scope por relación (`viewer_scope`: admin/leader/member/none — miembro inscrito recibe SOLO su inscripción, sin roster ajeno), beyondOwn en leaders (evaluaciones+is_donor), analysis y prematrimonial; ModuleGuard: dirigente solo raíz/grupos/detalle-asistencia, miembro solo detalle de grupo; sidebar acorde. (3) Deep link "Ver grupo": el del perfil ya era correcto; el del dashboard era MOCK — bloque del dirigente reescrito con sus grupos reales y links al detalle; detalle de grupo con modo read-only (sin añadir/desinscribir/perfiles/WhatsApp editable). (4) SERVIDORES: rol miembro ya estaba bloqueado (module servidores); EXTRA hallado y cerrado: lider_comite recibía TODOS los comités con contactos → /api/servers/committees filtra a sus comités liderados (helper `moduleScope` en roles.ts). (5) MIEMBROS: ya estaba bien para miembro; EXTRA cerrado: lider_comite (scope committee) podía listar/EXPORTAR el padrón completo → GET/export/counts/ids exigen scope 'all' + sidebar/ModuleGuard acordes (a su gente la ve en /servidores). MATRIZ: scripts/access-matrix.ts (login real con seed users por rol contra BASE_URL) — 14 endpoints × 5 roles + 2 checks de contenido: verde. Notas: usuario seed estudios@ tenía 3 roles acumulados (limpiado a coordinador_estudios); pendiente conocido: detalle de perfil sigue accesible a lider_comite por URL (scope committee granular = cambio mayor, documentado); páginas de asistencia POST del dirigente siguen coordinador-only como antes — no se otorgaron permisos nuevos))
Archivos: `src/app/(admin)/dashboard/*` + `/api/dashboard`, `src/app/(admin)/estudios/*`, `src/app/(admin)/servidores/*`, `src/app/(admin)/miembros/page.tsx`, `src/lib/auth/roles.ts`, sidebar

```
Probando el sistema logueado como MIEMBRO (sin roles) se encontraron fugas de permisos.
Arreglalas verificando en cada caso el gate en TRES capas: sidebar (no mostrar), página
(redirect/404 al entrar por URL) y API (requireRoles/requireModuleView) — recordá que el
middleware excluye /api, así que cada endpoint debe defenderse solo.

1) DASHBOARD: el rol miembro NO tiene dashboard (decisión actualizada 2026-07-28: se
   elimina para miembros, no se recorta). La página default al loguearse como miembro es
   su PERFIL: cambiar el redirect post-login y el destino raíz según rol (roles de gestión
   siguen aterrizando en /dashboard). /dashboard con rol miembro → redirect al perfil.
   Igual verificá que /api/dashboard y /api/dashboard/activity no devuelvan datos de
   módulos que el rol no ve (defensa del API aunque la UI ya no exista para miembros).
   Los eventos de hoy y "mis grupos" que veía en el dashboard viven en el perfil y en
   /eventos (EVE-3), no se pierden.
2) ESTUDIOS como dirigente: un dirigente solo debe ver SUS grupos (scope own, permiso
   view/edit de sus grupos según ROLES). Hoy puede ver todo el módulo de estudios,
   incluyendo eliminar estudios y páginas internas (plan, bloques, dirigentes, análisis,
   solicitudes, folletos). Auditá TODAS las páginas internas de /estudios/* y sus APIs:
   dirigente accede solo a sus grupos (asistencia, sesiones, cierre de los suyos); el
   resto exige STUDY_ADMIN_ROLES como corresponde. El rol miembro no ve nada de /estudios
   de gestión.
3) "Mis grupos" (dashboard/perfil): el link "Ver grupo" abre la página general de grupos
   en vez del grupo específico. Debe deep-linkear al grupo referenciado
   (/estudios/grupos/[id]) en modo SOLO LECTURA para el miembro: puede VER su grupo
   (horario, dirigente, sesiones), no editar nada. Verificá que la página de detalle de
   grupo tenga vista read-only gateada para miembros del grupo (scope own vía su
   enrollment) sin exponer acciones ni datos de otros estudiantes más allá de lo necesario.
4) SERVIDORES: (a) las solicitudes (/servidores/vacantes/solicitudes, aplicaciones,
   position-requests) NO deben ser visibles para el rol miembro — ni páginas ni APIs.
   (b) La página de resumen de servidores debe mostrar SOLO los comités a los que el
   miembro pertenece; si el miembro no es servidor de ningún comité, NO tiene acceso a esa
   página (ni entrada en el sidebar).
5) MIEMBROS: la página /miembros (padrón) no debe estar disponible para el rol miembro
   (su propio perfil se accede por otra vía). Verificá página + APIs de listado/búsqueda
   (/api/members con beyondOwn ya existe — confirmá que el gate funcione y que el sidebar
   no muestre la entrada).
6) PÁGINAS ADICIONALES ocultas para el rol miembro (agregado 2026-07-28): la página de
   estudios bíblicos (/estudios y su resumen), la página de solicitudes (/estudios/
   solicitudes) y cualquier página de "resumen" de módulos de gestión. El miembro
   interactúa con estudios SOLO vía /matricula, su perfil (historial, mis grupos) y el
   detalle read-only de su grupo (punto 3). Mismas tres capas: sidebar + página + API.
Después de arreglar, hacé una pasada de verificación general: creá un test (o script) de
"matriz de acceso" que recorra las rutas principales con un usuario de cada rol clave
(miembro, dirigente, lider_comite) y confirme qué ve y qué recibe 403 — para que esto no
se vuelva a colar. Correr tsc, lint, vitest.
```

### [x] COM-2 · Tres plantillas de invitación a estudios — HECHO 2026-07-30 (seed `scripts/seed-invitation-templates.mjs`, idempotente): las 3 en message_templates, categoría `inscripcion`, is_system=false (editables/borrables desde /comunicaciones/plantillas). Guardan SOLO el cuerpo — renderEmail pone header navy + logo propio + footer + pie de baja; sin URLs de CCB. CTA coral al link de matrícula (editable) y bloque "¿Primera vez que entrás al sistema?" con los 4 pasos de AUTH-2, SIN links que expiren (solo el link al sistema; el enlace de crear contraseña lo pide cada persona). Cuerpos con placeholders "(editá…)" para fechas/horarios/zona/requisitos y reutilizarlas cada ciclo; las de seleccionados llevan la caja navy con la FECHA LÍMITE de matrícula. Fragmento reutilizable: el editor guarda HTML plano y no soporta includes, así que la fuente única del bloque es la constante FIRST_TIME_BLOCK del seed — re-correrlo actualiza las tres de una vez (documentado en el propio HTML). Verificadas con el pipeline real (applyVars + renderEmail): {nombre} resuelve, CTA a /matricula, bloque presente, sin CCB y sin tokens. PENDIENTE OPERATIVO: envío de prueba por SES (a confirmar con TI antes de mandar un correo real).
Archivos: `message_templates`, `/comunicaciones/plantillas`, referencia de diseño: `docs/referencias/theos_email_campa_servidores_preventa.html`

```
Crear tres plantillas de correo en message_templates (visibles en /comunicaciones/plantillas,
no is_system, editables por quien arma el broadcast). Las tres comparten estructura e
identidad visual de Theos (header navy #161440 con logo, CTA coral #EF5554, footer estándar;
ver docs/referencias/theos_email_campa_servidores_preventa.html como referencia de estilo,
pero SIN las URLs de CCB — logo desde asset propio y links al sistema nuevo):
1) "Invitación a Nivel 1 / Capacitaciones" — invitación abierta a inscribirse.
2) "Invitación seleccionados CDEB" — para quienes fueron elegidos tras la preinscripción
   (ver EST-10): tono de "fuiste seleccionado", con fecha límite de matrícula.
3) "Invitación seleccionados Hermenéutica" — misma idea, para HER.
Las tres llevan:
- CTA principal al link de la página de matrícula (editable).
- Un bloque "¿Primera vez que entrás al sistema?" con el paso a paso corto de AUTH-2:
  entrá al sistema → tocá "Creá tu contraseña" con este mismo correo → abrí el enlace que
  te llega → definí tu contraseña y matriculate. Sin links que expiren en el correo.
- Cuerpo editable (fechas, horarios, grupo, requisitos) para reutilizarlas cada ciclo.
Hacer el bloque de "primera vez" un fragmento reutilizable si el editor lo permite, para no
mantener el mismo texto en tres lugares. Probar el render en el preview y con envío de
prueba (SES).
```

### [x] EST-10 · Flujo de preinscripción CDEB (convocatoria → formulario → selección → invitación) — HECHO 2026-07-30 (compuesto sobre lo que ya existía, sin módulo nuevo. FORMULARIO: `scripts/seed-cdeb-preinscription-form.mjs` crea la preinscripción con el builder (24 campos: 6 bloques informativos con los textos exactos del brief, los 9 compromisos como checkbox obligatorio, la declaración doctrinal de 7 puntos + Sí/No, las 7 abiertas obligatorias, disponibilidad, la pregunta de grupo con OPCIONES DINÁMICAS y comentarios). REUTILIZABLE: título y code del plan salen de argv — `node scripts/seed-cdeb-preinscription-form.mjs "Preinscripción Hermenéutica" HER`; nada de "CDEB Madrid 2026" hardcodeado. Tipos nuevos del builder: `info` (bloque de texto sin input) y `options_source: 'study_groups_open'` (el servidor resuelve los grupos en matrícula del plan al abrir el formulario, más "No me sirve") — migración 20260730100000. Prellenado: `personal_data` trae nombre/teléfono/correo del perfil; `allow_multiple_responses=false` da la pantalla de "ya respondiste". SELECCIÓN: migración 20260730120000 `form_response_reviews` (una por respuesta, status pendiente/aprobado/lista_espera/rechazado, notas internas, trazas de invitación) con RLS y CERO policies. Módulo puro `src/lib/forms/selection-rules.ts` (16 tests): gate `SELECTION_REVIEW_ROLES`, reconocimiento del formulario por el campo de opciones dinámicas (de ahí sale el plan), filtros por doctrina/disponibilidad/grupo/nombre y las reglas de quién se puede invitar. Pantalla `/formularios/[id]/seleccion`: resumen, filtros, decisión por persona, notas internas, respuestas completas en modal y la recomendación de EST-9 al lado de cada uno. INVITACIÓN: botón que crea `study_invitations` (desbloquea el plan invitation-only) y manda la plantilla de COM-2 como broadcast TRANSACCIONAL (queda en Comunicaciones con su cola); marca `invited_at` para no repetir; los rechazados y los de lista de espera no reciben nada. CONVOCATORIA: botón que manda el link del formulario a quienes tienen recomendación ENVIADA y positiva de EST-9 y todavía no se preinscribieron, con la plantilla nueva "Convocatoria a preinscripción de dirigentes" — el sistema inyecta el link donde diga `{link_formulario}`. VISIBILIDAD: todo (GET incluido) gateado a coordinador_dirigentes/coordinador_estudios/admin; las respuestas viajan SOLO por ese endpoint, no por `/api/forms/[id]/responses`.)
Archivos: módulo de formularios (`forms`, `form_fields`, `form_responses`, `form_response_values`), `study_invitations`, cola del comité de dirigentes, `message_templates` (COM-2)
Depende de: COM-2. Relacionado: EST-5 (CDEB invitation-only), EST-9 (recomendaciones como fuente de audiencia)

```
Implementar el flujo completo de preinscripción a CDEB dentro del sistema (hoy vive fuera,
en un formulario de CCB). IMPORTANTE: no construir un módulo nuevo — componé las piezas
existentes: el módulo de FORMULARIOS (forms/form_fields/form_responses, con builder de
campos configurables) para el formulario, y STUDY_INVITATIONS (planes invitation-only) para
la invitación final. Lo único nuevo es el puente de revisión/selección.

Etapas:
1) CONVOCATORIA: se elige una audiencia (lista de miembros; idealmente pre-cargada con las
   recomendaciones de dirigentes de EST-9 que estén enviadas/aprobadas) y se les manda un
   correo con el link al formulario de preinscripción, usando el flujo de broadcasts.
2) FORMULARIO DE PREINSCRIPCIÓN construido con el builder. La persona ya está autenticada:
   nombre y teléfono se PRELLENAN del perfil, no se re-escriben. Contenido:
   - Encabezado de contexto: alegría por la preinscripción, que se evaluarán las respuestas,
     que si es aprobado se le enviará la invitación al curso, e invitación a orar antes de
     responder.
   - "Compromisos del dirigente": 9 checkboxes — comunicación constante con Dios en oración
     y lectura · preparar el estudio semanalmente con antelación · puntualidad en los
     estudios · testimonio ejemplar · escuchar y orar por los estudiantes aun fuera del
     estudio · asistir a las actividades de Theos e invitar al estudio · aportar
     económicamente a la misión de Theos Place · asistir a las charlas mínimo 2 veces al
     mes · usar las redes sociales sabiamente, dando el ejemplo.
   - Declaración Doctrinal de Theos (los 7 puntos completos: Biblia · relación íntima y
     pecado · salvación por gracia como regalo de Dios · Padre, Hijo y Espíritu Santo ·
     madurez espiritual · unión de los creyentes / cuerpo de Cristo · adoración y oración
     solo a Dios) + "¿Estás de acuerdo con la Declaración doctrinal de Theos?" Sí/No.
   - Abiertas obligatorias: cómo describirías tu relación con Dios · por qué querés ser
     dirigente y qué te motiva · si considerás la Biblia autoridad máxima, completa y veraz,
     y por qué · cómo explicarías el plan de salvación a alguien nuevo (con referencias
     bíblicas) · posición sobre relaciones sexuales fuera del matrimonio · posición sobre
     identidad de género · si tu testimonio inspira a otros y qué debés trabajar (con el
     texto de contexto de 1 Cor 11:1 y la invitación a contar luchas con pecado recurrente
     para poder acompañar el proceso).
   - "¿Tenés el tiempo para capacitarte (aprox. 2 meses) y tener a cargo un grupo de estudio
     con compromiso de 1 año luego de la capacitación?" Sí/No.
   - "¿Considerás que tenés el compromiso y el tiempo necesarios para prepararte y dirigir?"
     con el texto de contexto: modalidad presencial, posible pasantía de al menos 8 semanas,
     preparación semanal y seguimiento a estudiantes.
   - "¿Si sos seleccionado, cuál grupo te serviría?" — opciones DINÁMICAS desde los grupos
     CDEB abiertos (dirigente, dirección, día y hora), más "No me sirve".
   - Cierre amable ("si no te considerás listo, no es la última oportunidad — contanos en
     comentarios y más adelante te tomamos en cuenta de nuevo") + campo de comentarios.
   Si el builder actual NO soporta algún tipo de campo (bloque de texto largo informativo,
   grupo de checkboxes, opciones dinámicas desde grupos), decímelo ANTES de improvisar.
3) REVISIÓN Y SELECCIÓN (lo nuevo): pantalla donde el comité vea las respuestas, las compare
   y marque aprobado / rechazado / en espera por persona, con notas internas. Filtros:
   aceptó la declaración doctrinal, disponibilidad, grupo elegido. Si la persona tiene
   recomendación de EST-9, mostrarla al lado de su respuesta.
4) INVITACIÓN: botón que, para los aprobados, genere la invitación en study_invitations (lo
   que desbloquea el plan invitation-only) y dispare el correo "Invitación seleccionados
   CDEB" (COM-2) con link a matrícula. Rechazados/en espera no reciben nada automático.
Permisos: convocar, revisar y seleccionar → coordinador_dirigentes, coordinador_estudios,
admin. Las respuestas traen información personal sensible (luchas con pecado, posiciones
doctrinales): NO visibles para otros roles, mismo criterio de EST-9.
Reutilizable: debe servir para futuras convocatorias y para el mismo esquema en otro estudio
(p. ej. Hermenéutica) — no hardcodear "CDEB Madrid 2026".
Tests: creación de invitación desde la selección, gate de visibilidad, prellenado del perfil.
```

### [x] EST-9 · Cierre especial D3/Panorama: recomendación a CDEB por estudiante — HECHO 2026-07-29 (migración 20260729160000 aplicada: tabla `cdeb_recommendations` (member+group UNIQUE para el upsert del guardado parcial, enrollment_id, filled_by, status borrador/enviada, convicciones en jsonb, 4 escalas, textos y recomendación final) con RLS y CERO policies = deny-by-default, solo service role. Módulo puro `cdeb-recommendation.ts` (17 tests) con los textos exactos: encabezado de contexto, fecha prellenada con la del cierre + hint, convicciones POR EXCEPCIÓN (los 5 temas arrancan en "convicción firme"; marcar dudas/contraria abre su explicación OBLIGATORIA), escalas 1-5 como botones en fila con la etiqueta del nivel visible, opción X "sin información suficiente" SOLO en Panorama y solo para testimonio/pasión, textos libres obligatorios que aceptan "NA" (el de compromiso es el único opcional), recomendación final de 4 opciones. Botón "Recomendar para CDEB" POR ESTUDIANTE (solo aprobados) en la lista de cierre — el form se abre solo al tocarlo; muestra badge de borrador/enviada. NO bloquea el cierre: el borrador no se valida (ni en el cliente ni en el server) y se puede completar después; el envío valida en ambos lados. En DIS3/PAN el bloque simple de EST-3 SE OCULTA (nunca los dos juntos). VISIBILIDAD: `CDEB_REC_VIEW_ROLES` = coordinador_dirigentes/coordinador_estudios/admin — NI el miembro, NI el dirigente que la escribió, NI dirección; panel de solo lectura en la ficha Administrativa del perfil (con 403 no se pinta) y GET de la cola del comité que además marca si la persona YA tiene invitación activa a CDEB (conexión con el flujo invitation-only de EST-5). El dirigente del grupo SÍ puede escribir/editar su borrador (gate por leader/co_leader del grupo).)
Archivos: `src/app/(admin)/estudios/grupos/[id]/cierre/page.tsx`, `src/app/api/studies/groups/[id]/close/route.ts`, migración (tabla nueva), `src/lib/studies/close-recommendations.ts` (gate de EST-3), cola de dirigentes/CDEB

```
Cierre especial para grupos de Discípulos 3 (DIS3) y Panorama (PAN): al cerrar, el dirigente
puede recomendar estudiantes para capacitarse en CDEB (Cómo Dar Estudios de Biblia).
NO es para todos los estudiantes: es un botón "Recomendar para CDEB" POR ESTUDIANTE en la
lista de cierre; solo al tocarlo se abre el formulario de evaluación.

Principio rector: el dirigente llena esto en el celular, al final de un cierre. Que sea
CORTO. Aplicá estas simplificaciones (decididas con la usuaria):
- Prellenar lo que el sistema ya sabe: fecha de finalización = fecha de cierre del grupo
  (editable, con el texto "Si no lo has terminado, ingresá la fecha prevista"); dirigente y
  estudiante vienen del contexto, no se preguntan.
- Convicciones POR EXCEPCIÓN: los 5 temas (sexualidad y relaciones antes del matrimonio,
  mayordomía, autoridad de la Biblia, salvación por gracia, identidad de género) arrancan
  todos en "convicción firme" con la instrucción "Marcá solo los temas donde viste dudas o
  postura contraria". Al marcar "tiene dudas" o "postura contraria" en un tema, se abre su
  campo de explicación (obligatorio solo en ese caso). Sin observaciones = cero toques.
- Escalas 1-5 como botones en fila (no dropdown), con la etiqueta del nivel visible al
  seleccionar. Aplica a: Testimonio, Pasión por enseñar/dar a conocer a Jesús, Conocimiento
  bíblico, Expresión verbal. Testimonio y Pasión tienen además la opción "X - Sin
  información suficiente", disponible SOLO en grupos de Panorama (no en DIS3).
- Textos libres: TODOS obligatorios (decisión confirmada) — "Describa brevemente el
  testimonio del estudiante" (acepta "NA" si no lo compartió), "¿Le ha visto compartir su
  fe o invitar a alguien por iniciativa propia? Describa un ejemplo" (acepta "NA"),
  "Ejemplo o comentario sobre cómo se expresa" y "Comentarios adicionales para el comité de
  dirigentes". El único opcional es "Comentario adicional sobre su compromiso", que en el
  form original ya viene marcado como opcional.
- Recomendación final (obligatoria, una de cuatro): Sí, sin reservas · Sí, pero debería
  llevar otro estudio primero · Sí, con reservas (ver comentarios) · No lo recomiendo.
- Encabezado del form con el texto de contexto: que recomendar es una responsabilidad, que
  se ore antes, y que recomendar no asegura la invitación al curso porque se evalúan otros
  aspectos.

Implementación:
- Migración: tabla nueva (p. ej. cdeb_recommendations) por estudiante, ligada a
  member_id + group_id + enrollment_id, con el dirigente que la llenó, fecha, todos los
  campos anteriores y estado (borrador / enviada).
- El botón/form solo aparece en grupos cuyo plan es DIS3 o PAN. Reutilizá el gate de nivel
  de src/lib/studies/close-recommendations.ts (EST-3) extendiéndolo, no dupliqués la lógica.
- NO bloquear el cierre: el grupo cierra aunque las recomendaciones queden en borrador; el
  dirigente puede completarlas después desde su grupo cerrado. Guardado parcial automático.
- Destino: las recomendaciones enviadas alimentan al comité de dirigentes y se conectan con
  el flujo de invitaciones a planes invitation-only, que es como se entra a CDEB (ver EST-5:
  CDEB pasa a etapa avanzada, solo por invitación).
- VISIBILIDAD (decisión confirmada): la recomendación queda guardada en el PERFIL de la
  persona evaluada, pero visible ÚNICAMENTE para coordinador_dirigentes,
  coordinador_estudios y admin. Nadie más — ni el propio miembro, ni el dirigente que la
  escribió una vez enviada, ni direccion, ni otros coordinadores. Es información sensible.
  Aplicá el gate en la sección del perfil Y en el API que la sirve (el guard del /api es
  obligatorio: el middleware no protege /api).
- Relación con lo existente (decisión confirmada): si el grupo es DIS3 o PAN, el bloque
  simple de "Recomendar para (oración/servicio/dirigente)" de EST-3 SE OCULTA y solo se
  muestra este flujo. En los demás grupos (N4+, capacitaciones) el bloque simple sigue
  igual. No se muestran los dos juntos nunca.
Tests: visibilidad solo en DIS3/PAN, opción X solo en Panorama, convicciones por excepción
(explicación obligatoria solo al marcar dudas/contraria), cierre no bloqueado por borradores.
```

### [x] PRE-8 · Cierre especial para estudios prematrimoniales (evaluación de la pareja) — HECHO 2026-07-29 (migración 20260729120000 aplicada: tabla `prematrimonial_evaluations` ligada a request_id (UNIQUE, una por pareja) + group_id, con RLS habilitado y CERO policies = deny-by-default para clientes con sesión, solo service role — a propósito: la policy premat_select deja que la pareja lea su propia SOLICITUD, así que la evaluación no podía vivir ahí. Catálogos con los TEXTOS EXACTOS de la spec + validación en módulo puro `premat-evaluation.ts` (10 tests: los 10 temas, 6 fortalezas, 3 planes, punto ciego exige descripción). Grupo PREMAT detectado por plan code; el form (`PrematCoupleEvaluation.tsx`) sale en el paso 1 del cierre, UNA evaluación por pareja (parejas desde /premat-pairs = solicitudes con resulting_group_id), y bloquea Continuar hasta completarlas; el POST de cierre las EXIGE server-side (400 `evaluacion_requerida`/`evaluacion_invalida`), ignora request_id ajenos y las guarda ANTES del cierre con upsert por pareja (un retry del cierre no duplica ni pierde la evaluación). Plan de acción != 'listos' ⇒ SEGUIMIENTO: flag `needs_follow_up` en la cola prematrimonial (badge ⚑) y panel de solo lectura en la ficha Administrativa del perfil. VISIBILIDAD: contenido solo para coordinador_estudios/direccion/admin (`PREMAT_EVAL_ROLES`) vía GET /api/studies/prematrimonial/evaluations — coordinador_dirigentes PUEDE cerrar el grupo pero NO ve la evaluación (con 403 el panel simplemente no se pinta) y el plan concreto en la cola también se recorta a esos roles (el flag booleano sí lo ve quien ve la cola). El cierre de grupos no PREMAT no cambió en nada)
Archivos: `src/app/(admin)/estudios/grupos/[id]/cierre/page.tsx` (flujo de cierre actual), `src/app/api/studies/groups/[id]/close/route.ts`, `prematrimonial_requests`, migración para la evaluación

```
Los grupos de estudios tipo prematrimonial necesitan un CIERRE ESPECIAL, distinto del cierre
regular: además del resultado por estudiante, los mentores llenan una evaluación por PAREJA.
Detectá los grupos prematrimoniales por su plan (el flujo prematrimonial ya existe:
prematrimonial_requests, grupos creados desde esa cola) y mostrá este form de evaluación en
el cierre, una por pareja del grupo. Campos exactos (respetar textos y opciones):

1) "¿Sienten que la pareja logró afianzar su compromiso mutuo y con Dios a lo largo del
   curso?" — opciones: Sí / En proceso / Requiere atención.
2) "¿Cuáles son las mayores fortalezas o áreas de mayor madurez que observaron en la
   pareja?" — selección múltiple + texto libre opcional:
   Comunicación y resolución de conflictos · Alineación en principios espirituales y
   relación con Dios · Claridad y acuerdo en finanzas y metas · Manejo del pasado y
   familias de origen · Visión compartida sobre la crianza de hijos y roles · Intimidad y
   expectativas sobre la sexualidad.
3) "¿En cuál(es) de los 10 temas del curso consideran que la pareja necesita profundizar o
   seguir trabajando?" — selección múltiple:
   Relación con Dios · Compromiso matrimonial · Roles en el hogar · Resolución de
   conflictos · Manejo del pasado · Finanzas / Manejo del dinero · Hijos y crianza ·
   Relación con padres y suegros · Sexualidad e intimidad · Metas y plan de vida juntos.
4) "Observaciones específicas sobre las áreas a trabajar" — texto libre.
5) "¿Detectaron algún punto ciego, desacuerdo grave o tema no resuelto que pudiera generar
   fricción en el matrimonio?" — Sí/No; si Sí, campo de descripción breve.
6) "Plan de acción y recomendaciones de mentores" — una de tres:
   Listos para el matrimonio (cierre regular) · Recomendado un tiempo de consejería/
   mentoría enfocada en un tema específico · Se sugiere pausar o posponer la fecha de boda
   para abordar temas críticos.
7) "Bendición final" — texto libre (palabras de bendición).

Implementación:
- Migración: tabla nueva (p. ej. prematrimonial_evaluations) ligada a la pareja
  (prematrimonial_request_id) y al grupo, con quién la llenó y cuándo. No metás esto en
  study_enrollments: la evaluación es por pareja, no por estudiante.
- El resultado del punto 6 puede condicionar el cierre: "listos" → cierre regular de ambos;
  las otras dos opciones cierran el grupo igual pero dejan la pareja marcada para
  seguimiento (visible en la cola prematrimonial y en el perfil de ambos).
- SENSIBLE: esta evaluación contiene información pastoral delicada (punto 5 especialmente).
  Visibilidad restringida: solo coordinador_estudios, direccion y admin — NO aparece en el
  perfil general del miembro ni la ve el propio miembro. Definí el gate explícito en el API.
- El cierre regular de grupos no prematrimoniales no cambia en nada.
Tests: evaluación requerida por pareja al cerrar grupo premat, gate de visibilidad, cierre
normal intacto para otros planes.
```

### [x] PRE-9 · Wizard prematrimonial: ceremonia ajustada + antecedentes + diagnóstico — HECHO 2026-07-29 (migración 20260729140000 aplicada: 7 columnas nuevas en prematrimonial_requests con CHECK en las cerradas; venue_defined/venue_outside_gam NO se borran — datos históricos — y las solicitudes nuevas las guardan en false. (1) Ceremonia: se quitó la pregunta del lugar; queda la fecha con el COPY EXACTO de la spec (CEREMONY_DATE_QUESTION) + el flag definida/aproximada y la validación de +6 meses de PRE-3. (2) Sección "Antecedentes de la pareja" al final del paso 2: tiempo de novios, primer matrimonio (No → detalle obligatorio), hijos (Sí → edades obligatorias) y convivencia — textos y opciones exactos. (3) Sección "Diagnóstico" al inicio del paso 4, antes del pago (texto libre opcional). Validación en módulo puro `premat-background.ts` (11 tests) usada por el wizard (gate del Continuar en el paso 2) Y por el POST (400 `antecedentes_invalidos`) — fuente única; el detalle no se arrastra si la respuesta cambia (no guarda texto huérfano). La cola muestra los antecedentes ("—" en solicitudes viejas). SENSIBLE: previous_marriage_notes y diagnostic_notes se RECORTAN a null en el API de la cola para roles fuera de PREMAT_EVAL_ROLES (mismo criterio que PRE-8; coordinador_dirigentes ve la cola pero no esos dos campos))
Archivos: `src/app/(admin)/matricula/prematrimonial/page.tsx` (wizard), `src/app/api/studies/prematrimonial/route.ts`, migración en `prematrimonial_requests`, `src/components/studies/PrematrimonialQueue.tsx`

```
Tres modificaciones al form de matrícula prematrimonial (aparte de lo ya implementado:
fecha mínima +6 meses, zonas fijas, pregunta del oficiante, búsqueda de pareja):

1) Sección "Ceremonia": QUITAR la pregunta del lugar. Queda solo la fecha, con este copy
   exacto: "¿Tienen fecha definida o aproximada para la boda? (Si ya la tienen, indicá la
   fecha. Recordá que el curso debe iniciar mínimo 6 meses antes)." — mantiene el flag
   existente de fecha definida/aproximada y la validación de +6 meses ya implementada.
   Si el campo lugar existe en prematrimonial_requests, no borrés la columna (datos
   históricos); solo se deja de preguntar y de mostrar en el form.

2) Sección NUEVA "Antecedentes de la pareja" (después de los datos de la pareja):
   - "¿Cuánto tiempo tienen de estar de novios?" — opciones: Menos de 1 año / 1 a 2 años /
     3 a 4 años / Más de 4 años.
   - "¿Es el primer matrimonio para ambos?" — Sí/No; si No, campo de texto: "Por favor
     indicar brevemente la situación previo a este proceso."
   - "¿Tienen hijos de relaciones anteriores o en común?" — Sí/No; si Sí, campo para
     indicar edades.
   - "¿Actualmente viven en casas separadas o ya conviven juntos?" — opciones: Casas
     separadas / Ya convivimos.

3) Sección NUEVA "Diagnóstico" (al final, antes del pago):
   - "¿Existe alguna situación particular o conversación difícil que hayan estado evitando
     o que quisieran abordar con el apoyo de sus futuros dirigentes?" — texto libre,
     opcional.

Implementación:
- Migración: columnas nuevas en prematrimonial_requests (tiempo de novios, primer
  matrimonio + detalle, hijos + edades, convivencia, diagnóstico). Las solicitudes viejas
  quedan con esos campos null y se muestran como "—" en la cola.
- Validación server-side de las opciones cerradas (zod en el POST, patrón del repo).
- La cola prematrimonial (PrematrimonialQueue) muestra los datos nuevos a los gestores.
- SENSIBLE: el detalle de matrimonio previo y el diagnóstico son información pastoral
  delicada. Misma visibilidad restringida que la evaluación de cierre (PRE-8):
  coordinador_estudios, direccion y admin; no visibles para otros roles.
Tests: guardado de secciones nuevas, condicionales (No→detalle, Sí→edades), lectura de
solicitudes viejas sin los campos.
```

### Activación masiva de cuentas (feedback 2026-07-28; hacer en orden: AUTH-1 → AUTH-2)

### [x] AUTH-1 · Cuentas para todos los miembros + flujo "Crear mi contraseña" — HECHO 2026-07-28 (script `scripts/create-member-accounts.ts` (dry-run/--apply, reglas puras testeadas en `account-creation-rules.ts`) EJECUTADO: 18,100 miembros con cuenta (14,897+3,213 creadas hoy con password aleatorio y correo SIN confirmar + 6 enlazadas + las 16 previas); `account_confirmed_at` queda NULL hasta que la persona reclame — verificado que `resetPasswordForEmail` funciona con cuentas sin confirmar y el verify confirma (punto 3 gratis por el trigger espejo). Exclusiones: 5,096 sin correo, 76 MENORES DE 12 (regla agregada a mitad de corrida a pedido de TI; las 16 ya creadas se limpiaron — gotcha: deleteUser del admin API da 500 en este proyecto, se borró por SQL directo), 23 sistema, 4 inactivos, 5 con correo duplicado (decisión TI: duplicados SE IGNORAN — familias bajo un correo; el titular ve a su familia con su cuenta). 3,104 sin fecha de nacimiento se incluyen (edad indeterminable). Login con bloque "¿Primera vez? Creá tu contraseña acá" → `/recuperar?nueva=1` (mismo flujo de recuperación con copy de crear contraseña). PREREQUISITO VIGENTE para reclamar a escala: SMTP propio en Supabase Auth (Fase 0))
Archivos: script nuevo en `scripts/`, endpoint existente de crear cuenta (`/api/members/[id]/create-account`), `src/app/(auth)/login/page.tsx`, flujo de recuperación existente
Prerequisito operativo: SMTP propio configurado en Supabase Auth (pendiente de Fase 0) — sin eso, los correos de reset tienen rate limit y esto no escala.

```
Objetivo: que todos los miembros del padrón puedan entrar al sistema sin invitaciones que
expiran. Estrategia decidida: crear las cuentas masivamente con contraseña ALEATORIA que
nadie conoce (nunca una contraseña genérica compartida), y que cada persona la reclame con
el flujo de recuperación existente cuando quiera entrar.
1) Script one-off en scripts/ (service role, dry-run primero) que recorra members activos
   con correo válido y sin auth_user_id, y les cree el usuario de Supabase Auth con password
   aleatorio fuerte (no guardarlo en ningún lado), vinculando auth_user_id. Reutilizá la
   lógica del endpoint existente /api/members/[id]/create-account si es generalizable.
   Excluir: correos rebotados (email_bounced), con queja (email_complained), miembros
   is_system y desactivados. Reporte: creadas, excluidas por causa, y correos duplicados
   entre miembros (dos personas con el mismo email — listarlos, NO crear esas cuentas
   hasta resolver el duplicado).
2) Login (src/app/(auth)/login/page.tsx): agregar un bloque visible "¿Primera vez en la
   nueva plataforma? Creá tu contraseña acá" que lleve al flujo de recuperación existente
   (mismo mecanismo de forgot password, solo cambia el copy: "crear contraseña" en vez de
   "recuperar"). El correo de reset lo pide la persona a demanda, así la expiración del
   link deja de ser problema.
3) En el primer login exitoso, marcar account_confirmed_at si no lo hace ya el flujo.
Tests: script idempotente (correrlo dos veces no duplica), exclusiones correctas.
```

### [x] AUTH-2 · Correo masivo "Cambiamos de plataforma" + plantilla de cambios de sistema — PLANTILLA Y VERIFICACIONES HECHAS 2026-07-28; queda el ENVÍO (operativo). Plantilla "Cambio de sistema / anuncio de plataforma" creada en message_templates (no is_system, seed `scripts/seed-platform-announcement-template.mjs`): anuncio editable, paso a paso numerado 1-4 para celular, CTA coral al login, nota de confianza con correo de ayuda; SIN links de invitación ni tokens que expiran; verificada con el pipeline real (applyVars+renderEmail). VERIFICADO el límite diario: el sistema ENCOLA solo — `distributeEmailSchedule` reparte los destinatarios en bloques de EMAIL_DAILY_LIMIT (5,000/día) con `scheduled_date` y el cron procesa respetando el cupo del día, así que ~18k salen automáticamente en ~4 días sin batching manual. AUDIENCIA: ya existe el filtro "Cuenta sin activar" en el constructor de segmentos (condición `account`) — es exactamente los 18k de AUTH-1. Pasos operativos pendientes ANTES del envío real: (1) SMTP propio en Supabase Auth (Fase 0) — el broadcast sale por SES, pero los correos de "crear contraseña" que la gente pedirá al recibirlo salen por el SMTP de Auth y sin configurarlo se atascan; (2) prueba con lista pequeña (staff) desde /comunicaciones/nueva con la plantilla y audiencia manual.
Archivos: `message_templates`, `/comunicaciones` (broadcast), depende de AUTH-1
Depende de: AUTH-1 (las cuentas deben existir antes de invitar a la gente a entrar)

```
Crear una plantilla de correo reutilizable "Cambio de sistema / anuncio de plataforma" en
message_templates (la de /comunicaciones/plantillas, no is_system) y usarla para el
broadcast de lanzamiento. Contenido de la plantilla, con la identidad visual de Theos
(header navy #161440 + logo, CTA coral #EF5554, footer estándar):
- Anuncio editable: estamos cambiando de plataforma (de CCB al sistema nuevo).
- Paso a paso numerado, claro y para celular:
  1. Entrá a [URL del sistema] (botón CTA).
  2. Tocá "Creá tu contraseña" e ingresá este mismo correo donde recibiste el mensaje.
  3. Revisá tu correo y abrí el enlace — llega en segundos, usalo de una vez.
  4. Definí tu contraseña y listo: vas a poder ver tu perfil, matricularte y gestionar
     tus pagos.
- Nota de confianza editable: por qué reciben esto (ya eran parte del sistema anterior)
  y a dónde escribir si necesitan ayuda.
IMPORTANTE: el correo NO lleva links de invitación ni tokens que expiren — solo el link
al login. El link de reset lo pide cada persona a demanda.
Envío: usar el flujo normal de broadcasts con audiencia = miembros con cuenta creada en
AUTH-1. Ojo con EMAIL_DAILY_LIMIT (default 5000/día): para ~23k destinatarios planificar
el envío escalonado en tandas por día (por sede o alfabético) y documentarlo en el
broadcast; verificá cómo se comporta el sistema al tocar el límite diario (¿encola o
falla?) antes del envío real. Probar primero con una lista pequeña (staff).
```

### Calendario público y eventos (feedback 2026-07-26)

### [x] EVE-1 · Detalle de evento público + inscribirse con login — HECHO 2026-07-27 (modal con fecha completa, costo en colones y "requiere inscripción" — campos que el endpoint ya exponía con whitelist, sin campos nuevos; botón funcional con login-gate patrón /vacantes → `/login?redirect=/eventos?register=<id>`; deep link `?register=` en /eventos abre el modal de inscripción vía elegibilidad y limpia la URL; botón visible solo con requires_registration y respetando showBtn; 2 tests)
Archivos: `src/app/(public)/calendario/page.tsx` (modal, líneas ~249-264), `src/components/servers/PublicApplyButton.tsx` (patrón a copiar), `src/components/events/useEventRegistration.tsx`, `src/app/api/public/events/route.ts`

```
El calendario público (src/app/(public)/calendario/page.tsx) tiene dos problemas:
1) El modal de detalle muestra muy poca info (flyer, nombre, descripción, lugar, hora).
   El endpoint /api/public/events YA expone requires_registration, requires_payment,
   payment_amount y max_capacity pero el modal no los usa. Agregalos al detalle: costo
   (formateado en colones), si requiere inscripción, y fecha completa. NO agregués campos
   nuevos al endpoint público sin whitelist explícita (ver el comentario de seguridad en
   src/app/api/public/events/route.ts: nunca hacer spread del evento).
2) El botón "Inscribirse" es un <div> decorativo sin onClick (líneas ~96-99 y ~259).
   Hacelo funcional con login-gate, copiando el patrón de
   src/components/servers/PublicApplyButton.tsx (el login-gate de /vacantes):
   - Sin sesión: redirigir a /login?redirect=<destino>. El param redirect ya funciona
     (postLoginDest en src/app/(auth)/login/page.tsx lo valida en password, TOTP y passkey).
   - El destino post-login debe abrir la inscripción del evento: la vista de inscripción
     para miembros vive en /eventos (src/app/(admin)/eventos/page.tsx usa
     useEventRegistration). Agregá soporte de deep link ?register=<eventId> en /eventos
     que abra el modal de inscripción de ese evento al cargar, verificando elegibilidad
     con /api/eventos/elegibilidad como hace el flujo actual.
   - Con sesión activa: el botón lleva directo a /eventos?register=<eventId>.
   Mostrar el botón solo si el evento tiene requires_registration (y respetar el query
   param showBtn existente del widget).
El calendario es un widget embebible controlado por query params (view, types, colores,
showBtn...); no rompás esos params. Tests del deep link y del redirect post-login.
```

### [x] EVE-2 · Flyers de eventos en Supabase Storage — HECHO 2026-07-27 (bucket público `event-flyers` creado; endpoint `/api/events/upload-flyer` con MIME/5MB y roles de eventos; el form de crear sube y guarda la URL pública — editar NO tenía campo de flyer, solo crear; script one-off `scripts/migrate-event-flyers.mjs` ejecutado: 0 flyers base64 en prod; bucket registrado en storage-orphans con normalización URL→path; CSP img-src ya permitía el origen de Supabase. SEGUIMIENTO: quitar `data:` de img-src cuando se confirme que nada más lo usa)
Archivos: `src/app/(admin)/eventos/nuevo/_components/Step1Informacion.tsx` (dropzone, líneas ~116-180), `src/app/(admin)/eventos/nuevo/page.tsx` (~165-170, FileReader), `src/lib/events/form-mapper.ts:58`, patrón: `src/app/api/communications/upload-image/route.ts`

```
Hoy el flyer de eventos se guarda como data URL base64 DENTRO de la columna events.flyer_url
(se lee con FileReader.readAsDataURL en src/app/(admin)/eventos/nuevo/page.tsx línea ~165 y
form-mapper.ts lo guarda tal cual). Migralo a Supabase Storage:
1) Bucket nuevo event-flyers (público, como email-images). Documentar que se crea desde el
   dashboard de Supabase (los buckets no se declaran en migraciones en este repo).
2) Endpoint POST /api/events/upload-flyer siguiendo el patrón exacto de
   src/app/api/communications/upload-image/route.ts (validar MIME PNG/JPG/WebP, máx 5MB,
   createAdminClient, devolver getPublicUrl). Guard: los mismos roles que gestionan eventos
   (direccion, encargado_staff, comunicaciones).
3) Cambiar crear Y editar evento para subir al endpoint y guardar la URL pública en flyer_url
   en vez del base64. La dropzone actual (Step1Informacion.tsx) se mantiene; solo cambia el destino.
4) Migración de datos: script one-off que recorra events con flyer_url que empiece con
   "data:", suba el contenido al bucket y reemplace por la URL pública. Reportar cuántos migró.
5) Registrar el bucket nuevo en el cron de huérfanos src/app/api/cron/storage-orphans/route.ts.
6) CSP (src/lib/csp.ts): verificar que img-src permita el dominio de Storage de Supabase;
   cuando ya no queden flyers base64, anotar como seguimiento quitar data: de img-src.
Tests del endpoint de upload (MIME inválido, tamaño excedido).
```

---

## Fase 2 — Filtros del padrón (hacer los 3 seguidos, misma zona de código)

### [x] FIL-1 · Filtro de miembros: NO asistió a un evento — HECHO 2026-07-26 (negate como anti-join vía sets exclude existentes; eventId puntual con combobox; endpoint liviano `/api/members/event-options`; labels + 4 tests)
Archivos: `src/types/filters.ts`, `src/components/members/AdvancedFilters.tsx`, `src/lib/supabase/queries/members.ts` (evaluación `attendance`, líneas ~355-428), `src/lib/condition-labels.ts`

```
El filtro avanzado de miembros tiene condición attendance (por tipo de evento, sede, nombre,
rango de fechas y cantidad) contra event_checkins, pero no permite negación ni apuntar a un
evento puntual. Necesito poder construir: "dirigentes que NO asistieron al evento X"
(ej.: no fueron al campamento).
1) Agregá a la condición attendance en src/types/filters.ts un flag de negación
   (p. ej. negate: boolean) y opcionalmente eventId para un evento puntual.
2) En src/lib/supabase/queries/members.ts implementá la negación como anti-join
   (miembros del conjunto base que NO tienen check-in que cumpla el criterio). Ojo con el
   rendimiento: el padrón es ~22k; resolvé con conjuntos de ids como hace el código actual.
3) UI en src/components/members/AdvancedFilters.tsx (tab Asistencia): toggle "asistió / no asistió"
   y selector de evento puntual. Label del chip en src/lib/condition-labels.ts.
La negación se combina con las demás condiciones con el AND existente (el OR entre grupos se
hace en FIL-3, no lo toqués acá). Agregá tests de la query con negate.
```

### [x] FIL-2 · Filtro de miembros: por inscripción a evento — HECHO 2026-07-26 (condición `registration` contra event_registrations: evento puntual/tipo, estado del tiquete, rango sobre fecha del evento, negación anti-join; panel propio en el tab Asistencia; labels + tests)
Archivos: los mismos de FIL-1 + tabla `event_registrations`. Depende de: FIL-1

```
Siguiendo el patrón de la condición attendance del filtro avanzado de miembros, agregá una
condición nueva de INSCRIPCIÓN a eventos contra event_registrations (hoy solo existe asistencia
vía event_checkins). Debe soportar: evento puntual o tipo de evento, rango de fechas,
estado del tiquete (pending/paid/exempted/expired, con "cualquiera" como default), y el mismo
flag de negación que attendance (no inscrito). Con esto se pueden cruzar "inscritos y asistentes"
o "inscritos que no asistieron" combinando ambas condiciones con AND.
Tocá: src/types/filters.ts (nuevo tipo de condición), src/lib/supabase/queries/members.ts
(evaluación), src/components/members/AdvancedFilters.tsx (UI en el tab de asistencia o tab nuevo
"Eventos"), src/lib/condition-labels.ts (labels). Tests de la evaluación.
```

### [x] FIL-3 · Grupos OR en el filtro avanzado — HECHO 2026-07-26 (módulo compartido `filter-units.ts` con la semántica de unidades UI=server; resolución por condición; `groups`/`ops` viajan a /api/members, ids y export; caso status-en-OR relaja el escaneo base; 9 tests)
Archivos: `src/lib/supabase/queries/members.ts:189` (TODO), `src/components/members/QueryBar.tsx`, `src/hooks/useMemberFilters.ts`. Depende de: FIL-1 y FIL-2

```
El QueryBar del padrón (src/components/members/QueryBar.tsx) ya renderiza chips en grupos
AND-OR, pero la evaluación en src/lib/supabase/queries/members.ts (TODO en línea ~189) solo
combina condiciones con AND. Implementá los grupos OR: dentro de un grupo las condiciones se
unen con OR (unión de conjuntos de ids, siguiendo el patrón de sets que ya usa la query),
y entre grupos con AND (intersección). Cuidá el rendimiento con ~22k miembros: resolvé cada
condición a un Set de ids y operá en memoria como hace el código actual. Incluí las condiciones
nuevas de FIL-1/FIL-2 (negación y registration) en la lógica OR. Revisá que export, counts y
listas guardadas (/api/members/export, counts, member_lists) usen la misma evaluación.
Tests: (A OR B) AND C con casos de negación incluidos.
```

### [x] FEA-1 · Conectar plantilla `form_asignado` — HECHO 2026-07-26 (dispara al crear/guardar form activo asignado a evento/grupo; destinatarios = inscritos no expirados / matriculados enrolled; dedupe por `forms.assignment_notified_key` (migración 20260726150000, aplicada); respeta prefs `mensajes_sistema`; GET /api/forms/[id] relajado a sesión para que el link de llenado funcione a miembros; 4 tests)
Archivos: plantillas de sistema en `src/lib/email/`, `/api/forms`, asignación de forms a entidades

```
La plantilla de correo form_asignado existe (BD con fallback hardcodeado, junto a
form_completado) pero no está conectada a ningún disparador (decisión de 2026-07-17, ahora sí
se implementa). Conectala: cuando se asigna un formulario a una entidad (evento o grupo de
estudio) con destinatarios definidos, enviar el correo form_asignado a esos destinatarios con
el link al formulario. Seguí el patrón de despacho de form_completado y respetá preferencias
de notificación (src/lib/notifications/dispatch.ts) y el límite diario de email. Dedupe: no
reenviar si se re-guarda el form sin cambiar la asignación. Test del disparador.
```

---

## Fase 3 — Reglas de negocio de estudios y matrícula

### [x] PRE-5 · Nuevo requisito prematrimonial — HECHO 2026-07-27 (regla pura `premat-requirement.ts`: N1 completado + N2 enrolled/completed, nivel posterior implica anteriores; profile gana `enrolled_codes`; 409 `requisito_n2` con mensaje nuevo; `has_n2`→`meets_requirement` en spouse-search/enrollee; tarjeta de /matricula y wizard gateados con `premat_ok` server-side; 6 tests)
Archivos: `src/lib/supabase/queries/prematrimonial.ts` (`PREMAT_REQUIRED_CODE`, `hasCompletedN2`), `src/app/api/studies/prematrimonial/route.ts` (líneas ~71-75), `src/app/api/studies/prematrimonial/spouse-search/route.ts`, wizard y elegibilidad

```
Cambio de regla de negocio del curso prematrimonial. Regla actual: ambos de la pareja con N2
COMPLETADO. Regla nueva: ambos de la pareja con N1 completado Y al menos INSCRITOS en N2
(enrollment en estado enrolled o completed en un plan N2; waitlist/pendiente_de_pago NO cuentan,
completed de N2 obviamente sí).
1) Actualizá la validación en src/lib/supabase/queries/prematrimonial.ts (hasCompletedN2 →
   renombrala a algo como meetsPrematRequirement) y el 409 requisito_n2 en
   src/app/api/studies/prematrimonial/route.ts con mensaje acorde.
2) spouse-search devuelve has_n2: actualizá el flag al requisito nuevo (renombrar con cuidado
   de actualizar el consumidor en el wizard).
3) La opción de inscripción al prematrimonial NO debe aparecer a quien no cumpla: revisá dónde
   se expone la entrada al wizard (elegibilidad en /api/matricula/eligibility o la página de
   matrícula) y aplicá la misma regla ahí, server-side.
Regla adicional que ya existe y se mantiene: ambos con cédula registrada.
Actualizá los tests existentes de la validación y agregá casos: N1 completado + N2 enrolled (pasa),
N1 completado sin N2 (falla), N2 waitlist (falla).
```

### [x] EST-1 · Dirigente con grupo activo ⇒ activo automático — HECHO 2026-07-27 (create/update de grupo ya activaban; se agregó la excepción de campaña vía `leader-activation.ts`, activación en el grupo sucesor del cierre y en el grupo prematrimonial, y la excepción de campaña en el bloqueo de desactivación individual+bulk; 4 tests)
Archivos: `src/lib/supabase/queries/studies.ts` (`setDirigenteActive`, `bulkSetDirigenteActive`), `src/app/api/studies/dirigentes/bulk-status/route.ts`, asignación de dirigente en grupos (`/api/studies/groups`)

```
Regla: nunca debe haber un dirigente inactivo con un grupo en estado en_matricula o en_curso.
Excepción: estudios tipo campaña quedan fuera de la regla (identificá cómo se marca un plan
como campaña — etapa 'campaña' en la elegibilidad, src/lib/studies/eligibility.ts).
Implementá:
1) Al asignar un dirigente a un grupo (creación/edición de grupo, herencia al cerrar grupo
   sucesor), si el dirigente está inactivo y el grupo no es de campaña, activarlo
   automáticamente reutilizando setDirigenteActive de src/lib/supabase/queries/studies.ts
   (que ya maneja comité Dirigentes + rol dirigente). Registrá el cambio igual que una
   activación manual.
2) Ya existe el bloqueo inverso (bulk-status impide desactivar con grupo activo): verificá que
   cubra también la desactivación individual y la excepción de campaña (sí se puede desactivar
   si su único grupo activo es de campaña).
Tests: asignar dirigente inactivo a grupo normal → queda activo; a grupo campaña → sigue inactivo.
```

### [x] GRU-1 · Fechas de matrícula en grupos + cierre automático — HECHO 2026-07-27 (migración 20260727100000 aplicada; ventana en elegibilidad + guard `matricula_cerrada` en autoservicio con bypass de staff; cron `group-enrollment-windows` 12:30 UTC cierra en_matricula→en_curso con doble guard; forms crear/editar con precarga desde el bloque vigente para capacitaciones; se eliminó `signup_deadline` muerto; env opcional nueva `HEALTHCHECK_URL_GROUP_WINDOWS`; 5 tests)

> Nota de diseño: los grupos no tienen estado previo a `en_matricula`, así que la "apertura"
> no cambia estado — la VENTANA hace que el grupo aparezca en matrícula el día de
> `enrollment_start_date` (elegibilidad + guard server-side). El cambio manual siempre manda:
> el cron solo transiciona desde el estado esperado y nunca re-abre.
Archivos: `src/app/(admin)/estudios/grupos/nuevo/page.tsx`, `src/app/(admin)/estudios/grupos/[id]/editar/page.tsx`, `src/app/api/studies/groups/schema.ts`, migración SQL, `src/lib/studies/bloques.ts`, cron nuevo

```
Hoy el estado en_matricula/en_curso de los grupos se cambia manualmente y no existen fechas de
matrícula (hay un campo signup_deadline muerto en el tipo Step1 del form nuevo: eliminalo o
reutilizalo). Implementá:
1) Migración: agregar enrollment_start_date y enrollment_end_date (date, nullable) a study_groups.
2) Forms de crear/editar grupo: dos campos de fecha "Inicio de matrícula" y "Fin de matrícula",
   editables. Cuando el grupo pertenece a un bloque de capacitación, precargar los defaults
   desde las fechas del bloque (src/lib/studies/bloques.ts define los hitos), pero siempre
   editables. Validación: inicio <= fin, y fin <= fecha de inicio del grupo si existe.
3) Automatización: un cron diario (seguir el patrón de vercel.json + auth CRON_SECRET de
   src/app/api/cron/folleto-blocks/route.ts) que:
   - pase grupos a en_matricula cuando llega enrollment_start_date,
   - los saque de matrícula al pasar enrollment_end_date (pasan a en_curso si su fecha de
     inicio llegó, o dejan de aceptar matrículas).
   El cambio manual de estado sigue existiendo y tiene prioridad (el cron no revierte un
   cambio manual posterior — pensá cómo evitarlo, p. ej. solo transicionar si el estado es el
   esperado para la fecha).
4) La elegibilidad de matrícula (solo se ofrecen grupos en_matricula con cupo,
   src/lib/studies/eligibility.ts) no cambia; se apoya en el estado.
Agregá el cron a vercel.json con horario UTC coherente con los demás. Tests de la transición.
```

### [x] EST-2 · Importar cursos por Excel/CSV — HECHO 2026-07-27 (wizard /estudios/importar con preview server-side vía `dry_run`; validación pura `group-import-rules.ts`; dirigente solo por cédula normalizada → sin match = advertencia sin dirigente; zona debe existir (el import NO crea zonas); plantilla .xlsx con dropdowns de planes/zonas/días; import parcial; activa dirigentes EST-1; botón en /estudios; 6 tests)
Patrón a replicar: import de vacantes (`src/app/(admin)/servidores/admin/importar-vacantes/page.tsx`, `src/app/api/servers/vacancies/import/route.ts` + `import-template/route.ts`, `src/lib/supabase/queries/vacancy-import.ts`)

```
Agregá importación masiva de grupos de estudio desde CSV en la página /estudios, replicando el
patrón del import de vacantes (page + route thin + query de validación/upsert + endpoint de
plantilla descargable):
- src/app/(admin)/estudios/importar/page.tsx (wizard: cargar → preview con errores por fila → confirmar)
- src/app/api/studies/groups/import/route.ts y src/app/api/studies/groups/import-template/route.ts
- src/lib/supabase/queries/group-import.ts
Columnas de la plantilla: plan (código, ej. N1), sede/zona (resolver con resolveZoneCode de
src/lib/zones.ts), horario/día, fecha inicio, fecha fin, cupo, cédula del dirigente (opcional),
y las fechas de inicio/fin de matrícula de GRU-1 (opcionales).
Reglas:
- El dirigente SOLO se matchea por cédula normalizada contra members; si la columna viene vacía
  o no matchea, el grupo se crea sin dirigente y se reporta como advertencia en el preview.
- Validar plan existente, sede resoluble, fechas coherentes. Filas inválidas se reportan y no
  se insertan (import parcial permitido, como donaciones).
- Permisos: STUDY_ADMIN_ROLES (mismo guard que crear grupos).
Botón "Importar" en la página /estudios visible con esos roles. Tests de la validación por fila.
```

---

## Fase 4 — Pagos pendientes (bloque con dependencias internas; hacer en orden)

### [x] PAG-1 · Página "mis pagos pendientes" + notificación clic-para-pagar — HECHO 2026-07-27 (/mis-pagos con pestañas de familia y deep link ?pago=; componente compartido `MemberPaymentsList` extraído del perfil; endpoint de pagos permite familia vía canViewMemberProfile; notificación del auto-enroll ahora linkea /mis-pagos?pago=<id> y respeta prefs mensajes_sistema; ítem "Mis pagos" en sidebar para toda sesión)
Archivos: `src/app/api/members/[id]/payments/route.ts` (ya permite self-access), página nueva, `internal_notifications`, flujo de matrícula automática N2-N4

```
Necesito que un miembro pueda ver y pagar sus pagos pendientes:
1) Página nueva /mis-pagos (grupo (admin), visible para cualquier sesión sobre sí mismo):
   lista de pagos del miembro con estado pending o comprobante rechazado, usando el API
   existente src/app/api/members/[id]/payments/route.ts (ya soporta isSelf). Cada ítem se abre
   y permite subir/resubir comprobante (reutilizá el flujo de comprobantes existente,
   bucket payment-receipts y el patrón de /api/payments/[id]/receipt). Agregala al sidebar
   para el rol miembro.
2) Notificación de pago pendiente: cuando se genera una matrícula automática N2-N4 con pago
   pendiente (herencia de cohorte al cerrar grupo, src/app/api/studies/groups/[id]/close/route.ts),
   crear una notificación interna al miembro (insert en internal_notifications, seguí el patrón
   de src/lib/supabase/queries/payments.ts línea ~243) cuyo link abra directamente el pago
   correspondiente en /mis-pagos (deep link con el id del pago, que abra el modal/detalle de pago).
   Respetá las preferencias de notificación vía src/lib/notifications/dispatch.ts.
3) Las notificaciones internas deben soportar un link de destino si no lo tienen ya (revisá el
   esquema de internal_notifications y la página /notificaciones para que el clic navegue).
Anti-suplantación: la página solo muestra pagos propios o de familiares
(resolveTargetMemberId / family_member_ids del auth-context). Tests del deep link y del self-access.
```

### [x] PAG-2 · Bloquear matrícula con pago de estudios pendiente — HECHO 2026-07-27 (guard en enrollMember → 409 `pago_pendiente` con conteo; solo concepto matrícula bloquea — regla pura `pending-payments.ts` con tests estudio-bloquea/evento-pasa; excluye el pago del propio plan (caso PAGO_PENDIENTE); banner en /matricula con link a /mis-pagos vía `pending_study_payments` del eligibility; staff con STUDY_ADMIN puede matricular a terceros con override EXPLÍCITO `override_pago_pendiente` confirmado en modal)
Archivos: `src/lib/studies/eligibility.ts`, `/api/matricula/eligibility`, página de matrícula. Depende de: PAG-1

```
Regla: un miembro no puede matricularse en un estudio si tiene algún pago de ESTUDIOS/
capacitaciones pendiente (concepto matrícula con status pending o comprobante rechazado).
Pagos de eventos u otros conceptos NO bloquean.
1) Agregá el chequeo a la elegibilidad server-side (src/lib/studies/eligibility.ts y/o el
   endpoint /api/matricula/eligibility) devolviendo una razón clara (código tipo
   pago_pendiente con el conteo).
2) En la UI de matrícula, mostrar un aviso: "Tenés N pago(s) pendiente(s); para matricular
   debés completarlos" con link a /mis-pagos.
3) El staff con STUDY_ADMIN_ROLES puede matricular a terceros por encima del bloqueo
   (confirmalo con un override explícito en la UI de staff, no silencioso).
Ojo con no romper el flujo de pendiente_de_pago de la propia matrícula en curso: el pago que
la persona está por hacer en el wizard no debe bloquearse a sí mismo.
Tests: con pago de estudio pendiente → bloqueado; con pago de evento pendiente → pasa.
```

### [x] PAG-3 · Recordatorio semanal de pagos pendientes — HECHO 2026-07-27 (cron lunes 16:30 UTC, patrón CRON_SECRET + `HEALTHCHECK_URL_PAYMENT_REMINDERS`; regla pura `payment-reminder-rules.ts`: pendientes sí, en_revision no, rechazados solo dentro de las 72h; helper compartido `payment-reminders.ts` con prefs mensajes_sistema + dedupe diario hora CR — REV-2 lo reusa; email queda como punto de extensión documentado; 4 tests)
Archivos: cron nuevo `src/app/api/cron/payment-reminders/route.ts`, `vercel.json`. Depende de: PAG-1

```
Creá un cron semanal (lunes, horario UTC coherente con los demás crons de vercel.json, auth
Bearer CRON_SECRET, ping a healthcheck si la env existe — seguí el patrón exacto de
src/app/api/cron/payment-holds-expire/route.ts) que:
1) Busque todos los pagos con status pending (o comprobante rechazado aún dentro de la ventana
   de 72h del cron payment-holds-expire, para no recordar pagos que van a expirar igual).
2) Envíe a cada miembro UNA notificación interna consolidada ("Tenés N pagos pendientes") con
   link a /mis-pagos, respetando preferencias (src/lib/notifications/dispatch.ts, categoría
   mensajes_sistema o la que corresponda) y evitando duplicados si el cron corre dos veces el
   mismo día (dedupe por fecha).
3) Opcional email: usar el helper de email existente solo si hay plantilla; si no, dejar
   preparado el punto de extensión y enviar solo notificación interna.
Agregá HEALTHCHECK_URL correspondiente a la lista de envs opcionales. Tests del dedupe.
```

### [x] REV-2 · Recordatorio manual de pago — HECHO 2026-07-27 (POST `/api/payments/[id]/remind` con guard revision_pagos:edit, reusa el helper del cron con deep link `/mis-pagos?pago=<id>`; 409 `ya_recordado` (máx 1/día por pago), `silenciado` (prefs) y `no_recordable` (pagado/en revisión/rechazo vencido); botón "Enviar recordatorio" en el detalle de pagos pendientes con toast de confirmación o del motivo)
Archivos: `src/app/(admin)/pagos/revision/page.tsx`, API nueva `/api/payments/[id]/remind`. Depende de: PAG-1 y PAG-3

```
En la página de revisión de pagos (src/app/(admin)/pagos/revision/page.tsx) agregá una acción
por pago "Enviar recordatorio": POST /api/payments/[id]/remind (guard
requireModuleView('revision_pagos','edit')) que reutilice la misma lógica de notificación del
cron semanal de recordatorios (extraela a un helper compartido en src/lib/ si quedó embebida
en el cron): notificación interna al miembro con deep link a su pago en /mis-pagos.
Rate limit simple: no permitir más de un recordatorio manual por pago por día (409 con mensaje).
Mostrar confirmación en la UI y cuándo se envió el último recordatorio.
```

### [x] PRE-6 · Botón "solicitar beca" en prematrimonial — HECHO 2026-07-27 (reusa ScholarshipRequestModal con destino fijo al plan PREMAT — mismo flujo finance_requests/scholarship de la matrícula normal, sin flujo nuevo; el eligibility expone `premat_plan_id`; funciona en autoservicio y onBehalf; la solicitud queda open y el pago sigue pendiente hasta que becas resuelva — los emails beca_* ya existentes aplican)
Archivos: `src/app/(admin)/matricula/prematrimonial/page.tsx` (paso 4, pago), `src/lib/supabase/queries/scholarships.ts`, `src/app/api/scholarships/*`, `finance_requests`

```
El wizard prematrimonial no tiene opción de beca (paso 4 es pago fijo por pareja). Agregá un
botón "Solicitar beca" en el paso de pago que cree una solicitud de beca usando el flujo
existente de solicitudes (las solicitudes de beca viven en finance_requests filtradas como
scholarship — ver src/lib/supabase/queries/scholarships.ts y finance-requests.ts), asociada al
prematrimonial_request. Comportamiento tras solicitar: la solicitud queda open y el pago queda
pendiente hasta que becas la resuelva (revisá cómo lo maneja la matrícula normal con becas para
ser consistente: canje en src/lib, emails beca_aprobada / beca_aprobada_parcial / beca_rechazada
ya existen). No inventés un flujo nuevo: replicá el de matrícula. Test de creación de la solicitud.
```

---

## Fase 5 — Folletos (después de GRU-1)

### [x] FOL-1 · Nuevas reglas de folletos — HECHO 2026-07-27 (migración 20260727200000 aplicada: tipos `cupo_lleno`/`fin_matricula` + índice único parcial = 1 tiquete automático por grupo, race-safe; el tiquete es del PROPIO nivel del grupo con quantity=matriculados; dispara al confirmar la matrícula que llena el cupo y en el cron de ventanas al vencer con ≥5; manual intacto; QUITADO: generación en cierre (route+UI del wizard) y en hitos de bloque. ACOPLAMIENTO reportado: en processBloqueMilestones el aviso por hito, el sello `*_sent_at` y la creación compartían bloque — se quitó solo el insert; el aviso con conteos por sede y su dedupe siguen igual. Gap conocido: la matrícula automática N2-N4 pasa a enrolled vía approve_payment (SQL) sin chequear cupo — lo cubren el cron y el manual; 3 tests)
Archivos: `src/app/api/studies/groups/[id]/close/route.ts` (líneas ~42-91), `src/app/api/cron/folleto-blocks/route.ts`, `src/lib/supabase/queries/bloques.ts` (`processBloqueMilestones`), `src/lib/supabase/queries/folletos.ts`, `src/lib/studies/folletos.ts`. Depende de: GRU-1

```
Cambio de reglas de generación de folleto_requests. Las reglas nuevas REEMPLAZAN la generación
actual por cierre de grupo y por hitos de bloque. Los tiquetes se crean únicamente cuando:
1) Un grupo llega a su cupo máximo de matrícula (chequeo al confirmar cada matrícula en
   /api/studies/groups/[id]/enrollments: si enrolled == cupo, generar tiquete; idempotente,
   un solo tiquete por grupo).
2) Termina el período de matrícula (enrollment_end_date de GRU-1) Y el grupo tiene >= 5
   estudiantes matriculados (estado enrolled). Esto va en el cron diario de GRU-1 o en uno
   propio; idempotente igual.
3) De forma manual (ya existe: /api/studies/folletos/manual y ManualFolletoRequestButton — se mantiene).
Quitar: la generación en el cierre de grupo (src/app/api/studies/groups/[id]/close/route.ts,
bloque folleto.send) y la generación por hitos de bloque en processBloqueMilestones
(src/lib/supabase/queries/bloques.ts). OJO: el cron folleto-blocks puede tener otras
responsabilidades de notificación — quitá solo la creación de folleto_requests, no los avisos,
y decime si encontrás acoplamientos.
Mantener: estados lineales creada → en_impresion → enviado_entregado → cerrada, fecha estimada,
y las notificaciones a destinatarios (notifyFolletoRecipients). Actualizá los tipos de
folleto_requests si los actuales (cierre, preapertura_*) ya no aplican: agregá tipos nuevos
(cupo_lleno, fin_matricula) sin borrar los viejos de los datos históricos.
Tests: cupo lleno genera 1 tiquete (no 2 si se rematricula), fin de matrícula con 4 estudiantes
no genera, con 5 sí.
```

---

## Fase 6 — Refactor delicado

### [x] REF-1 · Regla de sede a fuente única — HECHO 2026-07-28 (migración 20260728100000 aplicada y verificada: SQL es la única implementación de producción — `refresh_member_sede(member_id)` nueva para el trigger + `refresh_member_sedes()` masiva del pg_cron, misma regla en el mismo archivo; el perfil y el export de servidores leen lo PERSISTIDO; `computeMemberSede` queda solo como especificación ejecutable de los fixtures, que pasan idénticos. Smoke en prod: 20/20 miembros idénticos al bulk. BONUS: el trigger por check-in usaba la REGLA VIEJA (sin ventana ni caso) — arreglado; y el muestreo previo (400 miembros, 91% paridad) reveló que el mapeo título→sede de TS no reconocía United (~9%) — al leer lo persistido, el perfil de esa gente deja de mostrar "sin sede". Frescura documentada: el flip activo→inactivo por paso del tiempo lo corrige el cron nocturno, ≤24h)
Archivos: `src/lib/sede-attendance.ts`, SQL `refresh_member_sedes`, `sede-rule-fixtures.ts`

```
La regla de sede del miembro vive triplicada: TS (src/lib/sede-attendance.ts), SQL
(refresh_member_sedes, que corre en el trigger de cada check-in) y las fixtures de contrato
(sede-rule-fixtures.ts). Evaluá opciones para reducirla a una fuente única sin perder el
trigger en tiempo real (p. ej. que TS delegue en la RPC, o generar el SQL desde las fixtures).
Antes de tocar nada, presentame un mini-plan con la opción recomendada y su riesgo: hay 160k+
check-ins históricos y el trigger corre en cada check-in, así que el rendimiento importa.
No cambiés la regla de negocio en sí, solo la arquitectura. Las fixtures de contrato deben
seguir pasando idénticas.
```

### [x] MNT-1 · Squash de migraciones (nuevo baseline) — HECHO 2026-07-30 (baseline `20260730193000_baseline_consolidado.sql` = volcado completo de producción; el baseline viejo (20260718150236) + las 32 migraciones posteriores quedaron en `supabase/migrations_archive/` (180 archivos de historia). Registro de producción reparado: las 33 viejas a `reverted`, el baseline nuevo a `applied` → `db push` dice "up to date" y `migration list` muestra una sola entrada. PROBADO DESDE CERO en un contenedor `supabase/postgres:17.6.1.127` limpio: aplica sin un solo error y reproduce exactamente lo que hay en producción (71 tablas, 200 policies, 71 con RLS, 42 triggers de public, 40 funciones de public + 4 de private). HUECOS ENCONTRADOS Y CERRADOS en el baseline (el anterior también los tenía: `supabase db dump` solo vuelca public/private): el trigger `trg_sync_member_account_confirmed` sobre `auth.users` (espejo de AUTH-1) y los TRES jobs de pg_cron que sí viven en la BD — refresh-donor-flags (30 6 * * *), refresh-member-sedes (45 6 * * *) y prune-audit-log (0 4 * * *); van en un bloque al final del archivo. Los buckets de Storage siguen fuera de migraciones: documentados en el encabezado del baseline (payment-receipts, employee-docs, email-images). Backup del esquema en `~/theos-backups/schema-2026-07-30.sql`. Nota operativa: el CLI necesita Colima corriendo para `db dump` y hay que pasar las versiones como argumentos separados a `migration repair`.)
Archivos: `supabase/migrations/`, `supabase/migrations_archive/`, tabla de migraciones de Supabase
Cuándo: al final, cuando se calme la ola de migraciones de este plan (GRU-1, EST-5, REV-3, INT-*). No correrlo a mitad de fase.

```
Consolidar las migraciones acumuladas desde el baseline anterior
(20260718150236_baseline_consolidado.sql) en un baseline nuevo, repitiendo el patrón que ya
se usó en este repo:
1) Verificar que producción esté al día con todas las migraciones pendientes.
2) Generar el esquema actual completo como nuevo archivo baseline (supabase db dump del
   schema, o diff limpio), incluyendo tablas, CHECKs, RPCs, triggers, políticas RLS y grants.
3) Mover las migraciones individuales posteriores al baseline viejo a
   supabase/migrations_archive/ (no borrarlas: son historia).
4) Marcar el baseline nuevo como ya aplicado en la tabla de migraciones de Supabase en
   producción (repair/insert del registro) para que no intente ejecutarlo de nuevo.
5) Probar en un proyecto/branch de Supabase limpio que el baseline levanta la BD de cero y
   que los tests pasan contra ese esquema.
OJO: los buckets de Storage no están en migraciones (se crean por dashboard) — documentar en
el baseline un comentario con los buckets requeridos (payment-receipts, employee-docs,
email-images, event-flyers si ya existe EVE-2).
```

### [x] FRM-1 · Rol `forms` + encargados por evento/formulario (feedback 2026-07-30)

> **PARTE A HECHA — 2026-08-04** (migración `20260804120000`, commits `df1ca21` + `dade10e` + `e3ecb0e`).
> Rol `forms` con el módulo formularios (view/create/edit/export, sin delete: borrar se lleva
> las respuestas). Desalineamiento cerrado: `comunicaciones` y `encargado_staff` ya declaran el
> módulo y los guards de escritura usan `requireModuleView('formularios', {action})`.
> Bug encontrado al probar: el rol no veía la entrada del menú porque Formularios cuelga de
> Comunicaciones — resuelto con `formsNavPlacement` (submenu | top_level | none).
>
> **PARTE B, A MEDIAS.** Hecho: acceso puntual **por formulario** (tabla `form_access_grants`,
> `formViewerScope` → admin|grantee|none, UI "Personas con acceso a este formulario" en el
> FormBuilder, aplicado en el listado, el detalle y las respuestas; `granted_form_ids` en
> `/api/auth/me` para el sidebar y el ModuleGuard).
>
> **PARTE B CERRADA — 2026-08-06** (migración `20260806100000_event_managers`).
> Encargados de un evento: tabla `event_managers`, `eventViewerScope` → admin|manager|none,
> `requireEventAccess` / `requireFormEdit` (`src/lib/auth/event-guard.ts`),
> `/api/events/[id]/managers` (GET/POST/DELETE, solo `EVENT_ADMIN_ROLES`), sección
> "⑥ Encargados de este evento" en el editor, `managed_event_ids` en `/api/auth/me`, y los
> tabs completos de SU evento vía `visibleEventTabs({isManager})`. El formulario del evento
> HEREDA el permiso (`formViewerScope({isEventManager})` → `event_manager`, que sí edita).
>
> **DESVÍO DEL PLAN, a propósito:** el plan pedía una tabla polimórfica `entity_managers`
> (entity_type/entity_id). Se hizo `event_managers` específica, con FK reales. Motivo: sin FK
> quedan filas colgando al borrar el evento y cada lectura tiene que validar el tipo a mano.
> Dos tablas chicas (`event_managers` + `form_access_grants`) se leen de un vistazo; la
> herencia evento→formulario vive en la función de permisos, no en la forma de la tabla.
> Decisión de TI, 2026-08-06.
Archivos: `src/lib/auth/roles.ts`, migración (CHECK de `member_roles` + tabla nueva), `src/app/api/forms/*`, configuración de evento y de formulario, patrón a copiar: `src/lib/auth/studies-scope.ts`

```
Dos cosas distintas, no las mezclés:

A) ROL GLOBAL `forms`
   Crear el rol nuevo `forms` (migración: agregarlo al CHECK de member_roles, hoy con 19
   roles) con el módulo `formularios`: view/create/edit/export sobre cualquier formulario.
   Aprovechá para ARREGLAR UN DESALINEAMIENTO existente: hoy el permiso de módulo
   `formularios` en roles.ts SOLO lo declara `direccion`, pero POST/PUT/DELETE de
   /api/forms exigen requireRoles('comunicaciones','direccion','encargado_staff'). O sea:
   comunicaciones puede crear y editar formularios pero no ve el listado ni las respuestas.
   Dejá los guards de escritura y el permiso de módulo consistentes entre sí.

B) ENCARGADOS DE UN OBJETO PUNTUAL (lo nuevo)
   Caso: la encargada de una actividad debe ver TODO de ese evento y su formulario
   (respuestas, inscripciones), y NADA de los demás eventos. Eso no es un rol: es permiso
   sobre un recurso. Hoy no existe el dato — event_volunteers está vacía y
   event_organizing_committees solo se usa para precios, no para autorizar.
   1) Migración: tabla genérica siguiendo el patrón polimórfico que forms ya usa:
      entity_managers (entity_type 'event'|'study_group'|'form', entity_id, member_id,
      granted_by, granted_at; UNIQUE por los tres primeros). Una sola tabla sirve para
      eventos, grupos y formularios sueltos.
   2) DÓNDE SE ADMINISTRA (decisión confirmada): en la configuración de la ENTIDAD, no en
      dos lados. En el evento se agrega la sección "Encargados de este evento". El
      formulario asociado HEREDA: si sos encargado del evento, ves su formulario y sus
      respuestas. Solo los formularios sueltos (entity_type='general', sin padre) tienen
      su propia lista de encargados en la configuración del formulario.
   3) Autorización: función pura tipo formViewerScope({roles, memberId, form, isManager})
      → 'admin' | 'manager' | 'none', copiando el molde de src/lib/auth/studies-scope.ts
      (groupViewerScope) — testeable sin Supabase. Para un form con entity_type='event',
      resolver isManager mirando entity_managers del EVENTO padre, no del form.
      Aplicá el scope en GET /api/forms (el manager ve solo los suyos en el listado),
      GET /api/forms/[id] y GET /api/forms/[id]/responses. El manager LEE y EXPORTA;
      editar la estructura del formulario sigue siendo de los roles globales.
   4) Acceso al evento: el encargado también debe poder ver los datos de SU evento
      (inscripciones, check-ins) sin tener el rol global de eventos. Aplicá el mismo scope
      en los endpoints del evento correspondiente.
   Quién nombra encargados: los roles que gestionan la entidad (para eventos: direccion,
   encargado_staff, comunicaciones, admin).
Tests: el manager de un evento ve solo su formulario y sus respuestas (403/404 en otro);
el rol forms ve todos; miembro sin nada no ve ninguno; nombrar y quitar encargado.
```

---

## Fase 7 — Feedback de agosto (uso real)

> Puntos levantados probando el sistema con usuarios reales, a partir del 2026-08-05.

### [x] GRU-2 · Restricción opcional de audiencia al crear un grupo de estudio

> **HECHO 2026-08-06** (migración `20260806140000_group_enrollment_restrictions`).
> Columna `study_groups.enrollment_restrictions` (jsonb) con el MISMO shape del filtro
> avanzado del padrón. Regla pura en `src/lib/studies/group-restrictions.ts`
> (normalización, resumen legible, mensaje del bloqueo); lectura y evaluación en
> `src/lib/supabase/queries/group-restrictions.ts`. UI: `AudienceRestrictionSection`
> (el MISMO `AdvancedFilters`, con la prop nueva `allowedTypes`) en crear y editar grupo,
> resumen en la ficha, y conteo del padrón en vivo vía `POST /api/studies/groups/restriction-count`.
> Guard server-side en `enrollMember` → 409 `restriccion_grupo` con el motivo. 18 tests.
>
> **DECISIONES CONFIRMADAS CON TI (2026-08-06):**
> · Punto 6 — el staff SÍ puede saltarse la restricción, con confirmación explícita en el
>   modal de "Añadir miembro" y registro en la bitácora (`logAudit`), igual que PAG-2.
> · Condiciones permitidas: solo las de AUDIENCIA (dirigente, servicio, estudio, edad,
>   estado civil, donante). Asistencia, inscripción a eventos, formularios, estado de
>   cuenta y fecha de creación quedan fuera — no describen a quién va dirigido un grupo y
>   son las caras de resolver. Agregar una es una línea en `ALLOWED_RESTRICTION_TYPES`.
>
> **CÓMO SE EVITÓ LA SEGUNDA IMPLEMENTACIÓN** (lo que pedía el plan): `evaluateUnits` ya
> era puro y recibe un callback, así que la semántica AND/OR se reusa tal cual. Lo que
> faltaba era el costo: `resolveAdvancedConditions` barría las ~18 mil fichas por
> condición. Se le agregó un ALCANCE opcional por miembro (`scopeIds`) que se propaga a
> todas las consultas; con eso, "¿esta persona cumple?" y "¿cuánta gente cumple?" son la
> MISMA función (`getMemberIds`). Medido en producción: 4.5 s → 0.26 s (dirigente) y
> 5.7 s → 0.62 s (completó N1).
Archivos: migración (`study_groups`), `src/types/filters.ts`, `src/components/members/AdvancedFilters.tsx`, `src/lib/studies/eligibility.ts`, `src/lib/supabase/queries/studies.ts` (`enrollMember`), forms de crear/editar grupo, `src/lib/condition-labels.ts`

```
FEATURE · Restricción opcional de audiencia al crear un grupo de estudio

Caso: a veces se arma un grupo de una capacitación dirigido solo a cierta gente — solo
dirigentes, solo líderes de comité, o solo quienes ya llevaron cierto estudio. Hoy no se
puede: la elegibilidad se calcula por PLAN (etapa, compromisos, prerequisitos) y todos los
grupos de un mismo plan se le ofrecen a cualquiera que califique.

Lo que quiero: un bloque OPCIONAL en la creación/edición de grupo, "Restringir este grupo
a…", que limite a quién se le ofrece ese grupo en la matrícula. Si no se usa, el grupo se
comporta exactamente como hoy.

REUTILIZAR, NO INVENTAR
El filtro avanzado del padrón (src/types/filters.ts + src/components/members/
AdvancedFilters.tsx) ya tiene un modelo de condiciones con tipos study, leader, service,
donor, attendance, age, status… y su UI de constructor. Usá ESE mismo modelo para las
restricciones del grupo, en vez de crear un esquema paralelo.
Antes de programar, revisá si el evaluador actual sirve o hace falta uno per-persona: el
del padrón trabaja por conjuntos de ids sobre todo el padrón, y acá se necesita responder
"¿esta persona cumple?" para un solo miembro. Si hace falta, extraé una función pura
evaluateConditions(member, conditions) y que ambos caminos la usen — no dos
implementaciones de la misma regla, que después se desincronizan.

1) MIGRACIÓN
Columna enrollment_restrictions (jsonb, nullable) en study_groups, guardando la lista de
condiciones con el mismo shape del filtro del padrón. Null = sin restricción.

⚠️ ALCANCE — NO CONFUNDIR CON LOS REQUISITOS DEL PLAN
La restricción es POR GRUPO, nunca por plan ni por etapa. Son dos cosas separadas que se
evalúan aparte:
  · El PLAN define los compromisos de la etapa (donante, servidor, asistencia,
    prerequisitos, invitación). Eso ya existe y NO se toca.
  · El GRUPO puede tener, además y opcionalmente, su propia restricción de audiencia.
Dos grupos del MISMO plan deben poder tener restricciones distintas, o uno tenerla y el
otro no. Ejemplo concreto que tiene que funcionar: dos grupos de la misma capacitación, uno
abierto a cualquiera que califique para esa etapa y otro restringido a dirigentes — y una
persona que no es dirigente ve solo el primero.
NO agregues la restricción a study_plans, ni la heredes del plan al crear el grupo, ni la
copies al grupo sucesor cuando se cierra un grupo y avanza la cohorte (ver la herencia de
dirigente/horario/zona en el cierre: la restricción NO se hereda salvo que yo lo pida).

2) UI EN CREAR Y EDITAR GRUPO
Sección colapsada "Restringir este grupo a… (opcional)" con el constructor de condiciones.
Casos que deben quedar cubiertos de una:
  - Solo dirigentes
  - Solo líderes de comité
  - Solo quienes completaron el estudio X
  - Combinaciones (por ejemplo dirigentes que además completaron X)
Mostrá un resumen legible de la restricción en la ficha del grupo, usando las mismas
etiquetas de src/lib/condition-labels.ts.

3) ELEGIBILIDAD
En src/lib/studies/eligibility.ts, la restricción del grupo se evalúa ADEMÁS de lo que ya
existe (etapa, compromisos, prerequisitos, invitación, grupo virtual, estado y cupo), nunca
en lugar de. Un grupo restringido no aparece entre las opciones de quien no cumple.

4) GUARD SERVER-SIDE
Al matricular (enrollMember), si la persona no cumple la restricción → 409 con código claro.
No alcanza con esconderlo de la UI: el staff que matricula a terceros pasa por el mismo
endpoint, y el deep link a un grupo también.

5) MENSAJE ÚTIL
Si alguien llega al grupo por deep link, o el staff intenta matricular a quien no cumple, el
mensaje debe decir POR QUÉ ("Este grupo es solo para dirigentes"), no un error genérico.

6) OVERRIDE DEL STAFF — DECIDÍ CONMIGO, no lo resuelvas solo
¿Los STUDY_ADMIN_ROLES pueden matricular a alguien saltándose la restricción del grupo?
Mi inclinación es que sí, pero con confirmación explícita en la UI y quedando registrado,
igual que el override de PAG-2. Preguntame antes de implementarlo.

7) VISTA DE CONTEXTO
En la ficha del grupo (y al guardar la restricción), mostrá cuántas personas del padrón
cumplen esa restricción. Es fácil armar una condición demasiado estrecha y darse cuenta
recién cuando nadie se matriculó; ver el conteo al momento lo evita.

TESTS
- Grupo sin restricción se comporta igual que hoy.
- Grupo restringido a dirigentes no aparece para un no-dirigente.
- El POST de matrícula devuelve 409 para quien no cumple.
- Combinación de dos condiciones.
- La restricción NO reemplaza los compromisos de la etapa (una persona que es dirigente
  pero no cumple la asistencia de la etapa sigue bloqueada).
- Dos grupos del mismo plan con restricciones distintas se ofrecen de forma distinta.
- Al cerrar un grupo, el sucesor NO hereda la restricción.
```

### [x] FRM-2 · Hero/header con flyer en los formularios

> **HECHO 2026-08-06** (migración `20260806160000_form_hero`, bucket `form-heroes` creado).
> Columnas `hero_image_url` / `hero_title` / `hero_subtitle` en `forms`; sección
> "Encabezado (opcional)" en el builder con dropzone, vista previa y quitar;
> `FormHero` compartido por el formulario público y la vista previa;
> `POST /api/forms/upload-hero` con el patrón de EVE-2. 12 tests.
>
> **DECISIONES (las dos que el plan pedía justificar/avisar):**
> · COLUMNAS en `forms`, no un tipo de campo. Una fila de form_fields es una PREGUNTA:
>   arrastra orden, validación de obligatorios, lógica condicional, export y
>   form_response_values. El hero no se responde — es del formulario, como su título y
>   su descripción, que ya son columnas.
> · BUCKET PROPIO `form-heroes`, no `event-flyers`. Los formularios existen aparte de los
>   eventos (hay de estudios, encuestas y sueltos); un bucket llamado "de eventos" con
>   imágenes que no son de eventos hace imposible razonar después sobre qué se puede
>   limpiar. Público, tope 5 MB, MIME limitado a jpeg/png/webp EN EL BUCKET (además de la
>   validación del endpoint). Verificado en producción: sube, se lee anónimo y rechaza GIF.
Archivos: builder de formularios (`src/app/(admin)/formularios/*`), tablas `forms` / `form_fields`, `src/components/forms/FormFiller.tsx`, patrón de upload: `src/app/api/events/upload-flyer/route.ts` (EVE-2)

```
Al crear un formulario hay que poder agregarle un HERO/HEADER con imagen (flyer), para que
el formulario se vea como una pieza de comunicación y no como un cuestionario pelado.
Es un componente nuevo.

1) MODELO: agregá al formulario los campos del hero — imagen (URL), título y subtítulo o
   texto de bienvenida opcionales. Decidí mirando el esquema si van como columnas en `forms`
   (hero_image_url, hero_title, hero_subtitle) o como un tipo de campo nuevo en form_fields;
   mi inclinación es columnas en `forms`, porque el hero es del formulario, no una pregunta
   más — pero justificá lo que elijas.
2) UPLOAD: reutilizá el patrón de EVE-2 (bucket público, validación de MIME PNG/JPG/WebP y
   tamaño máximo, createAdminClient, getPublicUrl). Decidí si va al bucket de event-flyers
   o a uno propio para formularios y decímelo. NO guardes la imagen como base64 en la
   columna: ese fue justamente el problema que EVE-2 vino a arreglar en eventos.
3) BUILDER: sección "Encabezado (opcional)" arriba del constructor de campos, con dropzone
   y vista previa. Debe poder quitarse.
4) FORMULARIO PÚBLICO/LLENADO (FormFiller): renderizar el hero arriba, responsive — la
   mayoría lo abre desde el celular, así que la imagen no puede desbordar ni empujar el
   primer campo fuera de pantalla. Sin hero, el formulario se ve igual que hoy.
5) Que aparezca también en la vista previa del builder.
Tests del upload (MIME inválido, tamaño excedido) y del render sin hero.
```

### [x] COM-3 · Bug: "usar plantilla" desde nueva comunicación no carga el contenido

> **HECHO 2026-08-06**, junto con los bugs del editor de plantillas — era la MISMA causa raíz.
> El `useEffect` de sincronización de `EmailEditor` dependía solo de `[mode]`, no de `[value]`:
> al aplicar una plantilla, el contenido se setea DESPUÉS de que el editor ya montó y el
> editor nunca se enteraba. Se agregó `value` a las dependencias (la guarda
> `getHTML() !== value` evita el reseteo en cada tecla). Además, los dos caminos ahora usan
> UNA sola `applyTemplate(tpl, {setChannelToo})` — antes eran dos bloques casi iguales y ya
> se habían desincronizado: el de esta pantalla no seteaba el canal.
Archivos: `src/app/(admin)/comunicaciones/nueva/page.tsx`, `src/app/(admin)/comunicaciones/plantillas/*`, editor de correos

```
BUG reportado en uso real. Hay dos caminos para usar una plantilla y solo uno funciona:
  · Desde /comunicaciones/plantillas → botón "Usar" → FUNCIONA: el contenido se carga en el
    editor y se puede editar.
  · Desde la pantalla de nueva comunicación → botón "Usar plantilla" → ROTO: el contenido no
    se jala al panel izquierdo donde se muestra el cuerpo del correo, así que la plantilla no
    se puede editar.

Compará los dos caminos y arreglá el segundo para que use el mismo mecanismo que el primero
(probablemente uno pasa el contenido por navegación/estado inicial y el otro lo setea después
de que el editor ya montó, o lo escribe en un estado que el editor no observa). NO dupliques
lógica: extraé la carga de plantilla a una sola función que usen ambos caminos, para que no
se vuelva a desincronizar.
Verificá que después de cargar la plantilla se pueda editar libremente, que el asunto
también se cargue, y que cambiar de plantilla reemplace el contenido en vez de acumularlo.
Test de ambos caminos.
```

### [x] EVE-4 · Evento con formulario de inscripción y encuesta de satisfacción programada

> **HECHO 2026-08-06** (migración `20260806180000_event_form_and_survey`, cron nuevo).
>
> **DECISIONES CONFIRMADAS CON TI (2026-08-06), las dos que el plan pedía:**
> · (A) La inscripción SIGUE siendo `event_registrations` —cupo, pago y check-in— y la
>   respuesta del formulario se le ENLAZA (`event_registrations.form_response_id`). El
>   enlace se hace en `submitResponse`, no en el endpoint, para que valga por cualquier
>   camino: el botón del evento, el link directo o el staff respondiendo por alguien.
> · (B) La encuesta va a quienes hicieron CHECK-IN, no a todos los inscritos. Es fijo, y
>   se dice en la pantalla al programarla.
>
> Columnas: `registration_form_id`, `survey_form_id` / `survey_template_id` (CHECK: uno u
> otro), `survey_offset_hours` (la regla), `survey_send_at` (el momento CALCULADO — es lo
> que mira el cron), `survey_sent_at` + `survey_sent_count` (dedupe y estado).
> Reglas puras en `src/lib/events/survey-schedule.ts`; despacho en
> `src/lib/email/event-survey-notify.ts` (prefs `mensajes_sistema`, dedupe por el sello,
> techo `DAILY_LIMIT` compartido entre eventos); cron `/api/cron/event-surveys` 17:00 UTC
> con el patrón de siempre (CRON_SECRET + `HEALTHCHECK_URL_EVENT_SURVEYS` opcional).
> Plantilla del sistema nueva: `encuesta_evento`. 28 tests.
>
> **Verificado en producción antes de activar el cron:** de 3.372 eventos, 0 quedan en la
> condición de despacho — encender el cron no le manda un correo a nadie por accidente.
Archivos: crear/editar evento (`src/app/(admin)/eventos/nuevo`, `[id]/editar`), `events`, módulo de formularios, `message_templates`, cron nuevo o el de recordatorios

```
Dos capacidades nuevas al crear un evento, ambas OPCIONALES:

A) FORMULARIO DE INSCRIPCIÓN
   Poder elegir un formulario existente (o crear uno) que se use para inscribirse al evento.
   Hoy los formularios ya se asocian a entidades (forms.entity_type = 'event' + entity_id),
   así que la pieza existe — falta el selector en la creación del evento y que la
   inscripción pase por ese formulario.
   Definí y decime cómo queda la relación con event_registrations: ¿la respuesta del
   formulario ES la inscripción, o son dos cosas que se enlazan? Mi inclinación: la
   inscripción sigue siendo event_registrations (que es lo que maneja cupo, pago y check-in)
   y la respuesta del formulario queda enlazada como información adicional. Confirmámelo
   antes de implementar.

B) ENCUESTA DE SATISFACCIÓN PROGRAMADA
   El campo events.requires_survey ya existe pero no tiene flujo. Construilo:
   - Al crear el evento, si se marca que requiere encuesta, poder elegir QUÉ se envía:
     un formulario existente o una plantilla de correo ya creada (message_templates).
   - Y CUÁNDO se envía: momento relativo al fin del evento (por ejemplo "2 horas después",
     "al día siguiente", "3 días después") o una fecha y hora exactas. Guardá el momento
     calculado, no solo la regla, para que el envío sea predecible.
   - A QUIÉNES: definí el default y hacelo visible — mi propuesta es a quienes hicieron
     check-in, no a todos los inscritos (quien no llegó no tiene qué evaluar). Confirmámelo.
   - ENVÍO: un cron que despache las encuestas cuyo momento ya pasó, siguiendo el patrón
     exacto de los crons existentes (vercel.json, auth Bearer CRON_SECRET, ping a
     healthcheck si la env existe, dedupe para no reenviar si corre dos veces).
     Respetá preferencias de notificación y el límite diario de correos.
   - En la ficha del evento, mostrar el estado de la encuesta: programada para tal fecha /
     enviada a N personas / N respuestas.
Permisos: los mismos que gestionan eventos (direccion, encargado_staff, comunicaciones).
Tests: evento sin encuesta se comporta igual; el cron no reenvía; la encuesta programada a
futuro no se manda antes de tiempo.
```

### [x] EST-11 · Plan de estudios: EB desactivados solo para staff + campañas al final

> **HECHO 2026-08-06.** Regla pura en `src/lib/studies/plan-visibility.ts` (orden canónico
> de etapas, `canSeeArchivedPlans`, `visiblePlans`), usada por la página Y por
> `GET /api/studies/plans` — el miembro ya no los recibe en el payload aunque adivine la
> URL. 9 tests.
>
> **CAUSA DEL BUG DEL ORDEN:** no era `STUDY_STAGES` (ya tenía campañas al final) ni las
> secciones visuales (también correctas). Era el listado plano de la tabla: un desempate
> `isInvTail` empujaba CDEB y CDC al fondo de TODA la lista ANTES de comparar la etapa, así
> que las campañas quedaban entre Hermenéutica y esos dos. El orden dentro de la etapa
> avanzada ya lo pone `TAIL` en `withinStage`, así que ese desempate sobraba: se eliminó.
>
> `/matricula` y `/estudios/analisis` se revisaron y ya estaban bien (la primera tiene su
> `STAGE_ORDER` correcto, la segunda no lista niveles ni campañas y ya excluía los
> desactivados).
>
> **Impacto medido en producción:** de 40 planes, 9 están desactivados (LECTPROP, PAREJAS,
> PLANDANIEL, QEJ, TEOAT, APO, EFE, GAL, MDM). Esos 9 los veía cualquiera con sesión,
> incluido el rol miembro; ahora solo los ve quien administra estudios.
Archivos: `src/app/(admin)/estudios/plan/*`, `src/data/study-catalog.ts` (`STUDY_STAGES`), `src/lib/studies/eligibility.ts` (`LEVEL_TO_STAGE`)

```
Dos arreglos en la página del plan de estudios:
1) Los estudios DESACTIVADOS se le muestran hoy a todo el mundo. Deben verlos solo admin,
   direccion y quien tenga acceso al módulo de estudios (STUDY_ADMIN_ROLES). Para el resto
   —incluido el rol miembro— simplemente no aparecen: no es que salgan en gris, no salen.
   Gate en la página Y en el endpoint que sirve los planes (el miembro no debe recibirlos en
   el payload aunque adivine la URL).
2) Las CAMPAÑAS aparecen intercaladas entre Hermenéutica y el resto de los avanzados. Deben
   ir SIEMPRE al final, después de todas las etapas. Corregí el orden en el agrupador de
   etapas (STUDY_STAGES en src/data/study-catalog.ts y donde se ordene en la página).
   Orden correcto: Niveles → Etapa inicial → Etapa intermedia → Etapa avanzada → Campañas.
   Revisá que el mismo orden se respete en /matricula y en /estudios/analisis, no solo acá.
Tests del gate por rol y del orden de etapas.
```

### [x] GRU-3 · Datos de contacto del dirigente en el detalle del grupo

> **HECHO 2026-08-06.** Teléfono y correo del dirigente y del co-dirigente en la ficha del
> grupo, accionables: `tel:`, `wa.me` (helper `waLink` nuevo en `src/lib/phone.ts`, prefija
> 506 a los locales de 8 dígitos) y `mailto:`.
>
> **VISIBILIDAD — se respetó el default del plan, sin consultarlo:** solo lo ve quien
> gestiona el grupo (`viewer_scope` 'admin' o 'leader'). Un estudiante inscrito ve el
> NOMBRE de su dirigente, no su celular. Se implementó borrando los campos del PAYLOAD en
> `GET /api/studies/groups/[id]` (`stripLeaderContact`), no escondiéndolos en la UI: si
> viajan, están expuestos a cualquiera que mire la respuesta.
>
> phone/email se agregaron SOLO al select del detalle (`GROUP_SELECT`), nunca a los tres
> selects de listado — no tiene por qué viajar el contacto de 112 dirigentes por lote.
>
> Datos: de 112 grupos activos con dirigente, los 112 tienen teléfono y 109 correo.
Archivos: detalle de grupo (`src/app/(admin)/estudios/grupos/[id]`), query del grupo

```
En el detalle de un grupo, la sección del dirigente muestra solo el nombre. Agregá teléfono
y correo, para que quien necesite contactarlo no tenga que ir a buscar su perfil.
Incluí también al co-dirigente si el grupo tiene.
Que sean accionables: el teléfono como enlace tel: o de WhatsApp, el correo como mailto.
CUIDADO CON LA VISIBILIDAD: son datos personales. Mostralos solo a quien ya puede ver el
grupo con scope de gestión (STUDY_ADMIN_ROLES, GROUP_ADMIN_ROLES) — un estudiante del grupo
NO debe ver el teléfono de su dirigente en esta pantalla salvo que me lo confirmes.
Sumá los campos al select de la query del grupo; hoy probablemente solo trae el nombre.
```

### [x] BLQ-1 · Calendario anual de bloques

> **HECHO 2026-08-06.** Toggle Lista / Calendario (la lista se mantiene tal cual) + selector
> de año con el actual por defecto. Geometría pura en `src/lib/studies/bloque-calendar.ts`,
> vista en `src/components/studies/BloqueCalendar.tsx`. 15 tests.
>
> · La barra de cada bloque va del PRIMER hito (folleto preliminar, 3 semanas antes de
>   abrir) al cierre de matrícula — esa es la vida real del bloque, no solo los días que
>   está abierto. Los 4 hitos van marcados encima; las fechas salen de `bloqueMilestones`,
>   no se recalculan.
> · Un bloque a caballo entre dos años se recorta al año visible y se marca el corte.
> · GRU-1: carril propio abajo con las ventanas de matrícula de los grupos.
> · Clic en una barra resalta el bloque en el listado.
> · MÓVIL: el calendario y su toggle no se muestran en pantalla angosta (`hidden md:*`) —
>   un año entero en 360 px no se lee. Queda la lista, que ahí sí funciona.
Archivos: `src/app/(admin)/estudios/bloques`, `src/lib/studies/bloques.ts`

```
La pantalla de bloques hoy es un listado. Agregá una vista de CALENDARIO ANUAL que muestre,
sobre los 12 meses del año, los bloques de capacitación con sus hitos: apertura y cierre de
matrícula, inicio y fin del bloque, y los hitos que disparan pedidos de folletos.
- Selector de año, con el actual por defecto.
- Cada bloque como una barra sobre la línea de meses, con su nombre y color propio; los
  hitos marcados sobre la barra.
- Clic en un bloque abre su detalle (o lo resalta en el listado existente).
- El listado actual se mantiene: es una vista alternativa, no un reemplazo. Un toggle
  Lista / Calendario.
- Mobile: en pantalla angosta el calendario anual no funciona — degradá a la lista o a una
  vista vertical por mes.
Las fechas y los hitos salen de src/lib/studies/bloques.ts, no las recalcules aparte.
Si ya se implementó GRU-1 (fechas de matrícula por grupo), mostrá también esos rangos.
Permisos: los mismos de la pantalla de bloques (coordinador_estudios, admin).
```

### [x] REU-2 · Hacer visible la reubicación como plan de contingencia

> **HECHO 2026-08-06.** No se construyó nada nuevo: el flujo de `relocation` es el mismo.
> `StudyRequestActions` ganó dos props —`only` (mostrar un solo acceso) y `variant='link'`
> (enlace discreto)— y con eso el MISMO modal aparece en tres lugares nuevos:
> la confirmación de matrícula, la ficha del grupo en la vista del estudiante y /mis-pagos.
> El perfil sigue igual.
>
> · El modal ahora explica qué pasa después: lo revisa el coordinador, NO es automático, y
>   mientras tanto sigue matriculado en su grupo actual.
> · Coordinador: entrada propia "Cambios de grupo" en el hub de estudios, con contador
>   propio (`?count=relocation`). El conteo general mezclaba reubicaciones con intereses, y
>   los intereses son informativos (EST-6) — un badge que los junta no dice cuánta gente
>   está esperando un cambio.
> · 9 tests: que los tres accesos sigan puestos, que el modal explique el después, y que el
>   deep link `?tab=relocation` abra la sección.
Archivos: `src/components/studies/StudyRequestActions.tsx`, detalle de grupo, confirmación de matrícula, `/estudios/solicitudes`
Depende de: EST-6 y EST-7 (sin esos dos arreglados el flujo existe pero no sirve)

```
Caso: una persona se matricula en el grupo equivocado y necesita cambiarse.
EL FLUJO YA EXISTE — no construyas nada nuevo. Las solicitudes de reubicación viven en
study_requests, el API las acepta de cualquier usuario autenticado (con
resolveTargetMemberId como anti-suplantación) y el coordinador las resuelve desde
/estudios/solicitudes eligiendo el grupo destino, lo que mueve la matrícula.
EL PROBLEMA ES QUE NO SE ENCUENTRA: el botón está enterrado en la pestaña Participación del
perfil. Quien se matriculó mal no va a buscarlo ahí, va a escribirle a alguien por WhatsApp.

Ponelo donde duele:
1) En la ficha del grupo del estudiante (su vista read-only) y en la pantalla de
   confirmación de matrícula: un enlace discreto pero claro, "¿Te matriculaste en el grupo
   equivocado? Pedí un cambio de grupo", que abra el mismo modal de reubicación que ya
   existe.
2) En /mis-pagos o donde el miembro vea sus estudios activos, la misma entrada.
3) Que el modal explique qué pasa después: que lo revisa el coordinador de estudios, que no
   es automático, y que mientras tanto sigue matriculado en su grupo actual.
4) Del lado del coordinador: que la cola de reubicaciones sea visible desde el módulo de
   estudios sin tener que recordar la URL, con contador de pendientes.
NO agregues un sistema de "casos" ni un tipo de solicitud nuevo: es exactamente para esto
que existe relocation.
Ojo con el orden: EST-7 (el botón de resolver que no se habilita) y EST-6 (intereses
mezclados en la vista de reubicaciones) tienen que estar arreglados antes, o vamos a hacer
visible un flujo que no se puede completar.
```

### [x] PRE-10 · Quitar la pregunta del oficiante y fusionar el paso de ceremonia

> **HECHO 2026-08-06.** Fuera la pregunta, la constante `OFFICIANTS`, el estado y el campo
> del payload. El paso "La ceremonia" —que ya solo tenía la fecha— se fusionó con el de
> logística, bajo el subtítulo "La boda". El wizard queda en **3 pasos** (el plan decía
> "de 5 a 4": PRE-9 ya había quitado uno antes).
>
> · La regla de la fecha NO se tocó: mismo `CEREMONY_DATE_QUESTION` (importado, no copiado),
>   mismo mínimo de 6 meses y mismo checkbox, ahora dentro del paso 2.
> · El placeholder de comentarios ya no menciona al oficiante.
> · Renumerado el indicador, el corte de "Continuar/Enviar" y verificadas las validaciones:
>   la del género de la pareja sigue en el paso 1 y la de antecedentes en el 2.
> · DATOS HISTÓRICOS intactos: la columna `officiant` no se borra y la cola la sigue
>   mostrando. En producción hay 1 solicitud y tiene oficiante — se sigue leyendo.
> · 10 tests, incluido que la fecha quedó dentro del paso 2 y que la cola conserva el campo.
Archivos: `src/app/(admin)/matricula/prematrimonial/page.tsx` (constante `OFFICIANTS` línea ~28, paso 3 líneas ~410-430, payload línea ~193), `src/app/api/studies/prematrimonial/route.ts`, `src/components/studies/PrematrimonialQueue.tsx`

```
Theos deja de ofrecer el servicio de dirigir la ceremonia, así que sale del wizard
prematrimonial.

1) QUITAR la pregunta "¿Quién te gustaría que dirigiera la ceremonia?" y la constante
   OFFICIANTS (línea ~28). Sacar `officiant` del payload que se manda al crear la solicitud
   (línea ~193).
2) FUSIONAR EL PASO (decisión confirmada): al quitar el oficiante, el paso 3 "La ceremonia"
   queda solo con la fecha de la boda y los comentarios. Mové esos dos campos al paso de
   LOGÍSTICA y eliminá el paso 3. El wizard baja de 5 a 4 pasos.
   - La fecha conserva su regla y su copy exacto (PRE-3/PRE-9): mínimo hoy + 6 meses
     calendario, con el checkbox "Fecha ya definida" y el texto
     "¿Tienen fecha definida o aproximada para la boda? (Si ya la tienen, indicá la fecha.
     Recordá que el curso debe iniciar mínimo 6 meses antes)". NO la toques.
   - El placeholder del textarea de comentarios menciona hoy al oficiante ("si elegiste
     'Otro' para el oficiante, especificá acá…"): reescribilo, que ya no aplica.
   - Renumerá los pasos y el indicador de progreso, y revisá la navegación
     (setStep, los guards de "no podés avanzar si…" y el botón Atrás del primer paso).
     Ojo con la validación del paso 2 (backgroundError) y la del paso 1 (género de la
     pareja) — que sigan disparando en el paso correcto después del renumerado.
3) DATOS HISTÓRICOS: la columna officiant de prematrimonial_requests NO se borra, igual que
   se hizo con venue_* en PRE-9. Las solicitudes viejas deben seguir mostrando su oficiante
   en la cola (PrematrimonialQueue); las nuevas lo muestran vacío o simplemente no muestran
   esa fila.
4) Quitá la validación server-side de officiant si existe, y revisá que el zod del POST no
   lo exija.

Tests: el wizard completa con 4 pasos; la regla de los 6 meses sigue funcionando en su
nueva ubicación; una solicitud vieja con oficiante se lee bien en la cola.
```

### [x] EST-12 · Encuesta de satisfacción del dirigente al cerrar un grupo

> **HECHO 2026-08-06.** Formulario de 12 preguntas (seed idempotente
> `scripts/seed-study-survey-form.mjs`), envío programado por cron
> `/api/cron/study-surveys` (17:30 UTC) con el molde de EVE-4, y panel con
> promedio por pregunta.
>
> **ASOCIACIÓN grupo → dirigente (lo que el plan pedía proponer):** el formulario es UNO
> para todos los grupos, así que no puede colgar de una entidad. La respuesta detallada vive
> en `form_responses` y **`leader_evaluations` es la proyección consultable** — grupo,
> dirigente, co-dirigente y promedio en una fila, con índice. `study_groups.survey_form_id`
> FIJA el cuestionario que le tocó a cada grupo: si mañana se edita, las respuestas viejas
> siguen apuntando a las preguntas que esa gente respondió.
>
> **CONFIDENCIALIDAD:** se guarda quién respondió (dedupe y tasa de respuesta) pero la vista
> nunca muestra nombre junto a respuesta. El dirigente NO ve nada hasta que la coordinación
> revisa y comparte; con menos de 3 respuestas no ve los comentarios.
>
> **DESTINATARIOS (confirmado contra el SQL del cierre):** los reprobados quedan `completed`
> y los retirados `dropped`, así que el criterio `completed`/`enrolled` ya deja fuera
> exactamente a los retirados, como pedía la inclinación del plan.
>
> Puntaje: el formulario pregunta con palabras y `study-survey.ts` las convierte a 1-5 por
> posición (la primera opción es la mejor), así preguntas de 4 y de 5 opciones son
> comparables sin una tabla de puntajes que se desincronice. "No aplica" no puntúa.
> Se puede apagar por grupo (`survey_enabled`).
Archivos: módulo de formularios, `study_groups` (migración), cron nuevo, `src/lib/email/`, patrón a copiar: `src/app/api/cron/event-surveys/route.ts` + `src/lib/events/survey-schedule.ts` + `src/lib/email/event-survey-notify.ts`

```
NO EXISTE para grupos de estudio; sí existe para eventos (EVE-4: cron event-surveys diario
a las 17:00 UTC, con formulario o plantilla configurable, dedupe por survey_sent_at y
destinatarios = quienes hicieron check-in). REPLICÁ ESE MOLDE, no inventes uno nuevo.

Objetivo: cuando un grupo de estudio termina, mandarle automáticamente a todos sus
estudiantes una encuesta de satisfacción sobre el dirigente, y que las respuestas queden
asociadas al dirigente y al co-dirigente de ese grupo.

────────────────────────────────────────
1) CREAR EL FORMULARIO (seed idempotente en scripts/, como seed-cdeb-preinscription-form.mjs)
Título: "Encuesta de satisfacción — Estudio bíblico".
Encabezado: "¡Gracias por completar tu estudio bíblico! Queremos conocer tu experiencia para
seguir mejorando. Tus respuestas son confidenciales y nos ayudan a apoyar mejor a nuestros
dirigentes."

AUTOLLENADO (decisión confirmada): dirigente, co-dirigente, curso/capacitación, lugar
(sede/país) y modalidad (presencial/virtual) NO se preguntan — salen del grupo. Guardalos en
la respuesta como contexto, no como campos que el estudiante escribe.

Preguntas (todas obligatorias salvo las abiertas del final):
 1. ¿Demostró el dirigente un buen conocimiento del material?
    Totalmente / En gran parte / Algo / Muy poco
 2. ¿Estuvo el dirigente preparado para aclarar dudas sobre el tema tratado?
    Siempre / Frecuentemente / A veces / Rara vez
 3. ¿El dirigente fomentó la participación activa de los estudiantes?
    (ayuda: "Involucra y motiva a todo el grupo a participar")
    Siempre / Frecuentemente / A veces / Nunca
 4. Si hubo intervenciones largas de algún participante, ¿cómo las manejó el dirigente?
    Muy bien, de manera respetuosa / Bien, pero podría mejorar / A veces interrumpe /
    No interviene y se hacen muy largos los estudios / No aplica
 5. ¿Cómo trató el dirigente los temas sensibles con el grupo?
    Con mucha sensibilidad / Generalmente sensible / Algo sensible / Poco sensible / No aplica
 6. ¿Reconoció y manejó adecuadamente las diferencias de opinión?
    Siempre / Frecuentemente / A veces / Nunca
 7. ¿El dirigente comunicó el mensaje de forma clara y comprensible?
    Siempre / Frecuentemente / A veces / Nunca
 8. ¿Fomentó el dirigente la aplicación de lo aprendido en la vida diaria?
    Siempre / Frecuentemente / A veces / Nunca
 9. ¿Demostró interés y el amor de Dios a los estudiantes durante y fuera del estudio?
    Siempre / Frecuentemente / A veces / Nunca
10. ¿Mantuvo el dirigente la confianza respetando la privacidad?
    Siempre / Frecuentemente / A veces / Nunca
11. Comentarios adicionales (texto libre, opcional)
    ayuda: "Cosas que te gustaron y cosas por mejorar."
12. Comentarios sobre el folleto y el contenido del estudio (texto libre, opcional)
    ayuda: "Contanos cómo fue tu experiencia con el contenido y qué te pareció el folleto;
    trabajamos constantemente para mejorar."
Cierre: "¡Muchas gracias por completar este formulario y ayudarnos a mejorar!"

────────────────────────────────────────
2) ASOCIACIÓN AL DIRIGENTE (lo que hace útil la encuesta)
Cada respuesta debe quedar ligada al grupo, al dirigente y al co-dirigente, para poder ver
después "todas las evaluaciones de tal dirigente" a lo largo del tiempo.
Definí cómo: los formularios hoy se asocian a una entidad (entity_type/entity_id), así que
la respuesta ya puede colgar del grupo — pero necesitás resolver el salto grupo → dirigente
de forma consultable, no calculada cada vez. Proponeme el enfoque antes de implementar.
Vista nueva: en el perfil del dirigente (o en /estudios/dirigentes/[id]), un panel con sus
evaluaciones: promedio por pregunta, tendencia entre grupos y los comentarios abiertos.

⚠️ CONFIDENCIALIDAD — es lo más delicado de este punto
El encabezado le promete al estudiante que sus respuestas son confidenciales. Eso hay que
cumplirlo en el código:
 - Las respuestas se guardan SIN identificar al estudiante, o identificadas pero nunca
   visibles junto a sus respuestas. Decidime cuál preferís y por qué; mi inclinación es
   guardar quién respondió (para el dedupe y para saber la tasa de respuesta) pero que la
   vista de resultados NUNCA muestre nombre junto a respuesta.
 - EL DIRIGENTE EVALUADO NO VE SUS PROPIAS EVALUACIONES sin que alguien las medie. Acceso:
   coordinador_dirigentes, coordinador_estudios, direccion, admin. Confirmame si querés que
   el dirigente vea un resumen agregado de sí mismo.
 - Si un grupo tuvo menos de 3 respuestas, no mostrar los comentarios abiertos: con dos
   respuestas se adivina quién escribió qué.

────────────────────────────────────────
3) ENVÍO AUTOMÁTICO
Migración en study_groups, espejo de lo que ya tiene events:
survey_form_id, survey_template_id, survey_offset_hours (o survey_send_at), survey_sent_at.
Cron nuevo /api/cron/study-surveys copiando el patrón exacto de event-surveys: auth con
CRON_SECRET, ping a healthcheck, dedupe con survey_sent_at, límite diario de correos,
horario UTC coherente con los demás en vercel.json.
 - DISPARADOR: al cerrar el grupo (o al llegar su fecha de fin — decidí cuál y decímelo;
   mi inclinación es al CIERRE, porque es cuando el dirigente ya terminó su trabajo).
   Con un desfase configurable, por defecto el día siguiente.
 - DESTINATARIOS: los estudiantes del grupo. Definí si van todos o solo los que aprobaron;
   mi inclinación es todos los que estuvieron matriculados, incluidos los reprobados —
   pero NO los retirados, que no completaron el estudio. Confirmámelo.
 - Correo con plantilla propia (seed en scripts/, patrón seed-invitation-templates.mjs) con
   el link al formulario. Respetá preferencias de notificación.
 - Configurable por grupo: poder desactivar la encuesta en un grupo puntual, y poder
   dispararla manualmente desde la ficha del grupo.

Tests: el cron no reenvía; el formulario autollena el contexto del grupo; la vista de
resultados no muestra nombres; con menos de 3 respuestas se ocultan los comentarios.
```

### [x] EST-13 · Correo de retroalimentación al dirigente con el resumen de la encuesta

> **HECHO 2026-08-06.** Cinco secciones con sus tablas de conteos y los dos bloques de
> comentarios. La plantilla es la CÁSCARA editable con `{{tablas}}` y `{{comentarios}}`;
> el HTML lo genera `src/lib/email/leader-feedback-report.ts`.
> Usa el layout base: las clases `.score-table`/`.scale-legend` se agregaron a
> `baseLayout.ts` con su variante responsive. Ninguna URL de CCB.
>
> **DECISIONES PROPUESTAS Y APLICADAS:**
> · CUÁNDO → al apretar "Compartir con el dirigente". No hizo falta un borrador aparte: el
>   paso de revisión ya existe y hace eso. Compartir ES enviar.
> · MENOS DE 3 RESPUESTAS → el correo sale, sin los comentarios abiertos. Callarse es peor:
>   el dirigente sabe que la encuesta salió. Sin NINGUNA respuesta no se manda.
> · CO-DIRIGENTE → recibe el mismo correo.
>
> Verificado con datos reales: 5 tablas, 5 leyendas, 33 celdas en cero vacías, 4 comentarios,
> sin nombres y con el layout del sistema.
Archivos: `docs/referencias/email-feedback-dirigente.html` (molde visual con datos de ejemplo), `src/lib/email/`, `message_templates`, cron o disparo desde la ficha del grupo
Depende de: EST-12 (la encuesta tiene que existir y tener respuestas)

```
Después de recoger la encuesta de EST-12, al dirigente se le manda un correo con el RESUMEN
AGREGADO de sus evaluaciones. El molde visual está en
docs/referencias/email-feedback-dirigente.html (con datos de ejemplo).

⚠️ ESTO NO ES UNA PLANTILLA EDITABLE COMÚN: las tablas de conteos y las listas de
comentarios se CALCULAN a partir de las respuestas. La plantilla es la cáscara (saludo,
secciones, versículo, firma) y el contenido de las tablas se genera. Decidí cómo lo
resolvés — helper de render en src/lib/email/ con marcadores en la plantilla, o generación
completa desde código con la plantilla solo para el copy editable — y decime cuál elegiste.

⚠️ USAR EL LAYOUT BASE DEL SISTEMA, NO EL HTML SUELTO DEL REFERENCIA
El archivo de referencia es un correo COMPLETO y autónomo: trae su propio <style>, wrapper,
header con logo y footer. En este sistema las plantillas guardan SOLO EL CUERPO y
renderEmail() de src/lib/email/baseLayout.ts pone el resto. Al portarlo:
 - QUITAR del HTML: el bloque <style>, el div .wrapper, el header con el logo y el tagline,
   y el footer. Todo eso ya lo pone baseLayout (y así el logo sale del asset correcto, sin
   la URL de CCB).
 - REUTILIZAR las clases que ya existen en lugar de estilos en línea duplicados:
   · .tag .tag-blue  → la etiqueta "📊 Retroalimentación"
   · .greeting       → "Hola, {nombre} 👋"
   · .divider        → los separadores degradados
   · .info-box + .info-title → los dos bloques de comentarios
   · .highlight-box  → la caja navy del versículo
   Los párrafos normales ya heredan el estilo de .body p, no les pongas font-size a mano.
 - LO ÚNICO QUE NO EXISTE son las tablas de conteos. Agregá esas clases a los STYLES de
   baseLayout.ts (algo como .score-table, .score-head, .score-cell, .scale-legend) en vez de
   dejar estilos en línea en el cuerpo: el comentario del propio archivo explica que un
   <style> dentro del body lo ignoran varios clientes de correo, y así quedan disponibles si
   otra plantilla necesita una tabla.
 - Sumá la variante responsive de la tabla al bloque @media de baseLayout: en celular una
   tabla de 6 columnas se desborda.
 - Actualizá baseLayout.test.ts con el caso nuevo.
Resultado esperado: si mañana cambia el header o el footer de los correos, este también
cambia solo, sin tocarlo.

ESTRUCTURA (respetala, viene del correo que ya usan):
- Etiqueta "📊 Retroalimentación", saludo "Hola, {nombre} 👋" y el párrafo de contexto.
- "Recibimos N evaluaciones de tu grupo".
- Cinco secciones, cada una con su LEYENDA DE ESCALA propia arriba (porque las escalas
  cambian entre secciones) y una tabla de conteos por opción:
    1. Conocimiento del material — Totalmente / En gran parte / Algo / Muy poco
    2. Preparación y participación — Siempre / Frecuentemente / A veces / Rara vez
    3. Manejo de intervenciones — Muy bien / Bien, podría mejorar / A veces interrumpe /
       No interviene / No aplica
    4. Temas sensibles — Mucha sensibilidad / Generalmente sensible / Algo sensible /
       Poco sensible / No aplica
    5. Comunicación y actitud — Siempre / Frecuentemente / A veces / Nunca
  Las celdas muestran CUÁNTAS personas eligieron esa opción; vacías si es cero (no "0").
- Dos bloques de comentarios abiertos, en viñetas: sobre el dirigente y el curso, y sobre el
  folleto y el contenido.
- Versículo de Mateo 25:23b en la caja navy, y firma del Comité de Dirigentes.

REGLAS IMPORTANTES
- CONFIDENCIALIDAD: el correo va con conteos y comentarios ANÓNIMOS, nunca con nombres.
  Esto es lo que hace que el dirigente sí pueda recibir su propia retroalimentación (ajusta
  lo anotado en EST-12: el agregado sí se comparte, el detalle por persona no).
- MÍNIMO DE RESPUESTAS: si el grupo tuvo menos de 3 respuestas, NO mandes los comentarios
  abiertos (con dos se adivina quién escribió qué). Con menos de 3 en total, evaluá si vale
  mandar el correo o esperar — proponeme la regla.
- CO-DIRIGENTE: si el grupo tiene co-dirigente, ¿recibe el mismo correo? Mi inclinación es
  que sí, con el mismo contenido. Confirmámelo.
- LOGO: el HTML de referencia apunta a theosplace.ccbchurch.com. Reemplazalo por un asset
  propio, igual que en las otras plantillas. No debe quedar ninguna URL de CCB.
- Los comentarios abiertos pueden venir con formato pegado desde Word (el ejemplo trae
  spans con Calibri): limpialos antes de insertarlos, dejá solo el texto.
- ENVÍO: definí si lo dispara el cierre + un desfase, o si el comité lo manda a mano desde
  la ficha del grupo después de revisar. Mi inclinación: generarlo automático pero que
  quede en borrador para que el comité lo revise y lo envíe — es información sensible y
  alguien debería leerla antes. Proponémelo.

Tests: los conteos coinciden con las respuestas; con menos de 3 respuestas no salen los
comentarios; ningún nombre de estudiante aparece en el HTML generado.
```

### [x] INT-3 · Cerrar los huecos de multimoneda — HECHO 2026-08-06 (migraciones 20260806240000 y 20260806250000, aplicadas a producción)
Estado por punto:
1. ✅ Agregados por moneda. `donation_stats`, `payment_stats` y `dashboard_sums` devuelven
   `{"CRC": …, "EUR": …}`; `create_refund`/`process_refund` calculan el tope DENTRO de la
   moneda del pago. En TS: `sumByCurrency`/`addTotals` en `src/lib/money.ts` y
   `TotalsDisplay` para las tarjetas. Verificado en producción con datos de prueba en EUR:
   `total_paid {CRC 25000, EUR 40}` (antes habría dicho 25 040) y una devolución que topa
   en 14,50 respetando los céntimos. Los datos de prueba se borraron.
2. ✅ Decimales por moneda (`formatMoney` con Intl, CRC 0 / USD 2 / EUR 2) + `amountStep`.
   Se encontraron y arreglaron DOS redondeos a entero que se comían los céntimos:
   `computeApplication` y `computeDiscountedAmount` (becas y cupones).
3. ✅ `sedes.currency` (Madrid y Madrid Home en EUR) + **selector de sede en el evento**
   (crear y editar): al elegirla propone la moneda del cobro, editable, y avisa en coral si
   quedan distintas. Decisión del usuario 2026-08-06: agregar sede a eventos y grupos.
   En GRUPOS el campo ya existía — la "zona" ES una sede (el combobox lee `/api/sedes`),
   así que no se duplicó: se agregó el aviso de que la sede cobra en otra moneda que el
   plan. La moneda de la matrícula sigue saliendo del PLAN a propósito: el monto vive en
   `study_plans.cost` y cambiar la moneda sin cambiar el monto convertiría ₡25 000 en
   €25 000. Para cobrar en euros hay que crear un plan con el precio en euros.
   Nota: `events.sede_id` estaba vacío en los 3 372 eventos históricos y sigue vacío; se
   llena de ahora en adelante.
4. ✅ Becas/cupones: el bloqueo de monto fijo en otra moneda ya venía de INT-2; ahora la
   beca NACE en la moneda de lo que beca, el descuento se muestra en su moneda y el
   redondeo respeta los céntimos. Las devoluciones heredan la moneda del pago.
5. ✅ Moneda visible en montos de eventos, planes, matrícula, becas y devoluciones (se
   quitaron los `formatCRC` que asumían colones); CSV y QuickBooks con columna de moneda;
   el import acepta columna `moneda` opcional (y entra en la clave de duplicados); filtro
   por moneda en /finanzas/pagos, visible solo si hay más de una.
6. ✅ Verificado contra producción (ver punto 1).

**Hallazgos** (lo que sumaba mal, además de los agregados): la matrícula de estudios y el
cobro de folletos insertaban `currency: 'CRC'` fijo aunque el plan fuera en otra moneda; el
pago manual de finanzas nacía en colones por el default de la columna; el gráfico de
finanzas y el informe de transparencia sumaban meses sin mirar la moneda (ahora se dibujan
en UNA moneda con selector).

**Queda para cuando Madrid cobre de verdad:** un mismo plan no puede costar ₡X en CR y €Y
en Madrid (el precio es global). Hoy se resuelve con un plan aparte; si molesta, la opción
es una tabla plan×sede con su precio y moneda.

<details><summary>Spec original</summary>
Archivos: RPCs en la migración baseline (`donation_stats`, `payment_stats`, `dashboard_sums`, `create_refund`), `src/lib/format.ts`, `sedes` (migración), forms de plan/grupo/evento, `src/lib/supabase/queries/scholarships.ts` y `finance.ts`, exports CSV
Continúa **INT-2** (backlog, cerrado el 2026-07-28), que dejó explícitamente pendiente la decisión de producto sobre los agregados. Decisión tomada: **por moneda separada, sin conversión automática.**
Prioridad: **antes de la integración con Tilopay.** Si la pasarela nace asumiendo colones, cambiarla después es rehacer la integración.

```
Cerrar los huecos de multimoneda antes de empezar a cobrar en euros (Madrid).
Lo que YA existe y no hay que rehacer: columnas currency con CHECK (CRC/USD/EUR) y default
CRC en payments, donations, events, refunds, scholarships y study_plans; formatMoney(monto,
moneda) con tests; y selects de moneda en crear/editar plan y crear/editar evento.

REGLA DE ORO, no negociable: NUNCA sumar montos de monedas distintas y NUNCA convertir
automáticamente. Los totales se muestran separados por moneda. Una conversión es una
decisión contable con tipo de cambio y fecha, no algo que el sistema improvise.

1) 🔴 GRAVE · LOS AGREGADOS SUMAN ENTRE MONEDAS
Las funciones de la base hacen sum(amount) sin agrupar: donation_stats (líneas ~441-444),
payment_stats (~837-840), dashboard_sums, create_refund (~397) y los reportes financieros.
Hoy no se nota porque todo es CRC; el día que entre el primer euro, el dashboard muestra un
número sin significado.
Arreglalo agrupando por moneda: que devuelvan un total POR MONEDA en vez de un escalar
(por ejemplo {"CRC": 1250000, "EUR": 340}). Actualizá los consumidores en dashboard,
finanzas y reportes para mostrar los totales separados, uno debajo del otro. Donde hoy hay
una sola tarjeta de KPI, una línea por moneda con datos — y solo una si todo es CRC, para
que no se vea recargado mientras Madrid no arranque.
Revisá TODOS los sum/reduce sobre amount, en SQL y en TypeScript.

2) DECIMALES Y FORMATO POR MONEDA
formatMoney usa toLocaleString('es-CR') para todas. Los colones no llevan decimales; los
euros sí: €25,50 hoy se muestra "€25,5".
Usá Intl.NumberFormat con la moneda como parámetro y los decimales correctos (CRC 0,
EUR 2, USD 2). Revisá que en ningún lado se redondee a entero asumiendo colones — eso se
comería los céntimos. Los inputs de monto deben aceptar decimales cuando la moneda los
tiene y no cuando no. Tests con 25.50 en EUR y en CRC.

3) MONEDA POR DEFECTO SEGÚN LA SEDE
Hoy se elige a mano en cada plan y evento, así que alguien va a crear un estudio de Madrid
en colones y nadie se va a dar cuenta hasta que cobren.
Agregá moneda por defecto a la sede (columna currency en sedes, default CRC, Madrid EUR) y
que los formularios de plan, grupo y evento la propongan según la sede seleccionada,
siempre editable. Sin sede → CRC.
IMPORTANTE: la moneda se guarda en el registro al crearlo. Si mañana cambia la moneda de la
sede, los registros viejos NO cambian.

4) BECAS Y CUPONES ENTRE MONEDAS
scholarships ya tiene currency. Bloqueá el caso: una beca en CRC no se aplica a un pago en
EUR → 409 con mensaje claro ("Esta beca es en colones y el cobro es en euros"). Lo mismo
para devoluciones (el refund va en la moneda del pago original) y para los pagos manuales
que finanzas crea ligados a una matrícula.

5) VISIBILIDAD Y EXPORTS
- Toda pantalla que muestre un monto muestra su moneda; nada asume colones.
- Finanzas y la cola de pagos: filtro por moneda y totales separados.
- Los exports CSV llevan columna currency; no exportes montos sin moneda.
- El import de donaciones acepta columna de moneda opcional, default CRC.

6) VERIFICACIÓN
Creá un plan y un evento en EUR con datos de prueba, matriculá, pagá, aplicá una beca en la
moneda correcta y una en la equivocada, y revisá que dashboard y reportes muestren los dos
totales separados y correctos. Reportame qué encontraste que sumaba mal.
```
</details>

---

## Fase 8 — Reuniones de agosto (Finanzas y Dirigentes)

> Decisión tomada 2026-08-06 sobre la evaluación del dirigente: **identificada pero
> confidencial** — el sistema guarda quién respondió (permite dedupe, tasa de respuesta y
> "quiénes llenaron y quiénes no"), pero al dirigente NUNCA se le revela quién dio el
> feedback. EST-12 y EST-13 quedan como están (ya especificaban exactamente esto).

### De la reunión con Finanzas

### [x] FIN-2 · Pedir el documento de identidad donde falta (login, matrícula, check-in) — HECHO 2026-08-21
Archivos: `src/lib/auth/auth-context.tsx`, wizard de matrícula, `/eventos/[id]/checkin`, perfil

Contexto medido antes de arrancar: **21 665 de 23 777 miembros (91%) no tienen documento**, y
16 398 de ellos tienen login — o sea el aviso del punto 1 alcanza a ~16 400 personas y el
bloqueo del punto 2 frena a casi todo el que se matricule hasta que lo complete (es la
intención de finanzas, pero conviene saberlo antes de un despliegue).

**BUG encontrado y arreglado de paso:** PRE-7 guardaba el documento con `PATCH
/api/members/[id]`, pero la ruta solo exportaba `GET` y `PUT` → **405**. La captura del
prematrimonial nunca funcionó. La ruta ahora expone `PATCH` además de `PUT` (el handler ya
era un update parcial; PATCH es la convención del repo). Verificado: `PATCH` → 401 (antes
405), `PUT` → 401 sin cambios, `DELETE` sigue 405.

Implementado:
- Módulo puro `lib/members/document-prompt.ts` (`shouldShowDocumentPrompt`,
  `DOCUMENT_PROMPT_SNOOZE_DAYS = 14`) con **9 tests**, incluidos el formato `timestamptz`
  de Postgres (`+00:00`), fecha corrupta y fecha futura.
- Migración `20260821120000_notice_dismissals` (aplicada): tabla genérica
  `notice_dismissals (member_id, notice_key, dismissed_at)` con PK compuesta, RLS y política
  self vía `private.is_own_member`. Genérica a propósito, para no agregar una columna a
  `members` por cada aviso futuro. El descarte se guarda **con fecha**, no booleano.
- (1) Login: `DocumentPromptModal` en el AppShell, descartable, reaparece a los 14 días.
  **Reemplaza** al viejo `CedulaReminderBanner` (descartaba en `sessionStorage`, sin fecha —
  archivo eliminado). `/api/auth/me` ahora devuelve `document_prompt_dismissed_at`;
  `POST /api/members/notice-dismissals` registra el descarte (member_id de la sesión, nunca
  del body, así nadie silencia el aviso de otro).
- (2) Matrícula: bloqueante. Server: el guard de `enrollMember` pasó de exigir documento solo
  a los planes de `REQUIRES_CEDULA_CODES` (PREMAT) a exigirlo en **toda** matrícula. UI: al
  darle "matricularse" sin documento se pide primero y luego sigue con la confirmación que
  quedó pendiente (`profile.has_document`, nuevo en el perfil de elegibilidad).
- (3) Check-in: **nunca bloquea**. El lookup ya traía la cédula y el cliente la tiraba; ahora
  se conserva, la fila muestra un chip discreto "sin documento", y **después** de registrar
  el check-in aparece un panel opcional y cerrable para capturarlo al vuelo.
- Componente compartido `DocumentCapture` (tipo + número, validación por tipo de INT-1,
  guardado por PATCH con el dedup 409 existente) usado en los 3 puntos **y** en el
  prematrimonial, que quedó unificado (antes tenía su propia copia del bloque).
- Limpieza: `REQUIRES_CEDULA_CODES` quedó huérfano y se eliminó junto con su test, que
  afirmaba que N1 *no* exige documento — ahora falso y activamente engañoso.

Verificación: typecheck limpio, **965 tests** en verde, lint sin errores nuevos (los 9 de
`scripts/` son preexistentes; 96 warnings ≤ 107). Ciclo del descarte probado contra la BD
real: el upsert no duplica (1 fila por miembro+aviso) y el re-descarte actualiza la fecha.
Los tests de "matrícula bloqueada" y "check-in nunca bloqueado" no son unitarios: el guard es
server-side inline y el repo solo testea módulos puros (vitest incluye `.ts`, no `.tsx`).

```
Para finanzas, que todos tengan documento registrado es prioritario. Hoy solo el
prematrimonial lo exige (PRE-7). Agregá la captura en tres puntos, con fricción distinta:
1) AL ENTRAR AL SISTEMA (descartable): si el miembro logueado no tiene documento, un aviso
   "Completá tu perfil" con modal para ingresarlo ahí mismo (tipo + número, selector de
   INT-1, normalización y dedup 409 existentes). Descartable; si lo descarta, reaparece a
   los 14 días (guardá el descarte con fecha, no con un booleano). No bloquea nada.
2) AL MATRICULARSE (obligatorio): si quien se matricula no tiene documento, el wizard lo
   pide como paso previo y no continúa sin él — mismo criterio y mismo copy claro de PRE-7
   ("Ingresá tu cédula o número de documento de identidad para continuar"). Aplica a
   autoservicio y a staff matriculando a terceros.
3) EN EL CHECK-IN (captura rápida, opcional): cuando el staff hace check-in de alguien sin
   documento, mostrá un indicador discreto con un campo para capturarlo al vuelo SIN frenar
   la fila — es opcional: el check-in nunca se bloquea por esto.
El dato se guarda en el perfil (cedula + cedula_normalized / document_type de INT-1), con
el dedup existente: si el documento ya pertenece a otro miembro → 409 y mensaje claro.
Tests: modal reaparece a los 14 días; matrícula bloqueada sin documento; check-in nunca
bloqueado; dedup.
```

### [x] FIN-3 · Beca descontada visible en el modal de pago + comprobante requerido para el pago — HECHO 2026-08-21
Archivos: modal de pago/matrícula, `src/lib/supabase/queries/scholarships.ts`, flujo de comprobantes

**Causa raíz del reclamo de finanzas** ("la gente paga montos equivocados"): había **tres
copias distintas del cálculo del descuento** — el módulo puro, `computeDiscountedAmount` en
el server, y una inline en el ConfirmModal con `Math.round` fijo — y **dos del formato**
(`formatDiscount` en el server y otra reimplementada en `finanzas/becas/page.tsx`, porque el
cliente no puede importar del server). La copia del modal redondeaba a entero: un 10% sobre
€25,50 mostraba €23 en vez de €22,95. Además el modal formateaba con `formatCRC`, así que un
plan en euros se mostraba en colones.

Implementado:
- Módulo puro nuevo `lib/finance/payment-breakdown.ts`, **client-safe** y única fuente:
  `buildPaymentBreakdown` (precio / descuento / final / `covered` / `blockedByCurrency`),
  `formatDiscount` y `declaredAmountMismatch`. **12 tests** (50% → residual, 100% → covered,
  beca fija mayor al precio, beca fija en otra moneda no aplica, céntimos en euros).
  `computeDiscountedAmount` ahora **delega** en la función pura y `scholarships.ts`
  re-exporta `formatDiscount`: se acabaron las copias.
- (1) Desglose en el modal de matrícula: precio, línea de beca con el descuento en negativo
  y **TOTAL A PAGAR** grande. Respeta la moneda del plan (`group.currency`, que ya existía
  por INT-3 y no se usaba). Si la beca es fija y está en otra moneda, se dice que no aplica
  en vez de mostrar un descuento que el server niega. Con beca del 100% avisa que no hay que
  subir comprobante.
- (3) El comprobante ahora pide **"Monto que transferiste"** y avisa si no coincide con el
  calculado — **no bloquea** (finanzas decide en revisión, según la spec). El modal también
  recibe `currency`; `enrollMember` la devuelve para eso.
- Bug arreglado: **las becas asignadas no validaban vencimiento**. Los cupones genéricos sí
  (`validateGenericCode` → `expired`), pero `findApplicableScholarship` filtraba solo por
  `status='active'`, así que una beca con `expires_at` pasado se mostraba en el modal **y el
  server la aplicaba**. Verificado contra la BD: la query vieja la encontraba, la nueva la
  excluye, y una vigente sigue apareciendo.
- Bug arreglado: si `approve_payment` reventaba tras aplicar una beca del 100%, la excepción
  subía como 500 genérico y el pago quedaba en `en_revision` con monto 0 y la beca ya
  consumida — nadie sabía que la beca sí se había aplicado. Ahora se responde
  `approved: false`: el estado queda consistente y finanzas lo ve en la cola para cerrarlo.

**(2) Auditoría de "en revisión sin comprobante" — pedía verificar, y hay DOS caminos:**
1. `transitionPaymentQueue(id, 'start_review')` (`payments.ts:750`, vía
   `POST /api/payments/[id]/review`): finanzas marca "empiezo a gestionar este cobro" sin
   comprobante, y **queda así**. **NO lo cambié**: es una acción deliberada del staff, no de
   alguien pagando, y cerrarlo rompería la cola de revisión. **Necesita tu decisión** si
   querés que también exija comprobante.
2. Beca del 100% (`scholarships.ts`): transitorio de un tick para habilitar el guard del RPC
   — es el caso que BEC-1 define como "aprobado sin comprobante"; su falla quedó arreglada.

Los 5 caminos de comprobante (`createComprobantePayment`, `submitEnrollment/EventComprobante`
× UPDATE/INSERT) sí exigen `receipt_path`.

Verificación: typecheck limpio, **977 tests** en verde, y el lint queda en **110 warnings,
los mismos que `main`** (FIN-3 no suma ninguno).

```
CONTEXTO — no romper una decisión ya tomada: la matrícula es EFECTIVA DE INMEDIATO y el
pago es un carril aparte. "Comprobante obligatorio" acá significa obligatorio PARA EL PAGO,
no para la matrícula: sin comprobante el pago sigue pendiente (con los recordatorios de
PAG-3 y el bloqueo de PAG-2 para matrículas nuevas), pero la matrícula no se cae.
1) BECA DESCONTADA EN EL MODAL: si la persona tiene beca activa aplicable, el modal de pago
   la muestra automáticamente: precio del estudio, línea de descuento de la beca (monto o
   porcentaje) y MONTO FINAL A PAGAR grande y claro. Que no haya que adivinar cuánto
   transferir — ese es el reclamo de finanzas: la gente paga montos equivocados.
2) COMPROBANTE REQUERIDO PARA COMPLETAR EL PAGO: el flujo de subir comprobante pasa a ser
   el único camino para que un pago SINPE/transferencia llegue a la cola de revisión (hoy
   ya es así vía submitEnrollmentComprobante — verificá que no haya camino que marque un
   pago en revisión sin comprobante). Si la beca es del 100%, se mantiene BEC-1: sin
   comprobante y aprobado directo.
3) En el modal, si la persona sube el comprobante ahí mismo, el monto que declara debe
   coincidir con el monto final calculado — avisá si difiere (no bloquees: finanzas decide
   en revisión).
Tests: modal con beca del 50% muestra el residual correcto; beca 100% sin comprobante;
monto declarado distinto genera aviso.
```

### [x] FIN-4 · Arreglo de pago en tractos (uso interno de finanzas) — HECHO 2026-08-21
Archivos: migración (tabla nueva), `/finanzas/pagos`, `src/lib/supabase/queries/payments.ts`, guard de matrícula/inscripción

**Decisiones tomadas antes de migrar** (el punto pedía proponer el esquema):
- **El primer tracto aprobado libera el objeto pagado** → `approve_payment` queda intacto.
- **Cancelar el arreglo solo marca el plan**: los tractos impagos siguen `pending`, así que
  siguen bloqueando y siguen entrando a los recordatorios. Cancelar ≠ condonar; para condonar
  está el "Cerrar sin cobrar" que ya existe por pago. Calza con "no automatices consecuencias
  más allá del bloqueo".

Migración `20260821200000_payment_plans` (aplicada y verificada):
- Tabla `payment_plans` (member, objeto pagado con CHECK de exactamente uno, total, moneda,
  cantidad de tractos 2–24, status activo/completado/cancelado, notas, created_by), RLS con
  policy self+finanzas y trigger `set_updated_at`.
- `payments` gana `payment_plan_id`, `due_date` e `installment_number`. `due_date` es columna
  NUEVA a propósito: `payment_date` ya existe con otro significado (NOT NULL con default hoy
  = fecha de registro, poblada incluso en pagos impagos).
- **Dos índices únicos redefinidos**: `payments_comprobante_en_revision_uniq` y su gemelo de
  eventos permitían UN solo pago en revisión por matrícula/inscripción; con tractos, subir el
  comprobante del tracto 2 mientras el 1 estaba en revisión chocaba. Ahora se limitan a los
  pagos SIN plan (`payment_plan_id IS NULL`), que es donde la regla tenía sentido.
- `payments_plan_installment_uniq`: un tracto por número dentro del arreglo (idempotencia si
  el POST se reintenta).

Hecho:
- Módulo puro `lib/finance/installments.ts` con **23 tests**: `splitAmount` garantiza que los
  tractos **suman exacto** el total (₡10 000 en 3 → 3 334 + 3 333 + 3 333, no 3×3 333 =
  ₡9 999), `monthlyDueDates` no corre el calendario (31 ene → 28 feb, no 3 mar), `isOverdue`
  y `overdueBlockMessage` (mensaje con el detalle, sin sumar monedas distintas).
- `queries/payment-plans.ts`: `createPaymentPlan` (reusa el pago original como tracto 1, así
  conserva beca/comprobante/vínculos, y revierte todo si falla), `cancelPaymentPlan`,
  `settlePlanIfPaid`, `getOverdueInstallments`.
- **Guard (punto 3)**: tracto vencido impago → 409 `tracto_vencido` con el detalle, en
  matrícula (`enrollMember`) **y en eventos pagos** (`createRegistration`) — los eventos no
  tenían NINGÚN guard de deuda antes de esto. Se salta con el override del staff / cuando
  finanzas fuerza paid/exempted.
- **UI (punto 2)**: panel "Convertir en arreglo de pago" en el modal de la cola, solo sobre un
  pago pendiente y solo para finanzas/dirección/admin — por ROL, no por módulo, porque
  dirección tiene `finanzas` solo en view y el endpoint usa `requireRoles`.
- **Seguimiento (punto 4, parcial)**: los tractos muestran su vencimiento en `/mis-pagos` y
  marcan en rojo los vencidos (corte en hora CR). Los recordatorios de PAG-3 los toman
  automáticamente: un tracto es `status='pending'`, que es justo lo que busca el cron.
- Rutas: `GET/POST /api/payments/[id]/payment-plan` y `PATCH /api/payment-plans/[id]`
  (`action: 'cancelar'`), ambas con `requireRoles('finanzas','direccion','admin')` y auditoría.

Verificado contra la BD real (los 3 tests que pedía el punto): partir un pago da tractos que
suman el total, el tracto vencido bloquea, el futuro al día no bloquea, y cancelar deja los
tractos pendientes. Typecheck limpio, 995 tests, lint 94/94 sin errores.

**Punto 4 cerrado (2026-08-21, segunda tanda):**
- [x] Filtro **"En arreglo de pago"** en la página de pagos: chip nuevo + `?in_plan=1` en
      `GET /api/finance/payments` (`inPaymentPlan` en `PaymentFilters` → `payment_plan_id NOT
      NULL`). Los tractos son pagos normales, así que se mezclaban con el resto.
- [x] **Aviso interno a finanzas de tractos vencidos**, en el cron de `payment-reminders`
      (`notifyFinanceOverdueInstallments`): consolidado por corrida (cuánta gente, cuántos
      tractos y por cuánto, sin mezclar monedas), a los roles finanzas/dirección/admin con rol
      activo en miembro activo, con dedupe diario en hora CR. Best-effort: si falla, el
      recordatorio al miembro no se cae. Decisión documentada: NO pasa por la preferencia
      `mensajes_sistema` porque es cola de trabajo del staff, no un mensaje al miembro sobre
      lo suyo. Hacía falta porque el bloqueo es pasivo — actúa cuando la persona intenta
      matricularse, así que sin el aviso nadie se enteraba.

Verificado contra la BD real: el filtro aísla exactamente los tractos creados (y todas las
filas traen `payment_plan_id`), el aviso se genera y la segunda corrida del mismo día dedupea.

```
Excepción manejada internamente (NUNCA visible como opción de autoservicio): finanzas puede
partir el pago de un estudio o evento en tractos.
1) MODELO: tabla payment_plans (acuerdo: member_id, referencia al objeto pagado —
   enrollment_id o event_registration_id—, monto total, moneda, cantidad de tractos, creado
   por, notas) y los tractos como filas en payments ligadas al acuerdo (payment_plan_id,
   cada una con su monto y fecha esperada). Así cada tracto pasa por la cola de revisión
   normal y los agregados no cambian. Proponeme el esquema exacto antes de migrar.
2) QUIÉN: solo finanzas, direccion y admin crean arreglos, desde la página unificada de
   pagos (REV-3), sobre un pago pendiente existente ("Convertir en arreglo de pago").
3) BLOQUEO (extiende PAG-2): con un tracto VENCIDO impago, la persona no puede matricularse
   en otro estudio NI inscribirse a otro evento pago. Tracto futuro al día no bloquea.
   Mensaje claro con el detalle de lo que debe.
4) SEGUIMIENTO: los tractos aparecen en /mis-pagos de la persona con sus fechas; entran a
   los recordatorios semanales de PAG-3; y la página de pagos permite filtrar "en arreglo
   de pago". Si un tracto se vence, notificación interna a finanzas.
5) Si la persona deja de pagar a mitad: finanzas decide manualmente (cancelar el arreglo,
   condonar, o convertir en caso de seguimiento) — no automatices consecuencias más allá
   del bloqueo.
Tests: crear arreglo parte el pago en tractos que suman el total; tracto vencido bloquea
matrícula y evento; tracto al día no bloquea.
```

### [x] FIN-5 · Aprobación parcial de becas: 100%, 50%, porcentaje libre, o rechazo — HECHO 2026-08-21
Archivos: revisión de solicitudes de beca (`/finanzas/becas`, `finance_requests`), `scholarships`, plantillas `beca_aprobada` / `beca_aprobada_parcial` / `beca_rechazada`

Punto de partida: el backend ya aceptaba `discount_type`/`discount_value`/`approval_type` y ya
mandaba las tres plantillas. Los huecos reales eran otros tres.

**Hueco 1 — `approval_type` se elegía a mano.** La UI pedía primero "Aprobar total" o "Aprobar
parcial" y DESPUÉS el valor, así que se podía guardar `total` con un 50%: un dato que se
contradice a sí mismo. Ahora el tipo se **deriva de la cobertura** (`covered` ⇒ total) en el
server, que **ignora** lo que manda el cliente cuando puede calcular el costo. Verificado
contra la BD: mandando `approval_type: 'total'` con 50%, se guardó `parcial`.

**Hueco 2 — no se guardaba el monto.** El porcentaje sí quedaba (`discount_value`), pero no el
monto calculado. Ahora se congelan `original_amount` (costo del destino al aprobar) y
`final_amount` (residual), usando las dos columnas que ya existían sin uso. El porcentaje es
portable entre monedas; el monto se congela en la del destino (INT-3).

**Hueco 3 — la plantilla parcial no decía cuánto pagar.** Decía "El resto del monto quedaría a
tu cargo" sin el número — el mismo problema que FIN-3 arregló en el modal. Migración
`20260821220000` (aplicada): agrega `{{monto_final}}`, que `approveScholarshipRequest` manda ya
formateado en la moneda del destino.

Además:
- Módulo puro `lib/finance/scholarship-approval.ts` con **11 tests**: `previewApproval` reusa
  el desglose de FIN-3, así que **la vista previa y lo que se guarda son la misma cuenta**.
  Cubre 100%/50%/porcentaje libre/monto fijo, deriva el tipo, y avisa cuando el monto fijo
  supera el costo (el típico cero de más al teclear).
- UI de revisión: atajos **100% / 50% / "otro"** y **vista previa** con costo, lo que cubre la
  beca y lo que queda por pagar, más la advertencia de qué correo se va a enviar. Antes se
  escribía el número a ciegas.
- `finance_requests` ahora expone `entity_cost` y `entity_currency` (del plan o del evento),
  que es lo que alimenta la vista previa.

Puntos 3 y 4 de la spec ya estaban cubiertos y se verificaron: el residual se paga por el flujo
normal (FIN-3 lo muestra), una beca por pago lo garantiza el guard `pago_ya_con_beca` de BEC-1,
y el rechazo ya mandaba `beca_rechazada` con el motivo.

Verificación: typecheck limpio, **1011 tests**, lint 94/94 sin errores. Contra la BD real: las
becas creadas antes del cambio se siguen leyendo (los campos nuevos son aditivos y nullables) y
la aprobación al 50% congela costo y residual correctos.

```
Al resolver una solicitud de beca, finanzas puede: aprobar al 100%, al 50%, definir un
porcentaje libre (o un monto fijo), o rechazar. Hoy la resolución es más binaria.
1) UI de revisión: botones rápidos 100% / 50% / "otro" (input de porcentaje o monto) /
   Rechazar, con vista previa de cuánto cubriría sobre el costo del estudio.
2) MODELO: guardá el PORCENTAJE otorgado además del monto calculado (con multimoneda de
   INT-3 el porcentaje es portable; el monto se congela en la moneda del plan al momento de
   aprobar). Revisá qué guarda scholarships hoy (kind, amount) y extendé sin romper las
   becas existentes.
3) RESIDUAL: la persona paga el resto por el flujo normal (FIN-3 muestra el desglose en el
   modal). No se puede pedir OTRA beca para el mismo pago — una beca por matrícula.
4) CORREOS: ya existen las tres plantillas (beca_aprobada, beca_aprobada_parcial,
   beca_rechazada) — conectá cada resolución con la suya, incluyendo el porcentaje y el
   monto final a pagar en la parcial.
Permisos: becas, finanzas, direccion (los actuales de requireModuleView('becas')).
Tests: 50% calcula bien el residual; rechazo manda el correo correcto; beca existente
pre-cambio se sigue leyendo.
```

### [x] FIN-6 · Devoluciones: tipo, filtros, visibilidad compartida y convertir en donación — HECHO 2026-08-21
Archivos: `/finanzas/devoluciones` y solicitudes, `refunds`, RPC `create_refund`, `donations`

Contexto: la tabla `refunds` estaba **vacía** (0 filas), así que el esquema se pudo ajustar sin
backfill. La pantalla **no tenía ningún filtro** y la visibilidad era puramente por rol global.

Migración `20260821230000` (aplicada y verificada).

**1) TIPO derivado.** `refunds` gana `kind` + `plan_id` + `event_id`, que se llenan solos al
crear la devolución desde el pago original — nunca se piden a mano. La derivación vive en el
módulo puro `lib/finance/refund-kind.ts` (**10 tests**) y NO se duplicó en SQL, a propósito:
es el mismo error de las tres copias que arreglamos en FIN-3.
- Hallazgo de alcance: la spec pedía los tipos "estudio, evento, **campaña**, **actividad**",
  pero `payments.concept` solo tiene 4 valores y ninguno es campaña ni actividad. **Campaña sí
  es derivable** (matrícula cuyo plan tiene `level='campanas'`) y quedó implementada.
  **"Actividad" no existe en el modelo** — no hay concepto ni entidad que la represente, así
  que quedó fuera y documentado en el módulo. Si aparece, se agrega ahí y al CHECK.

**2) FILTROS.** Chips por tipo y, cuando el tipo sale de un plan, select de plan de estudio
(solo con los planes que realmente están en la cola). Van server-side (`kind`, `plan_id`,
`status` en `getRefunds`), no filtrando en memoria.

**3) VISIBILIDAD COMPARTIDA.** Módulo puro `lib/auth/refunds-scope.ts` (**8 tests**):
finanzas/dirección/admin ven todo y resuelven; coordinación de estudios ve las que salen de un
plan; el encargado de un evento ve **solo las de sus eventos** (vía `event_managers`). Los dos
últimos **ven y comentan, no resuelven** — tabla nueva `refund_comments` con sus endpoints, y
el PUT de resolver sigue con `requireRoles('finanzas','direccion')`. La página dejó de usar
`FinanceGuard` (que la cerraba a finanzas) por un guard de alcance; el gate real es el 403 del
GET.

**4) CONVERTIR EN DONACIÓN.** Contabilidad lo confirmó (2026-08-21, confirmado por el usuario).
Estado nuevo `convertida_donacion` (resuelta, **no se borra**), se crea la donación con la fecha
de conversión y `donations.refund_id` como referencia cruzada (columna nueva: donations no tenía
dónde guardar procedencia). Gateado a finanzas+dirección, con confirmación explícita del monto
—y el server rechaza si el monto cambió desde que se abrió la pantalla—.
- **Decisión clave para no duplicar plata:** el pago original pasa a `refunded`/`partial_refund`.
  Si siguiera `paid`, los totales mostrarían el ingreso del estudio Y la donación por el mismo
  dinero. Idempotente: índice único en `donations.refund_id`, así que un reintento no crea dos
  donaciones.

Verificado contra la BD real (los 4 tests que pedía el punto), con pago temporal propio y
restaurando `is_donor`: el tipo sale `campana` desde el nivel del plan, el filtro por plan
encuentra la devolución y la excluye con otro plan, la conversión crea la donación y deja el
pago en `refunded`, y convertir dos veces falla dejando **una sola** donación.

Typecheck limpio, **1032 tests**, lint 94/94 sin errores.

**Nota de alcance:** los filtros se agregaron a la cola de `/finanzas/devoluciones` (que es
donde vive el tipo). La pantalla de `/finanzas/solicitudes` (tab Devoluciones, sobre
`finance_requests`) quedó igual: son solicitudes previas, sin devolución creada todavía, así que
no tienen tipo derivado que filtrar.

```
Cuatro mejoras al flujo de devoluciones:
1) TIPO: derivalo del pago original (concept + entidad): estudio, evento, campaña,
   actividad. No lo pidas a mano — el pago ya sabe de dónde vino. Si el pago es de un plan
   de estudios, guardá también el plan para poder filtrar por tipo de estudio.
2) FILTROS en la pantalla de solicitudes de devolución: por tipo, y si es estudio, por plan.
3) VISIBILIDAD COMPARTIDA: además de finanzas, la devolución la ve el responsable del
   origen — encargado del evento (entity_managers de FRM-1 si existe, o los roles de
   gestión de eventos) o coordinador de estudios según el tipo. Ven y comentan; RESOLVER
   sigue siendo de finanzas.
4) CONVERTIR EN DONACIÓN: botón "Convertir en donación" para cuando la persona no quiere el
   reembolso. Mecánica: la devolución queda resuelta con estado 'convertida_donacion' (no
   se borra — sin soft-delete y con historial) y se crea la donación en donations con la
   fecha de conversión, ligada al miembro y con referencia cruzada al refund. El trigger de
   is_donor hace lo suyo solo.
   ⚠️ ANTES DE IMPLEMENTAR el punto 4: confirmar con contabilidad que la conversión es
   correcta fiscalmente (es plata que cambia de naturaleza). El botón queda gateado a
   finanzas + direccion y pide confirmación explícita con el monto.
Tests: tipo derivado correcto; filtro por plan; el encargado del evento ve solo las de su
evento; conversión crea la donación y no duplica plata.
```

### De la reunión con Dirigentes

### [x] DIR-1 · Migrar el formulario de disponibilidad de dirigentes desde CCB — HECHO 2026-08-21
Archivos: builder de formularios, `study_leaders` (`availability_status`, `zone_preference`), cola del coordinador

Seed en `scripts/seed-leader-availability-form.mjs` (mismo patrón que el de CDEB), corrido:
formulario **`disponibilidad-dirigentes`** con **11 campos** y las **23 zonas del catálogo real**
(no una lista escrita a mano). Idempotente por título — verificado: re-correrlo conserva el id.

Contenido según el original de CCB: encabezado + versículo de Daniel 12:3 (TLA); nombre y
teléfono NO se preguntan (campo `personal_data`, que prellena del perfil de verdad); las tres
preguntas obligatorias; y el comentario libre. La **nota de fechas va como `help_text`
editable**, no quemada — cambia cada ciclo.

**Mejora sobre el original** (bloque condicional que aparece si respondió Sí a dar estudio **o**
a ser suplente): días, horarios, zonas y modalidad, todo estructurado y por lo tanto filtrable.
Verificado en BD: las 5 condiciones son `show`/`OR` y apuntan a los dos `yes_no` con valor `Sí`.

Tres cosas que aparecieron y hay que saber:
- **El seed de CDEB no escribía `conditions`**, así que cualquier campo condicional habría
  quedado siempre visible. Mi seed lo escribe, y le agregué la línea al de CDEB también para
  quitar la trampa (hoy no usa condicionales, así que no cambia nada).
- **`multiselect` está en el CHECK de la BD pero el builder no lo ofrece** y el adapter lo
  degrada a `select` (una sola opción). Para los multi se usó **`checkbox`**, que sí funciona de
  punta a punta.
- **Re-correr el seed borra las respuestas** (los campos van en cascada). Documentado en el
  encabezado del script: para un ciclo nuevo se pasa otro título y se crea un formulario aparte,
  conservando el histórico.

**Vista del coordinador** (`/estudios/dirigentes/disponibilidad`, enlazada desde Dirigentes):
cada respuesta al lado del **estado actual** del dirigente (`availability_status`, `is_active`,
zonas, estudios que da, en formación), con link a la ficha para aplicar cambios. Roles
coordinador de dirigentes / coordinador de estudios / dirección / admin. **Solo lectura: nada
actualiza al dirigente automáticamente**, según la decisión del punto. Si hay varias
convocatorias, un selector elige el ciclo (se encuentran por el prefijo del slug).

Verificado contra la BD real (con respuesta simulada de un dirigente real y limpieza después):
el formulario se encuentra por slug, las respuestas se leen legibles (el multi-select como
"Lunes, Miércoles", no JSON crudo), el estado del dirigente aparece al lado, y los bloques sin
input (info/section/personal_data) no se cuelan como preguntas.

Typecheck limpio, 1032 tests, lint 94/94.

**Pendiente de decisión (audiencia):** hoy no existe un "este formulario es solo para
dirigentes" — las audiencias que soporta `formFillAccess` son evento, grupo, lista de
convocados, o link enviado por correo. Se resolvió como el CDEB: **se distribuye por
convocatoria (broadcast) y solo quien la recibe puede llenarlo**. Si se prefiere que el link
circule libre y siga cerrado a dirigentes, hay que agregar una rama `isActiveLeader` en
`fill-access.ts` y su resolución — es chico, pero no estaba pedido en el punto.

```
Traer al sistema el formulario de disponibilidad de dirigentes que hoy vive en CCB.
Construirlo con el builder de formularios (seed idempotente, como el de preinscripción
CDEB). Contenido exacto del form original:

- Encabezado: "¡Gracias por tu servicio y compromiso!" + el versículo:
  «"Pero los maestros sabios, que enseñaron a muchos a andar por el buen camino, brillarán
  para siempre como las estrellas del cielo." Daniel 12:3 (TLA)»
- Nombre y teléfono: NO se preguntan — la persona está autenticada, se prellenan del perfil
  (en CCB eran campos manuales; acá sobran).
- "¿Tenés disponibilidad para dar un Estudio Bíblico?" (obligatoria) con la nota de
  contexto: "Las capacitaciones comenzarán la semana del 21 de setiembre, si Dios quiere.
  Los Niveles se abren a finales de cada mes." — OJO: esa fecha cambia cada ciclo; hacela
  parte del texto editable del form, no la quemes.
- "¿Tenés disponibilidad para ser suplente?" (obligatoria) con la nota: "Tomaremos en
  cuenta tu disponibilidad de lugar, días y modalidad."
- "¿Te gustaría capacitarte para dar algún estudio?" (obligatoria): Sí / No, ninguno.
- "¿Tenés algún comentario adicional?" (texto libre, opcional).

MEJORA SOBRE EL ORIGINAL (confirmada por la nota de "lugar, días y modalidad"): el form de
CCB preguntaba disponibilidad como texto; acá agregá campos estructurados condicionales —
si responde que SÍ puede dar estudio o ser suplente: días de la semana (multi), horario
(mañana/tarde/noche, multi), zonas (multi, desde el catálogo de sedes con useSedes) y
modalidad (presencial/virtual). Estructurado se puede filtrar; texto libre no. El patrón de
multi-select de días/zonas ya existe en REU-1.

LAS RESPUESTAS NO ACTUALIZAN NADA AUTOMÁTICAMENTE (decisión): quedan como insumo en una
vista para el coordinador de dirigentes, al lado del estado actual del dirigente
(availability_status, zone_preference, qualified_study_codes). El coordinador decide y
aplica los cambios con los flujos existentes. Un cambio automático movería asignaciones
sin criterio humano.

Convocatoria: enviable por broadcast a la lista de dirigentes activos, con el patrón de
COM-2 (link al form + bloque de primera vez).
Tests: prellenado; condicionales de disponibilidad; responder NO cambia availability_status.
```

### [x] DIR-2 · Correos de cumpleaños automáticos a servidores y dirigentes — HECHO 2026-08-21
Archivos: cron nuevo `/api/cron/birthday-greetings`, `vercel.json`, `message_templates`

Audiencia real medida antes de construir: **677** personas (dirigentes activos + servidores
activos, deduplicados — un miembro tiene una fila de `volunteers` por puesto), de las cuales
**652** tienen fecha de nacimiento y correo. El día más cargado del año tiene 6 cumpleaños.

Cron diario `0 12 * * *` UTC = **6:00am CR** (hueco libre; los demás arrancan 12:30 UTC).
Patrón idéntico a los existentes: `CRON_SECRET` o sesión, `pingHealthcheck`, `export const GET = POST`.

- Módulo puro `lib/notifications/birthday-rules.ts` con **12 tests**.
- Migración `20260822100000` (aplicada): tabla `birthday_greetings` con **UNIQUE (member_id,
  year)** y la plantilla `cumpleanos`.
- **Dedupe anual por la BD, no por consulta.** La fila se inserta ANTES de enviar: si dos
  corridas coinciden, la segunda choca con el UNIQUE y no saluda dos veces. Si el envío falla,
  se libera la reserva para reintentar mañana. Verificado contra la BD: el segundo insert del
  mismo año da 23505 y el del año siguiente pasa.
- **29 de febrero**: en años no bisiestos se felicita el 28 (`birthdayMatchDays` devuelve los dos
  días). **El caso es real**: hay 8 miembros nacidos el 29/2 en el padrón (0 hoy en la
  audiencia, pero basta que uno entre a servir).
- **Rebotados y quejas quedan fuera** — `sendSystemEmail` no filtra nada de eso por su cuenta,
  así que el cron lo hace: seguir escribiéndole a una dirección que rebotó quema la reputación
  del dominio.
- Respeta la preferencia `mensajes_sistema` (un saludo es lo más silenciable que hay).
- Plantilla **editable** (`is_system = false`, como pedía el punto) con fallback en código.
- **BONUS**: el día 1 de cada mes, notificación interna a coordinación de dirigentes/estudios
  con los dirigentes que cumplen ese mes, ordenados por día.

**Ojo con el límite diario de correos:** `sendSystemEmail` NO pasa por la cola de broadcasts, así
que no consume ni respeta `EMAIL_DAILY_LIMIT` — ese techo solo aplica a los envíos masivos. Como
protección propia, el cron tiene `MAX_GREETINGS_PER_RUN = 100`: con ~2 saludos por día es
holgadísimo, y frena un disparo accidental (una fecha mal migrada que ponga a medio padrón el
mismo día).

Un test del repo (`health.test.ts`) exigía documentar la variable nueva en `.env.example` —
buen guardarraíl, agregada.

Typecheck limpio, **1044 tests**, lint 94/94.

**Falta configurar (vos):** `HEALTHCHECK_URL_BIRTHDAYS` en Vercel, como los otros crons.

```
Cron DIARIO (patrón exacto de los existentes: CRON_SECRET, healthcheck, horario UTC
coherente) que felicite a los cumpleañeros del día.
1) AUDIENCIA: miembros activos que sean servidores activos (volunteers status active) o
   dirigentes (study_leaders is_active) — no todo el padrón. Con birth_date de ese día y
   correo válido (sin email_bounced).
2) PLANTILLA: "Feliz cumpleaños" editable en message_templates (seed idempotente, identidad
   de Theos, no is_system), con el nombre de la persona. Que comunicaciones pueda cambiar
   el texto sin tocar código.
3) DEDUPE ANUAL: no felicitar dos veces el mismo año (registrá el envío; ojo con el caso
   29 de febrero → felicitar el 28 en años no bisiestos).
4) Respetar preferencias de notificación (categoría mensajes_sistema o la que corresponda)
   y el límite diario de correos.
5) BONUS para el coordinador: el día 1 de cada mes, notificación interna al coordinador de
   dirigentes con la lista de cumpleañeros del mes (solo dirigentes), para el saludo
   personal.
Tests: dedupe anual, exclusión de rebotados, caso 29/2.
```

### [x] DIR-3 · Recordatorio de cierre de grupo una semana antes — HECHO 2026-08-21
Archivos: cron (extender `start-reminders` o crear `close-reminders`), `study_groups`, correo nuevo

Cron nuevo `/api/cron/close-reminders`, diario `30 14 * * *` UTC = **8:30am CR**. Molde de
`start-reminders` (CRON_SECRET, healthcheck, `export const GET = POST`).

**Nombres reales, distintos a los de la spec:** las columnas son `study_groups.ends_at` (no
`end_date`) y `study_plans.duration_weeks` (no `weeks`).

- Módulo puro `lib/studies/close-reminder.ts` con **16 tests**: cálculo de la fecha de fin,
  qué aviso toca, y los casos de la spec (dispara a −7 y no antes, dedupe, segundo a +7, grupo
  cerrado a tiempo no recibe nada).
- **`ends_at` manda** sobre el cálculo; solo si falta se usa inicio + semanas del plan. Importa:
  de los 101 grupos en curso hay **1 sin fecha de fin**, que sin el cálculo quedaría mudo.
- Ventana **"≤ 7 días", no "exactamente 7"**: si un día el cron no corre, el aviso sale al
  siguiente en vez de perderse. El dedupe evita que se repita.
- Migración `20260822130000` (aplicada): `close_reminder_sent_at` y `close_overdue_notified_at`
  (patrón de `start_notified_at`), índice parcial sobre los grupos en curso, y la plantilla
  `cierre_vencido`. La del primer aviso (`cierre_pendiente`) ya venía de la tanda de plantillas.
- Va al **dirigente y al co-dirigente**, deduplicando por correo (si son la misma persona o
  comparten dirección, un solo envío).
- **Segundo aviso a +7 días** con texto propio (el grupo ya terminó y traba la matrícula de los
  estudiantes al siguiente nivel) + notificación interna a coordinación. Y ahí para: el correo
  lo dice explícito ("este es el último recordatorio automático").
- La marca de dedupe se sella SIEMPRE al terminar el grupo, aunque un correo falle: si no, al
  día siguiente le vuelve a escribir a quien sí lo recibió.

**Ojo con la primera corrida:** hoy hay **36 grupos "próximos" y 35 "vencidos"** = ~142 correos
de una. Verificado que los 35 vencidos terminaron hace **entre 8 y 30 días** (el más viejo,
25) — o sea son cierres realmente pendientes, no deuda histórica, y el aviso corresponde. Aun
así el cron lleva `MAX_CLOSE_REMINDERS_PER_RUN = 60`: lo que no entra hoy sale mañana (no se
sella lo que no se avisó), y un dato malo no se vuelve un bombardeo.

Typecheck limpio, **1060 tests**, lint 94/94.

**Falta configurar (vos):** `HEALTHCHECK_URL_CLOSE_REMINDERS` en Vercel.

```
Cuando a un grupo en_curso le falta UNA SEMANA para terminar, correo al dirigente Y al
co-dirigente recordando que deben hacer el cierre, con link directo a la página de cierre
del grupo (/estudios/grupos/[id]/cierre).
1) CÁLCULO de la fecha de fin: usá study_groups.end_date si existe; si no, fecha de inicio
   + semanas del plan (study_plans.weeks). Documentá cuál manda cuando hay ambas (end_date
   gana: es la explícita).
2) MOLDE: copiá el patrón del cron start-reminders (dedupe con una columna tipo
   close_reminder_sent_at, CRON_SECRET, healthcheck).
3) SEGUNDO RECORDATORIO: si 7 días después de la fecha de fin el grupo sigue en_curso,
   un segundo y último correo ("tu grupo ya terminó y está pendiente de cierre") + una
   notificación interna al coordinador de estudios. No insistir más — a partir de ahí es
   gestión humana.
4) El correo usa el layout base (renderEmail) con plantilla de sistema y fallback
   hardcodeado, como inicio_capacitacion.
Tests: dispara a -7 días y no antes; dedupe; segundo recordatorio a +7; grupo cerrado a
tiempo no recibe el segundo.
```

### [x] DIR-4 · Envío automático de la evaluación al cerrar el grupo — YA CUBIERTO POR EST-12 (verificado 2026-08-21)
Ya especificado en **EST-12** (cron study-surveys copiando el de eventos) y desbloqueado con
la decisión de confidencialidad. Según la reunión, el formulario y la plantilla ya existen
en el sistema: verificá al implementar EST-12 si sirven tal cual (seed ya corrido) y en ese
caso el trabajo se reduce al cron + la asociación al dirigente. Sin punto aparte.

**No hizo falta escribir código.** EST-12 quedó hecho el 2026-08-06 y la cadena está completa
y **ya corrió en producción**. Verificado eslabón por eslabón:

1. **El cierre programa el envío** — `close/route.ts:119` llama `scheduleLeaderFeedback(id)`,
   que setea `study_groups.survey_send_at` (por defecto, el día siguiente). Best-effort: el
   cierre no se cae si esto falla.
2. **El cron despacha** — `/api/cron/study-surveys` (17:30 UTC, ya en `vercel.json`) toma los
   grupos con `survey_send_at` vencido y `feedback_requested_at` nulo, y manda `retro_dirigente`
   a los estudiantes. Dedupe en `feedback_requested_at`.
3. **El formulario existe y está activo**: "Encuesta de satisfacción — Estudio bíblico", 14
   campos.
4. **La asociación grupo → dirigente existe**: `leader_evaluations` con `group_id`, `leader_id`,
   `co_leader_id`, `score`, `comments`, `response_id`, más los `hidden_*` de moderación.

Evidencia de que funciona con datos reales: **5 filas en `leader_evaluations`**, 1 grupo con la
encuesta ya solicitada y 2 programadas.

Lo único que se sumó en esta tanda fue de tono, no de mecánica: el correo `retro_dirigente` se
emparejó con el resto de las plantillas del cierre (migración `20260822120000`).

### [x] DIR-5 · Página "Evaluaciones": tiquete por grupo, rol nuevo y flujo de revisión — HECHO 2026-08-21
Archivos: página nueva, migración (tiquetes + rol), `src/components/shared/RequestBoard.tsx`, `src/lib/auth/roles.ts`
Depende de: EST-12 (las evaluaciones tienen que existir). Se integra con EST-13 (el correo al dirigente sale de acá).

```
Cuando los estudiantes llenan la evaluación del dirigente (EST-12), se abre UN TIQUETE POR
GRUPO en una página nueva "Evaluaciones", donde el comité revisa el compilado antes de que
nada llegue al dirigente.
1) ROL NUEVO `evaluaciones` (migración: agregarlo al CHECK de member_roles, patrón de
   FRM-1/forms). Acceso a la página: rol evaluaciones + coordinador_dirigentes + admin.
   NADIE MÁS — ni direccion (mismo criterio que las recomendaciones CDEB de EST-9): es
   información sensible sobre personas.
2) TIQUETE POR GRUPO: se crea al llegar la primera respuesta del grupo (o al cerrar el
   grupo, decidilo con el flujo de EST-12). Muestra: grupo, dirigente y co-dirigente, el
   compilado de respuestas (conteos por pregunta + comentarios), tasa de respuesta, y —
   como la evaluación es IDENTIFICADA PERO CONFIDENCIAL — la lista de QUIÉNES LLENARON Y
   QUIÉNES NO (visible solo en esta página; los nombres jamás se asocian a respuestas
   individuales en ninguna vista, ni siquiera acá).
3) ESTADOS del tiquete, reutilizando RequestBoard (el tablero genérico de solicitudes):
   abierto → asignado (a alguien con rol evaluaciones) → resuelto, más ESCALADO (al
   coordinador de dirigentes). "Escalado" no existe en el flujo de solicitudes actual:
   agregalo como estado propio de este tablero sin tocar los estados de study_requests.
4) ENVÍO MANUAL AL DIRIGENTE: desde el tiquete, el botón que genera y envía el correo de
   retroalimentación de EST-13 (conteos + comentarios anónimos). Esto materializa la
   decisión de EST-13 de que el correo se revisa antes de enviarse: el tiquete ES esa
   revisión. Registrar quién lo envió y cuándo.
5) VIGENCIA: la ventana de respuesta de la evaluación es de DOS SEMANAS desde el envío.
   Pasadas las dos semanas el tiquete se puede cerrar; el cierre muestra el resumen de
   participación. Las respuestas tardías ya no entran (el form se desactiva o rechaza
   respuestas fuera de ventana — usá starts_at/ends_at de forms si aplica).
Tests: gate del rol (403 para direccion y para miembro); estados incluida la escalada;
nombres de respondentes visibles solo en la lista de participación, nunca junto a una
respuesta; envío manual dispara el correo de EST-13 una sola vez.
```

**Cómo quedó** (migración `20260822140000_evaluation_tickets.sql`):

- Rol `evaluaciones` en el CHECK (21 roles). `EVALUATION_ROLES` en `roles.ts` es la lista
  única — la usan la página, el sidebar, el ModuleGuard y los 4 handlers. `direccion`
  queda afuera, como pedía la ficha.
- `evaluation_tickets` (UNIQUE por `group_id`) + `evaluation_ticket_status_history`, mismo
  esquema que finance/study requests. Backfill: los grupos ya compartidos entraron como
  resueltos, no a la cola.
- `RequestBoard` ganó dos props opcionales, `allowEscalate` y `closeBlockedReason`.
  Estudios y finanzas no cambian de comportamiento.
- **La ventana NO salió de `forms.starts_at/ends_at`**, aunque la ficha lo sugería: la
  encuesta es UN formulario compartido por todos los grupos, así que una ventana ahí los
  cerraría todos a la vez. Es por grupo, 14 días desde `feedback_requested_at`
  (`src/lib/studies/evaluation-window.ts`), y se valida dentro de `canEvaluate`, así que
  vale igual para el GET que decide qué ve el estudiante y para el POST.
- La participación vive en su propio endpoint, aparte del compilado: nombres y respuestas
  nunca viajan en el mismo payload.

**Bug arreglado de paso**: `leader-feedback-report-send.ts` filtraba los comentarios
ocultados solo en el ramo de evaluaciones viejas. Un comentario que la coordinación había
ocultado igual le llegaba al dirigente si la respuesta venía por formulario — o sea, el
agujero exacto que la moderación existe para tapar. Ahora se excluyen sus textos y su nota
sigue contando en el promedio.

### [x] DIR-6 · Estados administrativos del dirigente: "en pausa" y "en revisión" — HECHO 2026-08-21
Archivos: `src/app/api/studies/leaders/schema.ts` (`availability_status`), `/estudios/dirigentes`, migración si hace falta CHECK

```
Además de activo/inactivo, el coordinador necesita distinguir POR QUÉ un dirigente no está
activo: "en pausa" (descanso acordado) o "en revisión" (situación bajo evaluación).
1) REUTILIZAR availability_status, no crear un campo paralelo: ya tiene available /
   assigned / resting / inactive. Mapeo: "en pausa" = resting (solo cambia la ETIQUETA en
   la UI a "En pausa"); agregar el valor nuevo en_revision (migración del CHECK si está en
   BD, y el schema zod).
2) VISIBILIDAD: estos matices son ADMINISTRATIVOS — los ve y edita solo
   coordinador_dirigentes, coordinador_estudios y admin. Para el resto de roles que ven
   dirigentes, un dirigente resting o en_revision se muestra simplemente como inactivo,
   sin el matiz. "En revisión" es información delicada: cuidá que no se filtre en listados,
   exports ni en la vista del propio dirigente.
3) COHERENCIA con las reglas existentes: EST-1 (dirigente con grupo activo ⇒ activo
   automático) debe respetar en_revision — si alguien está en revisión, asignarle un grupo
   NO lo activa en silencio: bloqueá la asignación con un mensaje ("Este dirigente está en
   revisión; contactá al coordinador"). El bulk-status y la activación individual igual.
4) Filtros por estos estados en /estudios/dirigentes para los roles que los ven.
Tests: etiquetas visibles solo para los roles correctos; asignar grupo a un en_revision se
bloquea; el dirigente no ve su propio matiz.
```

**Cómo quedó** (migración `20260822150000_leader_en_revision.sql`):

- Se reusó `availability_status`, como pedía la ficha. Dato del arranque: la columna tenía
  4 valores pero solo 2 en uso (126 `available`, 359 `inactive`, **0** en `assigned` y
  `resting`) porque ninguna pantalla la editaba — era un espejo de `is_active`. `resting`
  solo cambió de etiqueta a "En pausa"; lo único nuevo en el CHECK es `en_revision`.
- La regla vive en `src/lib/studies/leader-admin-status.ts` (puro, 13 tests).
  `LEADER_ADMIN_ROLES` = coordinador_dirigentes + coordinador_estudios + admin. `direccion`
  afuera, aunque tenga el módulo estudios completo.
- **El colapso ocurre en el API, no en la UI**: `GET /api/studies/leaders` y el de
  disponibilidad devuelven `inactive` en lugar del matiz para quien no lo administra. Así
  el dato no sale del servidor y no depende de que cada pantalla se acuerde de esconderlo
  (el dirigente tampoco ve el suyo, por la misma vía).
- `assigned` NO es elegible a mano: lo derivaría el sistema de tener un grupo activo y
  elegirlo crearía un estado que contradice la realidad.
- Coherencia con EST-1: el guard de asignación corta ANTES de escribir el grupo (verificado:
  0 grupos creados en el intento). Activar, asignar y el bulk quedan bloqueados; el bulk los
  devuelve en `skipped` junto a los "no recomendado".
- Desactivar NO borra el matiz: quien estaba en pausa sigue en pausa. Sin eso, el toggle
  normal habría borrado justamente el porqué que DIR-6 agrega.
- Salir de revisión limpia el matiz antes de activar, porque el guard rechaza a los en
  revisión y si no nadie podría salir nunca.

**Aceptado, no resuelto**: las tres auto-activaciones best-effort (import de grupos,
prematrimonial, grupo sucesor de un pago) ahora simplemente no activan a un dirigente en
revisión y siguen. En el caso del sucesor eso puede dejar un grupo activo con dirigente
inactivo — la misma excepción que ya estaba aceptada para "no recomendado" y que su propio
comentario documenta como gestión manual.

### [x] DIR-7 · Reporte de dirigentes — HECHO 2026-08-21
Archivos: `/reportes` (página/bloque nuevo), `report_snapshots`, cron `report-snapshots`

```
Página o bloque nuevo en Reportes con el pulso del cuerpo de dirigentes:
1) MÉTRICAS: dirigentes activos (is_active) · cuántos están dando estudio ahora (grupo
   en_matricula o en_curso como leader o co_leader) · disponibles sin grupo · en pausa /
   en revisión (solo para los roles que ven ese matiz, DIR-6) · y el TOTAL DE PERSONAS
   CAPACITADAS PARA DAR CADA TIPO DE ESTUDIO, que sale directo de
   study_leaders.qualified_study_codes agrupado por código de plan.
2) Desglose por sede/zona (zone_preference) y evolución simple (comparación contra el
   snapshot de hace 3 y 6 meses).
3) CACHÉ: entra al cron nocturno report-snapshots como los demás datasets — no cálculo en
   vivo: cruza varias tablas y el patrón del módulo es snapshot.
4) PERMISOS: requireModuleView('reportes') como el resto, pero el desglose de en_revision
   solo para coordinador_dirigentes/coordinador_estudios/admin (consistente con DIR-6).
Tests: los conteos cuadran con un caso armado (dirigente con grupo, sin grupo, en pausa);
capacitados por tipo suma bien con códigos múltiples.
```

**Cómo quedó** (`/reportes/dirigentes`, migración `20260822160000_leader_report_history.sql`):

- Cálculo puro en `src/lib/reports/dirigentes.ts` (27 tests). Cinco buckets EXCLUYENTES que
  suman el total (hay test de la invariante); "dando ahora" gana sobre el estado configurado,
  porque dar un estudio es un hecho y el estado una intención.
- **Se reportan DOS columnas, no una.** La ficha decía "capacitadas ... de
  qualified_study_codes", pero en el esquema son dos cosas distintas que la UI ya nombra
  distinto: `formation_study_codes` = formación (para qué está capacitado) y
  `qualified_study_codes` = disponibilidad (qué está dispuesto a dar). Dan números
  diferentes en producción (N4: 311 capacitados vs 267 dispuestos), y la brecha es
  capacidad que existe y no está ofrecida — justo lo accionable.
- **La evolución necesitó tabla nueva.** `report_snapshots` tiene PK (report_key) y el cron
  hace upsert: solo existe la foto más reciente. Y no se puede reconstruir hacia atrás —
  `volunteers.start_date` está poblado (951/998) pero `end_date` tiene UNA fila, así que se
  perdería a quienes ya no sirven y el pasado saldría subestimado, mostrando crecimiento
  falso. Se creó `leader_report_history` (un punto por día, upsert por fecha) que empezó a
  acumular el 2026-08-21; hasta que haya datos el reporte dice "todavía sin dato" con la
  fecha de arranque, y `nearestPoint` tolera ±45 días antes de rendirse.
- DIR-6: el colapso de pausa/revisión a inactivos ocurre en `getDirigentesReport(verMatiz)`,
  o sea antes de serializar. El conteo real no viaja en el JSON.

**Hallazgos en producción, expuestos en el propio reporte** (bloque "Datos por revisar"):

- **15 dirigentes llevan un grupo abierto estando inactivos** — contradice EST-1 ("nunca un
  dirigente inactivo con grupo activo"). Probablemente el residuo de las activaciones
  best-effort documentadas en DIR-6.
- **4 personas llevan un grupo abierto sin fila en `study_leaders`**, así que no aparecen en
  ningún conteo. (Ojo: una consulta con LEFT JOIN los suma a los anteriores y da 19; son
  dos problemas distintos y el reporte los separa.)
- **`zone_preference` está vacío para los 126 activos**, así que el desglose por zona no
  tiene nada que mostrar y la tarjeta lo dice. El formulario de DIR-1 recoge la zona pero
  es de solo lectura: nada escribe esa columna todavía. Queda como pendiente real.

### [~] MIG-1 · Limpieza de datos de prueba + reimportación del histórico reciente (CCB) — ETAPA 1 HECHA 2026-08-21
Archivos: `scripts/limpiar-datos-de-prueba.ts` (ya existe), scripts de import existentes (`import-study-history.ts`, `import-charla-attendance.cjs`, `import-active-students.ts`, `import-grupos.ts`), exports de CCB que aporta Floriana

```
Operación de datos en dos mitades: LIMPIAR lo que fue prueba y REIMPORTAR lo real que pasó
en CCB durante estos meses. Orden estricto: primero limpiar, después importar — si no, la
reimportación choca con los datos de prueba. TODO con dry-run y mi aprobación por etapa.

────────────────────────────────────────
ETAPA 0 · SILENCIO DE CORREOS (ANTES de tocar nada)
El sistema NO debe mandar correos a miembros todavía: todo lo actual es prueba de procesos.
Y esta operación puede disparar envíos sola — ejemplos reales del riesgo:
  · importar grupos finalizados puede hacer que el cron de encuestas (study-surveys/EST-12,
    si ya existe) los vea como recién cerrados y mande la evaluación a todos;
  · los pagos de prueba pendientes alimentan el recordatorio de los lunes
    (payment-reminders);
  · start-reminders, folleto-blocks y event-surveys corren a diario en producción.
Implementá un MODO SILENCIOSO global antes de la limpieza y la importación:
1) Una env tipo EMAIL_SILENT_MODE=1 que el helper central de envío (src/lib/email/provider)
   respete: registra en log lo que HABRÍA enviado (destinatario + asunto) y no envía nada.
   Guard en un solo lugar, no cron por cron — cualquier camino de envío pasa por ahí.
   Excepción única: los correos de auth (reset de contraseña) siguen saliendo, porque el
   staff los necesita para entrar.
2) Los imports deben correr con los disparadores de notificación desactivados o con
   marcas de "ya notificado" (survey_sent_at, start_notified_at, close_reminder_sent_at,
   assignment_notified_key…) selladas al importar, para que al apagar el modo silencioso
   no salga una ola retroactiva de correos viejos.
3) Al terminar MIG-1, ANTES de apagar el modo silencioso: un reporte de qué habría enviado
   el sistema en las últimas 24 h. Si la lista no está vacía y limpia, no se apaga.
El modo silencioso queda encendido hasta que yo dé la orden (cuando los datos sean
oficiales), y apagarlo es una decisión explícita, no parte de esta tarea.

────────────────────────────────────────
ETAPA 1 · LIMPIEZA
a) El set marcado [prueba] / PRUEBA-: correr scripts/limpiar-datos-de-prueba.ts (ya existe,
   con dry-run). Es la parte fácil.
b) Grupos de prueba NO marcados, y pagos y matrículas hechos después del 1 de junio 2026:
   según la operación, todo lo transaccional posterior a junio fue prueba (el sistema no
   estaba en uso real). PERO acá va la cautela:
   - Generá primero un INVENTARIO: todos los study_groups creados después del 2026-06-01
     que no vengan de la migración histórica, con sus matrículas, pagos, check-ins y
     asistencias colgando; y todos los payments/enrollments posteriores a esa fecha.
     Sepárame el inventario en "claramente prueba" (creados por cuentas del equipo,
     nombres obvios de test) y "dudosos".
   - ACLARACIÓN (2026-08-08): aunque el staff entró el 3 de agosto, sus datos TAMPOCO son
     oficiales — son pruebas de procesos. Al menos matrículas y eventos posteriores a junio
     son prueba, incluidos los del staff. Igual van al inventario para mi revisión (no a
     borrado ciego), pero la presunción es que se limpian.
   - Yo reviso el inventario y marco qué se borra. Nada se borra sin esa revisión.
   - Borrado en orden de dependencias (check-ins → asistencias → pagos → matrículas →
     grupos), como hace el script de limpieza existente. Sin tocar members reales ni sus
     cuentas de auth.

**ETAPA 1 · EJECUTADA el 2026-08-21.** Respaldo previo en
`~/theos-backups/mig1-pre-borrado-2026-08-21.json` (128 KB, incluye todo lo borrado).

Lo importante que salió del inventario: **`created_at` NO sirve para separar prueba de
real.** La ficha proponía borrar "lo transaccional posterior al 1 de junio", pero TODO tiene
created_at posterior a esa fecha —los 2,183 grupos, las 40,493 matrículas, los 3,509
eventos— porque las importaciones históricas corrieron después. Y no hay columna de
procedencia en study_groups ni study_enrollments: nada dice "esto vino de un import".

El discriminador que sí sirvió fue la **huella de las cargas masivas**: un import crea miles
de filas en el mismo minuto, lo hecho a mano queda aislado. Los 2,167 grupos del histórico
entraron el 18-jul a las 18:53, todos en un minuto. Eso partió el universo en tres lotes
limpios, y solo 16 grupos quedaron fuera del histórico.

Borrado (aprobado por el usuario, lote por lote):

| | Antes | Después |
|---|---|---|
| study_groups | 2,183 | **2,167** (−14 `[prueba]`, −2 a mano) |
| study_enrollments | 40,493 | **40,451** |
| payments | 12 | **0** |
| members | 23,777 | **23,736** (−41 `PRUEBA-`) |
| event_checkins | 168,653 | **168,565** |

- Los 2 grupos sin marcar eran `N3 — Casona Escalante` y `N1 — Alajuela` (20-jul, pruebas
  del flujo de creación). De ellos solo colgaban 1 matrícula y 1 pago; las otras 13 FKs a
  study_groups estaban en 0.
- Los 12 pagos se fueron completos, incluidos los 3 de personas reales — el usuario confirmó
  que los tres fueron pruebas de proceso, incluido el que estaba en `paid`.
- GOTCHA repetido: `auth.admin.deleteUser` falló con `{}` en los 18 usuarios (mismo problema
  de AUTH-1). Se borraron con SQL directo sobre `auth.users`, guardado por el dominio
  `@prueba.theosplace.invalid` — TLD reservado, no puede ser de una persona real.
- Snapshots de reportes refrescados después: el de dirigentes pasó de 485 a 483 designados.
  Los hallazgos de calidad de DIR-7 (15 con grupo estando inactivos, 4 sin ficha) SIGUEN
  ahí, o sea que eran del histórico y no artefactos de la prueba.

**ETAPA 0 · HECHA el 2026-08-21** (después de la Etapa 1, que no la necesitaba porque
borrar no dispara correos).

- `EMAIL_SILENT_MODE=1` y el guard en **un solo lugar**: `sendEmail()` de
  `src/lib/email/provider.ts`, por donde pasa todo. Un camino de envío nuevo queda cubierto
  sin que nadie se acuerde. La regla es pura y testeada en `src/lib/email/silent-mode.ts`.
- El guard va ANTES de `assertEmailConfigured()`: con el modo encendido el correo no sale,
  así que da igual si SES está configurado — y el modo también sirve en local sin SES.
- **La excepción son 2 call sites y nada más**, marcados `authCritical: true` para que
  `grep authCritical` liste la lista completa: `sendPasswordLink` (alguien pide entrar) y
  `sendAccountReadyEmail` (botón del staff para UN miembro, desde `/password-reset` y
  `/resend-activation`). Ninguno lo dispara un cron ni un import. Se marca en el call site
  a propósito y no adivinando por el asunto, que se rompería al cambiar el copy.
- Lo silenciado queda en la tabla `silenced_emails` (destinatario + asunto + kind, NO el
  cuerpo). Sin tabla el modo es ciego: los logs de Vercel rotan y no se pueden agrupar.
- Reporte: `npx tsx scripts/reporte-correos-silenciados.ts` (`--horas N`, `--todo`,
  `--purgar`). Agrupa por asunto, que es lo que dice QUÉ disparador se activó.
- Verificado de punta a punta contra SES: correo normal con el modo encendido devuelve
  `skipped-silent-mode` y no sale; el `authCritical` sí sale (llega con message-id real de
  SES); solo el silenciado queda registrado; con el modo apagado vuelve a enviar.

**PENDIENTE de la Etapa 0**: el punto 2 de la ficha — sellar las marcas de "ya notificado"
(`survey_sent_at`, `start_notified_at`, `close_reminder_sent_at`, `assignment_notified_key`…)
al importar, para que al apagar el modo silencioso no salga una ola retroactiva. Eso se hace
DENTRO de cada import de la Etapa 2, así que va cuando se corra esa etapa, no antes.

**PENDIENTE de MIG-1**: Etapa 2a (grupos cerrados) y 2b (personas que pasaron). La asistencia
(2c) ya la importó el usuario por su cuenta.

────────────────────────────────────────
ETAPA 2 · REIMPORTACIÓN desde CCB (los exports los paso yo — pedímelos por tipo)
a) GRUPOS CERRADOS de estos meses: importarlos como grupos en estado finalizado, con
   dirigente matcheado por cédula o external_id, usando/extendiendo import-grupos.ts y el
   flujo de import de EST-2.
b) PERSONAS QUE PASARON EL CURSO: sus matrículas como enrollments completed (con nota si el
   export la trae — ver import-panorama-grades como referencia), colgando del grupo
   correcto. Esto alimenta prerequisitos de la cadena (N1→N2…), así que la elegibilidad de
   septiembre depende de que quede bien.
c) ASISTENCIAS DE LOS ÚLTIMOS MESES: check-ins de charla desde el corte de junio hasta hoy,
   con import-charla-attendance.cjs (dedupe contra lo ya importado: mismo miembro + mismo
   evento no se duplica). Esto recalcula la asistencia activa y las sedes automáticas, que
   HOY están desactualizadas — la elegibilidad de estudios depende de esto.
Matcheo de personas siempre por external_id o cédula normalizada; sin fallback automático
por nombre (reporte de no matcheados para revisión).

────────────────────────────────────────
ETAPA 3 · RECÁLCULO Y VERIFICACIÓN
- Correr refresh_member_sedes (masivo) y verificar que el trigger de is_donor no necesite
  recálculo (las donaciones no se tocan en esta operación).
- Números de control antes/después: total de grupos finalizados, enrollments completed,
  check-ins por mes, miembros con asistencia activa. Reportame el antes y el después de
  cada etapa.
- Muestreo: 5 personas conocidas (me pedís los nombres) y verificamos a mano que su
  historial quedó correcto.
Correr en STAGING primero de punta a punta; a producción solo con el reporte aprobado.
```

---

## Fase 9 — Feedback de uso (2026-08-20)

### [x] EST-14 · Motivo de retiro obligatorio: verificar por qué no se aplica — HECHO 2026-08-21
```
Se reporta que en el cierre el motivo de retiro sigue siendo opcional, PERO la regla ya
existe: hay un test que dice "un retirado SIN motivo bloquea (obligatorio desde
2026-08-04)" en src/lib/studies/close-payload.test.ts:77, y el payload usa withdraw_reason
(campo distinto de fail_reason, que es el de reprobado).
Diagnosticá por qué no se cumple en la práctica. Sospechas en orden:
 a) La UI del cierre sigue mostrando el campo como opcional (sin asterisco) o no bloquea
    el submit — la regla pura está bien pero el formulario no la aplica.
 b) La UI escribe fail_reason en vez de withdraw_reason para los retirados, así que la
    validación mira un campo vacío… o al revés, valida uno que la UI no llena.
 c) Hay un camino de cierre (masivo, o desde otra pantalla) que no pasa por la validación.
Arreglá la causa raíz y dejá los tres puntos consistentes: UI (asterisco + bloqueo con
mensaje que diga de cuál estudiante falta), regla pura y validación server-side del POST.
Reportame cuál era la causa.
```

**La causa era (c), y ninguna de las sospechas de (a) o (b).** El asistente de cierre estaba
BIEN en los tres puntos: la regla pura (`missingReasons`), la UI (asterisco, `aria-required`,
borde coral y bloqueo real del paso 2 en la línea 448) y la validación del POST usan todas
`withdraw_reason`. Nada de eso había que arreglar.

El agujero era **otro camino de retiro**: el botón "Desinscribir" de la ficha del grupo
(`estudios/grupos/[id]/page.tsx`), que llamaba `DELETE /enrollments` con el motivo
**hardcodeado** `'Desinscrito desde el grupo'` sin preguntarle nada a nadie. Y el endpoint
declaraba `reason?` — opcional. O sea que se podía retirar gente sin motivo real por ahí,
mientras el cierre lo exigía.

Arreglado:
- Regla pura nueva `withdrawReasonError` + `WITHDRAW_REASON_MIN = 10` en close-payload.ts.
  El mínimo NO es la defensa principal (el placeholder viejo tenía 26 caracteres y habría
  pasado); es para que un obligatorio no se llene con un punto.
- `DELETE /api/studies/groups/[id]/enrollments` ahora exige el motivo → 400
  `motivo_requerido`. Se valida server-side porque el endpoint lo puede llamar cualquiera
  con sesión.
- El modal de "Desinscribir" pide el motivo, con el error visible ANTES de apretar y el
  botón bloqueado hasta que sirva.
- De paso: en el cierre, "Motivo del retiro" era la única de las dos obligatorias que NO se
  veía como tal (gris en vez de coral). Ahora las dos se ven igual — plausiblemente parte de
  por qué se percibía como opcional.

Sin daño en los datos: 0 matrículas retiradas en la base al momento del arreglo.

Alcance verificado: la regla pura con tests, y que los otros dos llamadores del endpoint de
matrículas son POST (no DELETE), así que exigir el motivo no rompe ningún flujo existente.
NO se probó el round-trip HTTP con sesión. Nota: el endpoint permite que un miembro cancele
su propia matrícula, y hoy exigirle 10 caracteres aplicaría también ahí — no hay UI para ese
caso todavía, pero si se construye conviene revisar si corresponde la misma exigencia.

### [x] EST-15 · Recomendación CDEB: el dropdown de "otro estudio primero" solo con capacitaciones — HECHO 2026-08-21
```
En el formulario de recomendación a CDEB (EST-9), la opción "Sí, pero debería llevar otro
estudio primero" abre un dropdown de estudios. Hoy lista todo; debe listar SOLO
capacitaciones — quitá niveles (N1-N4) y campañas.
Filtrá por etapa del plan: incluí inicial, intermedia y avanzada; excluí 'niveles' y
'campaña' (LEVEL_TO_STAGE en src/lib/studies/eligibility.ts). Ojo con los planes inactivos:
no ofrezcas estudios desactivados.
Validá también server-side: si llega un plan de niveles o campaña en ese campo, rechazalo.
```

**Cómo quedó.** Regla pura `isPriorStudyOption` / `priorStudyOptions` en
`cdeb-recommendation.ts`, usada por el dropdown y por el POST (el dropdown filtrado no impide
mandar cualquier code al endpoint). Se valida también en BORRADOR: un code inválido lo es
igual. Reutiliza `isArchivedPlan` de plan-visibility en vez de duplicar la dualidad
is_archived/is_active.

Contra el catálogo real el dropdown pasó de **32 planes activos a 19**. Los 13 que salieron:

- las **7 campañas** (CAMP, PQET, PRETRANS, REDESC, TPS, TRANS, UFA) y los **4 niveles**
  (N1-N4) — lo que pedía la ficha;
- **BUS**, que es charla introductoria (`is_curricular = false`), no un estudio;
- **CDEB**, que no pedía la ficha y salió al revisar el catálogo: es de etapa avanzada, así
  que el filtro por etapa NO lo saca, y el formulario "¿debería ir a CDEB?" se ofrecía a sí
  mismo como paso previo. Mensaje propio en el API ("CDEB no puede ser su propio requisito").

Si no quedaran capacitaciones activas, el dropdown lo dice en vez de aparecer vacío.

### [x] REU-3 · El enlace de "¿grupo equivocado?" también en Matrícula — YA ESTABA HECHO (verificado 2026-08-21)
```
El enlace "¿Te matriculaste en el grupo equivocado?" (REU-2) quedó solo en /mis-pagos.
Ese no es el momento de dolor: la persona se da cuenta del error justo después de
matricularse, no cuando va a pagar.
Agregalo (SIN quitarlo de /mis-pagos) en:
 - la pantalla de CONFIRMACIÓN de matrícula, que es donde se ve el error de inmediato;
 - la ficha del grupo en la vista del estudiante y en su historial de estudios del perfil.
Mismo modal de reubicación que ya existe. Que el texto explique que lo revisa el
coordinador y que mientras tanto sigue matriculado en su grupo actual.
```

**Ya estaba, y con tests que lo fijan.** `src/lib/studies/relocation-entry.test.ts` verifica
los cuatro accesos y el copy del modal, y los 9 tests pasan:
`matricula/confirmacion` (línea 154), `estudios/grupos/[id]` (690), `mis-pagos` (199, no se
quitó) y `MemberParticipationTab` (165, el historial del perfil). El modal ya dice que lo
revisa el coordinador, que no es automático y que sigue matriculado en su grupo actual.
Se hizo junto con REU-2; no hacía falta tocar nada.

### [x] FRM-3 · Exportar respuestas de formularios también en Excel — HECHO 2026-08-21
```
Hoy las respuestas de un formulario se bajan solo en CSV. Agregá export en XLSX además del
CSV (dos botones, o un selector de formato).
El XLSX debe salir usable, no un CSV renombrado: encabezados en negrita, ancho de columna
razonable, panel congelado en la fila 1 y autofiltro. Una fila por respuesta, una columna
por campo del formulario, más las columnas de contexto (quién respondió si el form no es
anónimo, fecha).
Cuidado con Excel y los datos: cédulas y teléfonos como TEXTO (si no, Excel se come los
ceros iniciales y convierte números largos a notación científica) y fechas como fecha real,
no string. Respetá el mismo gate de permisos que el CSV (rol forms, o acceso puntual al
formulario).
```

**Cómo quedó.** Dos botones (CSV / Excel), no un selector: son dos clics, no una
configuración. El CSV se sigue armando en el cliente (ya tiene los datos); el XLSX sale de
`GET /api/forms/[id]/responses/export` porque ExcelJS no cabe en el bundle de una pantalla.
Mismo gate que el CSV: se repite `formViewerScope` (módulo, grant puntual, encargado del
evento) en vez de heredarlo.

Reglas puras y testeadas en `src/lib/forms/xlsx-export.ts`: el formato de columna se declara
**antes** de escribir (`'@'` para texto), que es lo que de verdad evita que Excel se coma el
cero de una cédula — mandar un string no alcanza. Solo `number` y `scale` van como número;
un `select` con opciones "1".."5" es una etiqueta, no una cantidad. Las fechas van como Date
ancladas a mediodía UTC para que no se corran de día en Costa Rica.

Verificado generando el archivo y volviéndolo a leer con datos reales (8 respuestas de la
preinscripción a CDEB): encabezado en negrita, panel congelado, autofiltro, anchos acotados
entre 12 y 42, fechas como Date y los checkbox múltiples unidos con coma igual que el CSV.

**Extra**: `personal_data` NO genera columna. Parece un campo (pide cédula y teléfono) pero
es un bloque que actualiza el perfil y nunca guarda nada — 3 campos de ese tipo y 0 valores
en la base. El CSV lo incluía junto con `info` y `page_break`, así que traía columnas siempre
vacías; ahora los dos exports usan el mismo `isDataField` y salen con las mismas columnas.

### [x] PRE-11 · Grupo prematrimonial: dirigente Y co-dirigente obligatorios (pareja) — HECHO 2026-08-21
```
Al crear un grupo de prematrimonial solo se puede elegir UN dirigente. El prematrimonial
siempre lo dan en PAREJA, así que dirigente y co-dirigente deben ser AMBOS obligatorios en
ese tipo de grupo.
1) Detectá el tipo de grupo por su plan (PREMAT) y, en ese caso: co-dirigente pasa de
   "(opcional)" a obligatorio, y no se puede guardar sin los dos. Para el resto de grupos
   nada cambia.
2) El dropdown debe listar SOLO personas aprobadas para dar prematrimonial — no cualquier
   dirigente. Revisá cómo se marca esa habilitación hoy (study_leaders.qualified_study_codes
   con el código del plan es lo más probable); si no existe la marca para PREMAT, decímelo
   antes de inventar un campo.
3) Validación server-side también, no solo en el form.
4) Coordiná con GRU-2/EST-4: el checkbox de disponibilidad y el orden de los campos del
   dirigente ya se reordenaron; no rompas eso.
```

**La marca EXISTÍA, no hubo que inventar nada** (era la pregunta del punto 2). PREMAT
aparece en `study_leaders.formation_study_codes` (32 dirigentes) y en `qualified_study_codes`
(30). Se acepta **cualquiera de las dos**: los datos están repartidos —28 en las dos, 4 solo
en formación, 2 solo en disponibilidad— y dejar fuera del dropdown a alguien realmente
habilitado es peor que ofrecer un conjunto algo más amplio, porque el coordinador igual
elige. Da 34 personas, 17 activas.

Regla pura en `src/lib/studies/premat-group.ts` (14 tests), usada por las dos pantallas
(crear y editar) y por `createGroup`/`updateGroup`. Además:

- En PREMAT se quitó el checkbox de **"dejar dirigente pendiente"**: si los dos son
  obligatorios, "pendiente" era la puerta de atrás.
- `updateGroup` lee el plan y el dirigente que el patch NO trae desde el grupo actual — si no,
  editar el horario de un PREMAT parecería dejarlo sin co-dirigente y se bloquearía solo.
- Si no se puede resolver la habilitación de alguien, NO bloquea: ese guard es una ayuda, no
  una barrera de seguridad, y un dato que falta no puede impedir crear el grupo.
- El checkbox de disponibilidad y el orden de los campos de GRU-2/EST-4 quedaron intactos:
  el co-dirigente sigue en su bloque aparte, solo cambia su etiqueta y su obligatoriedad.

### [x] UI-1 · Legibilidad: tamaño de letra y contraste — HECHO 2026-08-21
```
Reporte de uso real: "la letra está un poco pequeña y con bajo contraste, a veces cuesta
leer". Es transversal, no de una pantalla.
1) Auditá los estilos de texto contra WCAG AA: contraste mínimo 4.5:1 para texto normal y
   3:1 para texto grande. Los sospechosos son las clases con opacidad sobre navy que se
   repiten en todo el sistema (text-navy-light/60, /70, text-[11px], text-[12px] en
   etiquetas y ayudas). Listame las combinaciones que no pasan, con dónde se usan.
2) Proponeme una corrección SISTÉMICA, no parche por pantalla: subir el piso de tamaño de
   los textos secundarios (nada por debajo de 12px, y 13-14px para texto que se lee de
   corrido) y reemplazar las opacidades bajas por colores sólidos del design system que sí
   pasen contraste. Que quede documentado en el design system para que las pantallas
   nuevas no repitan el problema.
3) Aplicalo primero en las pantallas que usa el MIEMBRO desde el celular (matrícula,
   /mis-pagos, perfil, eventos, /ayuda) y después en las de gestión.
4) No cambies la identidad visual: mismos colores de marca, solo tamaños y niveles.
Mostrame antes/después de 3 pantallas para aprobar antes de aplicarlo en masa.
```

**Primero: la premisa de la ficha estaba en buena parte vencida.** Lo que señalaba como
sospechoso ya no existía — `text-navy-light/60` y `/70`: **0 usos**; `text-gray-400`: **0**;
9px: **0**. Y el `/80`, que se usa **2,092 veces**, da **6.41:1** sobre blanco y 6.01 sobre
surface-low: pasa AA cómodo. El "bajo contraste" reportado NO venía de ahí.

**Lo que sí fallaba, medido:**

| Combinación | Ratio | Alcance |
|---|---|---|
| blanco sobre `coral` #EF5554 | **3.44** ✗ | ~192 botones con texto de 10-14px (ninguno califica como "texto grande") |
| blanco sobre `teal` #70BDC2 | **2.15** ✗ | 13 chips + 3 botones |
| blanco sobre `teal-deep` #519DA2 | **3.14** ✗ | ~30 botones de confirmar/aprobar |
| `coral` como texto sobre blanco | **3.44** ✗ | mensajes de error |
| placeholders `/50` | **2.78** ✗ | 30 |
| texto en `/50` | **2.78** ✗ | 18 |
| negro 50% hardcodeado | **3.95** ✗ | 2 (calendario público) |

**Corrección sistémica, en tokens.** Se oscurecieron los DOS tonos derivados —los que
existen justamente para llevar texto encima— y la identidad no se tocó: navy #161440 y teal
#70BDC2 siguen iguales.

- `coral` #EF5554 → **#D63E3D** (4.55:1). Arregla los botones Y los mensajes de error de una.
- `coral-deep` #D94241 → **#C43635** (5.35:1); el `#D94241` daba 4.37 y no alcanzaba.
- `teal-deep` #519DA2 → **#3B7579** (5.24:1, y 4.59 como texto sobre su propio tinte).
- `bg-teal` pasa a texto **navy** (8.07:1) en vez de blanco: no se toca el color, se cambia
  el texto.
- Texto sobre tinte coral usa `coral-deep` (4.75) y no `coral` (4.04, no alcanzaba).
- `/50` → `/80`; los 34 `text-[10px]` → 11px; el negro 50% → 65%.
- Se reemplazaron los **40 hexes hardcodeados** de coral que se saltaban el token.

**Un error propio, corregido:** el reemplazo en masa de `/50` y `/40` tocó 14 casos que
estaban BIEN — separadores «·», íconos con `aria-hidden`, y controles deshabilitados, todos
exentos de AA. Oscurecerlos empeoraba la jerarquía visual sin que nadie leyera mejor. Se
revirtieron uno por uno y quedó documentado en el design system para no repetirlo.

**Queda fijado por test, no por acuerdo:** `src/lib/contrast.ts` calcula los ratios (con
composición de opacidad, porque medir el color puro da un número falso) y
`contrast.test.ts` (17 tests) falla si un par baja de 4.5:1 o si vuelve una clase retirada.
Documentado en `Theos Place Design System/accessibility.md` y en AGENTS.md.

**Decisión abierta**: la ficha pide "nada por debajo de 12px", lo que dejaría fuera los 429
micro-labels de 11px que AGENTS.md permite. AA no fija tamaños mínimos, solo contraste, así
que no es un incumplimiento — es una decisión de diseño que quedó anotada sin resolver.

**No cubierto** (fuera del alcance acordado, sigue en AUD-1): teclado, lectores de pantalla,
área táctil, móvil a 390px, estados vacíos, jerga filtrada y conteo de fricción.

### [x] AUD-1 · Auditoría de accesibilidad, legibilidad y UX — INFORME ENTREGADO 2026-08-21
Archivos: transversal — `src/components/**`, `src/app/(admin)/**`, `src/app/(public)/**`, design system
Absorbe **UI-1** (que era solo tamaño y contraste): correr AUD-1 primero, y UI-1 queda como el subconjunto que se arregla en la primera tanda.

```
Auditoría transversal de accesibilidad, legibilidad y experiencia de uso. Contexto que
define las prioridades: el sistema lo usan ~23 000 miembros de todas las edades, la mayoría
DESDE EL CELULAR y muchos con poca familiaridad tecnológica; el staff lo usa a diario en
escritorio. Ya hay un reporte de uso real: "la letra está pequeña y con bajo contraste".

ENTREGABLE: un informe en docs/auditoria-ux-2026-08.md con hallazgos priorizados
(bloqueante / importante / menor), cada uno con: dónde ocurre, por qué importa, y la
corrección propuesta. NO arregles nada todavía — primero el informe, yo priorizo, después
implementamos por tandas. Excepción: los arreglos triviales y sin riesgo (un aria-label
faltante, un alt vacío) los podés hacer sobre la marcha y listarlos aparte.

────────────────────────────────────────
1) ACCESIBILIDAD — contra WCAG 2.2 nivel AA
   - CONTRASTE: 4.5:1 texto normal, 3:1 texto grande y elementos de interfaz. Sospechosos
     conocidos: las opacidades sobre navy que se repiten en todo el sistema
     (text-navy-light/60, /70), los textos de 11-12px en etiquetas y ayudas, los placeholders,
     y el texto sobre los fondos coral y teal. Listá cada combinación que falle con su ratio
     real y dónde se usa.
   - TECLADO: se puede completar sin mouse los flujos críticos (login, matrícula, check-in,
     revisión de pagos). Foco visible siempre, orden de tabulación lógico, sin trampas de
     foco en modales, Escape cierra.
   - LECTORES DE PANTALLA: labels asociados a cada input, mensajes de error anunciados
     (aria-live), botones de solo ícono con aria-label, tablas con encabezados correctos,
     imágenes con alt útil (o alt="" si son decorativas), landmarks y jerarquía de headings
     sin saltos.
   - ÁREA TÁCTIL: mínimo 44x44 px en móvil. Revisá los íconos de acción en tablas y los
     checkboxes.
   - FORMULARIOS: el error dice QUÉ pasó y CÓMO arreglarlo, está junto al campo, y no
     depende solo del color para comunicarse.
   Usá una herramienta automatizada (axe-core / Lighthouse) sobre las pantallas principales
   como primer barrido, PERO no te quedes ahí: lo automatizado detecta ~30% de los
   problemas. Revisá a mano los flujos críticos.

2) LEGIBILIDAD
   - Piso de tamaño: nada por debajo de 12px, y 14-16px para texto que se lee de corrido.
     Hoy hay 11px en etiquetas.
   - Longitud de línea en textos largos (ayuda, términos, descripciones): 50-75 caracteres.
   - Jerarquía visual clara: que se distinga de un vistazo título, dato y ayuda. Hoy varias
     pantallas resuelven la jerarquía solo con opacidad, que es justo lo que falla en
     contraste.
   - LENGUAJE: buscá jerga técnica filtrada a la interfaz (nombres de estados del código,
     "409", "enrollment", "payload"). El miembro debe leer palabras de Theos, no del
     esquema. Listá los textos a reescribir.

3) UX / UI
   - CONSISTENCIA: mismo componente para el mismo propósito (botones, modales, tablas,
     estados vacíos, confirmaciones). Listá las divergencias — hay pantallas construidas en
     momentos distintos.
   - ANCHOS DE PÁGINA: ya se detectó que conviven max-w-2xl, 3xl, 5xl, 6xl, prose y anchos
     arbitrarios. Incluí la convención de tres anchos (lectura / formulario / trabajo) como
     hallazgo con su propuesta.
   - ESTADOS: cada pantalla debe resolver cargando, vacío y error. Un estado vacío que solo
     dice "sin resultados" es una oportunidad perdida: debe decir qué hacer.
   - MÓVIL: recorré los flujos del miembro en 390px de ancho (matrícula, /mis-pagos, perfil,
     eventos, /ayuda). Tablas que se desbordan, botones fuera de pantalla, modales que no
     dejan ver el botón de confirmar.
   - FRICCIÓN: contá los pasos de los tres flujos más usados (matricularse, hacer check-in,
     revisar un pago) y señalá pasos eliminables.
   - CONFIRMACIONES DESTRUCTIVAS: que las acciones irreversibles (cerrar un grupo, aprobar
     un pago, borrar) pidan confirmación y digan qué va a pasar exactamente.

4) PROPUESTA SISTÉMICA, NO PARCHES
   Las correcciones de contraste y tamaño deben resolverse en el design system (tokens de
   color y escala tipográfica), no pantalla por pantalla, y quedar documentadas para que lo
   nuevo no repita el problema. Si una corrección exige tocar 40 archivos, proponé el
   reemplazo global.
   NO cambies la identidad visual: mismos colores de marca (navy #161440, coral #EF5554,
   teal #70BDC2), solo sus usos, niveles y tamaños.

5) PRIORIZACIÓN sugerida en el informe: primero lo que afecta al MIEMBRO en celular
   (son 23 000 personas y es su única vía), después las pantallas de uso diario del staff,
   al final lo administrativo de uso esporádico.

Cerrá el informe con las 3 acciones de mayor impacto por esfuerzo, y con 3 pantallas de
antes/después para que yo apruebe el criterio antes de aplicarlo en masa.
```

**Informe en `docs/auditoria-ux-2026-08.md`.** Contraste y tamaños salieron aparte en UI-1
(commit `5af7e946`), así que el informe cubre el resto: teclado, lectores de pantalla, área
táctil, estados, consistencia, anchos, jerga y confirmaciones destructivas.

**Alcance real, dicho de frente:** es análisis estático medido sobre el código. NO incluye
pasada con lector de pantalla, ni recorrido a mano a 390px, ni prueba de tabulación de los
flujos completos. Eso queda pendiente y es donde está el valor no cubierto.

**Cero hallazgos bloqueantes.** El sistema está bastante mejor de lo que la ficha asumía: 0
modales propios (los 64 usan el compartido, con trampa de foco que cicla y Escape), 0
imágenes sin alt, 0 de las 43 tablas se desborda en móvil, y 0 jerga técnica filtrada — ni
`enrollment`, ni `payload`, ni códigos HTTP.

**Los 5 hallazgos importantes**, en orden de impacto por esfuerzo:

1. El `Modal.tsx` no devuelve el foco al cerrar. **Un archivo arregla 64 pantallas** — es el
   mejor cambio disponible.
2. El Toast usa `role="status"` para todo, incluidos los errores. Un error necesita
   `role="alert"` o el lector no interrumpe y el toast desaparece antes de anunciarse.
3. Los errores de campo se pintan pero no se vinculan al input: 20 `role="alert"` contra
   solo 5 `aria-invalid` y 2 `aria-describedby`.
4. 21 de 95 pantallas admin sin `<h1>`: sin encabezado no hay punto de entrada para un
   lector de pantalla.
5. Cinco pantallas con `DELETE` y sin confirmación aparente — marcado como A VERIFICAR, la
   detección es un proxy y ninguno está confirmado.

**Las 3 acciones de mayor impacto: HECHAS 2026-08-21** (commits `f3b6949c` y siguiente).
El Modal devuelve el foco (un archivo, 64 pantallas), el Toast usa `role="alert"` en los
errores, y los **175 labels quedaron asociados** — de 168 huérfanos a **0**, fijado por
`label-association.test.ts`. Precisión sobre el número: de los 175, 143 no tenían ningún
nombre accesible (falla de nivel A) y 32 ya traían `aria-label`. Quedan 17 labels antes de
un componente propio y 51 antes de grupos de radios, que necesitan `fieldset`/`legend` y son
otra tanda.

**Corrección a la ficha:** pide 44×44 de área táctil, pero eso es WCAG 2.2 nivel AAA
(2.5.5); el mínimo AA es 24×24 (2.5.8). Con ese criterio no hay incumplimiento de AA — los 5
botones más chicos están en ~24px y en pantallas de STAFF, no del miembro. La prioridad real
es más baja de lo que la ficha sugiere.

**Arreglado sobre la marcha** (solo lo trivial, como autoriza la ficha): `aria-label` en los
3 botones de solo ícono que no lo tenían.

**Honestidad sobre el método:** dos mediciones dieron falsos positivos que hubo que corregir
a mano — los botones de solo ícono (41 aparentes → 3 reales) y los estados de carga (22
aparentes → varios ya resueltos con el patrón `data === null`). Está anotado en el informe:
cualquier conteo que se use para priorizar hay que verificarlo en los archivos que lista.

### [x] FRM-4 · Llenar un formulario o una solicitud a nombre de otra persona — HECHO 2026-08-21
```
Que comunicaciones (y quien gestione formularios) pueda llenar un formulario A NOMBRE DE
otra persona — caso real: alguien responde por teléfono o en papel y el staff lo registra.
1) En el formulario, para los roles habilitados, un selector "Llenar a nombre de…" con
   búsqueda de miembro. La respuesta se guarda con el miembro seleccionado como autor
   Y con quién la registró realmente (dos campos: member_id y submitted_by). Nunca
   sobreescribas al autor sin dejar rastro de quién la digitó.
2) Permisos: rol forms, comunicaciones, direccion, admin — y quien tenga acceso puntual a
   ESE formulario (FRM-1). Nadie más.
3) La respuesta queda marcada visiblemente como "registrada por [staff]" en la vista de
   respuestas y en el export, para que nadie la confunda con una respuesta directa.
4) ALCANCE — decidí conmigo antes de ampliar: ¿esto aplica también a SOLICITUDES (interés
   de estudio, reubicación, beca)? Ahí ya existe resolveTargetMemberId con anti-
   suplantación, que permite a ciertos roles actuar sobre terceros — puede que ya funcione
   para algunas. Revisá cuáles solicitudes ya lo permiten y cuáles no, y proponeme el
   alcance. La matrícula a nombre de otro YA existe para STUDY_ADMIN_ROLES.
```

**RESPUESTA AL PUNTO 4** (el alcance que la ficha pedía decidir). El relevamiento dio algo
distinto de lo que la ficha asumía: **actuar a nombre de otro ya funcionaba en los CINCO
flujos**, y **ninguno guardaba quién lo hizo**.

| Flujo | El API lo permitía | UI | Rastro (antes) |
|---|---|---|---|
| Formularios | ✓ comunicaciones/dirección | ✓ ya existía en `FormFiller` (`onBehalf`) | ✗ |
| Solicitudes de estudio | ✓ coord. estudios/dirigentes | ✓ `createFor` en /estudios/solicitudes | ✗ |
| Solicitudes financieras | ✓ finanzas/dirección | ✓ ya existía, en el PERFIL del miembro | ✗ |
| Matrícula | ✓ STUDY_ADMIN_ROLES | ✓ selector de miembro | ✗ |
| Inscripción a evento | ✓ staff de eventos | **✗ la única que faltaba** | ✗ |

O sea que la ficha pedía construir una UI que **ya estaba** (punto 1) y el hueco real era otro:
un coordinador podía crear una solicitud o matricular a alguien y **no quedaba registro de
quién lo hizo**. `reviewed_by` no sirve — es quien la revisó. Decisión del usuario: cerrar el
rastro en los cinco y agregar las UI faltantes.

**Cómo quedó** (migración `20260822180000_recorded_by.sql`):

- Columna `recorded_by` en las cinco tablas, con **el mismo nombre en todas** — la ficha decía
  `submitted_by` solo para formularios, pero cinco nombres para el mismo concepto es lo que
  después obliga a recordar cuál va en cada tabla. (Bonus: `payments` y `study_attendance` ya
  usaban `recorded_by`, así que era la convención de la casa.)
- **La convención que simplifica todo**: `recorded_by` es NULL cuando la persona lo hizo ella
  misma. Solo se llena cuando el actor es distinto. Así `NOT NULL` responde exactamente la
  pregunta de la pantalla —"¿esto lo registró el staff?"— sin comparar dos columnas.
- Regla pura en `src/lib/auth/on-behalf.ts` (11 tests): `resolveOnBehalf` es el espejo de
  `resolveTargetMemberId` con la misma regla anti-suplantación, pero devuelve además el
  rastro. Se hizo aparte para no cambiar la firma de una función que usan cinco endpoints.
- El RPC `submit_form_response` se reemplazó con un parámetro `p_recorded_by DEFAULT NULL`
  (la firma es fija, así que había que recrear la función; el default deja funcionando
  cualquier llamada de 5 argumentos).
- Marca visible: "Registrada por X" en la fila, la tarjeta y el detalle de respuestas, más
  una columna nueva en el CSV **y** en el XLSX — los dos exports salen iguales.
- El gate de la UI de formularios ahora sale de `FORM_ON_BEHALF_ROLES`, la misma constante que
  valida el POST: antes eran dos listas separadas que podían divergir. Se sumó el rol `forms`
  que la ficha pedía, y el acceso PUNTUAL a un formulario (form_access_grants) habilita
  también — eso se resuelve en el POST porque depende del formulario, no del rol.
- Se centralizaron dos constantes que estaban **duplicadas con contenidos distintos** en dos
  rutas (`EVENT_REGISTRATION_STAFF_ROLES`: una incluía 'admin' y la otra no).

**UI agregada**: solo la de inscripción a eventos, que era la única que faltaba de verdad.
Va en el header y no dentro del modal, para que se vea a nombre de quién se está actuando
DURANTE toda la navegación y no se descubra al confirmar.

**Hueco relacionado que NO se cerró**: el DELETE de matrículas (retirar a alguien) sigue sin
registrar quién lo hizo. No es "llenar a nombre de otro" —es otra acción— y `recorded_by` ahí
sobreescribiría quién matriculó. Necesitaría su propia columna; queda anotado.

### [x] AYU-1 · Dos artículos nuevos en el centro de ayuda — HECHO 2026-08-21
```
Agregar dos artículos a content/ayuda/ (frontmatter como los existentes):

A) "¿Y si me matriculo en el grupo equivocado?" — PÚBLICO (visibilidad: publica), sección
   Estudios. Responde la pregunta que la gente hace apenas se equivoca: qué hacer, dónde
   está el botón de pedir cambio de grupo, que lo revisa el coordinador de estudios, que
   no es automático, y que mientras tanto sigue matriculada en su grupo actual. Enlazalo
   desde el tutorial de matrícula. Depende de REU-3 (el enlace tiene que existir donde el
   artículo dice que está).

B) "Cómo se calcula el análisis de estudios" — INTERNO (roles de estudios: dirigente,
   coordinador_estudios, coordinador_dirigentes, direccion). Antes de escribirlo, LEÉ EL
   CÓDIGO y respondeme la duda concreta que originó esto: en /estudios/analisis, ¿las
   personas se agrupan por la SEDE a la que asisten (calculada por check-ins,
   refresh_member_sedes) o por la ZONA donde viven (dirección del perfil)? Mirá
   src/lib/supabase/queries/studies-demand.ts y la regla de sede.
   El artículo debe explicar en lenguaje claro: de dónde sale cada número, qué significa
   "demanda", cómo se cuenta a alguien que asiste a dos sedes, qué ventana de tiempo usa,
   y qué NO mide (para que nadie tome una decisión con un número que significa otra cosa).
   Si al leer el código encontrás que la agrupación es ambigua o inconsistente, decímelo:
   sería un bug, no solo falta de documentación.
```

**Los dos artículos**: `content/ayuda/grupo-equivocado.md` (público, orden 4) y
`content/ayuda/analisis-de-estudios-como-se-calcula.md` (roles de estudios, orden 11).
Verificado que la visibilidad funciona: el público lo ve el rol `miembro`, el interno lo ven
los cuatro roles de estudios y el `miembro` NO. Enlazado desde el tutorial de matrícula, que
de paso decía "tres lugares" cuando REU-3 dejó **cuatro** (faltaba el historial del perfil).

**RESPUESTA A LA DUDA QUE ORIGINÓ ESTO.** La agrupación NO es una ni la otra: es una cadena
de respaldo, `province ?? sede.code ?? 'Sin zona'` — provincia de la dirección primero, si no
la sede calculada por check-ins. Está **consistente en los dos lugares** del código
(studies-demand.ts líneas 162 y 240), así que no es un bug de inconsistencia.

**Pero el dato real dice algo más útil.** Sobre 23.723 miembros activos:

| De dónde sale la zona | Personas |
|---|---|
| Provincia de la dirección | **6** |
| Sede donde asiste | 11.215 |
| **Sin zona** | **12.502** (53%) |

Dos conclusiones que quedaron escritas en el artículo:

1. **La decisión del 2026-08-19 de preferir la provincia sobre la sede es inerte**: aplica a 6
   personas, porque el perfil casi nunca tiene la provincia llena. En la práctica la columna
   es sede de asistencia, no lugar de residencia — y así se está leyendo mal si alguien la usa
   para decidir dónde abrir un grupo en una zona sin charlas.
2. **Más de la mitad del padrón cae en "Sin zona"**, y no es un error de cálculo: son los
   11.475 activos que **nunca hicieron check-in**. Sin check-in no hay sede, y sin dirección
   tampoco hay provincia.

No es un bug, pero sí un dato que cambia cómo hay que leer la pantalla. Si se quiere que la
columna signifique "dónde vive", hay que llenar la dirección del padrón primero; si se quiere
que signifique "dónde asiste", conviene quitar la provincia de la cadena para que no queden
6 filas midiendo otra cosa.

El artículo además documenta: qué es "demanda" (las dos categorías y por qué se calculan
distinto), los compromisos por etapa con los números reales (6 charlas/6 meses/60 días, o 12
en reforzada), que alguien que asiste a dos sedes cuenta en UNA (gana la de más check-ins en
6 meses, empate por la más reciente, y la ventana se ancla a la última visita si dejó de ir),
y una lista de **qué NO mide** — que es lo que evita decidir con un número que significa
otra cosa.

---

## Backlog (fases siguientes, requieren definición de producto)

- **CAM-1 · Matrículas de estudios tipo campaña** — no urge. Definir: ¿sin prerequisitos? ¿cupos? ¿pago? La etapa 'campaña' ya existe en la elegibilidad (campañas sin compromisos) y la excepción de campaña queda implementada en EST-1.
- **WAP-1 · Canal WhatsApp en comunicaciones** — fase mayor. Hoy solo está modelado en el esquema (`channel_configs.type`, prefs de miembro). Requiere decidir proveedor y costos antes de escribir código.
- **PAY-FUT · Pagos por tarjeta (pasarela) y SINPE directo** — decisión 2026-07-28: hoy todo entra por comprobante o manual; la UI de tarjeta/SINPE se retiró de /finanzas/pagos y /finanzas/devoluciones (marcada FASE FUTURA en el código: stat cards, chips de filtro, sección de devoluciones automáticas, botón Confirmar SINPE auto-gateado). El esquema ya soporta los métodos (`refunds.method`, `payment_stats`); al implementarse, reactivar esa UI.

### Internacionalización (Madrid / Colombia) — contemplar ANTES de migrar datos internacionales

- [x] **INT-1 · Documento de identidad por tipo (cédula / DNI-NIE / pasaporte)** — HECHO 2026-07-28.
  Migración `20260728150000_document_type` (aplicada a producción): `members.document_type`
  ('cedula' | 'dni_nie' | 'pasaporte' | 'otro', default 'cedula', los 23,320 registros CR
  quedaron como 'cedula') + índice único por PAREJA (document_type, cedula_normalized)
  reemplazando el de solo cédula. Código: helpers en `src/lib/cedula.ts`
  (`isValidDocument`, `documentFormatMessage`, labels) con tests; números en MAYÚSCULAS al
  guardar (dedup consistente para documentos con letras); POST/PATCH de members validan por
  tipo y dedupean por pareja; alta y edición de miembro con selector de tipo, label y
  placeholder dinámicos; lookup TSE/Hacienda solo aplica a tipo 'cedula'; import de grupos
  acepta encabezado "documento"; mensajes de prematrimonial/matrícula dicen "documento de
  identidad" (los códigos de error `cedula_requerida`/`cedula_invalida` no cambian).
  Nota: la normalización quita solo guiones y espacios (NO puntos) — números tipo CC
  colombiana se capturan sin puntos. Spec original: hoy la
  identificación es solo `cedula` + `cedula_normalized` (deduplicación, imports, match de
  dirigentes, requisito del prematrimonial). Para miembros fuera de CR: agregar
  `document_type` ('cedula' | 'dni_nie' | 'pasaporte' | 'otro', default 'cedula') y
  generalizar la normalización y la deduplicación a la pareja (tipo, número normalizado).
  La UI de perfil muestra un selector de tipo de documento; los flujos que hoy exigen
  "cédula" pasan a exigir "documento de identidad". Los imports aceptan columna de tipo
  opcional (default cédula). Sin romper: `cedula_normalized` sigue alimentado para los
  ~23k registros CR existentes. Decisión recomendada: tipo+número, no solo "pasaporte",
  para cubrir España (DNI/NIE), Colombia (CC) y cualquier país siguiente sin otro cambio
  de esquema.
- [x] **INT-2 · Montos multimoneda** — HECHO 2026-07-28. Migración
  `20260728160000_multicurrency` (aplicada a producción, todo lo existente quedó en CRC):
  columna `currency` (default 'CRC', CHECK CRC/USD/EUR) en donations, refunds,
  scholarships, study_plans y events; el CHECK de payments se amplió con EUR; el RPC
  `create_refund` hereda la moneda del pago. Código: `formatMoney(amount, currency)` +
  `currencySymbol` + `CURRENCIES` en `src/lib/format.ts` (formatCRC delega; con tests);
  los pagos heredan la moneda de su origen (costo del plan en matrícula/auto-matrícula,
  moneda del evento en inscripciones); selectores de moneda en editar plan de estudio y
  en crear/editar evento (símbolo dinámico en inputs y resumen); `AmountDisplay` acepta
  `currency` y las páginas de finanzas (pagos, donaciones, devoluciones, perfil de
  miembro, revisión de pagos) muestran la moneda de cada fila. PENDIENTE (decisión de
  producto con dirección/finanzas): los reportes y stats agregados (finanzas resumen,
  payment_stats, reportes) siguen sumando sin separar moneda — mientras todo sea CRC no
  distorsiona; definir "por moneda separada vs. conversión" antes de capturar montos EUR
  reales. Spec original: hoy todos los montos (payments, donations, scholarships,
  refunds, study_plans.cost, events.payment_amount) son numéricos sin moneda, asumidos en
  colones (₡ hardcodeado en formateo). Agregar columna `currency` (ISO 4217, default 'CRC')
  en las tablas de dinero, formateo por moneda en un helper único, y definir la regla de
  reportes/agregados (¿se reporta por moneda separada o se convierte? — decisión de
  producto pendiente con dirección/finanzas). Alcance inicial recomendado: EUR para Madrid,
  sin conversión automática (los reportes agregan por moneda). Coordinar con la
  integración Tilopay (fase 2 del roadmap) para que nazca multimoneda.
- Relacionado (ya anotado en la respuesta al cuestionario de TI): multi-idioma, zonas
  horarias de crons (hoy UTC pensado para CR) y GDPR para España — definir en la misma
  fase, no requieren código todavía.

## Fase 10 — Entrega de correo (2026-09-01)

### [ ] COR-1 · El correo de acceso no llega a Hotmail/Outlook

```
SÍNTOMA, con evidencia. A la gente de Hotmail y Outlook le llegan las campañas y NO le
llega el correo del enlace de acceso. Verificado con Arianna Leiva (arileiva14@hotmail.com):
el boletín mensual le llegó y quedó 'delivered' en message_logs; el enlace del mismo día,
del mismo remitente, no apareció nunca. Confirmado que no es su buzón, ni un rebote, ni
supresión de SES.

Señal de población, DÉBIL pero sin contraejemplos: de las 7 personas de Hotmail/Outlook
que pidieron el enlace, 0 lograron entrar. Gmail 2 de 10, otros dominios 5 de 7. Siete
casos es muy poco para llamarlo prueba — hay que medirlo con más datos antes de dar la
causa por cierta. Ahora se puede: desde 2026-09-01 los transaccionales quedan en
message_logs con su estado de SES.

TAMAÑO. 5.437 cuentas de Hotmail y 253 de Outlook en el padrón. No es un caso suelto:
es lo que va a pasar cuando el sistema se empuje a toda la congregación.

QUÉ YA SE DESCARTÓ, para no repetirlo:
 · No es el remitente ni el dominio: las campañas salen del mismo no-reply@theosplace.org,
   con la misma firma DKIM y el mismo configuration set, y sí llegan.
 · No es la lista de remitentes seguros. Outlook la usa para saltar el filtro de correo no
   deseado, pero NO salta un veredicto de phishing — y si es phishing de alta confianza el
   correo va a cuarentena, donde la persona no lo ve por más que busque.
 · No es mandar una contraseña temporal por correo: viaja por el mismo canal filtrado y
   deja la contraseña en texto plano en dos buzones. Descartado el 2026-09-01.

HIPÓTESIS A MEDIR (en este orden). Lo único que cambia entre el correo que llega y el que
no es el CONTENIDO:
 a) la URL con token hacia admin.theosplace.org — subdominio con poca reputación, patrón
    idéntico al de un phishing;
 b) el asunto sobre contraseñas;
 c) la ausencia de la cabecera List-Unsubscribe, que las campañas sí llevan.

CÓMO MEDIRLO, no adivinarlo: mandar variantes a buzones de prueba de Hotmail/Outlook
(mismo texto sin enlace, enlace al dominio raíz, asunto neutro) y leer el estado en
message_logs. Con eso se sabe cuál de las tres es, en vez de cambiar las tres a ciegas.

MITIGACIÓN QUE YA ESTÁ, y por eso esto no es urgente: el botón "Copiar enlace de acceso"
en Cuenta y acceso entrega el enlace por WhatsApp sin pasar por el correo.
```

---

## Fase 11 — Cosas menores pendientes (2026-09-07)

### [ ] UI-2 · Las infografías de ayuda todavía usan el coral viejo

```
QUÉ ES. Diez SVG de public/ayuda/infografias/ pintan con #EF5554, que es el coral que se
retiró de la marca justamente por contraste — contrast.test.ts lo deja escrito: "blanco
sobre el coral viejo no pasaba, y por eso se cambió". El coral vigente es #D63E3D
(--color-coral en globals.css).

POR QUÉ NO ES URGENTE, y por qué igual hay que hacerlo. En esos diez el color es
DECORATIVO —puntos de viñeta, subrayados bajo los títulos, flechas— y lo decorativo está
exento de AA, así que hoy no hay una falla de accesibilidad. Lo que sí hay es una
inconsistencia visible: la ayuda se ve de un rojo distinto al resto del sistema.

EL RIESGO REAL es el de al lado: en check-in-de-una-charla.svg el mismo tono se había usado
de FONDO de un chip con texto blanco encima, y ahí sí fallaba — 3.44:1 medido. Ese ya se
arregló (commit 92da272f). Cualquier infografía nueva que use el tono viejo como fondo de
texto repite el problema.

CÓMO HACERLO. Un sed de #EF5554 → #D63E3D sobre los diez archivos, y DESPUÉS revisar uno por
uno si algún texto quedó encima de un relleno coral. Los pares no se estiman: se miden con
contrastRatio de src/lib/contrast.ts, igual que se hizo en 92da272f.

ARCHIVOS: resolver-una-reubicacion, ruta-de-un-pago, mapa-de-roles, becas-y-cupones,
ciclo-grupo-estudio, como-me-matriculo, registrar-un-estudio-externo, mi-perfil,
inscribirme-a-un-evento, cierre-de-grupo.
```

### [ ] EVE-8 · Cinco sedes de charla están marcadas como zona, no como sede

```
QUÉ ES. Cartago, Liberia, Alajuela, Potrero y Pérez Zeledón existen en el catálogo `sedes`
con su día, hora y grupo de edad correctos, pero con is_zone = true. Se descubrió al crear
las 14 charlas recurrentes (commit a706fb24): no se duplicaron, se usaron como estaban.

POR QUÉ NO SE ARREGLÓ AHÍ MISMO. Cambiar la marca toca los filtros por zona de otras
pantallas, y no era el alcance de esa tarea. Hay que ver qué consulta cada filtro antes de
voltear el flag, no solo correr el UPDATE.

DATO RELACIONADO que ya se resolvió: la lista de charlas decía que Pérez Zeledón era jueves
y el catálogo decía miércoles. El catálogo tenía razón; la serie se movió en 5f7df959.
```


### [ ] DAT-1 · 65 fichas activas con fecha de nacimiento imposible

```
QUÉ ES. 65 personas activas tienen una fecha de nacimiento que no puede ser: 57
dicen entre 1 y 3 años, 7 dicen menos de 1 año, y una —Adolfo Guiso Olivas—
dice 1194. Lista completa en scripts/output/fechas-nacimiento-imposibles.csv,
con las señales que permiten triarlas.

POR QUÉ IMPORTA, y no es cosmético. La edad filtra grupos de estudio EN
SILENCIO: los grupos con edad mínima simplemente no aparecen, sin ningún
mensaje que lo explique. Una persona adulta con la fecha mal ve dos grupos
donde hay cinco y nadie entiende por qué. Se descubrió persiguiendo justo ese
síntoma (Carolina Retana, 2026-09-08). El filtro por edad esconde a propósito
—es una decisión de producto—, y por eso mismo una fecha mala es invisible.

CÓMO TRIARLAS, en orden de qué tan seguro es que la fecha sea el error:
  ·  9 son SEGURO adultos: llevaron estudios, sirven en un comité o donan. Un
     niño de 2 años no completó 8 estudios. Estas se corrigen sin dudar.
  · 47 hicieron check-in en charlas. Es señal fuerte pero no prueba: a las
     charlas también llega gente con sus hijos.
  ·  1 solo tiene correo.
  ·  8 no tienen ninguna señal: pueden ser niños de verdad y estar bien.

QUÉ NO HACER: un UPDATE masivo. No hay de dónde sacar la fecha correcta —hay
que preguntarle a la persona o mirar la cédula—. Lo que sí se puede hacer de
una es el caso de 1194, que es un typo evidente.

PREVENCIÓN, aparte de la limpieza: el alta no valida el rango. Conviene
rechazar fechas futuras y edades fuera de un rango razonable en el mismo módulo
que ya valida el alta (src/lib/members/alta-persona.ts, que ya calcula la edad).
```


### [x] DAT-2 · Fusionar dos fichas destruye datos en silencio — HECHO 2026-09-08 (migración 20260908160000)

```
QUÉ PASA. merge_members reasigna 23 tablas y después BORRA la ficha perdedora.
De las 84 columnas que apuntan a members, la función menciona 33: las otras 51
quedan afuera, y como casi todas las importantes son ON DELETE CASCADE, esas
filas se destruyen sin aviso. No hay error, no hay log, no hay forma de saber
qué se perdió.

Lo que se pierde y por qué duele (todas CASCADE, verificado 2026-09-08):
  · member_spiritual_data (361 filas)  — bautismo, testimonio, la historia
    espiritual de la persona.
  · member_admin_data (176)            — incluye authorized_virtual_studies, o
    sea el permiso para estudios virtuales.
  · member_role_position_grants (189)  — el respaldo de los roles automáticos.
  · internal_notifications (3.507), study_invitations (45),
    member_recommendations (31), form_access_grants (22),
    member_notification_prefs (4), notice_dismissals (19),
    birthday_greetings (40).

CASO REAL que lo destapó. Silvia Chavarría Flores tenía dos fichas y se
fusionaron el 2026-09-08. Su rol encargado_eventos sobrevivió (member_roles SÍ
se reasigna) pero su respaldo en member_role_position_grants no: quedó un rol
automático sin ningún puesto detrás, o sea un permiso que ya nadie va a
retirar cuando ella deje el puesto. Se reparó a mano con
scripts/roles-sede-2026-09/otorgar-eventos-a-sedes.ts, que es idempotente.

LO QUE NO ES TRIVIAL, y por eso esto no es "agregar 51 UPDATE". Varias de esas
tablas tienen UNIQUE por member_id: si LAS DOS fichas tienen fila
—member_spiritual_data, member_admin_data, member_notification_prefs— el
UPDATE choca. Hay que decidir por tabla: se queda la de destino, o se rellenan
sus campos vacíos con los del origen. Y hay que separar las columnas de SUJETO
(member_id: se reasignan) de las de ACTOR (changed_by, granted_by, reviewed_by:
también, pero son otra semántica y hoy quedan en NULL).

CÓMO VERIFICARLO. La consulta que encontró esto compara las FK a members contra
el texto de la función; sirve de test de regresión y debería quedar como tal,
para que una tabla nueva con member_id no se olvide otra vez.

MIENTRAS TANTO: después de cada fusión, correr la consulta de huérfanos
(rol automático activo sin fila en member_role_position_grants).
```


## Notas para la ejecución en Claude Code

- Un punto por sesión/PR. Pegar el prompt tal cual y pedir además: correr `tsc --noEmit`,
  lint y `vitest` antes de dar por terminado (la verja de CI usa `--max-warnings=107`, solo baja).
- Reglas del repo que ningún cambio debe romper (de AGENTS.md y docs/sistema-overview.md):
  - Todo handler de /api se autoriza solo con `requireRoles(...)` o `requireModuleView(...)`
    (el middleware excluye /api).
  - Sin soft-delete; DELETE con referencias → 409 con conteo.
  - Anti-suplantación con `resolveTargetMemberId()` en autoservicio.
  - La regla de sede vive SOLO en SQL desde REF-1 (refresh_member_sede + refresh_member_sedes,
    migración 20260728100000); computeMemberSede es la spec ejecutable de los fixtures. Si cambia
    la regla: las dos funciones SQL + el espejo TS + los fixtures.
- Después de cada punto completado, marcar el checkbox acá y anotar el commit/PR.
