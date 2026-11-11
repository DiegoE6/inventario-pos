-- =============================================================================
-- 18-modo-demo.sql — Reinicio nocturno, ventas de hoy y protección del demo
-- Requiere: 01 a 17, 07 de la Fase 6 (tres usuarios demo) y, para programar
-- los jobs, la extensión pg_cron activada (Database > Extensions).
--
-- ⚠️  SOLO PARA LA BASE DEL DEMO. En la instalación de un cliente real este
--     script no se corre: sin él no hay reinicio, ni ventas automáticas, ni
--     usuarios protegidos.
--
-- Qué hace:
--   1. privado.usuarios_demo: id, rol, correo y hash de contraseña de los
--      tres usuarios demo (dueño, cajero y cajero de turno).
--   2. Protección (primera capa), con triggers:
--      - auth.users: nadie cambia correo, contraseña ni teléfono de un
--        usuario demo (ni por la API de Auth ni desde el panel de Supabase).
--      - auth.mfa_factors: nadie le activa MFA a un usuario demo.
--      - public.perfiles: desde la API nadie cambia rol ni activo de un
--        usuario demo (el dueño demo no puede desactivar al cajero demo).
--      Los cambios a propósito pasan solo con el permiso de la transacción
--      `demo.permitir_cambios = on`, que activan reset_demo() y
--      cambiar_password_demo(). Auth de Supabase nunca lo activa.
--   3. reset_demo() (segunda capa y datos): restaura correo y contraseña
--      guardados, quita MFA, borra el historial de pg_cron de más de 7 días
--      y recarga la semilla (configuración, catálogos, productos, ventas,
--      movimientos y perfiles demo).
--   4. avanzar_demo(): cobra con registrar_venta las ventas de hoy que ya
--      llegaron a su hora (ver 07). Si 28 está instalado, también restaura
--      la marca del negocio 30 minutos después de su último cambio.
--   5. pg_cron: reset-demo a las 03:00 de Monterrey (09:00 UTC) y
--      ventas-demo cada minuto (una venta sale a lo más 1 minuto tarde).
--
-- Funciones en `privado`: ningún rol de la API (anon, authenticated,
-- service_role) puede ejecutarlas. pg_cron corre como postgres.
-- Se puede volver a correr.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Usuarios demo
-- -----------------------------------------------------------------------------
create table if not exists privado.usuarios_demo (
  id            uuid primary key references auth.users (id) on delete cascade,
  rol           text not null unique check (rol in ('dueno', 'cajero', 'turno')),
  correo        text not null,
  password_hash text not null,
  guardado_en   timestamptz not null default now()
);
revoke all on privado.usuarios_demo from public, anon, authenticated, service_role;

-- Guarda los tres usuarios. Si ya estaban guardados no los toca: el hash
-- guardado solo cambia con cambiar_password_demo(). Así, volver a correr 18
-- nunca guarda una contraseña que alguien haya cambiado.
create or replace function privado.registrar_usuarios_demo(
  p_correo_dueno  text default 'demo@latuerca.test',
  p_correo_cajero text default 'cajero@latuerca.test',
  p_correo_turno  text default 'turno@latuerca.test'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_faltan text;
begin
  select string_agg(c.correo, ', ') into v_faltan
  from (values (p_correo_dueno), (p_correo_cajero), (p_correo_turno)) c(correo)
  where not exists (
    select 1 from auth.users u
    where lower(u.email) = lower(c.correo) and u.encrypted_password is not null
  );
  if v_faltan is not null then
    raise exception 'Faltan usuarios demo (o no tienen contraseña): %. Créalos en Authentication > Users.', v_faltan;
  end if;

  insert into privado.usuarios_demo (id, rol, correo, password_hash)
  select u.id, c.rol, u.email, u.encrypted_password
  from (values ('dueno', p_correo_dueno), ('cajero', p_correo_cajero), ('turno', p_correo_turno)) c(rol, correo)
  join auth.users u on lower(u.email) = lower(c.correo)
  on conflict (id) do nothing;
end;
$$;

revoke execute on function privado.registrar_usuarios_demo(text, text, text)
  from public, anon, authenticated, service_role;

create or replace function privado.es_usuario_demo(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.usuarios_demo d where d.id = p_id);
$$;

revoke execute on function privado.es_usuario_demo(uuid)
  from public, anon, authenticated, service_role;

-- true solo dentro de reset_demo() o cambiar_password_demo() (o si alguien lo
-- activa a mano en el SQL Editor para una reparación).
create or replace function privado.cambios_demo_permitidos()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('demo.permitir_cambios', true), '') = 'on';
$$;

