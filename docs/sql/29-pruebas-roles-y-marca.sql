-- =============================================================================
-- 29-pruebas-roles-y-marca.sql — Marca, logo, usuarios y permisos (28)
-- Requiere: 01 a 28 (con la semilla cargada). En el demo, también 18.
--
-- Todo dentro de BEGIN … ROLLBACK: no deja cambios (tampoco en Storage: solo
-- se tocan filas de storage.objects dentro de la transacción, no archivos).
-- "Success" en el SQL Editor = pasaron todas. Si una falla, el error dice cuál.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Contexto (como postgres)
-- -----------------------------------------------------------------------------
select
  set_config('pruebas.dueno',
    coalesce((select id::text from auth.users where lower(email) = 'demo@latuerca.test'), ''), true),
  set_config('pruebas.cajero',
    coalesce((select id::text from auth.users where lower(email) = 'cajero@latuerca.test'), ''), true),
  set_config('pruebas.nuevo', gen_random_uuid()::text, true),
  set_config('pruebas.demo', (to_regclass('privado.usuarios_demo') is not null)::text, true);

do $$
begin
  if current_setting('pruebas.dueno') = '' or current_setting('pruebas.cajero') = '' then
    raise exception '0. Faltan los usuarios demo. Corre 07.';
  end if;
  if to_regprocedure('public.actualizar_usuario(uuid, text, text, boolean)') is null then
    raise exception '0. Falta 28-roles-y-marca.sql.';
  end if;
  if to_regclass('storage.objects') is null then
    raise exception '0. No existe storage.objects (¿no es una base de Supabase?).';
  end if;

  -- Un usuario nuevo (el trigger de 02 le crea perfil de cajero inactivo).
  insert into auth.users (id, email) values (current_setting('pruebas.nuevo')::uuid, 'nuevo-29@latuerca.test');
  assert (select rol = 'cajero' and not activo from public.perfiles where id = current_setting('pruebas.nuevo')::uuid),
    '0. El perfil nuevo debe nacer como cajero inactivo';

  -- Otro bucket, para probar que las políticas solo dejan `marca`.
  insert into storage.buckets (id, name, public) values ('otro-29', 'otro-29', false)
  on conflict (id) do nothing;
end $$;

-- 1. Catálogo.
do $$
declare
  f text;
begin
  assert (select count(*) from pg_constraint
          where conrelid = 'public.configuracion_negocio'::regclass and convalidated
            and conname in ('configuracion_giro_largo', 'configuracion_telefono_largo',
                            'configuracion_direccion_largo', 'configuracion_logo_url')) = 4,
    '1. Faltan los CHECK de configuracion_negocio (o quedaron NOT VALID)';

  foreach f in array array['public.usuarios()', 'public.actualizar_usuario(uuid, text, text, boolean)',
                           'public.restaurar_marca_demo()'] loop
    assert (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = f::regprocedure),
      format('1. %s debe ser SECURITY DEFINER con search_path vacío', f);
    assert not has_function_privilege('anon', f, 'execute'), format('1. anon puede ejecutar %s', f);
    assert pg_get_function_result(f::regprocedure) !~* '(costo|ganancia|valor)',
      format('1. %s regresa costos', f);
  end loop;
  foreach f in array array['privado.marca_original()', 'privado.aplicar_marca_original()',
                           'privado.restaurar_marca_vencida(timestamp with time zone)',
                           'privado.es_usuario_demo_seguro(uuid)'] loop
    assert not has_function_privilege('authenticated', f, 'execute')
       and not has_function_privilege('anon', f, 'execute'),
      format('1. La API puede ejecutar %s', f);
  end loop;

  -- Bucket y políticas.
  assert (select public and file_size_limit = 524288 and allowed_mime_types = array['image/webp']
          from storage.buckets where id = 'marca'),
    '1. El bucket marca debe ser público, de 512 KB y solo image/webp';
  assert (select count(*) from pg_policies
          where schemaname = 'storage' and tablename = 'objects'
            and policyname in ('marca_logo_insert', 'marca_logo_update', 'marca_logo_select')) = 3,
    '1. Faltan políticas del logo en storage.objects';
  assert not exists (select 1 from pg_policies
                     where schemaname = 'storage' and tablename = 'objects'
                       and policyname like 'marca%' and cmd in ('DELETE', 'ALL')),
    '1. Hay una política de borrado para el logo';
  assert not exists (select 1 from pg_policies
                     where schemaname = 'storage' and tablename = 'objects'
                       and policyname like 'marca%' and roles && array['anon'::name, 'public'::name]),
    '1. Una política del logo aplica a anon';
  raise notice '✔ 1. CHECKs, funciones, bucket y políticas';
