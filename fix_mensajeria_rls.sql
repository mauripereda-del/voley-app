-- =========================================================
-- AJUSTES DEL MÓDULO MENSAJERÍA
-- Pegar en Supabase > SQL Editor > New query > Run
-- Requiere que ya hayas corrido esquema_voley.sql y rls_triggers_storage.sql
-- =========================================================

-- Evita la recursión de RLS al listar participantes / mensajes
create or replace function es_participante(p_conversacion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from conversacion_participante
    where conversacion_id = p_conversacion_id
      and perfil_id = auth.uid()
  );
$$;

drop policy if exists "conversacion_select" on conversacion;
create policy "conversacion_select" on conversacion for select using (es_participante(id));

drop policy if exists "conversacion_update" on conversacion;
create policy "conversacion_update" on conversacion for update using (
  created_by = auth.uid() or es_admin_o_dirigente()
  or (equipo_id is not null and es_staff_de_equipo(equipo_id))
);

drop policy if exists "conversacion_delete" on conversacion;
create policy "conversacion_delete" on conversacion for delete using (
  created_by = auth.uid() or es_admin_o_dirigente()
  or (equipo_id is not null and es_staff_de_equipo(equipo_id))
);

drop policy if exists "participante_select" on conversacion_participante;
create policy "participante_select" on conversacion_participante for select using (es_participante(conversacion_id));

drop policy if exists "participante_insert" on conversacion_participante;
create policy "participante_insert" on conversacion_participante for insert with check (
  perfil_id = auth.uid()
  or exists (select 1 from conversacion c where c.id = conversacion_id and c.created_by = auth.uid())
  or es_participante(conversacion_id)
);

drop policy if exists "mensaje_select" on mensaje;
create policy "mensaje_select" on mensaje for select using (es_participante(conversacion_id));

drop policy if exists "mensaje_insert" on mensaje;
create policy "mensaje_insert" on mensaje for insert with check (
  remitente_id = auth.uid() and es_participante(conversacion_id)
);

-- Mensajes en vivo (opcional, para que el chat se actualice solo)
do $$
begin
  alter publication supabase_realtime add table mensaje;
exception
  when duplicate_object then null;
end $$;
