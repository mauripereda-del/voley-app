-- =========================================================
-- PASO 1: ROW LEVEL SECURITY (RLS)
-- PASO 2: TRIGGER PARA TABLA DE POSICIONES
-- PASO 3: SUPABASE STORAGE
-- =========================================================
-- Pegar en Supabase > SQL Editor > New query > Run
-- Requiere que ya hayas corrido esquema_voley.sql antes.
-- Se puede volver a ejecutar: borra y recrea las políticas.

-- =========================================================
-- FUNCIONES AUXILIARES (para no repetir lógica en cada política)
-- =========================================================

create or replace function auth_rol()
returns text
language sql stable
as $$
  select rol from perfil where id = auth.uid();
$$;

create or replace function es_admin_o_dirigente()
returns boolean
language sql stable
as $$
  select exists (
    select 1 from perfil where id = auth.uid() and rol in ('admin','dirigente')
  );
$$;

create or replace function es_staff_de_equipo(p_equipo_id uuid)
returns boolean
language sql stable
as $$
  select exists (
    select 1 from cuerpo_tecnico ct
    where ct.equipo_id = p_equipo_id and ct.perfil_id = auth.uid()
  ) or es_admin_o_dirigente();
$$;

create or replace function pertenece_a_equipo(p_equipo_id uuid)
returns boolean
language sql stable
as $$
  select exists (
    select 1 from jugador j
    where j.equipo_id = p_equipo_id and j.perfil_id = auth.uid()
  ) or es_staff_de_equipo(p_equipo_id);
$$;

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

-- =========================================================
-- PASO 1: ROW LEVEL SECURITY
-- =========================================================

-- ---------- Núcleo ----------
alter table categoria enable row level security;
drop policy if exists "categoria_select" on categoria;
drop policy if exists "categoria_write" on categoria;
create policy "categoria_select" on categoria for select using (auth.uid() is not null);
create policy "categoria_write" on categoria for all using (es_admin_o_dirigente()) with check (es_admin_o_dirigente());

alter table equipo enable row level security;
drop policy if exists "equipo_select" on equipo;
drop policy if exists "equipo_write" on equipo;
create policy "equipo_select" on equipo for select using (auth.uid() is not null);
create policy "equipo_write" on equipo for all using (es_admin_o_dirigente()) with check (es_admin_o_dirigente());

alter table perfil enable row level security;
drop policy if exists "perfil_select" on perfil;
drop policy if exists "perfil_update_propio" on perfil;
drop policy if exists "perfil_insert_propio" on perfil;
create policy "perfil_select" on perfil for select using (auth.uid() is not null);
create policy "perfil_update_propio" on perfil for update using (id = auth.uid() or es_admin_o_dirigente());
create policy "perfil_insert_propio" on perfil for insert with check (id = auth.uid());

alter table jugador enable row level security;
drop policy if exists "jugador_select" on jugador;
drop policy if exists "jugador_write" on jugador;
create policy "jugador_select" on jugador for select using (pertenece_a_equipo(equipo_id));
create policy "jugador_write" on jugador for all using (es_staff_de_equipo(equipo_id)) with check (es_staff_de_equipo(equipo_id));

alter table cuerpo_tecnico enable row level security;
drop policy if exists "cuerpo_tecnico_select" on cuerpo_tecnico;
drop policy if exists "cuerpo_tecnico_write" on cuerpo_tecnico;
create policy "cuerpo_tecnico_select" on cuerpo_tecnico for select using (pertenece_a_equipo(equipo_id));
create policy "cuerpo_tecnico_write" on cuerpo_tecnico for all using (es_admin_o_dirigente()) with check (es_admin_o_dirigente());

alter table jugador_ficha_medica enable row level security;
drop policy if exists "ficha_medica_select" on jugador_ficha_medica;
drop policy if exists "ficha_medica_write" on jugador_ficha_medica;
create policy "ficha_medica_select" on jugador_ficha_medica for select using (
  exists (select 1 from jugador j where j.id = jugador_id and (j.perfil_id = auth.uid() or es_staff_de_equipo(j.equipo_id)))
);
create policy "ficha_medica_write" on jugador_ficha_medica for all using (
  exists (select 1 from jugador j where j.id = jugador_id and (j.perfil_id = auth.uid() or es_staff_de_equipo(j.equipo_id)))
);

