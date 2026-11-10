-- =============================================================================
-- 21-pruebas-costos-solo-dueno.sql — El cajero no obtiene costos por ningún camino
-- Requiere: 01 a 20 (con la semilla cargada) y pg_graphql desactivado en
-- Supabase (ver docs/endurecimiento.md).
--
-- Todo dentro de BEGIN … ROLLBACK: no deja cambios.
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
  set_config('pruebas.producto',
    coalesce((select id::text from public.productos where codigo = 'HER-004'), ''), true),
  set_config('pruebas.costo',
    coalesce((select costo::text from public.productos where codigo = 'HER-004'), ''), true);

do $$
begin
  if current_setting('pruebas.dueno') = '' or current_setting('pruebas.cajero') = '' then
    raise exception '0. Faltan los usuarios demo. Corre 07.';
  end if;
  if current_setting('pruebas.producto') = '' then
    raise exception '0. No existe HER-004. Corre 07.';
  end if;
end $$;

-- 1. Catálogo: lo que queda expuesto a la API.
do $$
begin
  -- a) Ningún rol de la API puede leer las columnas de costo.
  assert not has_column_privilege('authenticated', 'public.productos', 'costo', 'select')
     and not has_column_privilege('anon', 'public.productos', 'costo', 'select')
     and not has_column_privilege('authenticated', 'public.venta_detalle', 'costo_unitario', 'select')
     and not has_column_privilege('anon', 'public.venta_detalle', 'costo_unitario', 'select'),
    '1. Un rol de la API puede leer una columna de costo';
  -- b) Las demás columnas sí (si no, la app se rompe).
  assert has_column_privilege('authenticated', 'public.productos', 'precio', 'select')
     and has_column_privilege('authenticated', 'public.productos', 'stock', 'select')
     and has_column_privilege('authenticated', 'public.venta_detalle', 'importe', 'select'),
    '1. Se quitaron columnas que la app necesita';
  -- c) La vista vieja ya no existe.
  assert to_regclass('public.v_ventas_por_dia') is null, '1. Todavía existe v_ventas_por_dia';
  -- d) Ninguna vista de public tiene columnas de costo o ganancia.
  assert not exists (
      select 1 from information_schema.columns c
      join information_schema.views w on w.table_schema = c.table_schema and w.table_name = c.table_name
      where c.table_schema = 'public'
        and (c.column_name ilike '%costo%' or c.column_name ilike '%ganancia%')),
    '1. Hay una vista en public con columnas de costo o ganancia';
  -- e) Solo estas funciones de public devuelven costos o ganancias (o filas
  --    con costo). Todas validan dueño, o regresan null al cajero. Si alguien
  --    agrega otra, esta prueba obliga a revisarla y sumarla aquí.
  assert not exists (
      select 1
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and (   pg_get_function_result(p.oid) ~* '(costo|ganancia|valor)'
             or pg_get_function_result(p.oid)
                ~ '^(SETOF )?(public\.)?(productos|movimientos_inventario|venta_detalle)$')
        and p.proname not in ('mas_vendidos', 'resumen_ventas', 'ventas_por_dia', 'valor_inventario',
                              'costos_productos', 'crear_producto', 'registrar_movimiento',
                              'registrar_ajuste',
                              -- Reportes (24): solo dueño.
                              'reporte_resumen', 'reporte_ventas_por_periodo',
                              'reporte_por_categoria', 'reporte_sin_movimiento')),
    '1. Hay una función nueva que devuelve costos: revísala y agrégala a esta lista';
  -- f) Esas funciones son SECURITY DEFINER (si fueran INVOKER, no podrían
  --    leer el costo ni para el dueño).
  assert not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and not p.prosecdef
        and p.proname in ('mas_vendidos', 'resumen_ventas', 'ventas_por_dia', 'valor_inventario',
                          'costos_productos', 'reporte_resumen', 'reporte_ventas_por_periodo',
                          'reporte_por_categoria', 'reporte_sin_movimiento')),
    '1. Una función de costos no es SECURITY DEFINER';
  -- g) Realtime: ninguna tabla con costos está publicada.
  assert not exists (
      select 1 from pg_publication_tables t
      where t.pubname = 'supabase_realtime' and t.schemaname = 'public'
        and t.tablename in ('productos', 'venta_detalle', 'movimientos_inventario')),
    '1. Una tabla con costos está en la publicación de Realtime';
  -- h) GraphQL desactivado (la app no lo usa).
  assert not exists (select 1 from pg_extension where extname = 'pg_graphql'),
    '1. pg_graphql sigue activo: desactívalo en Database > Extensions';
  raise notice '✔ 1. Catálogo: costos sin SELECT, sin vista vieja, funciones revisadas, sin Realtime ni GraphQL';