end $$;

-- =============================================================================
-- Como DUEÑO
-- =============================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.dueno'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- 2. Configuración: valores válidos pasan; largos, color y logo_url inválidos no.
do $$
declare
  v_caso text[];
  v_n    int;
begin
  update public.configuracion_negocio
  set nombre = 'Abarrotes Doña Lupe', giro = repeat('g', 60), telefono = repeat('1', 30),
      direccion = repeat('d', 200), color_primario = '#FDE047',
      logo_url = '/storage/v1/object/public/marca/logo?v=1731300000000'
  where id = 1;
  get diagnostics v_n = row_count;
  assert v_n = 1, '2. El dueño no pudo editar la configuración';

  foreach v_caso slice 1 in array array[
    array['giro', repeat('g', 61)],
    array['telefono', repeat('1', 31)],
    array['direccion', repeat('d', 201)],
    array['nombre', ''],
    array['color_primario', '#12345'],
    array['color_primario', 'red'],
    array['logo_url', 'https://evil.test/logo.png'],
    array['logo_url', 'javascript:alert(1)'],
    array['logo_url', 'https://abc.supabase.co/storage/v1/object/public/marca/logo?v=1'],
    array['logo_url', '/storage/v1/object/public/marca/logo'],
    array['logo_url', '/storage/v1/object/public/marca/otro?v=1'],
    array['logo_url', '/storage/v1/object/public/marca/logo?v=1&x=2'],
    array['logo_url', '//evil.test/storage/v1/object/public/marca/logo?v=1']
  ] loop
    begin
      execute format('update public.configuracion_negocio set %I = %L where id = 1', v_caso[1], v_caso[2]);
      raise exception '2. Se aceptó %: %', v_caso[1], v_caso[2];
    exception when check_violation then null;
    end;
  end loop;
  raise notice '✔ 2. Configuración: válidos pasan; 13 inválidos rechazados (largos, color, logo_url)';
end $$;

-- 3. Storage: el dueño escribe y lee marca/logo; nada más.
do $$
declare
  v_n int;
begin
  -- Insert simple, sin ON CONFLICT: el Storage con versionado no tiene un
  -- índice único simple en (bucket_id, name), solo índices parciales. Si ya
  -- hay un logo subido desde la app, se salta el insert y se prueba el update.
  if not exists (select 1 from storage.objects where bucket_id = 'marca' and name = 'logo') then
    insert into storage.objects (bucket_id, name) values ('marca', 'logo');
  end if;
  update storage.objects set name = name where bucket_id = 'marca' and name = 'logo';
  get diagnostics v_n = row_count;
  assert v_n = 1, '3. El dueño no pudo actualizar marca/logo';
  assert (select count(*) from storage.objects where bucket_id = 'marca' and name = 'logo') = 1,
    '3. El dueño no ve marca/logo';

  begin
    insert into storage.objects (bucket_id, name) values ('marca', 'otro');
    raise exception '3. El dueño subió marca/otro';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('otro-29', 'logo');
    raise exception '3. El dueño subió a otro bucket';
  exception when insufficient_privilege then null;
  end;
  raise notice '✔ 3. Storage: el dueño escribe marca/logo; otra ruta u otro bucket, no';
end $$;

-- 4. Usuarios: lista con correo; reglas de actualizar_usuario.
do $$
declare
  v_nuevo uuid := current_setting('pruebas.nuevo')::uuid;
  v_dueno uuid := current_setting('pruebas.dueno')::uuid;
  p       public.perfiles;
  v_caso  record;
  v_est   text;
  v_msg   text;
