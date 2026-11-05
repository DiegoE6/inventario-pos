-- =============================================================================
-- 07-semilla.sql — Datos de demostración
-- Requiere: 01 a 06, y los dos usuarios creados en Authentication > Users.
--
-- ⚠️  BORRA Y VUELVE A CARGAR todos los datos del negocio: productos,
--     catálogos, ventas y movimientos. No borra usuarios. Solo para la base
--     de demo.
--
-- Crea privado.cargar_semilla() y la ejecuta. En la Fase 6, reset_demo()
-- solo tendrá que llamarla.
--
-- Qué carga:
--   - Configuración de "Ferretería La Tuerca".
--   - Perfiles: upsert de demo (dueño) y cajero (cajero), ambos activos.
--     Upsert porque los usuarios pueden existir desde antes del trigger de 02.
--   - 6 categorías, 5 proveedores, 40 productos.
--   - Ventas de los últimos 30 días + las de hoy hasta la hora actual, con más
--     movimiento en sábado. Una venta de hace 3 días queda cancelada.
--   - Movimientos: una entrada inicial por producto (hace 31 días) y un
--     movimiento por cada venta y cancelación, con stock anterior/nuevo.
--   - 7 productos terminan por debajo de su mínimo (para la alerta).
--
-- Cuadre del stock: el stock final de cada producto está fijado abajo
-- (columna stock_final). La entrada inicial se calcula hacia atrás:
-- stock_final + todo lo vendido. Así el stock nunca baja de stock_final.
-- Los productos de la venta cancelada terminan con stock_final + lo que se
-- regresó.
--
-- Se usa setseed: el mismo día genera los mismos datos. Las cantidades de
-- ventas cambian según el día de la semana en que se corra.
-- =============================================================================

