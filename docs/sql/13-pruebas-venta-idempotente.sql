-- =============================================================================
-- 13-pruebas-venta-idempotente.sql — Pruebas de cobro sin duplicados
-- Requiere: 01 a 12 (con la semilla cargada).
--
-- Todo dentro de BEGIN … ROLLBACK: no deja cambios.
-- "Success" en el SQL Editor = pasaron todas. Si una falla, el error dice cuál.
--
-- Limitación: el SQL Editor usa una sola sesión, así que no se pueden lanzar
-- dos cobros realmente simultáneos. Se prueba:
--   - el reintento (misma clave → misma venta, stock una sola vez),
--   - que el candado consultivo se toma,
--   - el respaldo del índice único (prueba 7), con una copia temporal de la
--     función a la que se le quita la búsqueda de la clave, para forzar el
--     choque con el índice en la misma sesión.
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
  set_config('pruebas.p1',
    coalesce((select id::text from public.productos where codigo = 'HER-004'), ''), true),
  set_config('pruebas.p2',
    coalesce((select id::text from public.productos where codigo = 'ELE-003'), ''), true),
  set_config('pruebas.k1', gen_random_uuid()::text, true);

do $$
begin
  if current_setting('pruebas.dueno') = '' or current_setting('pruebas.cajero') = '' then
    raise exception '0. Faltan los usuarios demo. Revisa los correos o corre 07.';
  end if;
  if current_setting('pruebas.p1') = '' or current_setting('pruebas.p2') = '' then
    raise exception '0. Faltan HER-004 o ELE-003. Corre 07 primero.';
  end if;
  if (select min(stock) from public.productos where codigo in ('HER-004', 'ELE-003')) < 10 then
    raise exception '0. HER-004 y ELE-003 necesitan al menos 10 de stock.';
  end if;
  raise notice '✔ 0. Contexto listo';
end $$;

-- =============================================================================
-- Como DUEÑO
-- =============================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.dueno'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- 1. Reintento con la misma clave: misma venta, el stock baja una sola vez.
do $$
declare
  v_p1    uuid := current_setting('pruebas.p1')::uuid;
  v_k     uuid := current_setting('pruebas.k1')::uuid;
  v_items jsonb;
  v_antes numeric;
  v1      public.ventas;
  v2      public.ventas;
begin
  select stock into v_antes from public.productos where id = v_p1;
  v_items := jsonb_build_array(jsonb_build_object('producto_id', v_p1, 'cantidad', 2));

  v1 := public.registrar_venta(v_items, 'efectivo', 500, v_k);
  v2 := public.registrar_venta(v_items, 'efectivo', 500, v_k);

  assert v2.id = v1.id and v2.folio = v1.folio, '1. El reintento creó otra venta';
  assert v1.clave_cliente = v_k, '1. La venta no guardó la clave';
  assert (select stock from public.productos where id = v_p1) = v_antes - 2,
    '1. El stock no bajó exactamente una vez';
  assert (select count(*) from public.ventas where clave_cliente = v_k) = 1,
    '1. Hay más de una venta con la misma clave';
  assert (select count(*) from public.movimientos_inventario where venta_id = v1.id) = 1,
    '1. El reintento dejó movimientos de más';

  perform set_config('pruebas.venta1', v1.id::text, true);
  raise notice '✔ 1. Reintento con la misma clave: folio %, stock % → %', v1.folio, v_antes, v_antes - 2;
end $$;

-- 2. Misma clave con OTRO carrito: devuelve la venta original y no toca nada.
do $$
declare
  v_p1  uuid := current_setting('pruebas.p1')::uuid;
  v_p2  uuid := current_setting('pruebas.p2')::uuid;
  v_s1  numeric := (select stock from public.productos where id = current_setting('pruebas.p1')::uuid);
  v_s2  numeric := (select stock from public.productos where id = current_setting('pruebas.p2')::uuid);
  v     public.ventas;
begin
  v := public.registrar_venta(
    jsonb_build_array(jsonb_build_object('producto_id', v_p2, 'cantidad', 5)),
    'tarjeta', null, current_setting('pruebas.k1')::uuid);

  assert v.id = current_setting('pruebas.venta1')::uuid, '2. No devolvió la venta original';
  assert (select stock from public.productos where id = v_p1) = v_s1, '2. Cambió el stock de HER-004';
  assert (select stock from public.productos where id = v_p2) = v_s2, '2. Cambió el stock de ELE-003';
  raise notice '✔ 2. Misma clave con otro carrito: regresa la venta original sin tocar stock';
