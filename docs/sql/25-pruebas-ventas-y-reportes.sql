-- =============================================================================
-- 25-pruebas-ventas-y-reportes.sql — Quién canceló y funciones de Reportes
-- Requiere: 01 a 24 (con la semilla cargada).
--
-- Todo dentro de BEGIN … ROLLBACK: no deja cambios.
-- "Success" en el SQL Editor = pasaron todas. Si una falla, el error dice cuál.
--
-- Ventas propias en 2000 (lejos de la semilla), con montos conocidos:
--
--   #  Monterrey            Usuario  Estado      Método         Renglones (cant × precio, costo)     Total
--   1  2000-01-09 23:59:59  cajero   completada  tarjeta        P2 1 × 11 (5)                          11
--   2  2000-01-10 10:00     cajero   completada  efectivo       P2 2.5 × 20 (8.10)                     50
--   3  2000-01-10 12:00     dueño    cancelada   tarjeta        P3 1 × 1000 (1)                      1000
--   4  2000-01-10 23:59     dueño    completada  transferencia  P1 1 × 100 (60)                       100
--   5  2000-01-11 00:00     dueño    completada  tarjeta        P1 1 × 7 (3)                            7
--   6  2000-01-17 09:00     dueño    completada  efectivo       P1 1 × 30 (10) + P2 1 × 20 (8.10)      50
--   7  2000-02-01 10:00     dueño    completada  efectivo       P1 1 × 40 (25)                         40
--
-- P1 = HER-004, P2 = ELE-001 (de otra categoría), P3 = otro producto activo
-- con stock, de una tercera categoría si la hay.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Contexto y ventas de prueba (como postgres)
-- -----------------------------------------------------------------------------
select
  set_config('pruebas.dueno',
    coalesce((select id::text from auth.users where lower(email) = 'demo@latuerca.test'), ''), true),
  set_config('pruebas.cajero',
    coalesce((select id::text from auth.users where lower(email) = 'cajero@latuerca.test'), ''), true),
  set_config('pruebas.p1',
    coalesce((select id::text from public.productos where codigo = 'HER-004'), ''), true),
  set_config('pruebas.p2',
    coalesce((select id::text from public.productos where codigo = 'ELE-001'), ''), true);

select set_config('pruebas.p3', coalesce((
  select p.id::text
  from public.productos p
  where p.activo and p.stock > 0 and p.codigo not in ('HER-004', 'ELE-001')
  order by (p.categoria_id is not distinct from (select categoria_id from public.productos where codigo = 'HER-004')
            or p.categoria_id is not distinct from (select categoria_id from public.productos where codigo = 'ELE-001')),
           p.codigo
  limit 1), ''), true);

do $$
declare
  v_dueno  uuid;
  v_cajero uuid;
  v_p1     uuid;
  v_p2     uuid;
  v_p3     uuid;
  v_id     uuid;
  r        record;
  v_n      int := 0;
