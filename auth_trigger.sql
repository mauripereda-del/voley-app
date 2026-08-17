-- =========================================================
-- TRIGGER: crea la fila en "perfil" automáticamente
-- cada vez que alguien se registra (auth.users)
-- =========================================================
-- Pegar en Supabase > SQL Editor > Run
-- El frontend manda nombre/apellido/rol como "metadata" en el signUp,
-- y esta función los toma de ahí para completar el perfil.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.perfil (id, nombre, apellido, email, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', ''),
    coalesce(new.raw_user_meta_data->>'apellido', ''),
    new.email,
    coalesce(new.raw_user_meta_data->>'rol', 'jugador')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();