begin
  assert exists (select 1 from public.usuarios() u where u.id = v_nuevo and u.correo = 'nuevo-29@latuerca.test'),
    '4. usuarios() no trae al usuario nuevo con su correo';
  if current_setting('pruebas.demo')::boolean then
    assert (select count(*) from public.usuarios() u
            where u.es_demo and u.id in (v_dueno, current_setting('pruebas.cajero')::uuid)) = 2,
      '4. Los usuarios demo deben venir marcados';
    assert not (select u.es_demo from public.usuarios() u where u.id = v_nuevo), '4. El nuevo no es demo';
  end if;

  p := public.actualizar_usuario(v_nuevo, '  Ana   López ', 'cajero', true);
  assert p.nombre = 'Ana López' and p.rol = 'cajero' and p.activo, format('4. Activar: %s', row_to_json(p));
  p := public.actualizar_usuario(v_nuevo, 'Ana López', 'dueno', true);
  assert p.rol = 'dueno', '4. No se pudo hacer dueño';
  p := public.actualizar_usuario(v_nuevo, 'Ana López', 'cajero', true);

  for v_caso in
    select * from (values
      (v_dueno, 'Dueño', 'cajero', true,  'LT409', 'No puedes quitarte el rol'),
      (v_dueno, 'Dueño', 'dueno',  false, 'LT409', 'No puedes desactivarte'),
      (v_nuevo, 'Ana',   'admin',  true,  'LT422', 'Rol no válido'),
      (v_nuevo, '   ',   'cajero', true,  'LT422', 'El nombre es obligatorio'),
      (v_nuevo, repeat('a', 81), 'cajero', true, 'LT422', 'El nombre es obligatorio'),
      (gen_random_uuid(), 'X', 'cajero', true, 'LT404', 'El usuario no existe')
    ) t(id, nombre, rol, activo, codigo, mensaje)
  loop
    begin
      perform public.actualizar_usuario(v_caso.id, v_caso.nombre, v_caso.rol, v_caso.activo);
      raise exception '4. Se aceptó: %', v_caso.mensaje;
    exception when others then
      get stacked diagnostics v_est = returned_sqlstate, v_msg = message_text;
      assert v_est = v_caso.codigo and v_msg like v_caso.mensaje || '%',
        format('4. Esperaba %s "%s…", llegó %s "%s"', v_caso.codigo, v_caso.mensaje, v_est, v_msg);
    end;
  end loop;

  if current_setting('pruebas.demo')::boolean then
    begin
      perform public.actualizar_usuario(current_setting('pruebas.cajero')::uuid, 'Otro', 'cajero', true);
      raise exception '4. Se modificó un usuario demo';
    exception when sqlstate 'LT409' then null;
    end;
  end if;

  -- El dueño sigue siendo dueño y activo.
  assert (select rol = 'dueno' and activo from public.perfiles where id = v_dueno), '4. El dueño cambió';
  -- Desactivar al nuevo, para la prueba 5.
  p := public.actualizar_usuario(v_nuevo, 'Ana López', 'cajero', false);
  assert not p.activo, '4. No se pudo desactivar';
  raise notice '✔ 4. usuarios() con correo; actualizar_usuario: reglas, sin quitarse el rol ni desactivarse';
end $$;

-- 5. Proveedores: el dueño sí los ve.
do $$
begin
  assert (select count(*) from public.proveedores) > 0, '5. El dueño no ve proveedores';
end $$;

-- =============================================================================
-- Como el USUARIO DESACTIVADO (con su JWT todavía válido)
-- =============================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.nuevo'), 'role', 'authenticated')::text, true);

do $$
begin
  assert public.rol_actual() is null, '5. Un usuario desactivado todavía tiene rol';
  assert (select count(*) from public.productos) = 0, '5. Un usuario desactivado lee productos';
  assert (select count(*) from public.ventas) = 0, '5. Un usuario desactivado lee ventas';
  begin
    perform public.registrar_venta('[]'::jsonb, 'efectivo', 0, gen_random_uuid());
    raise exception '5. Un usuario desactivado pudo vender';
  exception when sqlstate 'LT401' then null;
  end;
  raise notice '✔ 5. Usuario desactivado: sin rol, sin lecturas y LT401 en funciones';
end $$;

-- =============================================================================
-- Como CAJERO
-- =============================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.cajero'), 'role', 'authenticated')::text, true);

do $$
declare
  v_sql text;
  v_n   int;
