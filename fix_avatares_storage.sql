-- =========================================================
-- CORRECCIÓN: permitir que entrenadores/delegados/admin
-- puedan subir la foto de sus jugadores, no solo la propia.
-- =========================================================
-- Pegar en Supabase > SQL Editor > Run

drop policy if exists "avatares_insert_propio" on storage.objects;
drop policy if exists "avatares_update_propio" on storage.objects;

create policy "avatares_insert" on storage.objects for insert
  with check (
    bucket_id = 'avatares' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or es_admin_o_dirigente()
      or exists (select 1 from cuerpo_tecnico where perfil_id = auth.uid())
    )
  );

create policy "avatares_update" on storage.objects for update
  using (
    bucket_id = 'avatares' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or es_admin_o_dirigente()
      or exists (select 1 from cuerpo_tecnico where perfil_id = auth.uid())
    )
  );