begin
  if current_setting('pruebas.dueno') = '' or current_setting('pruebas.cajero') = ''
     or current_setting('pruebas.p1') = '' or current_setting('pruebas.p2') = ''
     or current_setting('pruebas.p3') = '' then
    raise exception '0. Faltan usuarios demo o productos de la semilla. Corre 07.';
  end if;
  if to_regprocedure('public.reporte_resumen(date, date)') is null then
    raise exception '0. Falta 24-ventas-y-reportes.sql.';
  end if;
  v_dueno  := current_setting('pruebas.dueno')::uuid;
  v_cajero := current_setting('pruebas.cajero')::uuid;
  v_p1     := current_setting('pruebas.p1')::uuid;
  v_p2     := current_setting('pruebas.p2')::uuid;
  v_p3     := current_setting('pruebas.p3')::uuid;

  assert (select categoria_id from public.productos where id = v_p1)
         is distinct from (select categoria_id from public.productos where id = v_p2),
    '0. HER-004 y ELE-001 deben ser de categorías distintas';

  for r in
    select * from (values
      (timestamp '2000-01-09 23:59:59', v_cajero, 'completada', 'tarjeta',        11.00,
       v_p2, 1.0, 11.00, 5.00,  null::uuid, null::numeric, null::numeric, null::numeric),
      (timestamp '2000-01-10 10:00',    v_cajero, 'completada', 'efectivo',       50.00,
       v_p2, 2.5, 20.00, 8.10,  null, null, null, null),
      (timestamp '2000-01-10 12:00',    v_dueno,  'cancelada',  'tarjeta',      1000.00,
       v_p3, 1.0, 1000.00, 1.00, null, null, null, null),
      (timestamp '2000-01-10 23:59',    v_dueno,  'completada', 'transferencia', 100.00,
       v_p1, 1.0, 100.00, 60.00, null, null, null, null),
      (timestamp '2000-01-11 00:00',    v_dueno,  'completada', 'tarjeta',         7.00,
       v_p1, 1.0, 7.00, 3.00,   null, null, null, null),
      (timestamp '2000-01-17 09:00',    v_dueno,  'completada', 'efectivo',       50.00,
       v_p1, 1.0, 30.00, 10.00, v_p2, 1.0, 20.00, 8.10),
      (timestamp '2000-02-01 10:00',    v_dueno,  'completada', 'efectivo',       40.00,
       v_p1, 1.0, 40.00, 25.00, null, null, null, null)
    ) t(local_ts, usuario, estado, metodo, total, pa, ca, pra, coa, pb, cb, prb, cob)
  loop
    v_n := v_n + 1;
    insert into public.ventas
      (subtotal, total, metodo_pago, pago_recibido, cambio, usuario_id, creado_en,
       estado, motivo_cancelacion, cancelada_en, cancelada_por)
    values
      (r.total, r.total, r.metodo, r.total, 0, r.usuario,
       r.local_ts at time zone 'America/Monterrey',
       r.estado,
       case when r.estado = 'cancelada' then 'Prueba' end,
       case when r.estado = 'cancelada' then (r.local_ts at time zone 'America/Monterrey') + interval '5 minutes' end,
       case when r.estado = 'cancelada' then v_dueno end)
    returning id into v_id;

    insert into public.venta_detalle
      (venta_id, producto_id, nombre_producto, unidad, cantidad, precio_unitario, costo_unitario, importe)
    select v_id, p.id, p.nombre, p.unidad, x.c, x.pr, x.co, round(x.c * x.pr, 2)
    from (values (r.pa, r.ca, r.pra, r.coa), (r.pb, r.cb, r.prb, r.cob)) x(p, c, pr, co)
    join public.productos p on p.id = x.p;

    perform set_config('pruebas.venta' || v_n, v_id::text, true);
  end loop;

  raise notice '✔ 0. Contexto listo y 7 ventas de prueba en 2000';
end $$;

-- =============================================================================
-- Como DUEÑO
-- =============================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.dueno'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- 1. Resumen: un día y un mes, sin la cancelada pero contándola aparte.
do $$
declare
  r record;
begin
  select * into r from public.reporte_resumen('2000-01-10', '2000-01-10');
  assert r.num_ventas = 2 and r.ventas = 150.00 and r.costo = 80.25 and r.ganancia = 69.75
     and r.ticket_promedio = 75.00,
    format('1. Resumen del día 10 incorrecto: %s', row_to_json(r));
  assert r.num_canceladas = 1 and r.canceladas = 1000.00,
    format('1. Canceladas del día 10 incorrectas: %s', row_to_json(r));

  select * into r from public.reporte_resumen('2000-01-10', '2000-01-31');
  assert r.num_ventas = 4 and r.ventas = 207.00 and r.costo = 101.35 and r.ganancia = 105.65
     and r.ticket_promedio = 51.75,
    format('1. Resumen del 10 al 31 incorrecto: %s', row_to_json(r));

  select * into r from public.reporte_resumen('2000-03-01', '2000-03-31');
  assert r.num_ventas = 0 and r.ventas = 0 and r.costo = 0 and r.ganancia = 0
     and r.ticket_promedio = 0 and r.num_canceladas = 0,
    format('1. Un mes sin ventas debe dar ceros: %s', row_to_json(r));
  raise notice '✔ 1. Resumen: día (sin la cancelada, a las 23:59 de Monterrey), mes y periodo vacío';
