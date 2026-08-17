-- =========================================================
-- AJUSTES DEL MÓDULO CAMPEONATOS
-- Pegar en Supabase > SQL Editor > New query > Run
-- Requiere esquema_voley.sql y rls_triggers_storage.sql
-- =========================================================

-- No recalcular si el partido es amistoso (sin campeonato) o falta un equipo
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

-- Recalcula también si se corrige el resultado de un partido ya finalizado
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