end $$;

-- =============================================================================
-- Como CAJERO
-- =============================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.cajero'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- 2. Una venta propia, para que tenga detalle que leer.
select set_config('pruebas.venta_cajero', (public.registrar_venta(
  jsonb_build_array(jsonb_build_object('producto_id', current_setting('pruebas.producto'), 'cantidad', 1)),
  'tarjeta', null, gen_random_uuid())).id::text, true);

-- 3. Cada camino directo a las tablas, uno por uno: 42501.
do $$
declare
  v_sql   text;
  v_casos text[] := array[
    'select costo from public.productos limit 1',
    'select * from public.productos limit 1',
    'select id from public.productos where costo > 0 limit 1',
    'select id from public.productos order by costo limit 1',
    'select sum(costo) from public.productos',
    'select count(*) from public.productos where costo is not null',
    'select p.id from public.productos p where p.precio - p.costo > 0 limit 1',
    'select costo_unitario from public.venta_detalle limit 1',
    'select * from public.venta_detalle limit 1',
    'select id from public.venta_detalle where costo_unitario > 0 limit 1',
    'select sum(cantidad * costo_unitario) from public.venta_detalle',
    'select d.id from public.ventas v join public.venta_detalle d on d.venta_id = v.id order by d.costo_unitario limit 1',
    'select to_jsonb(p) from public.productos p limit 1',
    'select row_to_json(d) from public.venta_detalle d limit 1'
  ];
begin
  foreach v_sql in array v_casos loop
    begin
      execute v_sql;
      raise exception '3. El cajero pudo ejecutar: %', v_sql;
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice '✔ 3. Tablas: % caminos a los costos rechazados para el cajero (42501)', cardinality(v_casos);
end $$;

-- 4. Lo que sí necesita el cajero sigue funcionando.
do $$
begin
  assert (select count(*) from public.productos where precio > 0 and stock >= 0) > 0,
    '4. El cajero no puede leer precio y stock';
  assert exists (select 1 from public.venta_detalle d
                 where d.venta_id = current_setting('pruebas.venta_cajero')::uuid
                   and d.importe > 0 and d.nombre_producto is not null),
    '4. El cajero no puede leer el detalle de su venta';
  assert (select count(*) from public.v_stock_bajo) > 0, '4. El cajero no ve el stock bajo';
  raise notice '✔ 4. El cajero sigue leyendo precio, stock, su detalle y el stock bajo';
end $$;

-- 5. Funciones: ninguna le da costos.
do $$
declare
  r   record;
  v_n int;
begin
  -- mas_vendidos: solo sus ventas, costo y ganancia en null.
  select count(*) as n, count(m.costo) as n_costo, count(m.ganancia) as n_ganancia,
         coalesce(sum(m.importe), 0) as importe
  into r
  from public.mas_vendidos(current_date - 40, current_date + 1, 100) m;
  assert r.n > 0, '5. mas_vendidos no le regresó su venta al cajero';
  assert r.n_costo = 0 and r.n_ganancia = 0, '5. mas_vendidos le dio costo o ganancia al cajero';
  assert r.importe = (select coalesce(sum(d.importe), 0) from public.venta_detalle d
                       join public.ventas v on v.id = d.venta_id where v.estado = 'completada'),
    '5. mas_vendidos le muestra ventas ajenas al cajero';

  -- resumen_ventas: ganancia null.
  assert (select ganancia from public.resumen_ventas(now() - interval '40 days', now() + interval '1 hour')) is null,
    '5. resumen_ventas le dio ganancia al cajero';

  -- Solo dueño: LT403.
  begin
    perform * from public.costos_productos(array[current_setting('pruebas.producto')::uuid]);
    raise exception '5. El cajero pudo usar costos_productos';
  exception when sqlstate 'LT403' then null;
  end;
  begin
    perform * from public.ventas_por_dia(current_date - 7, current_date);
    raise exception '5. El cajero pudo usar ventas_por_dia';
  exception when sqlstate 'LT403' then null;
  end;
  begin
    perform * from public.valor_inventario();
    raise exception '5. El cajero pudo usar valor_inventario';
  exception when sqlstate 'LT403' then null;
  end;
  begin
    perform public.registrar_movimiento(current_setting('pruebas.producto')::uuid, 'entrada', 1, 1);
    raise exception '5. El cajero pudo registrar una entrada (regresa el costo)';
  exception when sqlstate 'LT403' then null;
  end;

  -- Movimientos (traen costo_unitario): RLS no le deja ver ninguno.
  select count(*) into v_n from public.movimientos_inventario;
  assert v_n = 0, '5. El cajero ve movimientos de inventario';

  -- La venta que regresa registrar_venta no trae costos.
  assert not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'ventas'
                       and (column_name ilike '%costo%' or column_name ilike '%ganancia%')),
    '5. ventas tiene columnas de costo';
  raise notice '✔ 5. Funciones: mas_vendidos y resumen_ventas sin costos; las de dueño en LT403; sin movimientos';