-- ---------- Mensajería ----------
alter table conversacion enable row level security;
drop policy if exists "conversacion_select" on conversacion;
drop policy if exists "conversacion_insert" on conversacion;
drop policy if exists "conversacion_update" on conversacion;
drop policy if exists "conversacion_delete" on conversacion;
create policy "conversacion_select" on conversacion for select using (es_participante(id));
create policy "conversacion_insert" on conversacion for insert with check (auth.uid() is not null);
create policy "conversacion_update" on conversacion for update using (
  created_by = auth.uid() or es_admin_o_dirigente()
  or (equipo_id is not null and es_staff_de_equipo(equipo_id))
);
create policy "conversacion_delete" on conversacion for delete using (
  created_by = auth.uid() or es_admin_o_dirigente()
  or (equipo_id is not null and es_staff_de_equipo(equipo_id))
);

alter table conversacion_participante enable row level security;
drop policy if exists "participante_select" on conversacion_participante;
drop policy if exists "participante_insert" on conversacion_participante;
create policy "participante_select" on conversacion_participante for select using (es_participante(conversacion_id));
create policy "participante_insert" on conversacion_participante for insert with check (
  perfil_id = auth.uid()
  or exists (select 1 from conversacion c where c.id = conversacion_id and c.created_by = auth.uid())
  or es_participante(conversacion_id)
);

alter table mensaje enable row level security;
drop policy if exists "mensaje_select" on mensaje;
drop policy if exists "mensaje_insert" on mensaje;
create policy "mensaje_select" on mensaje for select using (es_participante(conversacion_id));
create policy "mensaje_insert" on mensaje for insert with check (
  remitente_id = auth.uid() and es_participante(conversacion_id)
);

alter table mensaje_leido enable row level security;
drop policy if exists "mensaje_leido_todo" on mensaje_leido;
create policy "mensaje_leido_todo" on mensaje_leido for all using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

do $$
begin
  alter publication supabase_realtime add table mensaje;
exception
  when duplicate_object then null;
end $$;

-- ---------- Calendario ----------
alter table evento enable row level security;
drop policy if exists "evento_select" on evento;
drop policy if exists "evento_write" on evento;
create policy "evento_select" on evento for select using (pertenece_a_equipo(equipo_id));
create policy "evento_write" on evento for all using (es_staff_de_equipo(equipo_id)) with check (es_staff_de_equipo(equipo_id));

-- ---------- Convocatoria y presencias ----------
alter table convocatoria enable row level security;
drop policy if exists "convocatoria_select" on convocatoria;
drop policy if exists "convocatoria_write" on convocatoria;
create policy "convocatoria_select" on convocatoria for select using (
  exists (select 1 from evento e where e.id = evento_id and pertenece_a_equipo(e.equipo_id))
);
create policy "convocatoria_write" on convocatoria for all using (
  exists (select 1 from evento e where e.id = evento_id and es_staff_de_equipo(e.equipo_id))
);

alter table convocatoria_jugador enable row level security;
drop policy if exists "convocatoria_jugador_select" on convocatoria_jugador;
drop policy if exists "convocatoria_jugador_select_equipo" on convocatoria_jugador;
drop policy if exists "convocatoria_jugador_update_propio" on convocatoria_jugador;
drop policy if exists "convocatoria_jugador_update_staff" on convocatoria_jugador;
drop policy if exists "convocatoria_jugador_insert_staff" on convocatoria_jugador;
drop policy if exists "convocatoria_jugador_delete_staff" on convocatoria_jugador;
create policy "convocatoria_jugador_select" on convocatoria_jugador for select using (
  exists (
    select 1 from convocatoria c
    join evento e on e.id = c.evento_id
    where c.id = convocatoria_id and pertenece_a_equipo(e.equipo_id)
  )
);
create policy "convocatoria_jugador_update_propio" on convocatoria_jugador for update using (
  exists (select 1 from jugador j where j.id = jugador_id and j.perfil_id = auth.uid())
);
create policy "convocatoria_jugador_update_staff" on convocatoria_jugador for update using (
  exists (
    select 1 from convocatoria c join evento e on e.id = c.evento_id
    where c.id = convocatoria_id and es_staff_de_equipo(e.equipo_id)
  )
);
create policy "convocatoria_jugador_insert_staff" on convocatoria_jugador for insert with check (
  exists (
    select 1 from convocatoria c join evento e on e.id = c.evento_id
    where c.id = convocatoria_id and es_staff_de_equipo(e.equipo_id)
  )
);
create policy "convocatoria_jugador_delete_staff" on convocatoria_jugador for delete using (
  exists (
    select 1 from convocatoria c join evento e on e.id = c.evento_id
    where c.id = convocatoria_id and es_staff_de_equipo(e.equipo_id)
  )
);