end $$;

-- 2. Por periodo: la agrupación sale del largo del rango.
do $$
declare
  r     record;
  v_n   int;
  v_sum numeric;
begin
  -- 31 días: por día, uno por día aunque no haya ventas.
  select count(*), sum(ventas) into v_n, v_sum
    from public.reporte_ventas_por_periodo('2000-01-01', '2000-01-31');
  assert v_n = 31 and v_sum = 218.00, format('2. Enero por día: %s renglones, %s', v_n, v_sum);
  assert (select bool_and(agrupacion = 'dia' and desde = periodo and hasta = periodo)
          from public.reporte_ventas_por_periodo('2000-01-01', '2000-01-31')),
    '2. 31 días deben ir por día';
  select * into r from public.reporte_ventas_por_periodo('2000-01-01', '2000-01-31') where periodo = '2000-01-10';
  assert r.num_ventas = 2 and r.ventas = 150.00 and r.costo = 80.25 and r.ganancia = 69.75,
    format('2. Día 10 incorrecto (¿corte en UTC?): %s', row_to_json(r));
  select * into r from public.reporte_ventas_por_periodo('2000-01-01', '2000-01-31') where periodo = '2000-01-09';
  assert r.ventas = 11.00, format('2. La venta de las 23:59:59 del 9 no quedó en el 9: %s', row_to_json(r));

  -- 32 a 182 días: por semana, de lunes a domingo, recortada en las orillas.
  assert (select agrupacion from public.reporte_ventas_por_periodo('2000-01-01', '2000-02-01') limit 1) = 'semana',
    '2. 32 días deben ir por semana';
  select count(*), sum(ventas) into v_n, v_sum
    from public.reporte_ventas_por_periodo('2000-01-01', '2000-02-15');
  assert v_n = 8 and v_sum = 258.00, format('2. Por semana: %s renglones, %s', v_n, v_sum);
  select * into r from public.reporte_ventas_por_periodo('2000-01-01', '2000-02-15') order by periodo limit 1;
  assert r.periodo = '1999-12-27' and r.desde = '2000-01-01' and r.hasta = '2000-01-02',
    format('2. Primera semana mal recortada: %s', row_to_json(r));
  select * into r from public.reporte_ventas_por_periodo('2000-01-01', '2000-02-15') where periodo = '2000-01-10';
  assert r.num_ventas = 3 and r.ventas = 157.00 and r.hasta = '2000-01-16',
    format('2. La semana del lunes 10 debe tener 157 (¿semana en domingo?): %s', row_to_json(r));
  select * into r from public.reporte_ventas_por_periodo('2000-01-01', '2000-02-15') where periodo = '2000-01-03';
  assert r.ventas = 11.00, format('2. El domingo 9 es de la semana del lunes 3: %s', row_to_json(r));
  select * into r from public.reporte_ventas_por_periodo('2000-01-01', '2000-02-15') order by periodo desc limit 1;
  assert r.periodo = '2000-02-14' and r.desde = '2000-02-14' and r.hasta = '2000-02-15',
    format('2. Última semana mal recortada: %s', row_to_json(r));
  assert (select agrupacion from public.reporte_ventas_por_periodo('2000-01-01', date '2000-01-01' + 181) limit 1) = 'semana',
    '2. 182 días deben ir por semana';

  -- 183 a 366 días: por mes.
  assert (select agrupacion from public.reporte_ventas_por_periodo('2000-01-01', date '2000-01-01' + 182) limit 1) = 'mes',
    '2. 183 días deben ir por mes';
  select count(*), sum(ventas) into v_n, v_sum
    from public.reporte_ventas_por_periodo('1999-12-01', '2000-06-30');
  assert v_n = 7 and v_sum = 258.00, format('2. Por mes: %s renglones, %s', v_n, v_sum);
  select * into r from public.reporte_ventas_por_periodo('1999-12-01', '2000-06-30') where periodo = '2000-01-01';
  assert r.ventas = 218.00 and r.desde = '2000-01-01' and r.hasta = '2000-01-31',
    format('2. Enero por mes incorrecto: %s', row_to_json(r));
  assert (select count(*) from public.reporte_ventas_por_periodo('2000-01-01', '2000-12-31')) = 12,
    '2. 366 días (2000 es bisiesto) deben dar 12 meses';

  -- Lo mismo que el resumen.
  assert (select sum(ventas) from public.reporte_ventas_por_periodo('2000-01-01', '2000-02-15'))
       = (select ventas from public.reporte_resumen('2000-01-01', '2000-02-15'))
     and (select sum(costo) from public.reporte_ventas_por_periodo('2000-01-01', '2000-02-15'))
       = (select costo from public.reporte_resumen('2000-01-01', '2000-02-15')),
    '2. Los periodos no suman lo mismo que el resumen';
  raise notice '✔ 2. Por periodo: día hasta 31, semana (lunes) hasta 182, mes hasta 366, recortes y totales';