end $$;

-- =============================================================================
-- Como DUEÑO
-- =============================================================================
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.dueno'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- 6. El dueño tampoco lee la columna directo; sí por las funciones, y sigue
--    pudiendo escribir el costo.
do $$
declare
  v_costo numeric;
  v_n     int;
begin
  begin
    perform costo from public.productos limit 1;
    raise exception '6. El dueño pudo leer productos.costo directo (se esperaba 42501)';
  exception when insufficient_privilege then null;
  end;

  select c.costo into v_costo
  from public.costos_productos(array[current_setting('pruebas.producto')::uuid]) c;
  assert v_costo = current_setting('pruebas.costo')::numeric,
    format('6. costos_productos dio %s, esperado %s', v_costo, current_setting('pruebas.costo'));

  assert (select count(m.costo) from public.mas_vendidos(current_date - 40, current_date + 1, 100) m) > 0,
    '6. mas_vendidos no le da costos al dueño';
  assert (select ganancia from public.resumen_ventas(now() - interval '40 days', now() + interval '1 hour')) is not null,
    '6. resumen_ventas no le da ganancia al dueño';

  -- Guardar un producto (como la app, que manda el valor nuevo):
  -- UPDATE … RETURNING id pasa; RETURNING costo no, y tampoco
  -- SET costo = costo + 1, porque lee el costo actual.
  update public.productos set costo = current_setting('pruebas.costo')::numeric + 1
  where id = current_setting('pruebas.producto')::uuid
  returning 1 into v_n;
  assert v_n = 1, '6. El dueño no pudo guardar el costo';
  begin
    execute 'update public.productos set costo = 1 where id = $1 returning costo'
      using current_setting('pruebas.producto')::uuid;
    raise exception '6. UPDATE … RETURNING costo no falló';
  exception when insufficient_privilege then null;
  end;
  begin
    execute 'update public.productos set costo = costo + 1 where id = $1'
      using current_setting('pruebas.producto')::uuid;
    raise exception '6. SET costo = costo + 1 no falló (lee el costo)';
  exception when insufficient_privilege then null;
  end;
  assert (select c.costo from public.costos_productos(array[current_setting('pruebas.producto')::uuid]) c)
       = current_setting('pruebas.costo')::numeric + 1,
    '6. El costo guardado no se ve en costos_productos';

  -- Más de 500 ids: LT422.
  begin
    perform * from public.costos_productos(array_fill(gen_random_uuid(), array[501]));
    raise exception '6. costos_productos aceptó 501 ids';
  exception when sqlstate 'LT422' then null;
  end;
  raise notice '✔ 6. Dueño: costos por funciones, guarda el costo; la columna directa también le da 42501';
end $$;

-- =============================================================================
-- Como ANON
-- =============================================================================
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

-- 7. anon: ni tablas ni funciones de costos.
do $$
declare
  v_sql text;
begin
  foreach v_sql in array array[
    'select costo from public.productos limit 1',
    'select costo_unitario from public.venta_detalle limit 1',
    'select * from public.costos_productos(array[gen_random_uuid()])',
    'select * from public.mas_vendidos(current_date, current_date)'
  ] loop
    begin
      execute v_sql;
      raise exception '7. anon pudo ejecutar: %', v_sql;
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice '✔ 7. anon sin acceso (42501)';
end $$;

reset role;
rollback;
