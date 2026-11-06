-- =============================================================================
-- 15-pruebas-movimiento-idempotente.sql — Entradas, mermas y conteos sin duplicados
-- Requiere: 01 a 14 (con la semilla cargada).
--
-- Todo dentro de BEGIN … ROLLBACK: no deja cambios.
-- "Success" en el SQL Editor = pasaron todas. Si una falla, el error dice cuál.
--
-- Como en 13: una sola sesión no puede lanzar dos operaciones simultáneas.
-- El respaldo del índice único se prueba (9) con una copia temporal de
-- registrar_movimiento sin la búsqueda de la clave.
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
  set_config('pruebas.k_entrada', gen_random_uuid()::text, true),
  set_config('pruebas.k_merma', gen_random_uuid()::text, true),
  set_config('pruebas.k_ajuste', gen_random_uuid()::text, true);

do $$
begin
  if current_setting('pruebas.dueno') = '' or current_setting('pruebas.cajero') = '' then
    raise exception '0. Faltan los usuarios demo. Revisa los correos o corre 07.';
  end if;
  if current_setting('pruebas.p1') = '' then
    raise exception '0. Falta HER-004. Corre 07 primero.';
  end if;
  if (select stock from public.productos where codigo = 'HER-004') < 5 then
    raise exception '0. HER-004 necesita al menos 5 de stock.';
  end if;
  if (select count(*) from pg_proc where proname in ('registrar_movimiento', 'registrar_ajuste')) <> 2 then
    raise exception '0. Debe existir una sola versión de registrar_movimiento y de registrar_ajuste. Corre 14.';
  end if;
  raise notice '✔ 0. Contexto listo';
end $$;

-- =============================================================================
-- Como DUEÑO
-- =============================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.dueno'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- 1. Entrada con la misma clave dos veces: un movimiento, el stock sube una vez.
do $$
declare
  v_p     uuid := current_setting('pruebas.p1')::uuid;
  v_k     uuid := current_setting('pruebas.k_entrada')::uuid;
  v_antes numeric := (select stock from public.productos where id = current_setting('pruebas.p1')::uuid);
  m1      public.movimientos_inventario;
  m2      public.movimientos_inventario;
begin
  m1 := public.registrar_movimiento(v_p, 'entrada', 5, 70, 'Compra de prueba', v_k);
  m2 := public.registrar_movimiento(v_p, 'entrada', 5, 70, 'Compra de prueba', v_k);

  assert m2.id = m1.id, '1. El reintento de la entrada creó otro movimiento';
  assert m1.clave_cliente = v_k, '1. El movimiento no guardó la clave';
  assert (select stock from public.productos where id = v_p) = v_antes + 5,
    '1. El stock no subió exactamente una vez';
  assert (select count(*) from public.movimientos_inventario where clave_cliente = v_k) = 1,
    '1. Hay más de un movimiento con la misma clave';
  perform set_config('pruebas.mov_entrada', m1.id::text, true);
  raise notice '✔ 1. Entrada repetida: un movimiento, stock % → %', v_antes, v_antes + 5;
end $$;

-- 2. Merma con la misma clave dos veces: un movimiento, el stock baja una vez.
do $$
declare
  v_p     uuid := current_setting('pruebas.p1')::uuid;
  v_k     uuid := current_setting('pruebas.k_merma')::uuid;
  v_antes numeric := (select stock from public.productos where id = current_setting('pruebas.p1')::uuid);
  m1      public.movimientos_inventario;
  m2      public.movimientos_inventario;
begin
  m1 := public.registrar_movimiento(v_p, 'merma', 1, null, 'Se rompió (prueba)', v_k);
  m2 := public.registrar_movimiento(v_p, 'merma', 1, null, 'Se rompió (prueba)', v_k);

  assert m2.id = m1.id and m1.cantidad = -1, '2. El reintento de la merma creó otro movimiento';
  assert (select stock from public.productos where id = v_p) = v_antes - 1,
    '2. El stock no bajó exactamente una vez';
  raise notice '✔ 2. Merma repetida: un movimiento, stock % → %', v_antes, v_antes - 1;
end $$;

-- 3. Una clave ya usada devuelve la operación original aunque cambien los datos.
do $$
declare
  v_p     uuid := current_setting('pruebas.p1')::uuid;
  v_antes numeric := (select stock from public.productos where id = current_setting('pruebas.p1')::uuid);
  m       public.movimientos_inventario;
begin
  m := public.registrar_movimiento(v_p, 'merma', 3, null, 'Otra cosa',
         current_setting('pruebas.k_entrada')::uuid);
  assert m.id = current_setting('pruebas.mov_entrada')::bigint and m.tipo = 'entrada',
    '3. No devolvió la operación original';
  assert (select stock from public.productos where id = v_p) = v_antes, '3. Cambió el stock';
  raise notice '✔ 3. Clave ya usada con otros datos: regresa la original sin tocar stock';