end $$;

-- 3. Por categoría y por método de pago.
do $$
declare
  r     record;
  v_c1  int := (select categoria_id from public.productos where id = current_setting('pruebas.p1')::uuid);
  v_c2  int := (select categoria_id from public.productos where id = current_setting('pruebas.p2')::uuid);
  v_n   int;
begin
  select * into r from public.reporte_por_categoria('2000-01-10', '2000-01-31') where categoria_id = v_c1;
  assert r.num_ventas = 3 and r.ventas = 137.00 and r.costo = 73.00 and r.ganancia = 64.00,
    format('3. Categoría de HER-004 incorrecta (¿cuenta la cancelada?): %s', row_to_json(r));
  select * into r from public.reporte_por_categoria('2000-01-10', '2000-01-31') where categoria_id = v_c2;
  assert r.num_ventas = 2 and r.ventas = 70.00 and r.costo = 28.35 and r.ganancia = 41.65,
    format('3. Categoría de ELE-001 incorrecta: %s', row_to_json(r));
  select count(*) into v_n from public.reporte_por_categoria('2000-01-10', '2000-01-31');
  assert v_n = 2, format('3. Debe haber 2 categorías (la venta cancelada no cuenta), hay %s', v_n);
  assert (select sum(ventas) from public.reporte_por_categoria('2000-01-10', '2000-01-31'))
       = (select ventas from public.reporte_resumen('2000-01-10', '2000-01-31')),
    '3. Las categorías no suman lo mismo que el resumen';

  select * into r from public.reporte_por_metodo('2000-01-10', '2000-01-31') where metodo_pago = 'efectivo';
  assert r.num_ventas = 2 and r.ventas = 100.00, format('3. Efectivo: %s', row_to_json(r));
  select * into r from public.reporte_por_metodo('2000-01-10', '2000-01-31') where metodo_pago = 'tarjeta';
  assert r.num_ventas = 1 and r.ventas = 7.00, format('3. Tarjeta (sin la cancelada): %s', row_to_json(r));
  select * into r from public.reporte_por_metodo('2000-01-10', '2000-01-31') where metodo_pago = 'transferencia';
  assert r.num_ventas = 1 and r.ventas = 100.00, format('3. Transferencia: %s', row_to_json(r));
  assert (select sum(ventas) from public.reporte_por_metodo('2000-01-10', '2000-01-31')) = 207.00,
    '3. Los métodos no suman lo mismo que el resumen';
  assert (select count(*) from public.reporte_por_metodo('2000-03-01', '2000-03-31') where ventas = 0 and num_ventas = 0) = 3,
    '3. Sin ventas deben salir los 3 métodos en 0';
  raise notice '✔ 3. Por categoría y por método de pago: montos, sin la cancelada y cuadran con el resumen';
