-- =============================================================================
-- 17-pruebas-inicio.sql — Indicadores de Inicio
-- Requiere: 01 a 16 (con la semilla cargada).
--
-- Todo dentro de BEGIN … ROLLBACK: no deja cambios.
-- "Success" en el SQL Editor = pasaron todas. Si una falla, el error dice cuál.
--
-- Las pruebas de montos usan ventas propias en enero de 2000 (lejos de la
-- semilla), con importes y costos conocidos, para poder comparar contra
-- números exactos. Las de consistencia comparan contra la semilla real.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Contexto y ventas de prueba (como postgres)
--
--   Monterrey   Usuario  Estado      Total   Costo   Ganancia
--   09 23:59:59 cajero   completada   11.00    5.00     6.00   ← día anterior
--   10 10:00    cajero   completada   50.00   20.25    29.75   (ELE-001 × 2.5)
--   10 12:00    dueño    cancelada  1000.00    1.00       —    ← no cuenta
--   10 23:59    dueño    completada  100.00   60.00    40.00   (HER-004 × 1)
--   11 00:00    dueño    completada    7.00    3.00     4.00   ← día siguiente
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

do $$
declare
  v_dueno  uuid;
  v_cajero uuid;
  v_p1     uuid;
  v_p2     uuid;
  v_id     uuid;
  r        record;
begin
  if current_setting('pruebas.dueno') = '' or current_setting('pruebas.cajero') = '' then
    raise exception '0. Faltan los usuarios demo. Revisa los correos o corre 07.';
  end if;
  if current_setting('pruebas.p1') = '' or current_setting('pruebas.p2') = '' then
    raise exception '0. Faltan HER-004 o ELE-001. Corre 07 primero.';
  end if;
  if exists (select 1 from public.ventas
             where creado_en >= '2000-01-01' and creado_en < '2000-02-01') then
    raise exception '0. Ya hay ventas en enero de 2000; las pruebas necesitan ese mes vacío.';
  end if;

  v_dueno  := current_setting('pruebas.dueno')::uuid;
  v_cajero := current_setting('pruebas.cajero')::uuid;
  v_p1     := current_setting('pruebas.p1')::uuid;
  v_p2     := current_setting('pruebas.p2')::uuid;

  for r in
    select * from (values
      (timestamp '2000-01-09 23:59:59', v_cajero, 'completada',   11.00, v_p2, 1.0,    11.00,  5.00),
      (timestamp '2000-01-10 10:00',    v_cajero, 'completada',   50.00, v_p2, 2.5,    20.00,  8.10),
      (timestamp '2000-01-10 12:00',    v_dueno,  'cancelada',  1000.00, v_p1, 1.0,  1000.00,  1.00),
      (timestamp '2000-01-10 23:59',    v_dueno,  'completada',  100.00, v_p1, 1.0,   100.00, 60.00),
      (timestamp '2000-01-11 00:00',    v_dueno,  'completada',    7.00, v_p1, 1.0,     7.00,  3.00)
    ) t(local_ts, usuario, estado, total, producto, cantidad, precio, costo)
  loop
    insert into public.ventas
      (subtotal, total, metodo_pago, pago_recibido, cambio, usuario_id, creado_en,
       estado, motivo_cancelacion, cancelada_en)
    values
      (r.total, r.total, 'tarjeta', r.total, 0, r.usuario,
       r.local_ts at time zone 'America/Monterrey',
       r.estado,
       case when r.estado = 'cancelada' then 'Prueba' end,
       case when r.estado = 'cancelada' then (r.local_ts at time zone 'America/Monterrey') + interval '5 minutes' end)
    returning id into v_id;

    insert into public.venta_detalle
      (venta_id, producto_id, nombre_producto, unidad, cantidad, precio_unitario, costo_unitario, importe)
    select v_id, p.id, p.nombre, p.unidad, r.cantidad, r.precio, r.costo, r.total
    from public.productos p
    where p.id = r.producto;
  end loop;

  raise notice '✔ 0. Contexto listo y 5 ventas de prueba en enero de 2000';