alter table asistencia enable row level security;
drop policy if exists "asistencia_select" on asistencia;
drop policy if exists "asistencia_write" on asistencia;
create policy "asistencia_select" on asistencia for select using (
  exists (select 1 from evento e where e.id = evento_id and pertenece_a_equipo(e.equipo_id))
);
create policy "asistencia_write" on asistencia for all using (
  exists (select 1 from evento e where e.id = evento_id and es_staff_de_equipo(e.equipo_id))
);

-- ---------- Alineaciones ----------
alter table alineacion enable row level security;
drop policy if exists "alineacion_select" on alineacion;
drop policy if exists "alineacion_write" on alineacion;
create policy "alineacion_select" on alineacion for select using (pertenece_a_equipo(equipo_id));
create policy "alineacion_write" on alineacion for all using (es_staff_de_equipo(equipo_id)) with check (es_staff_de_equipo(equipo_id));

alter table alineacion_jugador enable row level security;
drop policy if exists "alineacion_jugador_select" on alineacion_jugador;
drop policy if exists "alineacion_jugador_write" on alineacion_jugador;
create policy "alineacion_jugador_select" on alineacion_jugador for select using (
  exists (select 1 from alineacion a where a.id = alineacion_id and pertenece_a_equipo(a.equipo_id))
);
create policy "alineacion_jugador_write" on alineacion_jugador for all using (
  exists (select 1 from alineacion a where a.id = alineacion_id and es_staff_de_equipo(a.equipo_id))
);

-- ---------- Tareas ----------
alter table tarea enable row level security;
drop policy if exists "tarea_select" on tarea;
drop policy if exists "tarea_write" on tarea;
drop policy if exists "tarea_update_asignado" on tarea;
create policy "tarea_select" on tarea for select using (pertenece_a_equipo(equipo_id));
create policy "tarea_write" on tarea for all using (es_staff_de_equipo(equipo_id)) with check (es_staff_de_equipo(equipo_id));
create policy "tarea_update_asignado" on tarea for update using (asignado_a = auth.uid());

-- ---------- Campeonatos ----------
alter table campeonato enable row level security;
drop policy if exists "campeonato_select" on campeonato;
drop policy if exists "campeonato_write" on campeonato;
create policy "campeonato_select" on campeonato for select using (auth.uid() is not null);
create policy "campeonato_write" on campeonato for all using (es_admin_o_dirigente()) with check (es_admin_o_dirigente());

alter table campeonato_equipo enable row level security;
drop policy if exists "campeonato_equipo_select" on campeonato_equipo;
drop policy if exists "campeonato_equipo_write" on campeonato_equipo;
create policy "campeonato_equipo_select" on campeonato_equipo for select using (auth.uid() is not null);
create policy "campeonato_equipo_write" on campeonato_equipo for all using (es_admin_o_dirigente()) with check (es_admin_o_dirigente());

alter table partido enable row level security;
drop policy if exists "partido_select" on partido;
drop policy if exists "partido_write" on partido;
create policy "partido_select" on partido for select using (auth.uid() is not null);
create policy "partido_write" on partido for all using (
  es_staff_de_equipo(equipo_local_id) or es_staff_de_equipo(equipo_visitante_id)
) with check (
  es_staff_de_equipo(equipo_local_id) or es_staff_de_equipo(equipo_visitante_id)
);

-- ---------- Estadísticas y live stats ----------
alter table accion_partido enable row level security;
drop policy if exists "accion_partido_select" on accion_partido;
drop policy if exists "accion_partido_write" on accion_partido;
create policy "accion_partido_select" on accion_partido for select using (auth.uid() is not null);
create policy "accion_partido_write" on accion_partido for all using (
  exists (select 1 from partido p where p.id = partido_id and (es_staff_de_equipo(p.equipo_local_id) or es_staff_de_equipo(p.equipo_visitante_id)))
);

alter table set_partido enable row level security;
drop policy if exists "set_partido_select" on set_partido;
drop policy if exists "set_partido_write" on set_partido;
create policy "set_partido_select" on set_partido for select using (auth.uid() is not null);
create policy "set_partido_write" on set_partido for all using (
  exists (select 1 from partido p where p.id = partido_id and (es_staff_de_equipo(p.equipo_local_id) or es_staff_de_equipo(p.equipo_visitante_id)))
);

do $$
begin
  alter publication supabase_realtime add table accion_partido;
exception
  when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table set_partido;
exception
  when duplicate_object then null;
end $$;

-- ---------- Post partido ----------
alter table post_partido enable row level security;
drop policy if exists "post_partido_select" on post_partido;
drop policy if exists "post_partido_write" on post_partido;
create policy "post_partido_select" on post_partido for select using (auth.uid() is not null);
create policy "post_partido_write" on post_partido for all using (
  exists (select 1 from partido p where p.id = partido_id and (es_staff_de_equipo(p.equipo_local_id) or es_staff_de_equipo(p.equipo_visitante_id)))
);

