-- =============================================================================
-- 31-pruebas-pulido.sql — Pruebas de 30 (stock bajo por urgencia y "Sin
-- movimiento" sin productos nuevos) y de la fecha de alta de la semilla (07)
-- Requiere: 01 a 30, con la semilla cargada (07 nuevo).
--
-- Todo dentro de BEGIN … ROLLBACK: no deja cambios.
-- "Success" en el SQL Editor = pasaron todas. Si una falla, el error dice cuál.
--
-- Productos de prueba (código P31-…), creados como postgres:
--   - 60 en stock bajo, para pasar del límite de 50 que pide Inicio. Los
--     agotados se llaman "ZZ…" a propósito: por nombre quedarían fuera.
--   - 5 para "Sin movimiento" en el rango 2001-03-10 a 2001-03-20 (Monterrey),
--     lejos de la semilla: dados de alta antes, justo en el borde y dentro.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Contexto
-- -----------------------------------------------------------------------------
select
  set_config('pruebas.dueno',
    coalesce((select id::text from auth.users where lower(email) = 'demo@latuerca.test'), ''), true),
  set_config('pruebas.cajero',
    coalesce((select id::text from auth.users where lower(email) = 'cajero@latuerca.test'), ''), true);

do $$
begin
  if current_setting('pruebas.dueno') = '' or current_setting('pruebas.cajero') = '' then
    raise exception '0. Faltan los usuarios demo. Corre 07.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'v_stock_bajo' and column_name = 'proporcion') then
    raise exception '0. v_stock_bajo no tiene proporcion: corre 30-pulido.sql.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. Catálogo: la vista sigue con security_invoker y sin anon; la función
--    sigue SECURITY DEFINER, con search_path vacío, sin anon y con la regla.
-- -----------------------------------------------------------------------------
do $$
declare
  v_def text;
begin
  assert (select 'security_invoker=true' = any (coalesce(c.reloptions, '{}'))
          from pg_class c where c.oid = 'public.v_stock_bajo'::regclass),
    '1. v_stock_bajo perdió security_invoker';
  assert not has_table_privilege('anon', 'public.v_stock_bajo', 'select'),
    '1. anon puede leer v_stock_bajo';
  assert (select data_type from information_schema.columns
          where table_schema = 'public' and table_name = 'v_stock_bajo' and column_name = 'proporcion') = 'numeric',
    '1. proporcion debe ser numeric';
  assert (select array_agg(column_name::text order by ordinal_position) from information_schema.columns
          where table_schema = 'public' and table_name = 'v_stock_bajo')
         = array['id','codigo','nombre','unidad','stock','stock_minimo','faltante','categoria_id','categoria',
                 'proveedor_id','proveedor','proporcion'],
    '1. Columnas de v_stock_bajo distintas: proporcion debe ir al final y no faltar ninguna';
  assert not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'v_stock_bajo' and column_name ilike '%costo%'),
    '1. v_stock_bajo no debe tener costos';

  assert (select p.prosecdef and p.proconfig @> array['search_path=""']
          from pg_proc p where p.oid = 'public.reporte_sin_movimiento(date, date, int)'::regprocedure),
    '1. reporte_sin_movimiento debe ser SECURITY DEFINER con search_path vacío';
  assert not has_function_privilege('anon', 'public.reporte_sin_movimiento(date, date, int)', 'execute'),
    '1. anon puede ejecutar reporte_sin_movimiento';
  v_def := pg_get_functiondef('public.reporte_sin_movimiento(date, date, int)'::regprocedure);
  assert position('privado.rango_reporte' in v_def) > 0,
    '1. reporte_sin_movimiento debe usar privado.rango_reporte (día de Monterrey)';
  raise notice '✔ 1. Vista y función: permisos, columnas y regla';
end $$;

-- -----------------------------------------------------------------------------
-- 2. Semilla (07): los productos se dieron de alta antes del mes pasado, así
--    que "Este mes" y "Mes pasado" tienen datos en "Sin movimiento".
-- -----------------------------------------------------------------------------
do $$
declare
  v_hoy        date := (now() at time zone 'America/Monterrey')::date;
  v_mes_pasado date;
  v_n          int;