end $$;

-- Valores esperados contra la semilla, calculados aquí como postgres (sin RLS).
select
  set_config('pruebas.esperado_30d', (
    select coalesce(sum(v.total), 0)::text
    from public.ventas v
    where v.estado = 'completada'
      and v.creado_en >= (((now() at time zone 'America/Monterrey')::date - 29)::timestamp
                          at time zone 'America/Monterrey')
  ), true),
  set_config('pruebas.esperado_ganancia_30d', (
    -- Desde las tablas (la vista v_ventas_por_dia se quitó en 20).
    select coalesce(sum(v.total - c.costo), 0)::text
    from public.ventas v
    join (select d.venta_id, round(sum(d.cantidad * d.costo_unitario), 2) as costo
          from public.venta_detalle d group by d.venta_id) c on c.venta_id = v.id
    where v.estado = 'completada'
      and v.creado_en >= (((now() at time zone 'America/Monterrey')::date - 29)::timestamp
                          at time zone 'America/Monterrey')
  ), true),
  set_config('pruebas.esperado_cajero_30d', (
    select coalesce(sum(v.total), 0)::text
    from public.ventas v
    where v.estado = 'completada'
      and v.usuario_id = current_setting('pruebas.cajero')::uuid
      and v.creado_en >= (((now() at time zone 'America/Monterrey')::date - 29)::timestamp
                          at time zone 'America/Monterrey')
  ), true),
  set_config('pruebas.esperado_valor', (
    select coalesce(round(sum(p.stock * p.costo), 2), 0)::text
    from public.productos p
    where p.activo
  ), true);

-- =============================================================================
-- Como DUEÑO
-- =============================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.dueno'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- 1. Resumen del día 10: dos ventas, la cancelada no cuenta y las de los
--    días 9 y 11 (en el borde de la medianoche de Monterrey) tampoco.
do $$
declare r record;
begin
  select * into r from public.resumen_ventas(
    timestamp '2000-01-10 00:00' at time zone 'America/Monterrey',
    timestamp '2000-01-11 00:00' at time zone 'America/Monterrey');
  assert r.num_ventas = 2, format('1. Se esperaban 2 ventas, salieron %s', r.num_ventas);
  assert r.ventas = 150.00, format('1. Se esperaban $150.00, salieron %s', r.ventas);
  assert r.ganancia = 69.75, format('1. Se esperaba ganancia 69.75, salió %s', r.ganancia);
  raise notice '✔ 1. Día completo: 2 ventas, $150.00, ganancia $69.75 (sin la cancelada ni los bordes)';
end $$;

-- 2. "Hasta la misma hora": del 10 a las 00:00 al 10 a las 12:00 solo entra
--    la de las 10:00.
do $$
declare r record;
begin
  select * into r from public.resumen_ventas(
    timestamp '2000-01-10 00:00' at time zone 'America/Monterrey',
    timestamp '2000-01-10 12:00' at time zone 'America/Monterrey');
  assert r.num_ventas = 1 and r.ventas = 50.00 and r.ganancia = 29.75,
    format('2. Hasta las 12:00 se esperaba 1 venta de $50.00 (29.75), salió %s', r);
  raise notice '✔ 2. Rango hasta una hora: 1 venta, $50.00';
end $$;

-- 3. Rango sin ventas: ceros, no nulls.
do $$
declare r record;
begin
  select * into r from public.resumen_ventas('2000-01-20 00:00-06', '2000-01-21 00:00-06');
  assert r.num_ventas = 0 and r.ventas = 0 and r.ganancia = 0,
    format('3. Sin ventas se esperaban ceros, salió %s', r);
  raise notice '✔ 3. Rango vacío: 0, $0.00, $0.00';
end $$;

-- 4. Gráfica: un renglón por día, con los días vacíos en 0.
do $$
declare
  v_filas jsonb;