revoke execute on function privado.cambios_demo_permitidos()
  from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2a. auth.users: sin cambios de correo, contraseña ni teléfono
-- IS DISTINCT FROM: una escritura que deja el mismo valor (por ejemplo, Auth
-- al iniciar sesión o renovar el token) pasa. coalesce(..., '') porque Auth
-- usa '' y null indistintamente en email_change y phone_change.
-- -----------------------------------------------------------------------------
create or replace function privado.proteger_auth_usuario_demo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if privado.es_usuario_demo(old.id)
     and not privado.cambios_demo_permitidos()
     and (   new.email                          is distinct from old.email
          or new.encrypted_password             is distinct from old.encrypted_password
          or coalesce(new.phone, '')            is distinct from coalesce(old.phone, '')
          or coalesce(new.email_change, '')     is distinct from coalesce(old.email_change, '')
          or coalesce(new.phone_change, '')     is distinct from coalesce(old.phone_change, ''))
  then
    raise exception 'El usuario del demo no se puede modificar.' using errcode = 'LT403';
  end if;
  return new;
end;
$$;

revoke execute on function privado.proteger_auth_usuario_demo()
  from public, anon, authenticated, service_role;

drop trigger if exists proteger_usuario_demo on auth.users;
create trigger proteger_usuario_demo
  before update on auth.users
  for each row execute function privado.proteger_auth_usuario_demo();

-- -----------------------------------------------------------------------------
-- 2b. auth.mfa_factors: sin MFA para usuarios demo. Si Supabase no deja crear
-- el trigger en esta tabla, se avisa y reset_demo() borra los factores cada
-- noche.
-- -----------------------------------------------------------------------------
create or replace function privado.proteger_mfa_usuario_demo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if privado.es_usuario_demo(new.user_id) and not privado.cambios_demo_permitidos() then
    raise exception 'El usuario del demo no puede activar MFA.' using errcode = 'LT403';
  end if;
  return new;
end;
$$;

revoke execute on function privado.proteger_mfa_usuario_demo()
  from public, anon, authenticated, service_role;

do $$
begin
  drop trigger if exists proteger_mfa_demo on auth.mfa_factors;
  create trigger proteger_mfa_demo
    before insert on auth.mfa_factors
    for each row execute function privado.proteger_mfa_usuario_demo();
exception when insufficient_privilege or undefined_table then
  raise warning 'No se pudo crear el trigger en auth.mfa_factors (%). reset_demo() borra los factores MFA cada noche.', sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- 2c. perfiles: desde la API nadie cambia rol ni activo de un usuario demo.
-- La política de 03 ya impide que el dueño se quite el rol o se desactive;
-- esto cubre que el dueño demo desactive o promueva al cajero demo. Su
-- propio perfil lo sigue cuidando la política (mismo error de siempre).
-- current_setting('role') es el rol de la petición (PostgREST hace SET ROLE)
-- y no cambia dentro de funciones SECURITY DEFINER. Desde el SQL Editor y
-- pg_cron vale 'none', así que la semilla y las reparaciones pasan.
-- -----------------------------------------------------------------------------
create or replace function privado.proteger_perfil_demo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if privado.es_usuario_demo(old.id)
     and old.id is distinct from (select auth.uid())
     and coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon')
     and (new.rol is distinct from old.rol or new.activo is distinct from old.activo)
  then
    raise exception 'Los usuarios del demo no se pueden desactivar ni cambiar de rol.'
      using errcode = 'LT403';
  end if;
  return new;
end;
$$;

revoke execute on function privado.proteger_perfil_demo()
  from public, anon, authenticated, service_role;

drop trigger if exists proteger_perfil_demo on public.perfiles;
create trigger proteger_perfil_demo
  before update on public.perfiles
  for each row execute function privado.proteger_perfil_demo();