end $$;

-- 3b. La categoría es la de hoy (limitación documentada): sin categoría → "Sin categoría".
reset role;
update public.productos set categoria_id = null where id = current_setting('pruebas.p2')::uuid;
set local role authenticated;
do $$
declare
  r record;
begin
  select * into r from public.reporte_por_categoria('2000-01-10', '2000-01-31') where categoria_id is null;
  assert r.categoria = 'Sin categoría' and r.ventas = 70.00,
    format('3b. Producto sin categoría: %s', row_to_json(r));
  raise notice '✔ 3b. Productos sin categoría salen como "Sin categoría"';
end $$;

-- 4. Sin movimiento.
reset role;
select set_config('pruebas.inactivo', (select id::text from public.productos
  where activo and stock > 0 and id not in (current_setting('pruebas.p1')::uuid, current_setting('pruebas.p2')::uuid,
                                            current_setting('pruebas.p3')::uuid)
  order by codigo limit 1), true);
select set_config('pruebas.sin_stock', (select id::text from public.productos
  where activo and stock > 0 and id not in (current_setting('pruebas.p1')::uuid, current_setting('pruebas.p2')::uuid,
                                            current_setting('pruebas.p3')::uuid, current_setting('pruebas.inactivo')::uuid)
  order by codigo limit 1), true);
update public.productos set activo = false where id = current_setting('pruebas.inactivo')::uuid;
update public.productos set stock = 0 where id = current_setting('pruebas.sin_stock')::uuid;
-- Desde 30, "Sin movimiento" no incluye productos dados de alta dentro del
-- rango. Los de la semilla se fechan antes del rango de esta prueba (2000);
-- es solo dentro de esta transacción.
update public.productos set creado_en = timestamptz '1999-12-01 08:00-06';
select set_config('pruebas.p3_valor', (select round(stock * costo, 2)::text from public.productos
  where id = current_setting('pruebas.p3')::uuid), true);
select set_config('pruebas.p3_ultima', coalesce((select max(v.creado_en)::text from public.venta_detalle d
  join public.ventas v on v.id = d.venta_id
  where d.producto_id = current_setting('pruebas.p3')::uuid and v.estado = 'completada'), ''), true);
select set_config('pruebas.esperados_sin_mov', (select count(*)::text from public.productos
  where activo and stock > 0
    and id not in (current_setting('pruebas.p1')::uuid, current_setting('pruebas.p2')::uuid)), true);
set local role authenticated;

do $$
declare
  r       record;
  v_prev  numeric := null;
  v_n     int := 0;
begin
  for r in select * from public.reporte_sin_movimiento('2000-01-10', '2000-01-31', 200) loop
    v_n := v_n + 1;
    assert r.producto_id not in (current_setting('pruebas.p1')::uuid, current_setting('pruebas.p2')::uuid),
      format('4. %s se vendió en el periodo y salió sin movimiento', r.codigo);
    assert r.producto_id <> current_setting('pruebas.inactivo')::uuid, '4. Salió un producto inactivo';
    assert r.producto_id <> current_setting('pruebas.sin_stock')::uuid, '4. Salió un producto sin stock';
    assert v_prev is null or r.valor_detenido <= v_prev, '4. No está ordenado por valor detenido';
    v_prev := r.valor_detenido;
  end loop;
  assert v_n = current_setting('pruebas.esperados_sin_mov')::int,
    format('4. Salieron %s productos sin movimiento, se esperaban %s', v_n, current_setting('pruebas.esperados_sin_mov'));

  select * into r from public.reporte_sin_movimiento('2000-01-10', '2000-01-31', 200)
  where producto_id = current_setting('pruebas.p3')::uuid;
  assert found, '4. P3 solo tuvo una venta cancelada: debe salir sin movimiento';
  assert r.valor_detenido = current_setting('pruebas.p3_valor')::numeric,
    format('4. Valor detenido de P3: %s, esperado %s', r.valor_detenido, current_setting('pruebas.p3_valor'));
  assert r.ultima_venta is not distinct from nullif(current_setting('pruebas.p3_ultima'), '')::timestamptz,
    '4. Última venta de P3 incorrecta (no debe contar la cancelada)';

  assert (select count(*) from public.reporte_sin_movimiento('2000-01-10', '2000-01-31', 1)) = 1,
    '4. No respeta el límite';
  raise notice '✔ 4. Sin movimiento: % productos, sin vendidos, inactivos ni sin stock, por valor detenido', v_n;
