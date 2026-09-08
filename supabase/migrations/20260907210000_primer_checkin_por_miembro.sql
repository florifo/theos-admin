-- Primer check-in de cada persona, para poder distinguir "vino por primera vez"
-- de "ya había venido antes".
--
-- POR QUÉ HACE FALTA. La tarjeta de "personas nuevas" del tab de Reportes
-- contaba a quien tuviera la ficha creada el mismo día del evento. Eso se cae
-- los días con varias charlas: si a la persona se le crea el perfil en Cartago
-- y esa misma noche pasa por Meridiano, las DOS la contaban como nueva. Con el
-- primer check-in, solo la cuenta la charla donde realmente llegó primero.
--
-- Devuelve solo el DATO, no la regla: quién cuenta como nuevo se decide en
-- src/lib/events/personas-nuevas.ts, que es donde están los tests. Si la regla
-- viviera en los dos lados, tarde o temprano dirían cosas distintas.
create or replace function members_first_checkin(p_member_ids uuid[])
returns table (member_id uuid, first_checkin_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select ec.member_id, min(ec.checked_in_at)
  from event_checkins ec
  where ec.member_id = any(p_member_ids)
  group by ec.member_id
$$;

comment on function members_first_checkin(uuid[]) is
  'Fecha del primer check-in de cada miembro. La usa el detalle de un evento '
  'para saber qué asistentes vinieron por primera vez ahí.';
