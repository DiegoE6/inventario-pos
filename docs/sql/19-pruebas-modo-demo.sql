-- =============================================================================
-- 19-pruebas-modo-demo.sql — Reinicio, ventas automáticas y protección del demo
-- Requiere: 01 a 18 (con la semilla cargada).
--
-- Todo dentro de BEGIN … ROLLBACK: no deja cambios (tampoco los reinicios de
-- las pruebas 7 y 9, que recargan la semilla dentro de la transacción).
-- "Success" en el SQL Editor = pasaron todas. Si una falla, el error dice cuál.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Contexto (como postgres)
-- -----------------------------------------------------------------------------
select
  set_config('pruebas.dueno',
    coalesce((select id::text from privado.usuarios_demo where rol = 'dueno'), ''), true),
  set_config('pruebas.cajero',
    coalesce((select id::text from privado.usuarios_demo where rol = 'cajero'), ''), true),
  set_config('pruebas.turno',
    coalesce((select id::text from privado.usuarios_demo where rol = 'turno'), ''), true),
  set_config('pruebas.producto',
    coalesce((select id::text from public.productos where codigo = 'HER-004'), ''), true);

do $$
begin
  if current_setting('pruebas.dueno') = '' or current_setting('pruebas.cajero') = ''
     or current_setting('pruebas.turno') = '' then
    raise exception '0. privado.usuarios_demo está incompleta. Corre 18 primero.';
  end if;
  if current_setting('pruebas.producto') = '' then
    raise exception '0. No existe el producto HER-004. Corre 07 primero.';
  end if;
  if (select stock from public.productos where codigo = 'HER-004') < 2 then
    raise exception '0. HER-004 tiene menos de 2 piezas. Corre 07 para recargar.';
  end if;
  if current_setting('demo.permitir_cambios', true) = 'on' then
    raise exception '0. demo.permitir_cambios está activo en esta sesión; ciérrala y vuelve a correr.';
  end if;
end $$;

-- 1. Ningún rol de la API puede usar lo del demo.
do $$
declare
  v_rol  text;
  v_func text;
  v_tab  text;
begin
  foreach v_rol in array array['anon', 'authenticated', 'service_role'] loop
    assert not has_schema_privilege(v_rol, 'privado', 'usage'),
      format('1. %s tiene USAGE sobre privado', v_rol);
    foreach v_func in array array[
      'privado.reset_demo()', 'privado.avanzar_demo()',
      'privado.cambiar_password_demo(text, text)',
      'privado.registrar_usuarios_demo(text, text, text)',
      'privado.es_usuario_demo(uuid)', 'privado.cargar_semilla(text, text, text)'
    ] loop
      assert not has_function_privilege(v_rol, v_func, 'execute'),
        format('1. %s puede ejecutar %s', v_rol, v_func);
    end loop;
    foreach v_tab in array array['privado.usuarios_demo', 'privado.demo_ventas_pendientes'] loop
      assert not has_table_privilege(v_rol, v_tab, 'select, insert, update, delete'),
        format('1. %s tiene permisos sobre %s', v_rol, v_tab);
    end loop;
  end loop;
  raise notice '✔ 1. anon, authenticated y service_role sin acceso a funciones y tablas del demo';
end $$;

-- 2. auth.users: correo, contraseña y teléfono de los tres usuarios demo no se
--    cambian (así llegarían de la API de Auth o del panel de Supabase).
do $$
declare
  v_id    uuid;
  v_sql   text;
  v_casos text[] := array[
    'update auth.users set encrypted_password = ''x'' where id = $1',
    'update auth.users set email = ''otro@ejemplo.test'' where id = $1',
    'update auth.users set email_change = ''otro@ejemplo.test'' where id = $1',
    'update auth.users set phone = ''5218100000000'' where id = $1',
    'update auth.users set phone_change = ''5218100000000'' where id = $1'
  ];
