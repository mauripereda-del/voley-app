-- =========================================================
-- AJUSTES DEL MÓDULO POST PARTIDO
-- Pegar en Supabase > SQL Editor > New query > Run
-- =========================================================

create unique index if not exists post_partido_unico on post_partido(partido_id);

drop policy if exists "post_partido_comentario_delete" on post_partido_comentario;
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

drop policy if exists "post_partido_bucket_delete" on storage.objects;
create policy "post_partido_bucket_delete" on storage.objects for delete
  using (bucket_id = 'post-partido' and auth.uid() is not null);
