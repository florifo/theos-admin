-- Cierra el EXECUTE público de las dos funciones creadas hoy.
--
-- QUÉ PASÓ. Toda función nueva en Postgres nace con EXECUTE para PUBLIC. Las
-- del proyecto no lo tienen porque sus migraciones lo revocan; estas dos se
-- crearon sin ese paso y quedaron llamables desde /rest/v1/rpc/... por
-- cualquiera, incluso sin sesión. Lo reportó el linter de Supabase el mismo día
-- (avisos 0028 y 0029).
--
-- POR QUÉ IMPORTA, y sobre todo la segunda:
--
--   · members_first_checkin devuelve la fecha del primer check-in de los ids
--     que le pasen. Filtrado: alguien sin cuenta podía preguntar por cualquier
--     miembro.
--
--   · merge_one_to_one es mucho peor. Recibe un NOMBRE DE TABLA como texto y
--     arma SQL dinámico para mover filas de una persona a otra y borrar el
--     resto. Con EXECUTE público y SECURITY DEFINER, cualquiera con sesión
--     podía reescribir los datos espirituales o administrativos de otra
--     persona. Era una escalada de privilegios en toda regla, y la introduje yo
--     hoy al arreglar la fusión.
--
-- LA CORRECCIÓN, dos capas:
--   1. Revocar EXECUTE a PUBLIC y dejarlo solo en service_role — es lo que
--      hacen todas las demás y es lo que la app necesita (llama con esa clave).
--   2. Pasarlas a SECURITY INVOKER. No necesitan los privilegios del dueño:
--      quien las llama ya es service_role. Así, si algún día alguien recupera
--      el EXECUTE por error, la función queda limitada por los permisos de
--      quien la ejecuta en vez de correr como superusuario.

alter function public.members_first_checkin(uuid[]) security invoker;
alter function public.merge_one_to_one(text, uuid, uuid) security invoker;

revoke execute on function public.members_first_checkin(uuid[]) from public;
revoke execute on function public.merge_one_to_one(text, uuid, uuid) from public;

grant execute on function public.members_first_checkin(uuid[]) to service_role;
grant execute on function public.merge_one_to_one(text, uuid, uuid) to service_role;