begin
  foreach v_id in array array[current_setting('pruebas.dueno')::uuid,
                              current_setting('pruebas.cajero')::uuid,
                              current_setting('pruebas.turno')::uuid] loop
    foreach v_sql in array v_casos loop
      begin
        execute v_sql using v_id;
        raise exception '2. FALLÓ: se permitió %', replace(v_sql, '$1', v_id::text);
      exception when sqlstate 'LT403' then null;
      end;
    end loop;
  end loop;
  raise notice '✔ 2. Correo, contraseña y teléfono de los usuarios demo bloqueados (LT403)';
end $$;

-- 3. Escrituras que no cambian esos valores sí pasan (iniciar sesión,
--    renovar el token); con el permiso de la transacción también pasa un
--    cambio real.
do $$
declare
  v_id   uuid := current_setting('pruebas.dueno')::uuid;
  v_hash text;
  v_n    int;
begin
  update auth.users
  set email              = email,
      encrypted_password = encrypted_password,
      email_change       = coalesce(email_change, ''),
      phone_change       = coalesce(phone_change, ''),
      last_sign_in_at    = now()
  where id = v_id;
  get diagnostics v_n = row_count;
  assert v_n = 1, '3. Una escritura sin cambios fue bloqueada';

  select encrypted_password into v_hash from auth.users where id = v_id;
  perform set_config('demo.permitir_cambios', 'on', true);
  update auth.users set encrypted_password = 'reparacion' where id = v_id;
  update auth.users set encrypted_password = v_hash where id = v_id;
  perform set_config('demo.permitir_cambios', '', true);
  raise notice '✔ 3. Sin cambios pasa; con demo.permitir_cambios se puede reparar';
end $$;

-- 4. MFA: nadie le activa un factor a un usuario demo.
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'proteger_mfa_demo') then
    raise exception '4. Falta el trigger proteger_mfa_demo (ver el aviso de 18).';
  end if;
  begin
    insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
    values (gen_random_uuid(), current_setting('pruebas.cajero')::uuid, 'prueba',
            'totp', 'unverified', now(), now());
    raise exception '4. FALLÓ: se activó MFA a un usuario demo';
  exception when sqlstate 'LT403' then null;
  end;
  raise notice '✔ 4. MFA bloqueado para usuarios demo (LT403)';
end $$;

-- =============================================================================
-- Como el DUEÑO demo (por la API)
-- =============================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.dueno'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- 5. El dueño demo no desactiva ni cambia de rol a los otros usuarios demo;
--    el nombre sí lo puede cambiar (el reinicio lo regresa).
do $$
declare
  v_id  uuid;
  v_sql text;
  v_n   int;
begin
  foreach v_id in array array[current_setting('pruebas.cajero')::uuid,
                              current_setting('pruebas.turno')::uuid] loop
    foreach v_sql in array array[
      'update public.perfiles set activo = false where id = $1',
      'update public.perfiles set rol = ''dueno'' where id = $1'
    ] loop
      begin
        execute v_sql using v_id;
        raise exception '5. FALLÓ: el dueño demo pudo hacer %', replace(v_sql, '$1', v_id::text);
      exception when sqlstate 'LT403' then null;
      end;
    end loop;
  end loop;

  update public.perfiles set nombre = 'Otro nombre'
  where id = current_setting('pruebas.cajero')::uuid;
  get diagnostics v_n = row_count;
  assert v_n = 1, '5. El dueño no pudo cambiar el nombre del cajero';
  raise notice '✔ 5. Perfiles demo: rol y activo bloqueados por la API (LT403)';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- 6. avanzar_demo(): cobra lo vencido con registrar_venta, omite lo que no
--    se puede, deja lo futuro y no cobra doble.
do $$
declare
  v_turno  uuid := current_setting('pruebas.turno')::uuid;
  v_cajero uuid := current_setting('pruebas.cajero')::uuid;
  v_prod   uuid := current_setting('pruebas.producto')::uuid;
  v_s0     numeric;
  v_precio numeric;
  v_cajero_ventas int;
  k_ok     uuid := gen_random_uuid();
  k_stock  uuid := gen_random_uuid();
  k_futura uuid := gen_random_uuid();
  k_ayer   uuid := gen_random_uuid();
  v_n      int;
  v        public.ventas;
  p        record;