begin
  foreach v_sql in array array[
    'select * from public.usuarios()',
    format('select public.actualizar_usuario(%L, ''X'', ''dueno'', true)', current_setting('pruebas.cajero')),
    'select public.restaurar_marca_demo()'
  ] loop
    begin
      execute v_sql;
      raise exception '6. El cajero pudo: %', v_sql;
    exception when sqlstate 'LT403' then null;
    end;
  end loop;

  update public.configuracion_negocio set nombre = 'Del cajero' where id = 1;
  get diagnostics v_n = row_count;
  assert v_n = 0, '6. El cajero editó la configuración';
  update public.perfiles set rol = 'dueno' where id = current_setting('pruebas.cajero')::uuid;
  get diagnostics v_n = row_count;
  assert v_n = 0, '6. El cajero se hizo dueño';

  assert (select count(*) from public.proveedores) = 0, '6. El cajero ve proveedores';
  assert (select count(*) from public.configuracion_negocio) = 1, '6. El cajero debe poder leer la configuración';

  -- Insert directo y "upsert" como insert ... on conflict do nothing (sin
  -- columnas, porque el Storage con versionado solo tiene índices parciales).
  -- Los dos los frena la política de insert: la RLS se revisa antes que el
  -- índice único, así que si la política los dejara pasar el error sería
  -- 23505 o "0 filas" y la prueba falla. El update lo prueba la sentencia
  -- de abajo (0 filas).
  begin
    insert into storage.objects (bucket_id, name) values ('marca', 'logo');
    raise exception '6. El cajero subió el logo';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('marca', 'logo')
    on conflict do nothing;
    raise exception '6. El cajero sobrescribió el logo';
  exception when insufficient_privilege then null;
  end;
  update storage.objects set name = name where bucket_id = 'marca' and name = 'logo';
  get diagnostics v_n = row_count;
  assert v_n = 0, '6. El cajero actualizó el logo';
  raise notice '✔ 6. Cajero: LT403 en usuarios y marca; sin editar configuración, perfiles ni logo; sin proveedores';
end $$;

-- =============================================================================
-- Como ANON
-- =============================================================================
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

do $$
declare
  v_sql text;
begin
  foreach v_sql in array array[
    'select * from public.usuarios()',
    format('select public.actualizar_usuario(%L, ''X'', ''dueno'', true)', current_setting('pruebas.dueno')),
    'select public.restaurar_marca_demo()',
    'update public.configuracion_negocio set nombre = ''anon'' where id = 1',
    'select count(*) from public.proveedores',
    'insert into storage.objects (bucket_id, name) values (''marca'', ''logo'')'
  ] loop
    begin
      execute v_sql;
      raise exception '7. anon pudo: %', v_sql;
    exception when insufficient_privilege then null;
    end;
  end loop;
  assert (select count(*) from public.configuracion_negocio) = 1, '7. anon debe poder leer la configuración (login)';
  raise notice '✔ 7. anon: 42501 en usuarios, marca, proveedores y Storage; sí lee la configuración';
end $$;

-- =============================================================================
-- 8. Demo: restaurar la marca (botón) y que la original sea la de la semilla.
-- =============================================================================
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.dueno'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  o record;
  c public.configuracion_negocio;
begin
  if not current_setting('pruebas.demo')::boolean then
    begin
      perform public.restaurar_marca_demo();
      raise exception '8. restaurar_marca_demo funcionó fuera del demo';
    exception when sqlstate 'LT409' then null;
    end;
    raise notice '✔ 8. Fuera del demo, restaurar_marca_demo responde LT409';
    return;
  end if;
  perform public.restaurar_marca_demo();
  select * into c from public.configuracion_negocio where id = 1;
  assert c.nombre = 'Ferretería La Tuerca' and c.logo_url is null and c.color_primario = '#c2410c',
    '8. El botón no restauró la marca';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

do $$
declare
  o record;
  c public.configuracion_negocio;
begin
  if not current_setting('pruebas.demo')::boolean then
    return;
  end if;
  update public.configuracion_negocio set nombre = 'Otra cosa', color_primario = '#000000' where id = 1;
  perform privado.reset_demo();
  select * into o from privado.marca_original();
  select * into c from public.configuracion_negocio where id = 1;
  assert (c.nombre, c.giro, c.logo_url, c.color_primario, c.telefono, c.direccion)
         is not distinct from (o.nombre, o.giro, o.logo_url, o.color_primario, o.telefono, o.direccion),
    '8. privado.marca_original() no coincide con lo que deja la semilla (07): actualiza 28';
  raise notice '✔ 8. Botón de restaurar; la marca original coincide con la de la semilla';
end $$;

rollback;
