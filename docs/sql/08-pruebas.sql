-- =============================================================================
-- 08-pruebas.sql — Pruebas de reglas de negocio y seguridad
-- Requiere: 01 a 07 (con la semilla cargada).
--
-- Todo corre dentro de BEGIN … ROLLBACK: no deja ningún cambio.
-- Simula usuarios con `set local role` + `request.jwt.claims` (lo mismo que
-- hace PostgREST con cada petición).
--
-- Cómo leer el resultado en el SQL Editor:
--   - Si termina en "Success", pasaron todas.
--   - Si una falla, el error dice el número y qué falló. Como el error aborta
--     la transacción, tampoco queda ningún cambio.
--   (En psql, además, cada prueba imprime un NOTICE con ✔.)
--
-- Si usaste otros correos en la semilla, cámbialos en el paso 0.
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
  set_config('pruebas.ventas_cajero',
    (select count(*)::text from public.ventas
     where estado = 'completada'
       and usuario_id = (select id from auth.users where lower(email) = 'cajero@latuerca.test')), true),
  set_config('pruebas.ventas_total',
    (select count(*)::text from public.ventas where estado = 'completada'), true);

do $$
begin
  if current_setting('pruebas.dueno') = '' or current_setting('pruebas.cajero') = '' then
    raise exception '0. Faltan los usuarios demo. Revisa los correos o corre 07.';
  end if;
  if current_setting('pruebas.producto') = '' then
    raise exception '0. No existe el producto HER-004. Corre 07 primero.';
  end if;
  if (select stock from public.productos where codigo = 'HER-004') < 3 then
    raise exception '0. HER-004 necesita al menos 3 de stock para las pruebas.';
  end if;
  raise notice '✔ 0. Contexto listo';
end $$;

-- =============================================================================
-- Como CAJERO
-- =============================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.cajero'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- 1. Una venta baja el stock. El precio sale de la BD aunque el cliente mande otro.
do $$
declare
  v_prod    uuid := current_setting('pruebas.producto')::uuid;
  v_antes   numeric;
  v_despues numeric;
  v_venta   public.ventas;
begin
  select stock into v_antes from public.productos where id = v_prod;

  v_venta := public.registrar_venta(
    jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 2, 'precio', 0.01)),
    'efectivo', 500
  );

  select stock into v_despues from public.productos where id = v_prod;

  assert v_despues = v_antes - 2,
    format('1. El stock no bajó: antes %s, después %s', v_antes, v_despues);
  assert v_venta.total = 230 and v_venta.cambio = 270,
    format('1. Total/cambio incorrectos: total %s, cambio %s (esperado 230 y 270)',
           v_venta.total, v_venta.cambio);

  perform set_config('pruebas.venta', v_venta.id::text, true);
  raise notice '✔ 1. Venta del cajero: stock % → %, total %, folio %',
    v_antes, v_despues, v_venta.total, v_venta.folio;
end $$;

-- 2. No deja vender más de lo que hay (y el stock no cambia).
do $$
declare
  v_prod  uuid := current_setting('pruebas.producto')::uuid;
  v_antes numeric;
begin
  select stock into v_antes from public.productos where id = v_prod;
  begin
    perform public.registrar_venta(
      jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', v_antes + 1)),
      'tarjeta'
    );
    raise exception '2. FALLÓ: dejó vender % con stock %', v_antes + 1, v_antes;
  exception when sqlstate 'LT409' then
    null;
  end;
  assert (select stock from public.productos where id = v_prod) = v_antes,
    '2. El stock cambió después de una venta rechazada';
  raise notice '✔ 2. Vender más de lo que hay se rechaza (LT409)';
end $$;

-- 3. Validaciones de la venta: decimales en pieza, efectivo insuficiente, vacía.
do $$
declare
  v_prod uuid := current_setting('pruebas.producto')::uuid;