begin
  -- Solo nuestras ventas: las de la semilla se apartan (todo se revierte).
  update privado.demo_ventas_pendientes set estado = 'omitida' where estado = 'pendiente';

  select stock, precio into v_s0, v_precio from public.productos where id = v_prod;
  select count(*) into v_cajero_ventas from public.ventas where usuario_id = v_cajero;

  insert into privado.demo_ventas_pendientes (clave, programada, usuario_id, metodo_pago, pago, items)
  values
    (k_ok,     now() - interval '1 minute', v_turno, 'efectivo', 0,
       jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 1))),
    (k_stock,  now() - interval '1 minute', v_turno, 'tarjeta', 0,
       jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', v_s0 + 1000))),
    (k_futura, now() + interval '1 hour',   v_turno, 'tarjeta', 0,
       jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 1))),
    (k_ayer,   now() - interval '30 hours', v_turno, 'tarjeta', 0,
       jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 1)));

  v_n := privado.avanzar_demo();
  assert v_n = 1, format('6. avanzar_demo cobró %s ventas, esperado 1', v_n);

  select * into p from privado.demo_ventas_pendientes where clave = k_ok;
  assert p.estado = 'aplicada' and p.venta_id is not null, '6. La venta vencida no quedó aplicada';
  select * into v from public.ventas where id = p.venta_id;
  assert v.usuario_id = v_turno, '6. La venta no quedó a nombre del cajero de turno';
  assert v.clave_cliente = k_ok, '6. La venta no usa la clave de la pendiente';
  assert v.total = round(v_precio, 2) and v.pago_recibido >= v.total and v.metodo_pago = 'efectivo',
    format('6. Montos de la venta: total %s, pago %s', v.total, v.pago_recibido);
  assert (select stock from public.productos where id = v_prod) = v_s0 - 1,
    '6. El stock no bajó una pieza';
  assert exists (select 1 from public.movimientos_inventario m
                 where m.venta_id = v.id and m.tipo = 'venta'
                   and m.stock_anterior = v_s0 and m.stock_nuevo = v_s0 - 1),
    '6. Falta el movimiento de la venta con stock anterior/nuevo';
  assert exists (select 1 from public.venta_detalle d
                 where d.venta_id = v.id and d.nombre_producto is not null and d.costo_unitario is not null),
    '6. Falta la copia de nombre y costo en el detalle';

  select * into p from privado.demo_ventas_pendientes where clave = k_stock;
  assert p.estado = 'omitida' and p.motivo is not null, '6. La venta sin stock no quedó omitida';
  assert (select estado from privado.demo_ventas_pendientes where clave = k_futura) = 'pendiente',
    '6. Se cobró una venta futura';
  assert (select motivo from privado.demo_ventas_pendientes where clave = k_ayer) = 'Ya pasó su día.',
    '6. La pendiente de ayer no quedó omitida';
  assert coalesce(current_setting('request.jwt.claims', true), '') = '',
    '6. avanzar_demo dejó puesta la sesión del usuario';

  -- Otra vuelta con la misma venta: registrar_venta devuelve la existente.
  update privado.demo_ventas_pendientes set estado = 'pendiente' where clave = k_ok;
  perform privado.avanzar_demo();
  assert (select count(*) from public.ventas where clave_cliente = k_ok) = 1, '6. Cobró doble';
  assert (select stock from public.productos where id = v_prod) = v_s0 - 1, '6. El stock bajó dos veces';

  assert (select count(*) from public.ventas where usuario_id = v_cajero) = v_cajero_ventas,
    '6. avanzar_demo le puso ventas al cajero demo';
  raise notice '✔ 6. avanzar_demo: cobra a tiempo, omite sin stock, respeta futuras y no duplica';
end $$;

-- 7. reset_demo(): lo que un prospecto (o alguien con acceso) rompa en el día
--    queda como nuevo.
do $$
declare
  v_dueno  uuid := current_setting('pruebas.dueno')::uuid;
  v_cajero uuid := current_setting('pruebas.cajero')::uuid;
  ud       record;
