-- Zona horaria por evento.
--
-- POR QUÉ. starts_at siempre guardó el instante real, pero TODO el sistema lo
-- interpretaba y lo mostraba asumiendo Costa Rica = UTC-6 fijo. Para Costa Rica
-- eso es exacto (no hay horario de verano); para las sedes de España no: medido
-- contra esta misma base, la diferencia con Madrid es de 8 horas en setiembre y
-- de 7 en enero.
--
-- Las dos charlas de Madrid estaban guardadas con su hora METIDA A LA FUERZA en
-- el marco de Costa Rica, así que sus instantes reales no tenían sentido: la de
-- los domingos caía a las 19:30 de Madrid y la de los jueves, viernes a las
-- 4:30 de la madrugada. Esta columna es lo que permite arreglarlas de verdad.
--
-- El default deja intacto todo lo que ya existe: 3.500+ eventos siguen siendo
-- de Costa Rica y nada cambia para ellos.
alter table events
  add column if not exists timezone text not null default 'America/Costa_Rica';

comment on column events.timezone is
  'Zona IANA en la que se define la hora del evento. Costa Rica por defecto; '
  'las sedes de España usan Europe/Madrid. starts_at sigue siendo el instante real.';