begin
  v_mes_pasado := (v_hoy - extract(day from v_hoy)::int) - extract(day from (v_hoy - extract(day from v_hoy)::int))::int + 1;
  select count(*) into v_n from public.productos where codigo ~ '^[A-Z]{3}-\d{3}$';
  assert v_n >= 30, format('2. Esperaba la semilla (30+ productos), hay %s', v_n);
  assert not exists (select 1 from public.productos
                     where codigo ~ '^[A-Z]{3}-\d{3}$'
                       and (creado_en at time zone 'America/Monterrey')::date >= v_mes_pasado),
    format('2. Hay productos de la semilla dados de alta desde el %s: vuelve a correr 07', v_mes_pasado);
  raise notice '✔ 2. Semilla: % productos dados de alta antes del %', v_n, v_mes_pasado;
end $$;

-- -----------------------------------------------------------------------------
-- Productos de prueba (como postgres)
-- -----------------------------------------------------------------------------
-- 60 en stock bajo. i = 1..10: agotados, "ZZ Agotado 01…10" (mínimo 5; los
-- 3 primeros sin mínimo, también agotados). i = 11..60: "AA Bajo 11…60",
-- stock entre 1 y 4 con mínimo 5 (proporciones 0.2 a 0.8).
insert into public.productos (codigo, nombre, unidad, costo, precio, stock, stock_minimo, creado_en)
select format('P31-SB-%s', lpad(i::text, 2, '0')),
       case when i <= 10 then format('ZZ Agotado %s', lpad(i::text, 2, '0'))
            else format('AA Bajo %s', lpad(i::text, 2, '0')) end,
       'pieza', 1, 2,
       case when i <= 10 then 0 else 1 + (i % 4) end,
       case when i <= 3 then 0 else 5 end,
       now() - interval '400 days'
from generate_series(1, 60) as i;

-- Sin movimiento, rango 2001-03-10 … 2001-03-20 (Monterrey).
insert into public.productos (codigo, nombre, unidad, costo, precio, stock, stock_minimo, creado_en)
values
  ('P31-SM-ANTES',    'Dado de alta antes del rango',      'pieza', 10, 20, 5, 0, timestamp '2001-02-01 08:00' at time zone 'America/Monterrey'),
  ('P31-SM-BORDE-1S', 'Un segundo antes del rango',        'pieza', 10, 20, 5, 0, (timestamp '2001-03-10 00:00' at time zone 'America/Monterrey') - interval '1 second'),
  ('P31-SM-BORDE',    'Justo al empezar el rango',         'pieza', 10, 20, 5, 0, timestamp '2001-03-10 00:00' at time zone 'America/Monterrey'),
  ('P31-SM-DENTRO',   'Dado de alta dentro del rango',     'pieza', 10, 20, 5, 0, timestamp '2001-03-15 12:00' at time zone 'America/Monterrey'),
  ('P31-SM-DESPUES',  'Dado de alta después del rango',    'pieza', 10, 20, 5, 0, timestamp '2001-04-01 12:00' at time zone 'America/Monterrey'),
  -- Un día antes del rango a las 23:30 en Monterrey: en UTC ya es el día 10.
  -- Si se comparara la fecha UTC en lugar del día de Monterrey, saldría mal.
  ('P31-SM-UTC',      'Antes del rango en Monterrey',      'pieza', 10, 20, 5, 0, timestamp '2001-03-09 23:30' at time zone 'America/Monterrey');

-- =============================================================================
-- Como DUEÑO
-- =============================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.dueno'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- 3. Stock bajo por urgencia
do $$
declare
  v_top   uuid[];
  v_prev  numeric := -1;
  r       record;
  v_total int;
