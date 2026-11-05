-- =============================================================================
-- 10-pruebas-crear-producto.sql — Pruebas de crear_producto
-- Requiere: 01 a 09 (con la semilla cargada).
--
-- Igual que 08: todo dentro de BEGIN … ROLLBACK, no deja cambios.
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
  set_config('pruebas.categoria',
    coalesce((select id::text from public.categorias where nombre = 'Herramienta'), ''), true),
  set_config('pruebas.proveedor',
    coalesce((select id::text from public.proveedores order by id limit 1), ''), true);

do $$
begin
  if current_setting('pruebas.dueno') = '' or current_setting('pruebas.cajero') = '' then
    raise exception '0. Faltan los usuarios demo. Revisa los correos o corre 07.';
  end if;
  if current_setting('pruebas.categoria') = '' or current_setting('pruebas.proveedor') = '' then
    raise exception '0. Faltan categorías o proveedores. Corre 07 primero.';
  end if;
  if exists (select 1 from public.productos where codigo like 'PRUEBA-%') then
    raise exception '0. Ya hay productos con código PRUEBA-%%; bórralos o cambia los códigos.';
  end if;
  raise notice '✔ 0. Contexto listo';
end $$;

-- Una categoría desactivada para la prueba 6 (se revierte al final).
insert into public.categorias (nombre, activo) values ('Categoría de prueba inactiva', false);

-- =============================================================================
-- Como DUEÑO
-- =============================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.dueno'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- 1. Con stock inicial: producto + una entrada con stock 0 → N.
do $$
declare
  v_prod public.productos;
  v_mov  public.movimientos_inventario;
begin
  v_prod := public.crear_producto(
    p_codigo        => '  PRUEBA-001  ',
    p_nombre        => 'Producto de prueba con stock',
    p_unidad        => 'metro',
    p_costo         => 10.555,
    p_precio        => 18,
    p_stock_minimo  => 5,
    p_stock_inicial => 12.5,
    p_categoria_id  => current_setting('pruebas.categoria')::bigint,
    p_proveedor_id  => current_setting('pruebas.proveedor')::bigint,
    p_descripcion   => '   '
  );

  assert v_prod.codigo = 'PRUEBA-001', '1. No recortó los espacios del código';
  assert v_prod.stock = 12.5, format('1. Stock %s, esperado 12.5', v_prod.stock);
  assert v_prod.costo = 10.56, format('1. Costo %s, esperado 10.56 (redondeo)', v_prod.costo);
  assert v_prod.descripcion is null, '1. Descripción vacía debería quedar null';

  assert (select count(*) from public.movimientos_inventario where producto_id = v_prod.id) = 1,
    '1. El stock inicial debe registrar exactamente un movimiento de entrada';
  select * into v_mov from public.movimientos_inventario where producto_id = v_prod.id;
  assert v_mov.tipo = 'entrada' and v_mov.cantidad = 12.5
         and v_mov.stock_anterior = 0 and v_mov.stock_nuevo = 12.5
         and v_mov.costo_unitario = 10.56
         and v_mov.usuario_id = current_setting('pruebas.dueno')::uuid
         and v_mov.nota = 'Inventario inicial',
    '1. El movimiento de entrada inicial es incorrecto';

  raise notice '✔ 1. Producto con stock inicial y su entrada';
end $$;

-- 2. Sin stock inicial: producto con stock 0 y ningún movimiento.
do $$
declare
  v_prod public.productos;
begin
  v_prod := public.crear_producto('PRUEBA-002', 'Producto de prueba sin stock', 'pieza', 5, 9);
  assert v_prod.stock = 0 and v_prod.activo, '2. Stock o activo incorrectos';
  assert not exists (select 1 from public.movimientos_inventario where producto_id = v_prod.id),
    '2. Se registró un movimiento con stock inicial 0';
  raise notice '✔ 2. Producto sin stock inicial, sin movimientos';
end $$;

-- 3. Código duplicado: LT409 y no se crea nada.
do $$
declare
  v_antes int := (select count(*) from public.productos);
begin
  begin
    perform public.crear_producto('PRUEBA-001', 'Duplicado', 'pieza', 1, 2, 0, 3);
    raise exception '3. FALLÓ: aceptó un código duplicado';
  exception when sqlstate 'LT409' then null;
  end;
  assert (select count(*) from public.productos) = v_antes, '3. Se creó un producto duplicado';
  raise notice '✔ 3. Código duplicado rechazado (LT409)';