alter table post_partido_comentario enable row level security;
drop policy if exists "post_partido_comentario_select" on post_partido_comentario;
drop policy if exists "post_partido_comentario_insert" on post_partido_comentario;
drop policy if exists "post_partido_comentario_delete" on post_partido_comentario;
create policy "post_partido_comentario_select" on post_partido_comentario for select using (auth.uid() is not null);
create policy "post_partido_comentario_insert" on post_partido_comentario for insert with check (perfil_id = auth.uid());
create policy "post_partido_comentario_delete" on post_partido_comentario for delete using (
  perfil_id = auth.uid()
  or es_admin_o_dirigente()
  or exists (
    select 1 from post_partido pp
    join partido p on p.id = pp.partido_id
    where pp.id = post_partido_id
      and (es_staff_de_equipo(p.equipo_local_id) or es_staff_de_equipo(p.equipo_visitante_id))
  )
);

-- ---------- Cuotas y colectas ----------
alter table cuota enable row level security;
drop policy if exists "cuota_select" on cuota;
drop policy if exists "cuota_write" on cuota;
create policy "cuota_select" on cuota for select using (pertenece_a_equipo(equipo_id));
create policy "cuota_write" on cuota for all using (es_staff_de_equipo(equipo_id)) with check (es_staff_de_equipo(equipo_id));

alter table cuota_pago enable row level security;
drop policy if exists "cuota_pago_select" on cuota_pago;
drop policy if exists "cuota_pago_write" on cuota_pago;
drop policy if exists "cuota_pago_staff" on cuota_pago;
drop policy if exists "cuota_pago_insert_propio" on cuota_pago;
create policy "cuota_pago_select" on cuota_pago for select using (
  exists (select 1 from jugador j where j.id = jugador_id and (j.perfil_id = auth.uid() or es_staff_de_equipo(j.equipo_id)))
);
create policy "cuota_pago_staff" on cuota_pago for all
  using (exists (select 1 from jugador j where j.id = jugador_id and es_staff_de_equipo(j.equipo_id)))
  with check (exists (select 1 from jugador j where j.id = jugador_id and es_staff_de_equipo(j.equipo_id)));
create policy "cuota_pago_insert_propio" on cuota_pago for insert with check (
  exists (
    select 1 from jugador j
    join cuota c on c.id = cuota_id
    where j.id = jugador_id
      and j.perfil_id = auth.uid()
      and j.equipo_id = c.equipo_id
  )
);

alter table colecta enable row level security;
drop policy if exists "colecta_select" on colecta;
drop policy if exists "colecta_write" on colecta;
create policy "colecta_select" on colecta for select using (pertenece_a_equipo(equipo_id));
create policy "colecta_write" on colecta for all using (es_staff_de_equipo(equipo_id)) with check (es_staff_de_equipo(equipo_id));

alter table colecta_aporte enable row level security;
drop policy if exists "colecta_aporte_select" on colecta_aporte;
drop policy if exists "colecta_aporte_insert" on colecta_aporte;
drop policy if exists "colecta_aporte_insert_propio" on colecta_aporte;
drop policy if exists "colecta_aporte_insert_staff" on colecta_aporte;
drop policy if exists "colecta_aporte_delete" on colecta_aporte;
create policy "colecta_aporte_select" on colecta_aporte for select using (
  exists (select 1 from colecta c where c.id = colecta_id and pertenece_a_equipo(c.equipo_id))
);
create policy "colecta_aporte_insert_propio" on colecta_aporte for insert with check (
  perfil_id = auth.uid()
  and exists (select 1 from colecta c where c.id = colecta_id and pertenece_a_equipo(c.equipo_id) and c.estado = 'activa')
);
create policy "colecta_aporte_insert_staff" on colecta_aporte for insert with check (
  exists (select 1 from colecta c where c.id = colecta_id and es_staff_de_equipo(c.equipo_id))
);
create policy "colecta_aporte_delete" on colecta_aporte for delete using (
  perfil_id = auth.uid()
  or exists (select 1 from colecta c where c.id = colecta_id and es_staff_de_equipo(c.equipo_id))
);

-- =========================================================
-- PASO 2: TRIGGER - TABLA DE POSICIONES (puntos FIVB)
-- =========================================================

create or replace function recalcular_equipo(p_campeonato uuid, p_equipo uuid)
returns void
language plpgsql
as $$
declare
  v_jugados int := 0;
  v_ganados int := 0;
  v_perdidos int := 0;
  v_puntos int := 0;
  v_sets_favor int := 0;
  v_sets_contra int := 0;
  r record;
  v_sets_propios int;
  v_sets_rival int;
