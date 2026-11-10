-- =============================================================================
-- 23-pruebas-folios-consecutivos.sql — Folios sin huecos
-- Requiere: 01 a 22 (con la semilla cargada). Las pruebas del demo (6) se
-- omiten si 18 no está instalado.
--
-- Todo dentro de BEGIN … ROLLBACK: no deja cambios (tampoco la recarga de la
-- semilla de la prueba 7).
-- "Success" en el SQL Editor = pasaron todas. Si una falla, el error dice cuál.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Contexto (como postgres)
-- -----------------------------------------------------------------------------
select
  set_config('pruebas.dueno',
    coalesce((select id::text from auth.users where lower(email) = 'demo@latuerca.test'), ''), true),
  set_config('pruebas.producto',
    coalesce((select id::text from public.productos where codigo = 'HER-004'), ''), true);

do $$
begin
  if current_setting('pruebas.dueno') = '' or current_setting('pruebas.producto') = '' then
    raise exception '0. Faltan el usuario demo o HER-004. Corre 07.';
  end if;
  if (select stock from public.productos where codigo = 'HER-004') < 3 then
    raise exception '0. HER-004 tiene menos de 3 piezas. Corre 07 para recargar.';
  end if;
end $$;

-- 1. Estructura: sin identity, default al contador, contador al día, nadie de
--    la API puede pedir folios, y el candado del contador va antes que los
--    de productos en registrar_venta.
do $$
declare
  v_src text := pg_get_functiondef('public.registrar_venta(jsonb, text, numeric, uuid)'::regprocedure);
  v_rol text;
begin
  assert (select is_identity from information_schema.columns
          where table_schema = 'public' and table_name = 'ventas' and column_name = 'folio') = 'NO',
    '1. ventas.folio sigue siendo identity';
  assert (select column_default from information_schema.columns
          where table_schema = 'public' and table_name = 'ventas' and column_name = 'folio')
         like '%siguiente_folio()%',
    '1. ventas.folio no toma el folio del contador';
  assert (select ultimo from privado.contador_folios where id = 1)
         >= coalesce((select max(folio) from public.ventas), 0),
    '1. El contador va atrás del folio más alto';
  foreach v_rol in array array['anon', 'authenticated', 'service_role'] loop
    assert not has_function_privilege(v_rol, 'privado.siguiente_folio()', 'execute'),
      format('1. %s puede pedir folios (dejaría huecos)', v_rol);
    assert not has_table_privilege(v_rol, 'privado.contador_folios', 'select, update'),
      format('1. %s tiene permisos sobre el contador', v_rol);
  end loop;
  assert position('privado.contador_folios c where c.id = 1 for update' in v_src) > 0
     and position('privado.contador_folios c where c.id = 1 for update' in v_src)
         < position('-- 3. Bloquear productos' in v_src),
    '1. registrar_venta no toma el contador antes de bloquear los productos';
  raise notice '✔ 1. Folio con contador, sin acceso de la API y candados en orden';
end $$;

-- =============================================================================
-- Como DUEÑO (por la API)
-- =============================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.dueno'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- 2 a 5. Cobros que fallan, reintentos y choques no gastan folio.
do $$
declare
  v_prod  uuid := current_setting('pruebas.producto')::uuid;
  v_clave uuid := gen_random_uuid();
  v_f0    bigint := (select max(folio) from public.ventas);
  v1      public.ventas;
  v2      public.ventas;
  v3      public.ventas;
begin
  -- 2. Fallan: sin stock, pago que no alcanza, producto que no existe.
  begin
    perform public.registrar_venta(
      jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 100000)), 'tarjeta', null, gen_random_uuid());
    raise exception '2. Se cobró sin stock';
  exception when sqlstate 'LT409' then null;
  end;
  begin
    perform public.registrar_venta(
      jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 1)), 'efectivo', 1, gen_random_uuid());
    raise exception '2. Se cobró con pago insuficiente';
  exception when sqlstate 'LT422' then null;
  end;
  begin
    perform public.registrar_venta(
      jsonb_build_array(jsonb_build_object('producto_id', gen_random_uuid(), 'cantidad', 1)), 'tarjeta', null, gen_random_uuid());
    raise exception '2. Se cobró un producto que no existe';
  exception when sqlstate 'LT404' then null;
  end;

  -- 3. El siguiente cobro bueno toma el folio que sigue.
  v1 := public.registrar_venta(
    jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 1)), 'tarjeta', null, v_clave);
  assert v1.folio = v_f0 + 1,
    format('3. Folio %s después de cobros fallidos; esperado %s (hay hueco)', v1.folio, v_f0 + 1);

  -- 4. Reintento con la misma clave: la misma venta, sin gastar folio.
  v2 := public.registrar_venta(
    jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 1)), 'tarjeta', null, v_clave);
  assert v2.id = v1.id and v2.folio = v1.folio, '4. El reintento no regresó la misma venta';

  -- 5. Choque con el índice único de la clave (el respaldo de registrar_venta):
  --    el folio que tomó el INSERT se revierte con él.
  begin
    insert into public.ventas (subtotal, total, metodo_pago, pago_recibido, cambio, usuario_id, clave_cliente)
    values (0, 0, 'tarjeta', 0, 0, current_setting('pruebas.dueno')::uuid, v_clave);
    raise exception '5. Se insertó una clave repetida';
  exception
    when unique_violation then null;
    when insufficient_privilege then null;  -- por la API ni siquiera puede insertar
  end;

  v3 := public.registrar_venta(
    jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 1)), 'tarjeta', null, gen_random_uuid());
  assert v3.folio = v1.folio + 1,
    format('5. Folio %s después del reintento y el choque; esperado %s', v3.folio, v1.folio + 1);
  raise notice '✔ 2-5. Cobros fallidos, reintento idempotente y choque de clave no dejan huecos (% → %)',
    v_f0, v3.folio;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- 5b. El mismo choque como postgres (sí puede insertar): el folio se revierte.