begin
  -- Romper: Auth (como si el trigger no existiera), MFA, negocio y perfiles.
  perform set_config('demo.permitir_cambios', 'on', true);
  update auth.users
  set email = 'hackeado@ejemplo.test', encrypted_password = 'hackeado',
      email_change = 'otro@ejemplo.test', phone = '5218100000000'
  where id = v_dueno;
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
  values (gen_random_uuid(), v_cajero, 'prueba', 'totp', 'verified', now(), now());
  perform set_config('demo.permitir_cambios', '', true);

  update public.configuracion_negocio set nombre = 'Hackeado', color_primario = '#000000', telefono = null;
  update public.productos set nombre = 'Roto', activo = false;
  update public.categorias set activo = false;
  insert into public.categorias (nombre) values ('Basura');
  update public.proveedores set nombre = nombre || ' (roto)';
  update public.perfiles set activo = false, nombre = 'Roto' where id = v_cajero;
  update public.ventas set estado = 'cancelada', motivo_cancelacion = 'prueba', cancelada_en = now()
  where estado = 'completada';

  perform privado.reset_demo();

  -- Auth
  for ud in select * from privado.usuarios_demo loop
    assert exists (select 1 from auth.users u
                   where u.id = ud.id and u.email = ud.correo and u.encrypted_password = ud.password_hash
                     and coalesce(u.email_change, '') = '' and u.phone is null),
      format('7. No se restauró el usuario %s', ud.correo);
  end loop;
  assert not exists (select 1 from auth.mfa_factors f
                     where f.user_id in (select id from privado.usuarios_demo)),
    '7. Quedaron factores MFA en usuarios demo';

  -- Negocio
  assert (select nombre = 'Ferretería La Tuerca' and color_primario = '#c2410c' and telefono is not null
          from public.configuracion_negocio where id = 1), '7. No se restauró la configuración';
  assert (select count(*) from public.productos where activo and nombre <> 'Roto') = 40,
    '7. No se restauraron los 40 productos';
  assert (select id from public.productos where codigo = 'HER-004') = current_setting('pruebas.producto')::uuid,
    '7. El producto cambió de id con el reinicio (los carritos guardados se rompen)';
  assert (select count(*) from public.categorias where id between 1 and 6) = 6
     and (select count(*) from public.proveedores where id between 1 and 5) = 5,
    '7. Categorías o proveedores cambiaron de id con el reinicio';
  assert (select count(*) from public.categorias where activo) = 6
     and not exists (select 1 from public.categorias where nombre = 'Basura'),
    '7. No se restauraron las categorías';
  assert (select count(*) from public.proveedores) = 5
     and not exists (select 1 from public.proveedores where nombre like '%(roto)'),
    '7. No se restauraron los proveedores';
  assert (select count(*) from public.ventas where estado = 'cancelada') = 1,
    '7. Las ventas canceladas no volvieron a la semilla';
  assert (select count(*) from public.perfiles p join privado.usuarios_demo d on d.id = p.id
          where p.activo and p.nombre <> 'Roto'
            and p.rol = case d.rol when 'dueno' then 'dueno' else 'cajero' end) = 3,
    '7. No se restauraron los perfiles demo';

  -- Semilla sana
  assert not exists (select 1 from public.ventas where creado_en > now()), '7. Hay ventas en el futuro';
  assert not exists (select 1 from privado.demo_ventas_pendientes
                     where estado <> 'pendiente' or programada <= now()
                        or (programada at time zone 'America/Monterrey')::date
                           <> (now() at time zone 'America/Monterrey')::date),
    '7. Hay pendientes vencidas o de otro día';
  assert not exists (select 1 from public.ventas where usuario_id = v_cajero),
    '7. La semilla le puso ventas al cajero demo';
  assert not exists (
      select 1 from public.productos p
      where p.stock < 0
         or p.stock <> coalesce((select sum(m.cantidad) from public.movimientos_inventario m
                                 where m.producto_id = p.id), 0)),
    '7. El stock no cuadra con los movimientos';
  raise notice '✔ 7. reset_demo restaura Auth, MFA, configuración, catálogos, productos, ventas y perfiles';