begin
  select jsonb_agg(jsonb_build_array(d.dia, d.num_ventas, d.ventas, d.ganancia) order by d.dia)
  into v_filas
  from public.ventas_por_dia('2000-01-08', '2000-01-12') d;

  assert v_filas = '[
    ["2000-01-08", 0, 0.00, 0.00],
    ["2000-01-09", 1, 11.00, 6.00],
    ["2000-01-10", 2, 150.00, 69.75],
    ["2000-01-11", 1, 7.00, 4.00],
    ["2000-01-12", 0, 0.00, 0.00]
  ]'::jsonb, format('4. Serie inesperada: %s', v_filas);
  raise notice '✔ 4. Serie de 5 días con huecos en 0 y bordes de medianoche correctos';
end $$;

-- 5. Consistencia con la semilla: los últimos 30 días suman lo mismo que un
--    cálculo independiente y que v_ventas_por_dia.
do $$
declare
  v_hoy   date := (now() at time zone 'America/Monterrey')::date;
  v_total numeric;
  v_gan   numeric;
  v_dias  int;
begin
  select sum(d.ventas), sum(d.ganancia), count(*)
  into v_total, v_gan, v_dias
  from public.ventas_por_dia(v_hoy - 29, v_hoy) d;

  assert v_dias = 30, format('5. Se esperaban 30 días, salieron %s', v_dias);
  assert v_total = current_setting('pruebas.esperado_30d')::numeric,
    format('5. Total de 30 días %s ≠ %s', v_total, current_setting('pruebas.esperado_30d'));
  assert v_gan = current_setting('pruebas.esperado_ganancia_30d')::numeric,
    format('5. Ganancia de 30 días %s ≠ %s', v_gan, current_setting('pruebas.esperado_ganancia_30d'));
  raise notice '✔ 5. 30 días de la semilla: $% vendidos, $% de ganancia', v_total, v_gan;
end $$;

-- 6. Valor del inventario a costo.
do $$
declare r record;
begin
  select * into r from public.valor_inventario();
  assert r.valor = current_setting('pruebas.esperado_valor')::numeric,
    format('6. Valor %s ≠ %s', r.valor, current_setting('pruebas.esperado_valor'));
  assert r.productos = (select count(*) from public.productos where activo),
    '6. El número de productos activos no cuadra';
  raise notice '✔ 6. Inventario a costo: $% en % productos', r.valor, r.productos;
end $$;

-- 7. Top del periodo ordenado por importe, no por cantidad: ELE-001 lleva más
--    cantidad (2.5 m) pero HER-004 más importe ($100).
do $$
declare v_codigos text[];
begin
  select array_agg(m.codigo order by m.importe desc)
  into v_codigos
  from public.mas_vendidos('2000-01-10', '2000-01-10', 5) m;
  assert v_codigos = array['HER-004', 'ELE-001'],
    format('7. Orden inesperado: %s', v_codigos);
  assert (select m.codigo from public.mas_vendidos('2000-01-10', '2000-01-10', 5) m limit 1) = 'HER-004',
    '7. mas_vendidos no regresa primero el de mayor importe';
  raise notice '✔ 7. Más vendidos por importe: HER-004 ($100) antes que ELE-001 (2.5 m, $50)';
end $$;

-- 8. Rangos inválidos → LT422.
do $$
declare
  v_casos text[] := array[
    'select * from public.resumen_ventas(''2000-01-10 00:00-06'', ''2000-01-10 00:00-06'')',
    'select * from public.resumen_ventas(''2000-01-11 00:00-06'', ''2000-01-10 00:00-06'')',
    'select * from public.resumen_ventas(null, ''2000-01-10 00:00-06'')',
    'select * from public.resumen_ventas(''2000-01-01 00:00-06'', ''2000-04-10 00:00-06'')',
    'select * from public.ventas_por_dia(''2000-01-12'', ''2000-01-10'')',
    'select * from public.ventas_por_dia(null, ''2000-01-10'')',
    'select * from public.ventas_por_dia(''2000-01-01'', ''2000-04-02'')'
  ];
  v_sql text;
