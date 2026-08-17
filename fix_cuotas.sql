-- =========================================================
-- AJUSTES DEL MÓDULO CUOTAS Y COLECTAS
-- Pegar en Supabase > SQL Editor > New query > Run
-- =========================================================

create index if not exists idx_cuota_equipo on cuota(equipo_id);
create index if not exists idx_cuota_pago_cuota on cuota_pago(cuota_id);
create index if not exists idx_colecta_equipo on colecta(equipo_id);
create index if not exists idx_colecta_aporte_colecta on colecta_aporte(colecta_id);

alter table colecta_aporte add column if not exists nombre_externo text;

insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', false)
on conflict (id) do nothing;

-- Pagos: el plantel ve los propios; el staff ve y carga todos.
-- Un jugador puede informar su propio pago (queda pendiente hasta que el staff confirma).
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

-- Aportes de colecta: todo el equipo ve el progreso; staff puede cargar por otra persona.
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

-- Comprobantes: bucket privado; cualquiera logueado puede ver/borrar (el staff confirma pagos).
drop policy if exists "comprobantes_insert_propio" on storage.objects;
drop policy if exists "comprobantes_select" on storage.objects;
drop policy if exists "comprobantes_delete" on storage.objects;
create policy "comprobantes_insert_propio" on storage.objects for insert
  with check (bucket_id = 'comprobantes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "comprobantes_select" on storage.objects for select
  using (bucket_id = 'comprobantes' and auth.uid() is not null);
create policy "comprobantes_delete" on storage.objects for delete
  using (bucket_id = 'comprobantes' and auth.uid() is not null);
