-- =========================================================
-- AJUSTES DEL MÓDULO CONVOCATORIAS Y PRESENCIAS
-- Pegar en Supabase > SQL Editor > New query > Run
-- Requiere que ya hayas corrido esquema_voley.sql y rls_triggers_storage.sql
-- =========================================================

-- Una sola convocatoria por evento
create unique index if not exists convocatoria_evento_unico on convocatoria(evento_id);

-- El plantel completo puede ver quién fue convocado (no solo su propia fila)
drop policy if exists "convocatoria_jugador_select_equipo" on convocatoria_jugador;
create policy "convocatoria_jugador_select_equipo" on convocatoria_jugador for select using (
  exists (
    select 1 from convocatoria c
    join evento e on e.id = c.evento_id
    where c.id = convocatoria_id and pertenece_a_equipo(e.equipo_id)
  )
);

-- El staff puede sacar a alguien de la convocatoria o resetear una respuesta
drop policy if exists "convocatoria_jugador_update_staff" on convocatoria_jugador;
create policy "convocatoria_jugador_update_staff" on convocatoria_jugador for update using (
  exists (
    select 1 from convocatoria c
    join evento e on e.id = c.evento_id
    where c.id = convocatoria_id and es_staff_de_equipo(e.equipo_id)
  )
);

drop policy if exists "convocatoria_jugador_delete_staff" on convocatoria_jugador;
create policy "convocatoria_jugador_delete_staff" on convocatoria_jugador for delete using (
  exists (
    select 1 from convocatoria c
    join evento e on e.id = c.evento_id
    where c.id = convocatoria_id and es_staff_de_equipo(e.equipo_id)
  )
);