begin
  begin
    perform public.registrar_venta(
      jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 1.5)), 'tarjeta');
    raise exception '3. FALLÓ: aceptó 1.5 piezas';
  exception when sqlstate 'LT422' then null;
  end;

  begin
    perform public.registrar_venta(
      jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 1)), 'efectivo', 10);
    raise exception '3. FALLÓ: aceptó un pago en efectivo menor al total';
  exception when sqlstate 'LT422' then null;
  end;

  begin
    perform public.registrar_venta('[]'::jsonb, 'efectivo', 100);
    raise exception '3. FALLÓ: aceptó una venta sin productos';
  exception when sqlstate 'LT422' then null;
  end;

  begin
    perform public.registrar_venta(
      jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', '1')), 'tarjeta');
    raise exception '3. FALLÓ: aceptó una cantidad como texto';
  exception when sqlstate 'LT422' then null;
  end;

  raise notice '✔ 3. Validaciones de venta (decimales, pago, vacía, tipos)';
end $$;

-- 4. El cajero no puede cancelar ventas.
do $$
begin
  begin
    perform public.cancelar_venta(current_setting('pruebas.venta')::uuid, 'prueba');
    raise exception '4. FALLÓ: el cajero pudo cancelar una venta';
  exception when sqlstate 'LT403' then null;
  end;
  raise notice '✔ 4. El cajero no puede cancelar (LT403)';
end $$;

-- 5. El cajero no puede registrar entradas, mermas ni ajustes.
do $$
declare
  v_prod uuid := current_setting('pruebas.producto')::uuid;
begin
  begin
    perform public.registrar_movimiento(v_prod, 'entrada', 10);
    raise exception '5. FALLÓ: el cajero registró una entrada';
  exception when sqlstate 'LT403' then null;
  end;
  begin
    perform public.registrar_ajuste(v_prod, 0);
    raise exception '5. FALLÓ: el cajero registró un ajuste';
  exception when sqlstate 'LT403' then null;
  end;
  raise notice '✔ 5. El cajero no puede mover inventario (LT403)';
end $$;

-- 6. Nadie cambia el stock con UPDATE directo (cajero aquí, dueño en 11).
do $$
begin
  begin
    update public.productos set stock = 9999
    where id = current_setting('pruebas.producto')::uuid;
    raise exception '6. FALLÓ: el cajero hizo UPDATE directo a stock';
  exception when insufficient_privilege then null;
  end;
  raise notice '✔ 6. UPDATE directo a stock rechazado para el cajero (42501)';
end $$;

-- 7. RLS del cajero: solo sus ventas, sin movimientos, no se vuelve dueño.
do $$
declare
  v_mias  int := current_setting('pruebas.ventas_cajero')::int + 1;  -- +1: la de la prueba 1
  v_total int := current_setting('pruebas.ventas_total')::int + 1;
  v_vista int;
begin
  assert (select count(*) from public.ventas where estado = 'completada') = v_mias,
    '7. El cajero ve ventas que no son suyas';
  assert not exists (
      select 1 from public.ventas where usuario_id <> current_setting('pruebas.cajero')::uuid),
    '7. El cajero ve ventas de otro usuario';
  assert not exists (
      select 1 from public.venta_detalle d
      where not exists (select 1 from public.ventas v where v.id = d.venta_id)),
    '7. El cajero ve detalle de ventas ajenas';
  assert (select count(*) from public.movimientos_inventario) = 0,
    '7. El cajero ve movimientos de inventario';

  -- Las funciones de resumen solo le cuentan sus ventas. (La vista
  -- v_ventas_por_dia se quitó en 20; la reemplaza resumen_ventas/ventas_por_dia.)
  select coalesce(num_ventas, 0) into v_vista
  from public.resumen_ventas(now() - interval '40 days', now() + interval '1 hour');
  assert v_vista = v_mias,
    format('7. resumen_ventas del cajero cuenta %s ventas, esperado %s', v_vista, v_mias);
  assert v_vista < v_total, '7. resumen_ventas del cajero incluye ventas del dueño';
  assert (select coalesce(sum(importe), 0) from public.mas_vendidos(current_date - 40, current_date + 1, 100))
       = (select coalesce(sum(d.importe), 0) from public.venta_detalle d
          join public.ventas v on v.id = d.venta_id where v.estado = 'completada'),
    '7. mas_vendidos del cajero incluye ventas ajenas';
  assert (select count(*) from public.v_stock_bajo) > 0, '7. El cajero no ve el stock bajo';

  -- Intentar volverse dueño: RLS lo filtra (0 filas), no hay error.
  update public.perfiles set rol = 'dueno'
  where id = current_setting('pruebas.cajero')::uuid;
  assert (select rol from public.perfiles where id = current_setting('pruebas.cajero')::uuid) = 'cajero',
    '7. FALLÓ: el cajero se cambió a dueño';

  raise notice '✔ 7. RLS del cajero: % ventas propias de %, sin movimientos, vistas filtradas',
    v_mias, v_total;
end $$;

-- 8. El cajero no puede ejecutar funciones internas (esquema privado).
do $$
declare
  s          text;
  v_entro    boolean;
begin
  foreach s in array array[
    'select privado.cargar_semilla()',
    'select privado.aplicar_movimiento(gen_random_uuid(), ''entrada'', 1, null, null, null, gen_random_uuid())',
    'select privado.usuario_validado(false)'
  ] loop
    -- Solo vale "permiso denegado" (42501). Cualquier otro error significa
    -- que sí entró a la función.
    begin
      execute s;
      v_entro := true;
    exception
      when insufficient_privilege then v_entro := false;
      when others then
        raise exception '8. FALLÓ: authenticated entró a % (respondió: %)', s, sqlerrm;
    end;
    if v_entro then
      raise exception '8. FALLÓ: authenticated pudo ejecutar: %', s;
    end if;
  end loop;
  raise notice '✔ 8. Funciones de privado bloqueadas para authenticated (42501)';
end $$;

reset role;

-- =============================================================================
-- Como DUEÑO
-- =============================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.dueno'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- 9. La venta de la prueba 1 dejó su movimiento y su detalle con copias.
do $$
declare
  v_mov public.movimientos_inventario;
  v_det record;
begin
  select * into v_mov from public.movimientos_inventario
  where venta_id = current_setting('pruebas.venta')::uuid;
  assert v_mov.tipo = 'venta' and v_mov.cantidad = -2
         and v_mov.stock_nuevo = v_mov.stock_anterior - 2,
    '9. El movimiento de la venta es incorrecto';

  -- Sin costo_unitario: desde 20 nadie de la API lo lee directo (se revisa
  -- como postgres en 9b).
  select precio_unitario, nombre_producto, importe into v_det from public.venta_detalle
  where venta_id = current_setting('pruebas.venta')::uuid;
  assert v_det.precio_unitario = 115
         and v_det.nombre_producto = 'Flexómetro 5 m' and v_det.importe = 230,
    '9. El detalle no copió precio/nombre';
  raise notice '✔ 9. Movimiento y detalle de la venta correctos';
end $$;

-- 10. Cancelar regresa el stock; no se puede cancelar dos veces.
do $$
declare
  v_prod    uuid := current_setting('pruebas.producto')::uuid;
  v_antes   numeric;
  v_venta   public.ventas;
begin
  select stock into v_antes from public.productos where id = v_prod;
  v_venta := public.cancelar_venta(current_setting('pruebas.venta')::uuid, 'Prueba de cancelación');

  assert v_venta.estado = 'cancelada' and v_venta.cancelada_en is not null,
    '10. La venta no quedó cancelada';
  assert (select stock from public.productos where id = v_prod) = v_antes + 2,
    '10. Cancelar no regresó el stock';
  assert exists (
      select 1 from public.movimientos_inventario
      where venta_id = v_venta.id and tipo = 'cancelacion_venta' and cantidad = 2),
    '10. Falta el movimiento de cancelación';

  begin
    perform public.cancelar_venta(v_venta.id, 'otra vez');
    raise exception '10. FALLÓ: se canceló dos veces';
  exception when sqlstate 'LT409' then null;
  end;
  raise notice '✔ 10. Cancelación regresa stock (% → %) y no se repite', v_antes, v_antes + 2;
end $$;

-- 11. Entrada, merma, ajuste; el dueño tampoco hace UPDATE directo a stock.
do $$
declare
  v_prod  uuid := current_setting('pruebas.producto')::uuid;
  v_antes numeric;
  v_mov   public.movimientos_inventario;
begin
  select stock into v_antes from public.productos where id = v_prod;

  v_mov := public.registrar_movimiento(v_prod, 'entrada', 10, 66.50, 'Compra de prueba');
  assert v_mov.cantidad = 10 and v_mov.stock_nuevo = v_antes + 10, '11. Entrada incorrecta';
  -- El dueño lee el costo con costos_productos (20), no de la columna.
  assert (select c.costo from public.costos_productos(array[v_prod]) c) = 66.50,
    '11. La entrada no actualizó el costo';

  begin
    perform public.registrar_movimiento(v_prod, 'merma', 1);
    raise exception '11. FALLÓ: aceptó una merma sin nota';
  exception when sqlstate 'LT422' then null;
  end;

  v_mov := public.registrar_movimiento(v_prod, 'merma', 1, null, 'Se cayó y se rompió');
  assert v_mov.cantidad = -1, '11. La merma no restó';

  begin
    perform public.registrar_movimiento(v_prod, 'venta', 1);
    raise exception '11. FALLÓ: registrar_movimiento aceptó tipo venta';
  exception when sqlstate 'LT422' then null;
  end;

  v_mov := public.registrar_ajuste(v_prod, 5, 'Conteo de prueba');
  assert v_mov.tipo = 'ajuste' and v_mov.stock_nuevo = 5
         and v_mov.cantidad = 5 - (v_antes + 9),
    '11. El ajuste no calculó la diferencia';
  assert public.registrar_ajuste(v_prod, 5) is null,
    '11. Un ajuste sin diferencia no debe registrar movimiento';

  begin
    update public.productos set stock = 9999 where id = v_prod;
    raise exception '11. FALLÓ: el dueño hizo UPDATE directo a stock';
  exception when insufficient_privilege then null;
  end;

  -- El dueño sí edita otras columnas.
  update public.productos set precio = 120 where id = v_prod;
  assert (select precio from public.productos where id = v_prod) = 120,
    '11. El dueño no pudo editar el precio';

  raise notice '✔ 11. Entrada, merma, ajuste y bloqueo de UPDATE a stock para el dueño';
end $$;

-- 12. El dueño no puede quitarse su propio rol ni desactivarse.
do $$
begin
  begin
    update public.perfiles set activo = false
    where id = current_setting('pruebas.dueno')::uuid;
    raise exception '12. FALLÓ: el dueño se desactivó a sí mismo';
  exception when insufficient_privilege then null;
  end;
  raise notice '✔ 12. El dueño no puede desactivarse a sí mismo';
end $$;

reset role;

-- 9b. (como postgres) El detalle de la venta de la prueba 1 copió el costo.
do $$
begin
  assert (select costo_unitario from public.venta_detalle
          where venta_id = current_setting('pruebas.venta')::uuid) = 65,
    '9b. El detalle no copió el costo';
  raise notice '✔ 9b. El detalle copió el costo';
end $$;

-- =============================================================================
-- Como ANON (sin sesión)
-- =============================================================================
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
set local role anon;

-- 13. anon no ejecuta ninguna función ni lee tablas o vistas (salvo configuración).
do $$
declare
  s       text;
  v_entro boolean;
begin
  foreach s in array array[
    'select public.rol_actual()',
    'select public.es_dueno()',
    'select public.registrar_venta(''[]''::jsonb, ''efectivo'', 0)',
    'select public.registrar_movimiento(gen_random_uuid(), ''entrada'', 1)',
    'select public.registrar_ajuste(gen_random_uuid(), 1)',
    'select public.cancelar_venta(gen_random_uuid(), ''x'')',
    'select * from public.mas_vendidos(current_date, current_date)',
    'select privado.cargar_semilla()',
    'select privado.aplicar_movimiento(gen_random_uuid(), ''entrada'', 1, null, null, null, gen_random_uuid())',
    'select count(*) from public.productos',
    'select count(*) from public.ventas',
    'select count(*) from public.venta_detalle',
    'select count(*) from public.movimientos_inventario',
    'select count(*) from public.perfiles',
    'select count(*) from public.categorias',
    'select count(*) from public.proveedores',
    'select count(*) from public.v_stock_bajo',
    'select * from public.costos_productos(array[gen_random_uuid()])'
  ] loop
    -- Solo vale "permiso denegado" (42501). Cualquier otro error significa
    -- que sí entró (por ejemplo, la función lo rechazó por dentro).
    begin
      execute s;
      v_entro := true;
    exception
      when insufficient_privilege then v_entro := false;
      when others then
        raise exception '13. FALLÓ: anon entró a % (respondió: %)', s, sqlerrm;
    end;
    if v_entro then
      raise exception '13. FALLÓ: anon pudo ejecutar: %', s;
    end if;
  end loop;

  assert (select count(*) from public.configuracion_negocio) = 1,
    '13. anon no puede leer configuracion_negocio';
  begin
    update public.configuracion_negocio set nombre = 'Hackeado';
    raise exception '13. FALLÓ: anon editó configuracion_negocio';
  exception when insufficient_privilege then null;
  end;

  raise notice '✔ 13. anon: sin funciones, sin tablas, solo lee configuración';
end $$;

reset role;

-- =============================================================================
-- Usuario INACTIVO
-- =============================================================================
update public.perfiles set activo = false where id = current_setting('pruebas.cajero')::uuid;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.cajero'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- 14. Un perfil inactivo no ve datos ni puede vender.
do $$
begin
  assert (select count(*) from public.productos) = 0, '14. Un usuario inactivo ve productos';
  assert (select count(*) from public.ventas) = 0, '14. Un usuario inactivo ve ventas';
  assert public.rol_actual() is null, '14. rol_actual() no es null para un inactivo';
  begin
    perform public.registrar_venta(
      jsonb_build_array(jsonb_build_object(
        'producto_id', current_setting('pruebas.producto'), 'cantidad', 1)),
      'tarjeta');
    raise exception '14. FALLÓ: un usuario inactivo pudo vender';
  exception when sqlstate 'LT401' then null;
  end;
  raise notice '✔ 14. Usuario inactivo bloqueado (LT401)';
end $$;

reset role;

-- =============================================================================
-- Fin: se revierte todo.
-- =============================================================================
rollback;
