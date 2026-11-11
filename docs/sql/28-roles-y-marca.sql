-- =============================================================================
-- 28-roles-y-marca.sql — Marca del negocio, logo, usuarios y permisos
-- Fase 8 · Requiere: 01 a 27
--
-- 1. configuracion_negocio: límites de largo (giro, teléfono, dirección) y
--    logo_url solo como la ruta relativa del logo en Storage:
--      /storage/v1/object/public/marca/logo?v=<n>
--    (la app le pone NEXT_PUBLIC_SUPABASE_URL al mostrarlo). Así no depende
--    del dominio del proyecto ni acepta otros sitios ni javascript:.
-- 2. Storage: bucket público `marca` (solo image/webp, 512 KB; la app sube
--    siempre la imagen re-codificada con sharp) y políticas en storage.objects:
--    insertar, actualizar y leer por la API solo el dueño y solo el objeto
--    `logo`. Sin política de borrado. La lectura pública del logo es por la
--    URL pública del bucket.
-- 3. Usuarios (solo dueño):
--      public.usuarios()            lista con correo y último acceso
--      public.actualizar_usuario()  nombre, rol y activo, con mensajes claros
--    El dueño no puede quitarse el rol ni desactivarse; los usuarios demo no
--    se pueden modificar (además del trigger de 18).
-- 4. Proveedores: solo el dueño los lee (contacto, teléfono y notas).
-- 5. Demo: privado.marca_original() (los valores de la semilla, 07),
--    public.restaurar_marca_demo() (botón, solo dueño, solo en el demo) y
--    privado.restaurar_marca_vencida(ahora): restaura la configuración si
--    cambió hace 30 minutos o más. La llama avanzar_demo() (18) cada minuto.
--
-- Funciones: SECURITY DEFINER, search_path = '', sin permiso para anon.
-- Ninguna regresa costos (21 no cambia).
-- Se puede volver a correr.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. configuracion_negocio: límites y formato del logo
-- -----------------------------------------------------------------------------
-- Una URL completa de una versión anterior (si alguien la puso a mano) se
-- convierte a la ruta relativa; cualquier otra cosa se quita.
update public.configuracion_negocio c
set logo_url = substring(c.logo_url from '(/storage/v1/object/public/marca/logo\?v=\d+)$')
where c.logo_url is not null
  and c.logo_url !~ '^/storage/v1/object/public/marca/logo\?v=\d+$';

alter table public.configuracion_negocio drop constraint if exists configuracion_giro_largo;
alter table public.configuracion_negocio add constraint configuracion_giro_largo
  check (giro is null or length(giro) <= 60) not valid;
alter table public.configuracion_negocio drop constraint if exists configuracion_telefono_largo;
alter table public.configuracion_negocio add constraint configuracion_telefono_largo
  check (telefono is null or length(telefono) <= 30) not valid;
alter table public.configuracion_negocio drop constraint if exists configuracion_direccion_largo;
alter table public.configuracion_negocio add constraint configuracion_direccion_largo
  check (direccion is null or length(direccion) <= 200) not valid;
alter table public.configuracion_negocio drop constraint if exists configuracion_logo_url;
alter table public.configuracion_negocio add constraint configuracion_logo_url
  check (logo_url is null or logo_url ~ '^/storage/v1/object/public/marca/logo\?v=\d+$') not valid;

do $$
declare
  c text;