end $$;

-- =============================================================================
-- Como AUTHENTICATED y ANON
-- =============================================================================
-- 8. Nadie de la API puede llamar el reinicio ni las ventas automáticas.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.dueno'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_sql text;
begin
  foreach v_sql in array array[
    'select privado.reset_demo()', 'select privado.avanzar_demo()',
    'select privado.cambiar_password_demo(''demo@latuerca.test'', ''contrasena-larga-de-prueba'')'
  ] loop
    begin
      execute v_sql;
      raise exception '8. El dueño demo pudo ejecutar: %', v_sql;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

do $$
begin
  begin
    perform privado.reset_demo();
    raise exception '8. anon pudo ejecutar reset_demo';
  exception when insufficient_privilege then null;
  end;
  raise notice '✔ 8. authenticated y anon sin permiso (42501)';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- 9. reset_demo borra el historial de pg_cron de más de 7 días y deja el
--    reciente. (Si pg_cron no está instalado, se omite.)
do $$
declare
  v_job bigint;
  v_n   int;
begin
  if to_regclass('cron.job_run_details') is null then
    raise notice '– 9. pg_cron no está instalado aquí: se omite';
    return;
  end if;
  execute 'select coalesce((select jobid from cron.job where jobname = ''ventas-demo''), 0)' into v_job;
  execute 'insert into cron.job_run_details (jobid, runid, command, status, start_time, end_time)
           values ($1, -1, ''prueba vieja'',    ''succeeded'', now() - interval ''8 days'', now() - interval ''8 days''),
                  ($1, -2, ''prueba reciente'', ''succeeded'', now() - interval ''6 days'', now() - interval ''6 days'')'
    using v_job;

  perform privado.reset_demo();

  execute 'select count(*) from cron.job_run_details
           where coalesce(end_time, start_time) < now() - interval ''7 days''' into v_n;
  assert v_n = 0, format('9. Quedaron %s corridas de pg_cron de más de 7 días', v_n);
  execute 'select count(*) from cron.job_run_details where runid = -2' into v_n;
  assert v_n = 1, '9. reset_demo borró historial reciente de pg_cron';
  raise notice '✔ 9. Historial de pg_cron: se borra lo de más de 7 días';
end $$;

-- 10. demo.permitir_cambios no le sirve a la API.
--   a) Ninguna función de los esquemas que expone la API (public,
--      graphql_public) usa set_config ni menciona el permiso. PostgREST solo
--      expone funciones de esos esquemas: set_config (pg_catalog) no se
--      puede llamar por RPC.
--   b) anon y authenticated no tienen permisos sobre auth.users.
--   c) Aunque un rol de la API pusiera el permiso, no puede escribir en
--      auth.users y el trigger de perfiles no depende de él.
do $$
declare
  v_rol text;
begin
  assert not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'graphql_public')
        and (p.prosrc ilike '%set_config%' or p.prosrc ilike '%permitir_cambios%')),
    '10. Una función expuesta por la API usa set_config o demo.permitir_cambios';
  foreach v_rol in array array['anon', 'authenticated'] loop
    assert not has_table_privilege(v_rol, 'auth.users', 'select, insert, update, delete'),
      format('10. %s tiene permisos sobre auth.users', v_rol);
    assert not has_table_privilege(v_rol, 'auth.mfa_factors', 'insert, update, delete'),
      format('10. %s puede escribir en auth.mfa_factors', v_rol);
  end loop;
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.dueno'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform set_config('demo.permitir_cambios', 'on', true);
  begin
    update auth.users set encrypted_password = 'x' where id = current_setting('pruebas.dueno')::uuid;
    raise exception '10. authenticated pudo escribir en auth.users';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.perfiles set activo = false where id = current_setting('pruebas.cajero')::uuid;
    raise exception '10. Con el permiso puesto, el dueño demo desactivó al cajero demo';
  exception when sqlstate 'LT403' then null;
  end;
  perform set_config('demo.permitir_cambios', '', true);
  raise notice '✔ 10. demo.permitir_cambios no se puede usar desde la API';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);
rollback;