end $$;

-- 5. Rangos inválidos: LT422 en todas.
do $$
declare
  v_sql   text;
  v_casos text[] := array[
    'select * from public.reporte_resumen(''2000-01-02'', ''2000-01-01'')',
    'select * from public.reporte_resumen(null, ''2000-01-01'')',
    'select * from public.reporte_resumen(''2000-01-01'', ''2001-01-01'')',
    'select * from public.reporte_ventas_por_periodo(''2000-01-01'', ''2001-01-01'')',
    'select * from public.reporte_ventas_por_periodo(''2000-01-02'', ''2000-01-01'')',
    'select * from public.reporte_por_categoria(''2000-01-01'', ''2001-01-01'')',
    'select * from public.reporte_por_metodo(''2000-01-01'', ''2001-01-01'')',
    'select * from public.reporte_sin_movimiento(''2000-01-01'', ''2001-01-01'')'
  ];
begin
  foreach v_sql in array v_casos loop
    begin
      execute v_sql;
      raise exception '5. Se aceptó un rango inválido: %', v_sql;
    exception when sqlstate 'LT422' then null;
    end;
  end loop;
  -- 366 días exactos sí.
  perform * from public.reporte_resumen('2000-01-01', '2000-12-31');
  raise notice '✔ 5. Rangos al revés, vacíos o de más de 366 días: LT422';
end $$;

-- 6. Cancelar guarda quién canceló.
do $$
declare
  v public.ventas;
begin
  v := public.cancelar_venta(current_setting('pruebas.venta7')::uuid, '  El cliente lo devolvió  ');
  assert v.estado = 'cancelada' and v.cancelada_por = current_setting('pruebas.dueno')::uuid
     and v.motivo_cancelacion = 'El cliente lo devolvió' and v.cancelada_en is not null,
    format('6. cancelar_venta no guardó quién, cuándo o por qué: %s', row_to_json(v));
  raise notice '✔ 6. cancelar_venta guarda quién canceló';
end $$;

reset role;

-- 7. El CHECK (como postgres): toda cancelada tiene quién, y una completada no.
do $$
begin
  assert (select convalidated from pg_constraint
          where conname = 'ventas_cancelada_por' and conrelid = 'public.ventas'::regclass),
    '7. El CHECK ventas_cancelada_por no existe o quedó NOT VALID';
  assert not exists (select 1 from public.ventas where estado = 'cancelada' and cancelada_por is null),
    '7. Hay ventas canceladas sin quién canceló';
  assert exists (select 1 from public.ventas where estado = 'cancelada'
                 and (creado_en at time zone 'America/Monterrey')::date >= current_date - 40),
    '7. La semilla no tiene su venta cancelada';
  begin
    update public.ventas set estado = 'cancelada', motivo_cancelacion = 'x', cancelada_en = now()
    where id = current_setting('pruebas.venta6')::uuid;
    raise exception '7. Se canceló una venta sin cancelada_por';
  exception when check_violation then null;
  end;
  begin
    update public.ventas set cancelada_por = current_setting('pruebas.dueno')::uuid
    where id = current_setting('pruebas.venta6')::uuid;
    raise exception '7. Una venta completada tiene cancelada_por';
  exception when check_violation then null;
  end;
  raise notice '✔ 7. CHECK validado: cancelada ⇔ con quién canceló';