begin
  select count(*) into v_total from public.v_stock_bajo;
  assert v_total > 50, format('3. Esperaba más de 50 en stock bajo, hay %s', v_total);

  -- Lo que pide Inicio: los 50 más urgentes.
  select array_agg(id) into v_top
  from (select id from public.v_stock_bajo order by proporcion, nombre limit 50) t;
  assert (select count(*) from public.productos
          where codigo like 'P31-SB-%' and stock = 0 and id = any (v_top)) = 10,
    '3. Algún agotado de prueba ("ZZ…") quedó fuera de los 50 más urgentes';
  assert not exists (select 1 from public.v_stock_bajo v
                     where v.stock = 0 and not (v.id = any (v_top))),
    '3. Hay agotados fuera de los 50 más urgentes';

  for r in select stock, stock_minimo, proporcion from public.v_stock_bajo order by proporcion, nombre loop
    assert r.proporcion >= v_prev, '3. proporcion no queda en orden';
    v_prev := r.proporcion;
    if r.stock = 0 then
      assert r.proporcion = 0, '3. Un agotado debe tener proporcion 0';
    else
      assert r.proporcion = round(r.stock / r.stock_minimo, 4),
        format('3. proporcion %s no es %s / %s', r.proporcion, r.stock, r.stock_minimo);
      assert r.proporcion > 0 and r.proporcion <= 1, '3. proporcion fuera de 0–1 en stock bajo';
    end if;
  end loop;

  assert (select proporcion from public.v_stock_bajo v join public.productos p using (id)
          where p.codigo = 'P31-SB-01') = 0,
    '3. Agotado sin mínimo: proporcion debe ser 0';
  assert (select proporcion from public.v_stock_bajo v join public.productos p using (id)
          where p.codigo = 'P31-SB-14') = 0.6,
    '3. Stock 3 con mínimo 5: proporcion debe ser 0.6';
  raise notice '✔ 3. Stock bajo: % productos; los 10 agotados de prueba dentro de los 50 más urgentes', v_total;
end $$;

-- 4. Sin movimiento: solo lo que ya existía al empezar el rango (Monterrey)
do $$
declare
  v_codigos text[];
begin
  select array_agg(codigo order by codigo) into v_codigos
  from public.reporte_sin_movimiento('2001-03-10', '2001-03-20', 200)
  where codigo like 'P31-SM-%';

  assert v_codigos = array['P31-SM-ANTES', 'P31-SM-BORDE-1S', 'P31-SM-UTC'],
    format('4. Esperaba ANTES, BORDE-1S y UTC; salieron %s', v_codigos);

  -- Un rango que empieza después del alta sí los incluye (no es "nunca").
  assert exists (select 1 from public.reporte_sin_movimiento('2001-05-01', '2001-05-31', 200)
                 where codigo = 'P31-SM-DENTRO'),
    '4. DENTRO debe salir en un rango que empieza después de su alta';
  -- Ninguno de la semilla sale en 2001: todavía no existían.
  assert not exists (select 1 from public.reporte_sin_movimiento('2001-03-10', '2001-03-20', 200)
                     where codigo !~ '^P31-'),
    '4. Salieron productos dados de alta después del rango';
  raise notice '✔ 4. Sin movimiento: antes del rango sí; en el borde, dentro y después, no; día de Monterrey';
end $$;

-- =============================================================================
-- Como CAJERO
-- =============================================================================
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.cajero'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- 5. El cajero ve el stock bajo con su orden (sin proveedor) y no los reportes
do $$
begin
  assert (select count(*) from public.v_stock_bajo) > 50, '5. El cajero no ve el stock bajo';
  assert (select proporcion from public.v_stock_bajo order by proporcion, nombre limit 1) = 0,
    '5. El primero del cajero debe ser un agotado';
  assert not exists (select 1 from public.v_stock_bajo where proveedor is not null),
    '5. El cajero ve el nombre del proveedor (desde 28 son solo del dueño)';
  begin
    perform * from public.reporte_sin_movimiento('2001-03-10', '2001-03-20');
    raise exception '5. El cajero pudo ver Sin movimiento';
  exception when sqlstate 'LT403' then null;
  end;
  raise notice '✔ 5. Cajero: stock bajo en orden y sin proveedor; LT403 en Sin movimiento';
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
    'select count(*) from public.v_stock_bajo',
    'select * from public.reporte_sin_movimiento(''2001-03-10'', ''2001-03-20'')'
  ] loop
    begin
      execute v_sql;
      raise exception '6. anon pudo: %', v_sql;
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice '✔ 6. anon: 42501 en la vista y en la función';
end $$;

reset role;
rollback;