end $$;

-- 4. Datos inválidos: LT422 y no se crea nada.
do $$
declare
  v_antes  int := (select count(*) from public.productos);
  v_movs   int := (select count(*) from public.movimientos_inventario);
  s        text;
begin
  foreach s in array array[
    $q$select public.crear_producto('PRUEBA-010', 'Decimales en pieza', 'pieza', 1, 2, 0, 1.5)$q$,
    $q$select public.crear_producto('PRUEBA-011', '   ', 'pieza', 1, 2)$q$,
    $q$select public.crear_producto('   ', 'Sin código', 'pieza', 1, 2)$q$,
    $q$select public.crear_producto('PRUEBA-012', 'Unidad rara', 'galon', 1, 2)$q$,
    $q$select public.crear_producto('PRUEBA-013', 'Precio negativo', 'pieza', 1, -2)$q$,
    $q$select public.crear_producto('PRUEBA-014', 'Costo nulo', 'pieza', null, 2)$q$,
    $q$select public.crear_producto('PRUEBA-015', 'Stock negativo', 'kilo', 1, 2, 0, -3)$q$,
    $q$select public.crear_producto('PRUEBA-016', 'Mínimo con decimales', 'caja', 1, 2, 0.5)$q$
  ] loop
    begin
      execute s;
      raise exception '4. FALLÓ: aceptó datos inválidos: %', s;
    exception when sqlstate 'LT422' then null;
    end;
  end loop;

  assert (select count(*) from public.productos) = v_antes, '4. Se creó un producto con datos inválidos';
  assert (select count(*) from public.movimientos_inventario) = v_movs, '4. Quedó un movimiento suelto';
  raise notice '✔ 4. Datos inválidos rechazados (LT422) sin dejar nada';
end $$;

-- 5. Categoría o proveedor inexistente: LT404.
do $$
begin
  begin
    perform public.crear_producto('PRUEBA-020', 'Categoría inexistente', 'pieza', 1, 2, 0, 0, -1);
    raise exception '5. FALLÓ: aceptó una categoría inexistente';
  exception when sqlstate 'LT404' then null;
  end;
  begin
    perform public.crear_producto('PRUEBA-021', 'Proveedor inexistente', 'pieza', 1, 2, 0, 0, null, -1);
    raise exception '5. FALLÓ: aceptó un proveedor inexistente';
  exception when sqlstate 'LT404' then null;
  end;
  raise notice '✔ 5. Categoría/proveedor inexistente rechazado (LT404)';
end $$;

-- 6. Categoría desactivada: LT422.
do $$
begin
  begin
    perform public.crear_producto(
      'PRUEBA-030', 'Categoría inactiva', 'pieza', 1, 2, 0, 0,
      (select id from public.categorias where nombre = 'Categoría de prueba inactiva'));
    raise exception '6. FALLÓ: aceptó una categoría desactivada';
  exception when sqlstate 'LT422' then null;
  end;
  raise notice '✔ 6. Categoría desactivada rechazada (LT422)';
end $$;

reset role;

-- =============================================================================
-- Como CAJERO
-- =============================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.cajero'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- 7. El cajero no puede crear productos.
do $$
begin
  begin
    perform public.crear_producto('PRUEBA-040', 'Del cajero', 'pieza', 1, 2, 0, 5);
    raise exception '7. FALLÓ: el cajero creó un producto';
  exception when sqlstate 'LT403' then null;
  end;
  raise notice '✔ 7. El cajero no puede crear productos (LT403)';
end $$;

reset role;

-- =============================================================================
-- Como ANON
-- =============================================================================
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
set local role anon;

-- 8. anon no puede ejecutar crear_producto (permiso denegado, no un error de la función).
do $$
declare
  v_entro boolean;
begin
  begin
    perform public.crear_producto('PRUEBA-050', 'De anon', 'pieza', 1, 2);
    v_entro := true;
  exception
    when insufficient_privilege then v_entro := false;
    when others then
      raise exception '8. FALLÓ: anon entró a crear_producto (respondió: %)', sqlerrm;
  end;
  if v_entro then
    raise exception '8. FALLÓ: anon pudo ejecutar crear_producto';
  end if;
  raise notice '✔ 8. anon no puede ejecutar crear_producto (42501)';
end $$;

reset role;

-- =============================================================================
-- Fin: se revierte todo.
-- =============================================================================
rollback;