end $$;

-- 3. El candado consultivo se toma (queda hasta el fin de la transacción).
do $$
begin
  assert exists (
    select 1 from pg_locks
    where locktype = 'advisory' and pid = pg_backend_pid() and granted
  ), '3. registrar_venta no tomó el candado consultivo';
  raise notice '✔ 3. Candado consultivo tomado';
end $$;

-- 4. Sin clave: cada llamada es una venta distinta.
do $$
declare
  v_items jsonb := jsonb_build_array(jsonb_build_object(
    'producto_id', current_setting('pruebas.p1')::uuid, 'cantidad', 1));
  v1 public.ventas;
  v2 public.ventas;
begin
  v1 := public.registrar_venta(v_items, 'tarjeta');
  v2 := public.registrar_venta(v_items, 'tarjeta');
  assert v1.id <> v2.id and v1.clave_cliente <> v2.clave_cliente,
    '4. Sin clave, dos cobros deberían ser dos ventas';
  raise notice '✔ 4. Sin clave: dos ventas distintas (folios % y %)', v1.folio, v2.folio;
end $$;

reset role;

-- Ranking esperado de productos_frecuentes, calculado sin RLS (como postgres)
-- DESPUÉS de las ventas de arriba, para compararlo con lo que ve el cajero.
select set_config('pruebas.frecuentes', coalesce((
  select string_agg(t.id::text, ',' order by t.veces desc, t.nombre, t.id)
  from (
    select p.id, p.nombre, f.veces
    from public.productos p
    join (
      select d.producto_id, count(distinct d.venta_id) as veces
      from public.venta_detalle d
      join public.ventas v on v.id = d.venta_id
      where v.estado = 'completada' and v.creado_en >= now() - interval '30 days'
      group by d.producto_id
    ) f on f.producto_id = p.id
    where p.activo
    order by f.veces desc, p.nombre, p.id
    limit 8
  ) t), ''), true);

do $$
begin
  if current_setting('pruebas.frecuentes') = '' then
    raise exception '0. No hay ventas en los últimos 30 días. Corre 07 primero.';
  end if;
end $$;

-- =============================================================================
-- Como CAJERO
-- =============================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.cajero'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- 5. La clave de otro usuario se rechaza y no deja nada.
do $$
declare
  v_s1 numeric := (select stock from public.productos where id = current_setting('pruebas.p1')::uuid);
begin
  begin
    perform public.registrar_venta(
      jsonb_build_array(jsonb_build_object(
        'producto_id', current_setting('pruebas.p1')::uuid, 'cantidad', 1)),
      'tarjeta', null, current_setting('pruebas.k1')::uuid);
    raise exception '5. FALLÓ: aceptó la clave de otro usuario';
  exception when sqlstate 'LT409' then null;
  end;
  assert (select stock from public.productos where id = current_setting('pruebas.p1')::uuid) = v_s1,
    '5. Cambió el stock';
  raise notice '✔ 5. Clave de otro usuario rechazada (LT409)';
end $$;

-- 6. productos_frecuentes: el cajero ve el ranking de TODA la tienda, sin costos.
do $$
declare
  v_ids text;
begin
  select string_agg(f.id::text, ',' order by f.ord)
  into v_ids
  from public.productos_frecuentes(8) with ordinality f(id, codigo, nombre, precio, stock, unidad, ord);

  assert v_ids = current_setting('pruebas.frecuentes'),
    '6. productos_frecuentes del cajero no coincide con el ranking de toda la tienda';
  assert (select proargnames from pg_proc where proname = 'productos_frecuentes')
       = array['p_limite', 'id', 'codigo', 'nombre', 'precio', 'stock', 'unidad'],
    '6. productos_frecuentes regresa columnas de más (¿costos o montos?)';
  raise notice '✔ 6. productos_frecuentes: ranking de toda la tienda, solo datos de catálogo';
end $$;

reset role;

