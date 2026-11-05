-- =============================================================================
-- 02-perfiles-y-roles.sql — Funciones de rol y perfil automático
-- Requiere: 01
-- =============================================================================

-- -----------------------------------------------------------------------------
-- rol_actual(): rol del usuario de la sesión, solo si su perfil está activo.
-- Devuelve null si no hay sesión, no hay perfil o el perfil está inactivo.
--
-- SECURITY DEFINER a propósito: las políticas de `perfiles` la usan, y si
-- leyera `perfiles` con los permisos del usuario, RLS la volvería a evaluar
-- (recursión infinita).
-- -----------------------------------------------------------------------------
create or replace function public.rol_actual()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.rol
  from public.perfiles p
  where p.id = (select auth.uid())
    and p.activo;
$$;

revoke execute on function public.rol_actual() from public, anon;
grant execute on function public.rol_actual() to authenticated;

-- -----------------------------------------------------------------------------
-- es_dueno(): true solo si hay sesión, el perfil está activo y su rol es dueño.
-- -----------------------------------------------------------------------------
create or replace function public.es_dueno()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.rol_actual() = 'dueno', false);
$$;

revoke execute on function public.es_dueno() from public, anon;
grant execute on function public.es_dueno() to authenticated;

-- -----------------------------------------------------------------------------
-- privado.usuario_validado(p_solo_dueno): guardia para las funciones de 04/05.
-- Lanza error si no hay sesión, si el perfil no está activo o si se pide
-- dueño y no lo es. Devuelve el id del usuario.
--
-- Códigos de error propios (la app los traduce a mensajes):
--   LT401 sin sesión o usuario inactivo
--   LT403 sin permiso por rol
--   LT404 no existe
--   LT409 conflicto (stock insuficiente, venta ya cancelada)
--   LT422 datos inválidos
-- -----------------------------------------------------------------------------
create or replace function privado.usuario_validado(p_solo_dueno boolean)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rol text;
begin
  if v_uid is null then
    raise exception 'No hay una sesión iniciada.' using errcode = 'LT401';
  end if;

  select p.rol into v_rol
  from public.perfiles p
  where p.id = v_uid and p.activo;

  if v_rol is null then
    raise exception 'Tu usuario no está activo.' using errcode = 'LT401';
  end if;

  if p_solo_dueno and v_rol <> 'dueno' then
    raise exception 'Solo el dueño puede hacer esto.' using errcode = 'LT403';
  end if;

  return v_uid;
end;
$$;

revoke execute on function privado.usuario_validado(boolean)
  from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Trigger: cada usuario nuevo de Auth recibe un perfil de CAJERO INACTIVO.
-- El rol y `activo` están fijos aquí: nada que mande el cliente (metadata)
-- puede volverlo dueño ni activarlo. El nombre sí sale de la metadata, solo
-- para mostrarse.
-- -----------------------------------------------------------------------------
create or replace function privado.crear_perfil_usuario_nuevo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, nombre, rol, activo)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    'cajero',
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function privado.crear_perfil_usuario_nuevo()
  from public, anon, authenticated, service_role;

drop trigger if exists crear_perfil_usuario_nuevo on auth.users;
create trigger crear_perfil_usuario_nuevo
  after insert on auth.users
  for each row execute function privado.crear_perfil_usuario_nuevo();
