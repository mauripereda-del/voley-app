-- =========================================================
-- AJUSTES DEL MÓDULO ALINEACIONES
-- Pegar en Supabase > SQL Editor > New query > Run
-- Requiere que ya hayas corrido esquema_voley.sql y rls_triggers_storage.sql
-- =========================================================

-- Cada equipo tiene su propia alineación por set
alter table alineacion add column if not exists equipo_id uuid references equipo(id) on delete cascade;

alter table alineacion drop constraint if exists alineacion_partido_id_set_numero_key;
drop index if exists alineacion_partido_id_set_numero_key;

create unique index if not exists alineacion_partido_equipo_set
  on alineacion(partido_id, equipo_id, set_numero);

-- Rival que no está cargado como equipo del club
alter table partido add column if not exists rival_externo text;

-- Políticas: solo el staff de ESE equipo edita su alineación
drop policy if exists "alineacion_select" on alineacion;
create policy "alineacion_select" on alineacion for select using (pertenece_a_equipo(equipo_id));

drop policy if exists "alineacion_write" on alineacion;
create policy "alineacion_write" on alineacion for all using (es_staff_de_equipo(equipo_id)) with check (es_staff_de_equipo(equipo_id));

drop policy if exists "alineacion_jugador_select" on alineacion_jugador;
create policy "alineacion_jugador_select" on alineacion_jugador for select using (
  exists (select 1 from alineacion a where a.id = alineacion_id and pertenece_a_equipo(a.equipo_id))
);

drop policy if exists "alineacion_jugador_write" on alineacion_jugador;
create policy "alineacion_jugador_write" on alineacion_jugador for all using (
  exists (select 1 from alineacion a where a.id = alineacion_id and es_staff_de_equipo(a.equipo_id))
);