begin
  foreach v_sql in array v_casos loop
    begin
      execute v_sql;
      raise exception '8. No rechazó: %', v_sql;
    exception when sqlstate 'LT422' then null;
    end;
  end loop;
  -- 92 días sí se permiten.
  assert (select count(*) from public.ventas_por_dia('2000-01-01', '2000-04-01')) = 92,
    '8. Un rango de 92 días debería permitirse';
  raise notice '✔ 8. Rangos inválidos rechazados (LT422); 92 días permitidos';
end $$;

-- =============================================================================
-- Como CAJERO
-- =============================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.cajero'), 'role', 'authenticated')::text, true);

-- 9. Resumen del cajero: solo sus ventas y sin ganancia.
do $$
declare
  r     record;
  v_hoy date := (now() at time zone 'America/Monterrey')::date;
begin
  select * into r from public.resumen_ventas(
    timestamp '2000-01-10 00:00' at time zone 'America/Monterrey',
    timestamp '2000-01-11 00:00' at time zone 'America/Monterrey');
  assert r.num_ventas = 1 and r.ventas = 50.00,
    format('9. El cajero debía ver solo su venta de $50.00, vio %s', r);
  assert r.ganancia is null, format('9. El cajero recibió ganancia: %s', r.ganancia);

  select * into r from public.resumen_ventas(
    (v_hoy - 29)::timestamp at time zone 'America/Monterrey',
    (v_hoy + 1)::timestamp at time zone 'America/Monterrey');
  assert r.ventas = current_setting('pruebas.esperado_cajero_30d')::numeric,
    format('9. 30 días del cajero %s ≠ %s', r.ventas, current_setting('pruebas.esperado_cajero_30d'));
  assert r.ganancia is null, '9. El cajero recibió ganancia en 30 días';
  raise notice '✔ 9. Cajero: solo sus ventas ($50.00 el día 10; $% en 30 días), ganancia null', r.ventas;
end $$;

-- 10. Gráfica y valor del inventario: solo dueño → LT403.
do $$
begin
  begin
    perform * from public.ventas_por_dia('2000-01-08', '2000-01-12');
    raise exception '10. El cajero pudo leer ventas_por_dia';
  exception when sqlstate 'LT403' then null;
  end;
  begin
    perform * from public.valor_inventario();
    raise exception '10. El cajero pudo leer valor_inventario';
  exception when sqlstate 'LT403' then null;
  end;
  raise notice '✔ 10. Cajero: ventas_por_dia y valor_inventario rechazados (LT403)';
end $$;

-- 11. Cajero desactivado → LT401 en resumen_ventas.
reset role;
update public.perfiles set activo = false where id = current_setting('pruebas.cajero')::uuid;
set local role authenticated;

do $$
begin
  begin
    perform * from public.resumen_ventas('2000-01-10 00:00-06', '2000-01-11 00:00-06');
    raise exception '11. Un usuario inactivo pudo leer resumen_ventas';
  exception when sqlstate 'LT401' then null;
  end;
  raise notice '✔ 11. Usuario inactivo rechazado (LT401)';
end $$;

-- =============================================================================
-- Como ANON
-- =============================================================================
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

-- 12. anon no puede ejecutar ninguna de las tres → 42501.
do $$
declare
  v_casos text[] := array[
    'select * from public.resumen_ventas(''2000-01-10 00:00-06'', ''2000-01-11 00:00-06'')',
    'select * from public.ventas_por_dia(''2000-01-08'', ''2000-01-12'')',
    'select * from public.valor_inventario()'
  ];
  v_sql text;
begin
  foreach v_sql in array v_casos loop
    begin
      execute v_sql;
      raise exception '12. anon pudo ejecutar: %', v_sql;
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice '✔ 12. anon sin permiso de ejecutar (42501)';
end $$;

reset role;
rollback;