end $$;

-- 4. El candado consultivo se toma.
do $$
begin
  assert exists (
    select 1 from pg_locks where locktype = 'advisory' and pid = pg_backend_pid() and granted
  ), '4. No se tomó el candado consultivo';
  raise notice '✔ 4. Candado consultivo tomado';
end $$;

-- 5. Sin clave: cada entrada es un movimiento distinto.
do $$
declare
  v_p     uuid := current_setting('pruebas.p1')::uuid;
  v_antes numeric := (select stock from public.productos where id = current_setting('pruebas.p1')::uuid);
  m1      public.movimientos_inventario;
  m2      public.movimientos_inventario;
begin
  m1 := public.registrar_movimiento(v_p, 'entrada', 1);
  m2 := public.registrar_movimiento(v_p, 'entrada', 1);
  assert m1.id <> m2.id and m1.clave_cliente is null, '5. Sin clave deberían ser dos movimientos';
  assert (select stock from public.productos where id = v_p) = v_antes + 2, '5. El stock no subió dos veces';
  raise notice '✔ 5. Sin clave: dos movimientos distintos';
end $$;

-- 6. Ajuste repetido después de una venta: no "regresa" lo vendido.
do $$
declare
  v_p     uuid := current_setting('pruebas.p1')::uuid;
  v_k     uuid := current_setting('pruebas.k_ajuste')::uuid;
  v_s     numeric := (select stock from public.productos where id = current_setting('pruebas.p1')::uuid);
  a1      public.movimientos_inventario;
  a2      public.movimientos_inventario;
begin
  -- Conteo: hay 4 más de lo que dice el sistema.
  a1 := public.registrar_ajuste(v_p, v_s + 4, 'Conteo de prueba', v_k, v_s);
  assert a1.tipo = 'ajuste' and a1.cantidad = 4 and a1.stock_nuevo = v_s + 4, '6. Ajuste incorrecto';

  -- Mientras tanto se venden 2.
  perform public.registrar_venta(
    jsonb_build_array(jsonb_build_object('producto_id', v_p, 'cantidad', 2)), 'tarjeta');
  assert (select stock from public.productos where id = v_p) = v_s + 2, '6. La venta no bajó el stock';

  -- Reintento del mismo conteo (misma clave): regresa el ajuste original.
  a2 := public.registrar_ajuste(v_p, v_s + 4, 'Conteo de prueba', v_k, v_s);
  assert a2.id = a1.id, '6. El reintento creó otro ajuste';
  assert (select stock from public.productos where id = v_p) = v_s + 2,
    '6. El reintento regresó las piezas vendidas';
  raise notice '✔ 6. Ajuste repetido tras una venta: no se pierden las piezas vendidas';
end $$;

-- 7. Stock esperado distinto al actual: LT409 con hint 'stock_cambio' y sin movimiento.
do $$
declare
  v_p     uuid := current_setting('pruebas.p1')::uuid;
  v_s     numeric := (select stock from public.productos where id = current_setting('pruebas.p1')::uuid);
  v_movs  int := (select count(*) from public.movimientos_inventario
                  where producto_id = current_setting('pruebas.p1')::uuid);
  v_hint  text;
  a       public.movimientos_inventario;
begin
  begin
    perform public.registrar_ajuste(v_p, 100, null, gen_random_uuid(), v_s - 1);
    raise exception '7. FALLÓ: aceptó un ajuste con el stock esperado viejo';
  exception when sqlstate 'LT409' then
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  assert v_hint = 'stock_cambio', format('7. El hint debía ser stock_cambio, fue %s', v_hint);
  assert (select count(*) from public.movimientos_inventario where producto_id = v_p) = v_movs,
    '7. Quedó un movimiento del ajuste rechazado';
  assert (select stock from public.productos where id = v_p) = v_s, '7. Cambió el stock';

  -- Confirmar con el stock actual sí funciona.
  a := public.registrar_ajuste(v_p, 100, null, gen_random_uuid(), v_s);
  assert a.stock_nuevo = 100, '7. El ajuste con el stock actual no se aplicó';
  raise notice '✔ 7. Stock esperado viejo: LT409 (stock_cambio); con el actual, se aplica';
end $$;

reset role;