create or replace function privado.cargar_semilla(
  p_correo_dueno  text default 'demo@latuerca.test',
  p_correo_cajero text default 'cajero@latuerca.test'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dueno    uuid;
  v_cajero   uuid;
  v_hoy      date := (now() at time zone 'America/Monterrey')::date;
  v_inicio   timestamptz;
  v_dia      date;
  v_hora     time;
  v_ts       timestamptz;
  v_n        int;
  v_renglones int;
  v_ids      uuid[];
  v_cants    numeric[];
  v_total    numeric(12,2);
  v_pago     numeric(12,2);
  v_metodo   text;
  v_usuario  uuid;
  v_venta_id uuid;
  v_cancelar record;
  r          double precision;
begin
  -- 1. Usuarios -------------------------------------------------------------
  select u.id into v_dueno  from auth.users u where lower(u.email) = lower(p_correo_dueno);
  select u.id into v_cajero from auth.users u where lower(u.email) = lower(p_correo_cajero);

  if v_dueno is null or v_cajero is null then
    raise exception
      'Faltan usuarios demo. Crea % y % en Authentication > Users (con Auto Confirm) y vuelve a correr este script.',
      p_correo_dueno, p_correo_cajero;
  end if;

  insert into public.perfiles (id, nombre, rol, activo)
  values (v_dueno,  'Dueño (demo)',  'dueno',  true),
         (v_cajero, 'Cajero (demo)', 'cajero', true)
  on conflict (id) do update
    set nombre = excluded.nombre,
        rol    = excluded.rol,
        activo = excluded.activo;

  -- 2. Limpiar datos del negocio --------------------------------------------
  truncate table
    public.movimientos_inventario,
    public.venta_detalle,
    public.ventas,
    public.productos,
    public.categorias,
    public.proveedores
  restart identity;

  perform setseed(0.42);
  v_inicio := ((v_hoy - 31) + time '08:00') at time zone 'America/Monterrey';

  -- 3. Configuración ----------------------------------------------------------
  insert into public.configuracion_negocio (id, nombre, giro, logo_url, color_primario, telefono, direccion)
  values (1, 'Ferretería La Tuerca', 'Ferretería', null, '#c2410c',
          '81 0000 0000', 'Av. Ejemplo 123, Col. Centro, Monterrey, N.L.')
  on conflict (id) do update
    set nombre = excluded.nombre,
        giro = excluded.giro,
        logo_url = excluded.logo_url,
        color_primario = excluded.color_primario,
        telefono = excluded.telefono,
        direccion = excluded.direccion;

  -- 4. Catálogos ----------------------------------------------------------------
  insert into public.categorias (nombre)
  values ('Tornillería'), ('Herramienta'), ('Eléctrico'),
         ('Plomería'), ('Pintura'), ('Jardín');

  insert into public.proveedores (nombre, contacto, telefono, notas)
  values
    ('Tornillos y Fijaciones del Norte', 'Laura Méndez',  '81 0000 0101', 'Entrega martes y viernes'),
    ('Distribuidora Ferretera Regia',    'Jorge Salinas', '81 0000 0102', 'Crédito a 15 días'),
    ('Eléctrica Industrial Monterrey',   'Ana Treviño',   '81 0000 0103', null),
    ('Hidráulica Santa Catarina',        'Raúl Garza',    '81 0000 0104', 'Pedido mínimo $1,500'),
    ('Pinturas y Recubrimientos del Valle', 'Sofía Cantú', '81 0000 0105', null);

  -- 5. Productos ------------------------------------------------------------------
  -- peso: qué tan seguido se vende (1 = poco, 10 = mucho).
  drop table if exists pg_temp.semilla_productos;
  create temp table semilla_productos (
    codigo       text primary key,
    nombre       text,
    categoria    text,
    proveedor    text,
    unidad       text,
    costo        numeric(12,2),
    precio       numeric(12,2),
    stock_minimo numeric(12,3),
    stock_final  numeric(12,3),
    peso         int
  ) on commit drop;

  insert into pg_temp.semilla_productos
    (codigo, nombre, categoria, proveedor, unidad, costo, precio, stock_minimo, stock_final, peso)
  values
    -- Tornillería
    ('TOR-001', 'Tornillo para madera 1" (caja con 100)',      'Tornillería', 'Tornillos y Fijaciones del Norte', 'caja',  38.00,  65.00,   5,  14, 4),
    ('TOR-002', 'Tornillo para tablaroca 1 1/4" (caja con 100)','Tornillería', 'Tornillos y Fijaciones del Norte', 'caja',  45.00,  79.00,   5,   3, 4),
    ('TOR-003', 'Taquete de plástico 1/4"',                     'Tornillería', 'Tornillos y Fijaciones del Norte', 'pieza',  0.60,   1.50, 200, 640, 6),
    ('TOR-004', 'Clavo estándar 2 1/2"',                         'Tornillería', 'Tornillos y Fijaciones del Norte', 'kilo',  32.00,  55.00,  10, 26.5, 5),
    ('TOR-005', 'Pija autorroscante 8 x 1"',                     'Tornillería', 'Tornillos y Fijaciones del Norte', 'pieza',  0.80,   2.00, 150, 420, 6),
    ('TOR-006', 'Tuerca hexagonal 3/8"',                         'Tornillería', 'Tornillos y Fijaciones del Norte', 'pieza',  1.20,   3.00, 100,  85, 5),
    ('TOR-007', 'Rondana plana 3/8"',                            'Tornillería', 'Tornillos y Fijaciones del Norte', 'pieza',  0.50,   1.50, 100, 310, 4),
    -- Herramienta
    ('HER-001', 'Martillo de uña 16 oz',                         'Herramienta', 'Distribuidora Ferretera Regia',    'pieza', 95.00, 159.00,   4,   9, 3),
    ('HER-002', 'Desarmador de cruz #2',                         'Herramienta', 'Distribuidora Ferretera Regia',    'pieza', 38.00,  69.00,   6,  15, 4),
    ('HER-003', 'Pinzas de electricista 8"',                     'Herramienta', 'Distribuidora Ferretera Regia',    'pieza',120.00, 199.00,   4,   2, 2),
    ('HER-004', 'Flexómetro 5 m',                                'Herramienta', 'Distribuidora Ferretera Regia',    'pieza', 65.00, 115.00,   6,  18, 4),
    ('HER-005', 'Juego de llaves Allen 9 piezas',                'Herramienta', 'Distribuidora Ferretera Regia',    'pieza', 85.00, 149.00,   3,   7, 2),
    ('HER-006', 'Nivel de aluminio 24"',                         'Herramienta', 'Distribuidora Ferretera Regia',    'pieza',110.00, 189.00,   3,   5, 1),
    ('HER-007', 'Segueta 12"',                                   'Herramienta', 'Distribuidora Ferretera Regia',    'pieza', 22.00,  39.00,  10,  31, 3),
    -- Eléctrico
    ('ELE-001', 'Cable THW calibre 12',                          'Eléctrico',   'Eléctrica Industrial Monterrey',   'metro',  9.50,  16.00,  50, 182, 7),
    ('ELE-002', 'Cable THW calibre 14',                          'Eléctrico',   'Eléctrica Industrial Monterrey',   'metro',  7.00,  12.50,  50,  38, 6),
    ('ELE-003', 'Foco LED 9 W luz blanca',                       'Eléctrico',   'Eléctrica Industrial Monterrey',   'pieza', 28.00,  49.00,  20,  64, 8),
    ('ELE-004', 'Apagador sencillo',                             'Eléctrico',   'Eléctrica Industrial Monterrey',   'pieza', 22.00,  39.00,  10,  27, 4),
    ('ELE-005', 'Contacto doble polarizado',                     'Eléctrico',   'Eléctrica Industrial Monterrey',   'pieza', 30.00,  52.00,  10,  22, 4),
    ('ELE-006', 'Cinta de aislar negra',                         'Eléctrico',   'Eléctrica Industrial Monterrey',   'pieza', 12.00,  22.00,  25,  75, 8),
    ('ELE-007', 'Extensión de uso rudo 3 m',                     'Eléctrico',   'Eléctrica Industrial Monterrey',   'pieza', 75.00, 129.00,   5,  11, 3),
    -- Plomería
    ('PLO-001', 'Tubo de cobre 1/2"',                            'Plomería',    'Hidráulica Santa Catarina',        'metro', 85.00, 135.00,  12,  40, 3),
    ('PLO-002', 'Codo de cobre 1/2" x 90°',                      'Plomería',    'Hidráulica Santa Catarina',        'pieza',  9.00,  16.00,  30, 112, 5),
    ('PLO-003', 'Llave de paso 1/2"',                            'Plomería',    'Hidráulica Santa Catarina',        'pieza', 95.00, 165.00,   5,   4, 2),
    ('PLO-004', 'Cinta teflón 1/2"',                             'Plomería',    'Hidráulica Santa Catarina',        'pieza',  7.00,  15.00,  30,  88, 7),
    ('PLO-005', 'Manguera flexible para lavabo 40 cm',           'Plomería',    'Hidráulica Santa Catarina',        'pieza', 45.00,  79.00,   6,  14, 3),
    ('PLO-006', 'Pegamento para PVC 125 ml',                     'Plomería',    'Hidráulica Santa Catarina',        'pieza', 48.00,  85.00,   6,  17, 3),
    ('PLO-007', 'Tubo PVC hidráulico 1/2"',                      'Plomería',    'Hidráulica Santa Catarina',        'metro', 12.00,  22.00,  30,  96, 5),
    -- Pintura
    ('PIN-001', 'Pintura vinílica blanca',                       'Pintura',     'Pinturas y Recubrimientos del Valle', 'litro', 58.00,  95.00, 20,  66, 6),
    ('PIN-002', 'Esmalte alquidálico negro',                     'Pintura',     'Pinturas y Recubrimientos del Valle', 'litro', 95.00, 155.00,  8,   6, 3),
    ('PIN-003', 'Thinner estándar',                              'Pintura',     'Pinturas y Recubrimientos del Valle', 'litro', 28.00,  48.00, 15,  52, 4),
    ('PIN-004', 'Brocha de 3"',                                  'Pintura',     'Pinturas y Recubrimientos del Valle', 'pieza', 32.00,  55.00,  8,  23, 4),
    ('PIN-005', 'Rodillo de felpa 9"',                           'Pintura',     'Pinturas y Recubrimientos del Valle', 'pieza', 55.00,  95.00,  5,  12, 3),
    ('PIN-006', 'Lija de agua grano 220',                        'Pintura',     'Pinturas y Recubrimientos del Valle', 'pieza',  6.00,  12.00, 40, 135, 6),
    -- Jardín
    ('JAR-001', 'Manguera de jardín reforzada',                  'Jardín',      'Distribuidora Ferretera Regia',    'metro', 14.00,  25.00,  30, 120, 4),
    ('JAR-002', 'Pala cuadrada con mango de madera',             'Jardín',      'Distribuidora Ferretera Regia',    'pieza',180.00, 289.00,   3,   6, 1),
    ('JAR-003', 'Tijera para podar',                             'Jardín',      'Distribuidora Ferretera Regia',    'pieza', 95.00, 165.00,   3,   1, 2),
    ('JAR-004', 'Tierra preparada para maceta',                  'Jardín',      'Distribuidora Ferretera Regia',    'kilo',   9.00,  18.00,  25,  70, 3),
    ('JAR-005', 'Aspersor de impacto',                           'Jardín',      'Distribuidora Ferretera Regia',    'pieza',120.00, 199.00,   4,   9, 1),
    ('JAR-006', 'Fertilizante triple 17',                        'Jardín',      'Distribuidora Ferretera Regia',    'kilo',  22.00,  38.00,  10, 28.5, 2);

  -- stock = 0: el stock real se escribe al final, a partir de los movimientos.
  insert into public.productos
    (codigo, nombre, categoria_id, proveedor_id, unidad, costo, precio, stock_minimo, creado_en)
  select s.codigo, s.nombre, c.id, pr.id, s.unidad, s.costo, s.precio, s.stock_minimo,
         v_inicio - interval '1 hour'
  from pg_temp.semilla_productos s
  join public.categorias c on c.nombre = s.categoria
  join public.proveedores pr on pr.nombre = s.proveedor
  order by s.codigo;

  -- 6. Ventas ----------------------------------------------------------------------
  -- Eventos de stock (ventas y cancelación); al final se convierten en
  -- movimientos con su stock anterior/nuevo.
  drop table if exists pg_temp.semilla_eventos;
  create temp table semilla_eventos (
    seq         bigint generated always as identity,
    producto_id uuid,
    creado_en   timestamptz,
    tipo        text,
    cantidad    numeric(12,3),
    costo       numeric(12,2),
    venta_id    uuid,
    nota        text,
    usuario_id  uuid
  ) on commit drop;

  for v_dia in
    select d::date
    from generate_series((v_hoy - 30)::timestamp, v_hoy::timestamp, interval '1 day') d
  loop
    -- Sábado es el día fuerte; domingo medio día.
    v_n := case extract(isodow from v_dia)
             when 6 then 14 + floor(random() * 5)::int
             when 7 then  5 + floor(random() * 4)::int
             else         7 + floor(random() * 5)::int
           end;

    for v_hora in
      select t.h
      from (
        select time '08:30' + random() * interval '10 hours 30 minutes' as h
        from generate_series(1, v_n)
      ) t
      order by t.h
    loop
      v_ts := (v_dia + v_hora) at time zone 'America/Monterrey';
      exit when v_ts > now();  -- hoy: solo hasta la hora actual

      v_usuario := case when random() < 0.7 then v_cajero else v_dueno end;

      r := random();
      v_metodo := case when r < 0.6 then 'efectivo'
                       when r < 0.9 then 'tarjeta'
                       else 'transferencia' end;

      r := random();
      v_renglones := case when r < 0.45 then 1 when r < 0.75 then 2
                          when r < 0.90 then 3 else 4 end;

      -- Productos distintos, elegidos con peso (muestreo ponderado).
      select array_agg(x.id order by x.id), array_agg(x.cantidad order by x.id)
      into v_ids, v_cants
      from (
        select p.id,
               case
                 when p.unidad = 'caja'  then case when random() < 0.85 then 1 else 2 end
                 when p.unidad = 'pieza' and p.precio < 5 then 5 * (1 + floor(random() * 6))
                 when p.unidad = 'pieza' and p.precio < 60 then 1 + floor(random() * 4)
                 when p.unidad = 'pieza' then 1 + floor(random() * 2)
                 when p.unidad = 'metro' then round((1 + random() * 9)::numeric * 2) / 2
                 when p.unidad = 'kilo'  then round((0.25 + random() * 2.75)::numeric * 4) / 4
                 else 1 + floor(random() * 4)  -- litro
               end::numeric(12,3) as cantidad
        from public.productos p
        join pg_temp.semilla_productos s on s.codigo = p.codigo
        order by -ln(1 - random()) / s.peso
        limit v_renglones
      ) x;

      select sum(round(x.cantidad * p.precio, 2)) into v_total
      from unnest(v_ids, v_cants) x(producto_id, cantidad)
      join public.productos p on p.id = x.producto_id;

      if v_metodo = 'efectivo' then
        r := random();
        v_pago := case
          when r < 0.35 then v_total
          when r < 0.70 then ceil(v_total / 50) * 50
          else coalesce(
            (select min(b) from unnest(array[100, 200, 500, 1000]) b where b >= v_total),
            ceil(v_total / 500) * 500)
        end;
      else
        v_pago := v_total;
      end if;

      insert into public.ventas
        (subtotal, total, metodo_pago, pago_recibido, cambio, usuario_id, creado_en)
      values
        (v_total, v_total, v_metodo, v_pago, v_pago - v_total, v_usuario, v_ts)
      returning id into v_venta_id;

      insert into public.venta_detalle
        (venta_id, producto_id, nombre_producto, unidad, cantidad,
         precio_unitario, costo_unitario, importe)
      select v_venta_id, p.id, p.nombre, p.unidad, x.cantidad,
             p.precio, p.costo, round(x.cantidad * p.precio, 2)
      from unnest(v_ids, v_cants) x(producto_id, cantidad)
      join public.productos p on p.id = x.producto_id;

      insert into pg_temp.semilla_eventos
        (producto_id, creado_en, tipo, cantidad, costo, venta_id, nota, usuario_id)
      select x.producto_id, v_ts, 'venta', -x.cantidad, p.costo, v_venta_id, null, v_usuario
      from unnest(v_ids, v_cants) x(producto_id, cantidad)
      join public.productos p on p.id = x.producto_id;
    end loop;
  end loop;

  -- 7. Una venta cancelada (hace 3 días, sin productos de stock bajo) ------------
  select v.id, v.creado_en into v_cancelar
  from public.ventas v
  where (v.creado_en at time zone 'America/Monterrey')::date = v_hoy - 3
    and not exists (
      select 1
      from public.venta_detalle d
      join public.productos p on p.id = d.producto_id
      join pg_temp.semilla_productos s on s.codigo = p.codigo
      where d.venta_id = v.id
        and s.stock_final <= s.stock_minimo
    )
  order by v.folio
  limit 1;

  if found then
    update public.ventas
    set estado = 'cancelada',
        motivo_cancelacion = 'El cliente se equivocó de medida',
        cancelada_en = v_cancelar.creado_en + interval '20 minutes'
    where id = v_cancelar.id;

    insert into pg_temp.semilla_eventos
      (producto_id, creado_en, tipo, cantidad, costo, venta_id, nota, usuario_id)
    select d.producto_id, v_cancelar.creado_en + interval '20 minutes',
           'cancelacion_venta', d.cantidad, d.costo_unitario, d.venta_id,
           'Cancelación: El cliente se equivocó de medida', v_dueno
    from public.venta_detalle d
    where d.venta_id = v_cancelar.id;
  end if;

  -- 8. Entrada inicial: stock_final + todo lo vendido --------------------------
  insert into pg_temp.semilla_eventos
    (producto_id, creado_en, tipo, cantidad, costo, venta_id, nota, usuario_id)
  select p.id, v_inicio, 'entrada',
         s.stock_final + coalesce(vendido.cantidad, 0),
         p.costo, null, 'Inventario inicial', v_dueno
  from public.productos p
  join pg_temp.semilla_productos s on s.codigo = p.codigo
  left join (
    select e.producto_id, sum(-e.cantidad) as cantidad
    from pg_temp.semilla_eventos e
    where e.tipo = 'venta'
    group by e.producto_id
  ) vendido on vendido.producto_id = p.id
  where s.stock_final + coalesce(vendido.cantidad, 0) > 0;

  -- 9. Eventos -> movimientos con stock anterior/nuevo, en orden cronológico ---
  insert into public.movimientos_inventario
    (producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
     costo_unitario, venta_id, nota, usuario_id, creado_en)
  select e.producto_id, e.tipo, e.cantidad,
         sum(e.cantidad) over w - e.cantidad,
         sum(e.cantidad) over w,
         e.costo, e.venta_id, e.nota, e.usuario_id, e.creado_en
  from pg_temp.semilla_eventos e
  window w as (partition by e.producto_id order by e.creado_en, e.seq
               rows between unbounded preceding and current row)
  order by e.creado_en, e.seq;

  update public.productos p
  set stock = t.stock
  from (
    select e.producto_id, sum(e.cantidad) as stock
    from pg_temp.semilla_eventos e
    group by e.producto_id
  ) t
  where p.id = t.producto_id;
end;
$$;

revoke execute on function privado.cargar_semilla(text, text)
  from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Cargar. Si usaste otros correos, pásalos:
--   select privado.cargar_semilla('tu-dueno@...', 'tu-cajero@...');
-- -----------------------------------------------------------------------------
select privado.cargar_semilla();

-- Resumen (es lo que muestra el SQL Editor al terminar).
select
  (select count(*) from public.productos)                         as productos,
  (select count(*) from public.v_stock_bajo)                      as stock_bajo,
  (select count(*) from public.ventas where estado = 'completada') as ventas,
  (select count(*) from public.ventas where estado = 'cancelada')  as canceladas,
  (select count(*) from public.movimientos_inventario)            as movimientos,
  (select sum(total) from public.ventas where estado = 'completada') as total_vendido;