-- -----------------------------------------------------------------------------
-- 3. Cambiar la contraseña de un usuario demo (desde el SQL Editor).
-- Actualiza auth.users y el hash guardado, para que reset_demo() no la
-- regrese a la anterior. bcrypt con costo 10, como Auth.
-- -----------------------------------------------------------------------------
create or replace function privado.cambiar_password_demo(p_correo text, p_password text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   uuid;
  v_hash text;
begin
  select d.id into v_id from privado.usuarios_demo d where lower(d.correo) = lower(p_correo);
  if v_id is null then
    raise exception '% no es un usuario demo.', p_correo;
  end if;
  if p_password is null or length(p_password) < 16 then
    raise exception 'Usa una contraseña de al menos 16 caracteres.';
  end if;

  v_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));

  perform set_config('demo.permitir_cambios', 'on', true);
  update auth.users set encrypted_password = v_hash where id = v_id;
  perform set_config('demo.permitir_cambios', '', true);

  update privado.usuarios_demo set password_hash = v_hash, guardado_en = now() where id = v_id;
  return format('Contraseña de %s cambiada.', p_correo);
end;
$$;

revoke execute on function privado.cambiar_password_demo(text, text)
  from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. reset_demo(): lo que corre pg_cron cada noche.
-- -----------------------------------------------------------------------------
create or replace function privado.reset_demo()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dueno  text;
  v_cajero text;
  v_turno  text;