-- 8. Clave de otro usuario: LT409. (Solo hay un dueño: se reasigna el
--    movimiento al cajero, como postgres, y se revierte al final.)
update public.movimientos_inventario
set usuario_id = current_setting('pruebas.cajero')::uuid
where clave_cliente = current_setting('pruebas.k_merma')::uuid;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.dueno'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_antes numeric := (select stock from public.productos where id = current_setting('pruebas.p1')::uuid);
begin
  begin
    perform public.registrar_movimiento(current_setting('pruebas.p1')::uuid, 'merma', 1, null,
      'x', current_setting('pruebas.k_merma')::uuid);
    raise exception '8. FALLÓ: aceptó la clave de otro usuario';
  exception when sqlstate 'LT409' then null;
  end;
  begin
    perform public.registrar_ajuste(current_setting('pruebas.p1')::uuid, 1, null,
      current_setting('pruebas.k_merma')::uuid);
    raise exception '8. FALLÓ: el ajuste aceptó la clave de otro usuario';
  exception when sqlstate 'LT409' then null;
  end;
  assert (select stock from public.productos where id = current_setting('pruebas.p1')::uuid) = v_antes,
    '8. Cambió el stock';
  raise notice '✔ 8. Clave de otro usuario rechazada (LT409)';
end $$;

reset role;

-- =============================================================================
-- 9. Respaldo del índice único (como postgres, con la sesión del dueño)
-- =============================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.dueno'), 'role', 'authenticated')::text, true);

do $$
declare
  v_def   text := pg_get_functiondef(
    'public.registrar_movimiento(uuid, text, numeric, numeric, text, uuid)'::regprocedure);
  v_p     uuid := current_setting('pruebas.p1')::uuid;
  v_k     uuid := gen_random_uuid();
  v_antes numeric;
  m1      public.movimientos_inventario;
  m2      public.movimientos_inventario;
begin
  assert position('[chequeo-clave:inicio]' in v_def) > 0,
    '9. No se encontró el marcador [chequeo-clave:inicio] en registrar_movimiento';
  v_def := regexp_replace(v_def,
    '-- \[chequeo-clave:inicio\].*-- \[chequeo-clave:fin\]', '-- (quitado para la prueba)');
  v_def := replace(v_def, 'public.registrar_movimiento(', 'pg_temp.registrar_movimiento_sin_chequeo(');
  assert position('[chequeo-clave:inicio]' in v_def) = 0, '9. No se pudo quitar el chequeo';
  execute v_def;

  select stock into v_antes from public.productos where id = v_p;

  m1 := pg_temp.registrar_movimiento_sin_chequeo(v_p, 'entrada', 1, null, 'Respaldo 1', v_k);
  begin
    m2 := pg_temp.registrar_movimiento_sin_chequeo(v_p, 'entrada', 3, null, 'Respaldo 2', v_k);
  exception when unique_violation then
    raise exception '9. FALLÓ: el choque con el índice único no tiene respaldo (error de clave duplicada)';
  end;

  assert m2.id = m1.id, '9. El respaldo no devolvió el movimiento existente';
  assert (select count(*) from public.movimientos_inventario where clave_cliente = v_k) = 1,
    '9. Quedaron dos movimientos con la misma clave';
  assert not exists (select 1 from public.movimientos_inventario where nota = 'Respaldo 2'),
    '9. El segundo intento dejó un movimiento';
  assert (select stock from public.productos where id = v_p) = v_antes + 1,
    '9. El segundo intento movió el stock';
  raise notice '✔ 9. Respaldo del índice único: sin movimiento ni stock del segundo intento';
end $$;

-- =============================================================================
-- Como CAJERO
-- =============================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.cajero'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- 10. El cajero sigue sin poder registrar movimientos ni ajustes.
do $$
begin
  begin
    perform public.registrar_movimiento(current_setting('pruebas.p1')::uuid, 'entrada', 1, null, null,
      gen_random_uuid());
    raise exception '10. FALLÓ: el cajero registró una entrada';
  exception when sqlstate 'LT403' then null;
  end;
  begin
    perform public.registrar_ajuste(current_setting('pruebas.p1')::uuid, 1, null, gen_random_uuid(), 1);
    raise exception '10. FALLÓ: el cajero registró un ajuste';
  exception when sqlstate 'LT403' then null;
  end;
  raise notice '✔ 10. El cajero no puede mover inventario (LT403)';
end $$;

reset role;

-- =============================================================================
-- Como ANON
-- =============================================================================
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
set local role anon;

-- 11. anon no ejecuta las firmas nuevas.
do $$
declare
  s       text;
  v_entro boolean;
begin
  foreach s in array array[
    $q$select public.registrar_movimiento(gen_random_uuid(), 'entrada', 1, null, null, gen_random_uuid())$q$,
    $q$select public.registrar_ajuste(gen_random_uuid(), 1, null, gen_random_uuid(), 1)$q$
  ] loop
    begin
      execute s;
      v_entro := true;
    exception
      when insufficient_privilege then v_entro := false;
      when others then
        raise exception '11. FALLÓ: anon entró a % (respondió: %)', s, sqlerrm;
    end;
    if v_entro then
      raise exception '11. FALLÓ: anon pudo ejecutar: %', s;
    end if;
  end loop;
  raise notice '✔ 11. anon no ejecuta las funciones (42501)';
end $$;

reset role;

-- =============================================================================
-- Fin: se revierte todo.
-- =============================================================================
rollback;