begin
  if p_campeonato is null or p_equipo is null then
    return;
  end if;

  for r in
    select * from partido
    where campeonato_id = p_campeonato
      and estado = 'finalizado'
      and (equipo_local_id = p_equipo or equipo_visitante_id = p_equipo)
  loop
    v_jugados := v_jugados + 1;

    if r.equipo_local_id = p_equipo then
      v_sets_propios := r.sets_local;
      v_sets_rival := r.sets_visitante;
    else
      v_sets_propios := r.sets_visitante;
      v_sets_rival := r.sets_local;
    end if;

    v_sets_favor := v_sets_favor + v_sets_propios;
    v_sets_contra := v_sets_contra + v_sets_rival;

    if v_sets_propios > v_sets_rival then
      v_ganados := v_ganados + 1;
      v_puntos := v_puntos + (case when v_sets_rival <= 1 then 3 else 2 end);
    else
      v_perdidos := v_perdidos + 1;
      v_puntos := v_puntos + (case when v_sets_propios = 2 then 1 else 0 end);
    end if;
  end loop;

  insert into campeonato_equipo (campeonato_id, equipo_id, puntos, partidos_jugados, partidos_ganados, partidos_perdidos, sets_a_favor, sets_en_contra)
  values (p_campeonato, p_equipo, v_puntos, v_jugados, v_ganados, v_perdidos, v_sets_favor, v_sets_contra)
  on conflict (campeonato_id, equipo_id) do update set
    puntos = excluded.puntos,
    partidos_jugados = excluded.partidos_jugados,
    partidos_ganados = excluded.partidos_ganados,
    partidos_perdidos = excluded.partidos_perdidos,
    sets_a_favor = excluded.sets_a_favor,
    sets_en_contra = excluded.sets_en_contra;
end;
$$;

create or replace function actualizar_posiciones()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.campeonato_id is not null then
    perform recalcular_equipo(old.campeonato_id, old.equipo_local_id);
    perform recalcular_equipo(old.campeonato_id, old.equipo_visitante_id);
  end if;
  if new.campeonato_id is not null then
    perform recalcular_equipo(new.campeonato_id, new.equipo_local_id);
    perform recalcular_equipo(new.campeonato_id, new.equipo_visitante_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_actualizar_posiciones on partido;
create trigger trg_actualizar_posiciones
after insert or update on partido
for each row
execute function actualizar_posiciones();

-- =========================================================
-- PASO 3: SUPABASE STORAGE
-- =========================================================

insert into storage.buckets (id, name, public)
values
  ('avatares', 'avatares', true),
  ('escudos', 'escudos', true),
  ('post-partido', 'post-partido', false),
  ('comprobantes', 'comprobantes', false)
on conflict (id) do nothing;

drop policy if exists "avatares_insert_propio" on storage.objects;
drop policy if exists "avatares_update_propio" on storage.objects;
create policy "avatares_insert_propio" on storage.objects for insert
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatares_update_propio" on storage.objects for update
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "escudos_write" on storage.objects;
drop policy if exists "escudos_update" on storage.objects;
create policy "escudos_write" on storage.objects for insert
  with check (bucket_id = 'escudos' and es_admin_o_dirigente());
create policy "escudos_update" on storage.objects for update
  using (bucket_id = 'escudos' and es_admin_o_dirigente());

drop policy if exists "post_partido_bucket_select" on storage.objects;
drop policy if exists "post_partido_bucket_insert" on storage.objects;
drop policy if exists "post_partido_bucket_delete" on storage.objects;
create policy "post_partido_bucket_select" on storage.objects for select
  using (bucket_id = 'post-partido' and auth.uid() is not null);
create policy "post_partido_bucket_insert" on storage.objects for insert
  with check (bucket_id = 'post-partido' and auth.uid() is not null);
create policy "post_partido_bucket_delete" on storage.objects for delete
  using (bucket_id = 'post-partido' and auth.uid() is not null);

drop policy if exists "comprobantes_insert_propio" on storage.objects;
drop policy if exists "comprobantes_select" on storage.objects;
drop policy if exists "comprobantes_delete" on storage.objects;
create policy "comprobantes_insert_propio" on storage.objects for insert
  with check (bucket_id = 'comprobantes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "comprobantes_select" on storage.objects for select
  using (bucket_id = 'comprobantes' and auth.uid() is not null);
create policy "comprobantes_delete" on storage.objects for delete
  using (bucket_id = 'comprobantes' and auth.uid() is not null);