begin
  foreach c in array array['configuracion_giro_largo', 'configuracion_telefono_largo',
                           'configuracion_direccion_largo', 'configuracion_logo_url'] loop
    begin
      execute format('alter table public.configuracion_negocio validate constraint %I', c);
    exception when check_violation then
      raise warning 'La configuración actual no cumple %: el CHECK queda NOT VALID (los cambios nuevos sí se revisan).', c;
    end;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Storage: bucket `marca` y políticas del objeto `logo`
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise warning 'No existe el esquema storage: se omite el bucket del logo.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('marca', 'marca', true, 524288, array['image/webp'])
  on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists marca_logo_insert on storage.objects';
  execute $p$
    create policy marca_logo_insert on storage.objects
      for insert to authenticated
      with check (bucket_id = 'marca' and name = 'logo' and (select public.es_dueno()))
  $p$;
  execute 'drop policy if exists marca_logo_update on storage.objects';
  execute $p$
    create policy marca_logo_update on storage.objects
      for update to authenticated
      using (bucket_id = 'marca' and name = 'logo' and (select public.es_dueno()))
      with check (bucket_id = 'marca' and name = 'logo' and (select public.es_dueno()))
  $p$;
  -- El upsert de Storage también necesita leer el objeto.
  execute 'drop policy if exists marca_logo_select on storage.objects';
  execute $p$
    create policy marca_logo_select on storage.objects
      for select to authenticated
      using (bucket_id = 'marca' and name = 'logo' and (select public.es_dueno()))
  $p$;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Usuarios