end $$;

-- 8. Catálogo: SECURITY DEFINER con search_path fijo; auxiliares cerradas.
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.reporte_resumen(date, date)', 'public.reporte_ventas_por_periodo(date, date)',
    'public.reporte_por_categoria(date, date)', 'public.reporte_por_metodo(date, date)',
    'public.reporte_sin_movimiento(date, date, integer)', 'public.cancelar_venta(uuid, text)'
  ] loop
    assert (select p.prosecdef and p.proconfig @> array['search_path=""']
            from pg_proc p where p.oid = v_fn::regprocedure),
      format('8. %s no es SECURITY DEFINER con search_path vacío', v_fn);
    assert not has_function_privilege('anon', v_fn, 'execute'),
      format('8. anon puede ejecutar %s', v_fn);
  end loop;
  assert not has_function_privilege('authenticated', 'privado.rango_reporte(date, date)', 'execute')
     and not has_function_privilege('authenticated', 'privado.agrupacion_reporte(date, date)', 'execute')
     and not has_function_privilege('anon', 'privado.rango_reporte(date, date)', 'execute'),
    '8. La API puede ejecutar las auxiliares de privado';
  raise notice '✔ 8. Funciones SECURITY DEFINER con search_path vacío; sin permiso para anon ni a las auxiliares';
end $$;

-- =============================================================================
-- Como CAJERO: nada de Reportes ni cancelar.
-- =============================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.cajero'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_sql   text;
  v_casos text[] := array[
    'select * from public.reporte_resumen(''2000-01-01'', ''2000-01-31'')',
    'select * from public.reporte_ventas_por_periodo(''2000-01-01'', ''2000-01-31'')',
    'select * from public.reporte_por_categoria(''2000-01-01'', ''2000-01-31'')',
    'select * from public.reporte_por_metodo(''2000-01-01'', ''2000-01-31'')',
    'select * from public.reporte_sin_movimiento(''2000-01-01'', ''2000-01-31'')',
    format('select public.cancelar_venta(%L, ''motivo'')', current_setting('pruebas.venta2'))
  ];
begin
  foreach v_sql in array v_casos loop
    begin
      execute v_sql;
      raise exception '9. El cajero pudo ejecutar: %', v_sql;
    exception when sqlstate 'LT403' then null;
    end;
  end loop;
  -- Ni con un rango inválido se le contesta otra cosa que LT403 (el rol va primero).
  begin
    perform * from public.reporte_resumen('2000-01-02', '2000-01-01');
    raise exception '9. El cajero recibió algo con un rango inválido';
  exception when sqlstate 'LT403' then null;
  end;
  raise notice '✔ 9. Cajero: Reportes y cancelar en LT403';
end $$;

-- =============================================================================
-- Como ANON
-- =============================================================================
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

do $$
declare
  v_sql   text;
  v_casos text[] := array[
    'select * from public.reporte_resumen(''2000-01-01'', ''2000-01-31'')',
    'select * from public.reporte_ventas_por_periodo(''2000-01-01'', ''2000-01-31'')',
    'select * from public.reporte_por_categoria(''2000-01-01'', ''2000-01-31'')',
    'select * from public.reporte_por_metodo(''2000-01-01'', ''2000-01-31'')',
    'select * from public.reporte_sin_movimiento(''2000-01-01'', ''2000-01-31'')'
  ];
begin
  foreach v_sql in array v_casos loop
    begin
      execute v_sql;
      raise exception '10. anon pudo ejecutar: %', v_sql;
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice '✔ 10. anon: sin permiso (42501)';
end $$;

reset role;
rollback;
