-- Estado 'vencida' para las solicitudes de estudio.
--
-- Una solicitud sirve para el bloque de matrícula que le toca. Cuando ese
-- bloque cierra su matrícula, ya no se puede atender: la persona tiene que
-- volver a pedirla en el siguiente. Hasta hoy se quedaban 'open' para siempre
-- y la cola se llenaba de pedidos de bloques que ya pasaron.
--
-- Solo vencen las ABIERTAS. Una 'in_review' la tiene alguien del comité
-- asignada y trabajándola; vencerla sola le borraría el trabajo sin avisarle.
alter table study_requests drop constraint if exists study_requests_status_check;

alter table study_requests add constraint study_requests_status_check
  check (status = any (array['open', 'in_review', 'resolved', 'rejected', 'vencida']));