-- -----------------------------------------------------------------------------
-- ¿Es uno de los usuarios demo? false si 18 no se corrió (instalación real).
create or replace function privado.es_usuario_demo_seguro(p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v boolean;
begin
  if to_regclass('privado.usuarios_demo') is null then
    return false;
  end if;
  execute 'select exists (select 1 from privado.usuarios_demo d where d.id = $1)' into v using p_id;
  return v;
end;
$$;
revoke all on function privado.es_usuario_demo_seguro(uuid) from public, anon, authenticated, service_role;

create or replace function public.usuarios()
returns table (
  id            uuid,
  nombre        text,
  correo        text,
  rol           text,
  activo        boolean,
  creado_en     timestamptz,
  ultimo_acceso timestamptz,
  es_demo       boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.usuario_validado(true);
  return query
  select p.id, p.nombre, u.email::text, p.rol, p.activo, p.creado_en, u.last_sign_in_at,
         privado.es_usuario_demo_seguro(p.id)
  from public.perfiles p
  join auth.users u on u.id = p.id
  order by p.activo desc, (p.rol = 'dueno') desc, lower(p.nombre), p.id;
end;
$$;
revoke execute on function public.usuarios() from public, anon;
grant execute on function public.usuarios() to authenticated;

create or replace function public.actualizar_usuario(
  p_id     uuid,
  p_nombre text,
  p_rol    text,
  p_activo boolean
)
returns public.perfiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := privado.usuario_validado(true);
  v_nombre text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_perfil public.perfiles;
begin
  if length(v_nombre) not between 1 and 80 then
    raise exception 'El nombre es obligatorio (máximo 80 caracteres).' using errcode = 'LT422';
  end if;
  if p_rol is null or p_rol not in ('dueno', 'cajero') then
    raise exception 'Rol no válido.' using errcode = 'LT422';
  end if;
  if p_activo is null then
    raise exception 'Falta indicar si está activo.' using errcode = 'LT422';
  end if;

  select * into v_perfil from public.perfiles p where p.id = p_id for update;
  if not found then
    raise exception 'El usuario no existe.' using errcode = 'LT404';
  end if;

  -- Primero las reglas sobre uno mismo (el mensaje más específico).
  if p_id = v_uid and p_rol <> 'dueno' then
    raise exception 'No puedes quitarte el rol de dueño.' using errcode = 'LT409';
  end if;
  if p_id = v_uid and not p_activo then
    raise exception 'No puedes desactivarte a ti mismo.' using errcode = 'LT409';
  end if;
  if privado.es_usuario_demo_seguro(p_id) then
    raise exception 'Los usuarios del demo no se pueden modificar.' using errcode = 'LT409';
  end if;

  update public.perfiles p
  set nombre = v_nombre, rol = p_rol, activo = p_activo
  where p.id = p_id
  returning * into v_perfil;
  return v_perfil;
end;
$$;
revoke execute on function public.actualizar_usuario(uuid, text, text, boolean) from public, anon;
grant execute on function public.actualizar_usuario(uuid, text, text, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Proveedores: solo el dueño (el cajero no necesita contactos ni notas).
-- -----------------------------------------------------------------------------
drop policy if exists proveedores_select on public.proveedores;
create policy proveedores_select on public.proveedores
  for select to authenticated
  using ((select public.es_dueno()));

-- -----------------------------------------------------------------------------
-- 5. Demo: marca original y restauración
-- -----------------------------------------------------------------------------
-- Los mismos valores que pone cargar_semilla (07). 29 revisa que coincidan.
create or replace function privado.marca_original()
returns table (
  nombre         text,
  giro           text,
  logo_url       text,
  color_primario text,
  telefono       text,
  direccion      text
)
language sql
immutable
set search_path = ''
as $$
  select 'Ferretería La Tuerca'::text, 'Ferretería'::text, null::text, '#c2410c'::text,
         '81 0000 0000'::text, 'Av. Ejemplo 123, Col. Centro, Monterrey, N.L.'::text;
$$;
revoke all on function privado.marca_original() from public, anon, authenticated, service_role;

create or replace function privado.aplicar_marca_original()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.configuracion_negocio c
  set nombre = o.nombre, giro = o.giro, logo_url = o.logo_url,
      color_primario = o.color_primario, telefono = o.telefono, direccion = o.direccion
  from privado.marca_original() o
  where c.id = 1;
$$;
revoke all on function privado.aplicar_marca_original() from public, anon, authenticated, service_role;

-- Restaura si la configuración es distinta de la original y su último cambio
-- fue hace 30 minutos o más. Solo en el demo (con privado.usuarios_demo).
-- p_ahora existe para probarlo sin esperar; el job la llama con now().
create or replace function privado.restaurar_marca_vencida(p_ahora timestamptz default now())
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.configuracion_negocio;
  o record;
begin
  if to_regclass('privado.usuarios_demo') is null then
    return false;
  end if;
  select * into c from public.configuracion_negocio x where x.id = 1;
  select * into o from privado.marca_original();
  if not found or c.id is null then
    return false;
  end if;
  if (c.nombre, c.giro, c.logo_url, c.color_primario, c.telefono, c.direccion)
     is not distinct from (o.nombre, o.giro, o.logo_url, o.color_primario, o.telefono, o.direccion) then
    return false;
  end if;
  if c.actualizado_en > p_ahora - interval '30 minutes' then
    return false;
  end if;
  perform privado.aplicar_marca_original();
  return true;
end;
$$;
revoke all on function privado.restaurar_marca_vencida(timestamptz) from public, anon, authenticated, service_role;

-- Botón "Restaurar marca del demo": solo dueño y solo en el demo.
create or replace function public.restaurar_marca_demo()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.usuario_validado(true);
  if to_regclass('privado.usuarios_demo') is null then
    raise exception 'Esto solo existe en el demo.' using errcode = 'LT409';
  end if;
  perform privado.aplicar_marca_original();
end;
$$;
revoke execute on function public.restaurar_marca_demo() from public, anon;
grant execute on function public.restaurar_marca_demo() to authenticated;

-- -----------------------------------------------------------------------------
-- Resumen
-- -----------------------------------------------------------------------------
select
  (select count(*) from pg_constraint
    where conrelid = 'public.configuracion_negocio'::regclass
      and conname in ('configuracion_giro_largo', 'configuracion_telefono_largo',
                      'configuracion_direccion_largo', 'configuracion_logo_url')
      and convalidated)                                                     as checks_validados,
  (select logo_url from public.configuracion_negocio where id = 1)         as logo_url,
  case when to_regclass('storage.buckets') is null then null
       else (select count(*) from pg_policies
              where schemaname = 'storage' and tablename = 'objects'
                and policyname like 'marca_logo_%') end                     as politicas_logo,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('usuarios', 'actualizar_usuario', 'restaurar_marca_demo')
      and p.prosecdef)                                                      as funciones_nuevas;