do $$
declare
  v_ult   bigint := (select ultimo from privado.contador_folios);
  v_clave uuid := (select clave_cliente from public.ventas order by folio desc limit 1);
begin
  begin
    insert into public.ventas (subtotal, total, metodo_pago, pago_recibido, cambio, usuario_id, clave_cliente)
    values (0, 0, 'tarjeta', 0, 0, current_setting('pruebas.dueno')::uuid, v_clave);
    raise exception '5b. Se insertó una clave repetida';
  exception when unique_violation then null;
  end;
  assert (select ultimo from privado.contador_folios) = v_ult,
    '5b. El choque de clave se llevó un folio';
  raise notice '✔ 5b. Un INSERT que choca no se lleva folio';
end $$;

-- 6. Ventas automáticas del demo: una omitida no deja hueco.
do $$
declare
  v_turno uuid;
  v_prod  uuid := current_setting('pruebas.producto')::uuid;
  v_f0    bigint;
  k_mala  uuid := gen_random_uuid();
  k_buena uuid := gen_random_uuid();
  v_folio bigint;
begin
  if to_regprocedure('privado.avanzar_demo()') is null then
    raise notice '– 6. 18 no está instalado: se omite';
    return;
  end if;
  select id into v_turno from privado.usuarios_demo where rol = 'turno';
  update privado.demo_ventas_pendientes set estado = 'omitida' where estado = 'pendiente';
  v_f0 := (select max(folio) from public.ventas);

  insert into privado.demo_ventas_pendientes (clave, programada, usuario_id, metodo_pago, pago, items)
  values
    (k_mala,  now() - interval '2 minutes', v_turno, 'tarjeta', 0,
       jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 100000))),
    (k_buena, now() - interval '1 minute',  v_turno, 'tarjeta', 0,
       jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 1)));

  perform privado.avanzar_demo();
  assert (select estado from privado.demo_ventas_pendientes where clave = k_mala) = 'omitida',
    '6. La venta sin stock no quedó omitida';
  select v.folio into v_folio
  from privado.demo_ventas_pendientes d join public.ventas v on v.id = d.venta_id
  where d.clave = k_buena;
  assert v_folio = v_f0 + 1,
    format('6. avanzar_demo dio el folio %s; esperado %s (la omitida dejó hueco)', v_folio, v_f0 + 1);
  raise notice '✔ 6. avanzar_demo: la venta omitida no deja hueco';
end $$;

-- 7. Recarga de la semilla (lo que hace reset_demo): folios 1…N, sin huecos,
--    en orden de fecha, y el contador en N.
do $$
declare
  r record;
begin
  perform privado.cargar_semilla();

  select count(*) as n, min(folio) as minimo, max(folio) as maximo,
         count(distinct folio) as distintos
  into r from public.ventas;
  assert r.minimo = 1 and r.maximo = r.n and r.distintos = r.n,
    format('7. Folios %s…%s para %s ventas: hay huecos', r.minimo, r.maximo, r.n);
  assert (select ultimo from privado.contador_folios) = r.maximo,
    '7. El contador no quedó en el último folio';
  assert not exists (
      select 1 from (
        select creado_en, lag(creado_en) over (order by folio) as anterior from public.ventas
      ) t where t.creado_en < t.anterior),
    '7. Los folios no van en orden de fecha';
  raise notice '✔ 7. Semilla: % ventas con folios 1…% en orden de fecha', r.n, r.maximo;
end $$;

rollback;