begin
  select max(d.correo) filter (where d.rol = 'dueno'),
         max(d.correo) filter (where d.rol = 'cajero'),
         max(d.correo) filter (where d.rol = 'turno')
  into v_dueno, v_cajero, v_turno
  from privado.usuarios_demo d;

  if v_dueno is null or v_cajero is null or v_turno is null then
    raise exception 'privado.usuarios_demo está incompleta. Corre 18-modo-demo.sql.';
  end if;

  -- Segunda capa: si el trigger falló o se quitó, la demo se repara sola.
  perform set_config('demo.permitir_cambios', 'on', true);
  begin
    update auth.users u
    set email              = d.correo,
        encrypted_password = d.password_hash,
        email_change       = '',
        phone_change       = '',
        phone              = null
    from privado.usuarios_demo d
    where u.id = d.id
      and (   u.email                      is distinct from d.correo
           or u.encrypted_password         is distinct from d.password_hash
           or coalesce(u.email_change, '') <> ''
           or coalesce(u.phone_change, '') <> ''
           or u.phone is not null);
  exception when insufficient_privilege then
    raise warning 'reset_demo: sin permiso para restaurar auth.users (%).', sqlerrm;
  end;
  begin
    delete from auth.mfa_factors f
    where f.user_id in (select d.id from privado.usuarios_demo d);
  exception when insufficient_privilege or undefined_table then
    raise warning 'reset_demo: sin permiso para borrar auth.mfa_factors (%).', sqlerrm;
  end;
  perform set_config('demo.permitir_cambios', '', true);

  -- Historial de pg_cron: ventas-demo corre cada minuto (~1,440 filas al
  -- día). Se guardan solo los últimos 7 días.
  if to_regclass('cron.job_run_details') is not null then
    begin
      execute 'delete from cron.job_run_details
               where coalesce(end_time, start_time) < now() - interval ''7 days''';
    exception when insufficient_privilege then
      raise warning 'reset_demo: sin permiso para limpiar cron.job_run_details (%).', sqlerrm;
    end;
  end if;

  -- Datos del negocio y perfiles demo.
  perform privado.cargar_semilla(v_dueno, v_cajero, v_turno);
end;
$$;

revoke execute on function privado.reset_demo()
  from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. avanzar_demo(): cobra las ventas de hoy que ya llegaron a su hora.
-- Usa registrar_venta, la misma función del punto de venta, con la sesión
-- del usuario de cada venta (request.jwt.claims solo dentro de esta
-- transacción). Así aplica todas sus reglas: FOR UPDATE, stock no negativo,
-- copias de nombre/precio/costo y movimientos. Con la clave fija de cada
-- venta, correr dos veces no cobra doble.
-- Si una venta ya no se puede (alguien vendió lo último, desactivó el
-- producto...), queda como 'omitida' con el motivo y se sigue con las demás.
-- Devuelve cuántas ventas cobró.
-- -----------------------------------------------------------------------------
create or replace function privado.avanzar_demo()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoy   date := (now() at time zone 'America/Monterrey')::date;
  r       record;
  v_venta public.ventas;
  v_total numeric(12,2);
  v_pago  numeric(12,2);
  v_n     int := 0;
begin
  -- Marca del negocio (28): si un prospecto la cambió hace 30 minutos o más,
  -- vuelve a la original. Si 28 no está, no hace nada. Un error aquí no
  -- detiene las ventas. (PL/pgSQL resuelve la llamada al ejecutarla: si 28
  -- no está, esta línea nunca corre y no hace falta que la función exista.)
  if to_regprocedure('privado.restaurar_marca_vencida(timestamp with time zone)') is not null then
    begin
      perform privado.restaurar_marca_vencida();
    exception when others then
      raise warning 'avanzar_demo: no se pudo revisar la marca (%).', sqlerrm;
    end;
  end if;

  -- Pendientes de días anteriores (si el job estuvo detenido): ya no se cobran.
  update privado.demo_ventas_pendientes
  set estado = 'omitida', motivo = 'Ya pasó su día.', aplicada_en = now()
  where estado = 'pendiente'
    and (programada at time zone 'America/Monterrey')::date < v_hoy;

  for r in
    select *
    from privado.demo_ventas_pendientes p
    where p.estado = 'pendiente' and p.programada <= now()
    order by p.programada
    for update skip locked
  loop
    begin
      -- En efectivo se paga lo de la semilla; si el precio subió y ya no
      -- alcanza, se redondea hacia arriba a $50, como en la semilla.
      v_pago := null;
      if r.metodo_pago = 'efectivo' then
        select coalesce(sum(round((i ->> 'cantidad')::numeric * p.precio, 2)), 0) into v_total
        from jsonb_array_elements(r.items) i
        join public.productos p on p.id = (i ->> 'producto_id')::uuid;
        v_pago := case when v_total <= r.pago then r.pago else ceil(v_total / 50) * 50 end;
      end if;

      perform set_config('request.jwt.claims',
        json_build_object('sub', r.usuario_id, 'role', 'authenticated')::text, true);
      v_venta := public.registrar_venta(r.items, r.metodo_pago, v_pago, r.clave);
      perform set_config('request.jwt.claims', '', true);

      update privado.demo_ventas_pendientes
      set estado = 'aplicada', venta_id = v_venta.id, aplicada_en = now(), motivo = null
      where clave = r.clave;
      v_n := v_n + 1;
    exception when others then
      -- El bloque se revirtió completo (también el set_config).
      update privado.demo_ventas_pendientes
      set estado = 'omitida', motivo = left(sqlerrm, 200), aplicada_en = now()
      where clave = r.clave;
    end;
  end loop;

  perform set_config('request.jwt.claims', '', true);
  return v_n;
end;
$$;

revoke execute on function privado.avanzar_demo()
  from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. Guardar los usuarios demo (correo y hash actuales).
-- Si usaste otros correos:
--   select privado.registrar_usuarios_demo('tu-dueno@...', 'tu-cajero@...', 'tu-turno@...');
-- -----------------------------------------------------------------------------
select privado.registrar_usuarios_demo();

-- -----------------------------------------------------------------------------
-- 7. Programar con pg_cron (usa UTC; Monterrey es UTC-6 todo el año).
-- cron.schedule con nombre reemplaza el job si ya existe.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('reset-demo', '0 9 * * *', 'select privado.reset_demo()');
    perform cron.schedule('ventas-demo', '* * * * *', 'select privado.avanzar_demo()');
    raise notice 'pg_cron: reset-demo (09:00 UTC = 03:00 Monterrey) y ventas-demo (cada minuto) programados.';
  else
    raise warning 'pg_cron no está activado: actívalo en Database > Extensions y vuelve a correr este script.';
  end if;
end $$;

-- Resumen.
select
  (select count(*) from privado.usuarios_demo)                                     as usuarios_demo,
  (select count(*) from pg_trigger where tgname = 'proteger_usuario_demo')         as trigger_auth,
  (select count(*) from pg_trigger where tgname = 'proteger_mfa_demo')             as trigger_mfa,
  (select count(*) from pg_trigger where tgname = 'proteger_perfil_demo')          as trigger_perfiles,
  (select count(*) from privado.demo_ventas_pendientes where estado = 'pendiente') as ventas_pendientes_hoy,
  (select count(*) from pg_extension where extname = 'pg_cron')                    as pg_cron_activo;