-- =============================================================================
-- 7. Respaldo del índice único (como postgres, con la sesión del dueño)
-- Copia temporal de registrar_venta SIN la búsqueda de la clave: el segundo
-- intento llega hasta el insert y choca con el índice único.
-- =============================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.dueno'), 'role', 'authenticated')::text, true);

do $$
declare
  v_def   text := pg_get_functiondef('public.registrar_venta(jsonb, text, numeric, uuid)'::regprocedure);
  v_p1    uuid := current_setting('pruebas.p1')::uuid;
  v_k     uuid := gen_random_uuid();
  v_antes numeric;
  v1      public.ventas;
  v2      public.ventas;
begin
  assert position('[chequeo-clave:inicio]' in v_def) > 0,
    '7. No se encontró el marcador [chequeo-clave:inicio] en registrar_venta';

  v_def := regexp_replace(v_def,
    '-- \[chequeo-clave:inicio\].*-- \[chequeo-clave:fin\]', '-- (quitado para la prueba)');
  v_def := replace(v_def, 'public.registrar_venta(', 'pg_temp.registrar_venta_sin_chequeo(');
  assert position('[chequeo-clave:inicio]' in v_def) = 0, '7. No se pudo quitar el chequeo';
  execute v_def;

  select stock into v_antes from public.productos where id = v_p1;

  v1 := pg_temp.registrar_venta_sin_chequeo(
    jsonb_build_array(jsonb_build_object('producto_id', v_p1, 'cantidad', 1)), 'tarjeta', null, v_k);
  -- Segundo intento, con otro carrito: llega al insert y choca con el índice.
  begin
    v2 := pg_temp.registrar_venta_sin_chequeo(
      jsonb_build_array(jsonb_build_object('producto_id', v_p1, 'cantidad', 3)), 'tarjeta', null, v_k);
  exception when unique_violation then
    raise exception '7. FALLÓ: el choque con el índice único no tiene respaldo (error de clave duplicada)';
  end;

  assert v2.id = v1.id, '7. El respaldo no devolvió la venta existente';
  assert (select count(*) from public.ventas where clave_cliente = v_k) = 1,
    '7. Quedaron dos ventas con la misma clave';
  assert (select count(*) from public.movimientos_inventario where venta_id = v1.id) = 1,
    '7. El segundo intento dejó movimientos';
  assert (select sum(cantidad) from public.venta_detalle where venta_id = v1.id) = 1,
    '7. El segundo intento dejó renglones de detalle';
  assert (select stock from public.productos where id = v_p1) = v_antes - 1,
    '7. El segundo intento movió el stock';
  raise notice '✔ 7. Respaldo del índice único: misma venta, sin movimientos del segundo intento';
end $$;

-- =============================================================================
-- Como ANON
-- =============================================================================
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
set local role anon;

-- 8. anon no ejecuta registrar_venta ni productos_frecuentes.
do $$
declare
  s       text;
  v_entro boolean;
begin
  foreach s in array array[
    $q$select public.registrar_venta('[]'::jsonb, 'efectivo', 0, gen_random_uuid())$q$,
    $q$select * from public.productos_frecuentes(8)$q$
  ] loop
    begin
      execute s;
      v_entro := true;
    exception
      when insufficient_privilege then v_entro := false;
      when others then
        raise exception '8. FALLÓ: anon entró a % (respondió: %)', s, sqlerrm;
    end;
    if v_entro then
      raise exception '8. FALLÓ: anon pudo ejecutar: %', s;
    end if;
  end loop;
  raise notice '✔ 8. anon no ejecuta las funciones (42501)';
end $$;

reset role;

-- =============================================================================
-- Usuario INACTIVO
-- =============================================================================
update public.perfiles set activo = false where id = current_setting('pruebas.cajero')::uuid;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.cajero'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- 9. Un usuario inactivo no ve los frecuentes.
do $$
begin
  begin
    perform * from public.productos_frecuentes(8);
    raise exception '9. FALLÓ: un usuario inactivo vio productos_frecuentes';
  exception when sqlstate 'LT401' then null;
  end;
  raise notice '✔ 9. Usuario inactivo bloqueado en productos_frecuentes (LT401)';
end $$;

reset role;

-- =============================================================================
-- Fin: se revierte todo.
-- =============================================================================
rollback;
