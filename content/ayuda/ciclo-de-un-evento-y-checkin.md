---
titulo: Ciclo de un evento y el check-in
seccion: Eventos
tipo: infografia
roles: [encargado_eventos, comunicaciones, encargado_staff, direccion]
orden: 10
resumen: De crear el evento al check-in del día, con lo que el check-in cambia sin que se note.
---

# Ciclo de un evento y el check-in

![Los cinco pasos de un evento y lo que el check-in recalcula](/ayuda/infografias/ciclo-de-un-evento.svg)

## El recorrido

**Crear** el evento → la gente se **inscribe** (si pide inscripción) → **paga** → el día del
evento se hace **check-in** → queda la asistencia registrada.

No todos los eventos piden inscripción. Una charla normal no la pide: la gente llega y se le
hace check-in. La inscripción se activa cuando hay cupo limitado o hay que cobrar.

## Al crear

Lo que más se olvida configurar:

- **Cupo máximo.** Si lo dejás vacío, no hay límite y nunca se llena.
- **Comité organizador.** Dice de quién es el evento, y habilita el precio distinto para sus
  servidores (ver abajo).
- **Qué pagan los servidores del comité organizador.** Por defecto **pagan igual que todos**.
  Si querés otra cosa, hay que configurarlo en el evento: o un **precio de servidor** más
  bajo, o **exentarlos** (ahí el tiquete sale exento, sin cobro). No pasa solo.
- **Formulario de inscripción** (opcional). Se elige uno ya creado y se le pide a quien se
  inscribe. Ojo con esto: **la inscripción no depende del formulario**. El cupo, el pago y el
  check-in viven en la inscripción; la respuesta queda enlazada como información adicional.
  Alguien que se inscribe y no llena el formulario está inscrito igual.
- **Sub-eventos**, si el evento tiene actividades internas con cupo propio.
- **Recurrencia**, si se repite. Cancelar una fecha de una serie recurrente no cancela la
  serie: se marca esa fecha como excepción.

## El check-in

Se hace desde **Check-in**, un ítem propio del menú principal que abre directo los eventos
del día, o desde la pestaña **Check-in** de la ficha del evento. Hay tres formas de
registrar: manual (buscando a la persona), por QR y por link.

Dos cosas que conviene saber:

**Si el evento es pago y la persona llega sin pagar,** se puede cobrar en el momento desde el
check-in: se registra el cobro ahí mismo, sin sacarla de la fila.

**Cada check-in recalcula la sede de la persona.** Esto es lo que menos se nota y más importa:
la sede de un miembro no se escribe a mano, sale de la charla a la que más asiste en los
últimos 6 meses. Cada check-in que registrás está alimentando eso — y con eso los reportes por
sede y los requisitos de asistencia de los estudios.

## Por qué la asistencia de alguien "no cuenta"

Para los requisitos de estudios solo cuentan los check-ins de **charla**, no los de cualquier
evento. Si alguien asiste a todos los eventos especiales pero no a las charlas, su asistencia
no sube.

Los números exactos: asistencia activa es 6 charlas en los últimos 6 meses completos más 1 en
los últimos 60 días; reforzada, 12.

## Encargados del evento

Si una persona organiza la actividad pero no tiene el módulo de Eventos, no hace falta darle
el rol: en la configuración del evento, sección **Encargados de este evento**, se la agrega y
con eso gestiona **ese** evento completo —inscripciones, check-in, servidores, reportes y la
edición— y ningún otro. Si el evento tiene formulario, lo hereda.

Nombrar encargados es de dirección, encargado de staff, comunicaciones y admin. Quien recibe
el permiso no lo reparte.

## La encuesta de satisfacción

Se activa en el evento y se programa: **qué** se manda (un formulario o una plantilla de
correo) y **cuándo** (2 horas después de que termine, al día siguiente, 3 días, una semana, o
una fecha y hora exactas).

Va a **quienes hicieron check-in**, no a todos los inscritos: quien no llegó no tiene qué
evaluar. Eso es fijo.

El envío es automático y sale una sola vez. En la ficha del evento se ve el estado: programada
para tal fecha, o enviada a N personas con N respuestas.

> Si movés la fecha de fin del evento, la programación se recalcula. Si apagás la encuesta,
> se borra: no queda un envío esperando.

## Después del evento

Los reportes de asistencia salen del check-in, así que un evento sin check-in queda como si no
hubiera pasado. Si el registro se hizo en papel, pasalo al sistema el mismo día: la sede y la
asistencia dependen de eso.

> Un evento cancelado o archivado no acepta inscripciones ni check-in. Si hay que corregir
> asistencia de un evento pasado, se corrige el check-in, no el estado del evento.
