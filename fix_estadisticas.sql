-- =========================================================
-- AJUSTES DEL MÓDULO ESTADÍSTICAS (opcional)
-- Pegar en Supabase > SQL Editor > New query > Run
-- Activa el marcador en vivo entre varios dispositivos
-- =========================================================

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
