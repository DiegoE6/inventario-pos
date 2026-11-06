-- =============================================================================
-- 12-venta-idempotente.sql — Cobro sin duplicados + productos frecuentes
-- Fase 3 · Requiere: 01 a 05
--
-- 1. ventas.clave_cliente (uuid, único): la genera el punto de venta al
--    empezar cada venta y la manda en cada intento de cobro.
-- 2. registrar_venta(p_items, p_metodo_pago, p_pago_recibido, p_clave):
--    a) toma pg_advisory_xact_lock sobre el hash de la clave: dos cobros con
--       la misma clave nunca corren a la vez, aunque el carrito haya cambiado;
--    b) si ya existe una venta con esa clave (del mismo usuario), la devuelve
--       sin tocar el stock;
--    c) solo entonces bloquea productos y registra la venta.
--    El índice único es el respaldo: si aun así choca, se devuelve la venta
--    existente y el segundo intento no deja ningún movimiento (el insert de la
--    venta va antes que los movimientos).
-- 3. productos_frecuentes(p_limite): los más vendidos de TODA la tienda en los
--    últimos 30 días, sin montos de venta ni costos. Para el punto de venta.
--
-- Reemplaza la registrar_venta de 3 parámetros de 05 (se borra para que no
-- haya dos versiones). Si vuelves a correr 05, corre este script después.
-- Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columna clave_cliente
-- -----------------------------------------------------------------------------
alter table public.ventas add column if not exists clave_cliente uuid;

update public.ventas set clave_cliente = gen_random_uuid() where clave_cliente is null;

alter table public.ventas alter column clave_cliente set default gen_random_uuid();
alter table public.ventas alter column clave_cliente set not null;

create unique index if not exists ventas_clave_cliente_key on public.ventas (clave_cliente);

-- -----------------------------------------------------------------------------
-- 2. registrar_venta con clave de idempotencia
-- -----------------------------------------------------------------------------
drop function if exists public.registrar_venta(jsonb, text, numeric);

create or replace function public.registrar_venta(
  p_items         jsonb,
  p_metodo_pago   text,
  p_pago_recibido numeric default null,
  p_clave         uuid    default null
)
returns public.ventas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := privado.usuario_validado(false);
  v_ids       uuid[];
  v_cants     numeric[];
  v_total     numeric(12,2);
  v_pago      numeric(12,2);
  v_venta     public.ventas;
  v_problema  record;
  i           int;
begin
  -- 0. Idempotencia ------------------------------------------------------------
  if p_clave is not null then
    -- Serializa los intentos con la misma clave hasta el fin de la transacción.
    perform pg_advisory_xact_lock(hashtextextended('registrar_venta:' || p_clave::text, 0));

    -- [chequeo-clave:inicio]
    select * into v_venta from public.ventas v where v.clave_cliente = p_clave;
    if found then
      if v_venta.usuario_id <> v_uid then
        raise exception 'Esa clave de venta ya fue usada por otro usuario.' using errcode = 'LT409';
      end if;
      return v_venta;  -- reintento: la misma venta, sin tocar el stock
    end if;
    -- [chequeo-clave:fin]
  end if;

  -- 1. Validar forma de la entrada ------------------------------------------
  if p_metodo_pago is null
     or p_metodo_pago not in ('efectivo', 'tarjeta', 'transferencia') then
    raise exception 'Método de pago no válido.' using errcode = 'LT422';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos.' using errcode = 'LT422';
  end if;

  if jsonb_array_length(p_items) > 200 then
    raise exception 'Demasiados renglones en una sola venta.' using errcode = 'LT422';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) e
    where jsonb_typeof(e) <> 'object'
       or jsonb_typeof(e -> 'producto_id') is distinct from 'string'
       or (e ->> 'producto_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       -- CASE para que el cast a numeric solo ocurra si es un número JSON.
       or case
            when jsonb_typeof(e -> 'cantidad') = 'number'
              then round((e ->> 'cantidad')::numeric, 3) <= 0
            else true
          end
  ) then
    raise exception 'Hay productos con datos o cantidades no válidas.'
      using errcode = 'LT422';
  end if;

  -- 2. Agrupar por producto, ordenado por id ---------------------------------
  select array_agg(t.producto_id order by t.producto_id),
         array_agg(t.cantidad    order by t.producto_id)
  into v_ids, v_cants
  from (
    select (e ->> 'producto_id')::uuid as producto_id,
           sum(round((e ->> 'cantidad')::numeric, 3)) as cantidad
    from jsonb_array_elements(p_items) e
    group by 1
  ) t;

  -- 3. Bloquear productos en orden por id ------------------------------------
  perform 1
  from public.productos p
  where p.id = any (v_ids)
  order by p.id
  for update;

  -- 4. Validar contra la BD --------------------------------------------------
  if (select count(*) from public.productos p where p.id = any (v_ids))
     <> cardinality(v_ids) then
    raise exception 'Uno de los productos no existe.' using errcode = 'LT404';
  end if;

  select p.nombre into v_problema
  from unnest(v_ids) x(producto_id)
  join public.productos p on p.id = x.producto_id
  where not p.activo
  limit 1;
  if found then
    raise exception '"%" está desactivado y no se puede vender.', v_problema.nombre
      using errcode = 'LT422';
  end if;

  for i in 1 .. cardinality(v_ids) loop
    perform privado.validar_cantidad(
      v_cants[i],
      (select p.unidad from public.productos p where p.id = v_ids[i])
    );
  end loop;

  select p.nombre, p.stock, x.cantidad into v_problema
  from unnest(v_ids, v_cants) x(producto_id, cantidad)
  join public.productos p on p.id = x.producto_id
  where p.stock < x.cantidad
  limit 1;
  if found then
    raise exception 'Stock insuficiente de "%": hay %, pediste %.',
      v_problema.nombre, trim_scale(v_problema.stock), trim_scale(v_problema.cantidad)
      using errcode = 'LT409';
  end if;

  -- 5. Totales y pago --------------------------------------------------------
  select coalesce(sum(round(x.cantidad * p.precio, 2)), 0) into v_total
  from unnest(v_ids, v_cants) x(producto_id, cantidad)
  join public.productos p on p.id = x.producto_id;

  if p_metodo_pago = 'efectivo' then
    v_pago := round(p_pago_recibido, 2);
    if v_pago is null or v_pago < v_total then
      raise exception 'El pago recibido no alcanza: el total es %.', v_total
        using errcode = 'LT422';
    end if;
  else
    v_pago := v_total;
  end if;

  -- 6. Registrar la venta (antes que los movimientos) ------------------------
  begin
    insert into public.ventas (
      subtotal, total, metodo_pago, pago_recibido, cambio, usuario_id, clave_cliente
    )
    values (
      v_total, v_total, p_metodo_pago, v_pago, v_pago - v_total, v_uid,
      coalesce(p_clave, gen_random_uuid())
    )
    returning * into v_venta;
  exception when unique_violation then
    -- Respaldo: otra transacción registró esta clave. Todavía no se ha
    -- escrito ningún movimiento, así que no queda nada de este intento.
    select * into v_venta from public.ventas v where v.clave_cliente = p_clave;
    if not found or v_venta.usuario_id <> v_uid then
      raise exception 'Esa clave de venta ya fue usada.' using errcode = 'LT409';
    end if;
    return v_venta;
  end;

  -- 7. Detalle y movimientos -------------------------------------------------
  insert into public.venta_detalle (
    venta_id, producto_id, nombre_producto, unidad, cantidad,
    precio_unitario, costo_unitario, importe
  )
  select v_venta.id, p.id, p.nombre, p.unidad, x.cantidad,
         p.precio, p.costo, round(x.cantidad * p.precio, 2)
  from unnest(v_ids, v_cants) with ordinality x(producto_id, cantidad, n)
  join public.productos p on p.id = x.producto_id
  order by x.n;

  for i in 1 .. cardinality(v_ids) loop
    perform privado.aplicar_movimiento(
      v_ids[i], 'venta', -v_cants[i], null, null, v_venta.id, v_uid
    );
  end loop;

  return v_venta;
end;
$$;

revoke execute on function public.registrar_venta(jsonb, text, numeric, uuid)
  from public, anon;
grant execute on function public.registrar_venta(jsonb, text, numeric, uuid)
  to authenticated;

-- -----------------------------------------------------------------------------
-- 3. productos_frecuentes — para el punto de venta (dueño y cajero)
-- SECURITY DEFINER para contar las ventas de toda la tienda aunque el cajero
-- solo pueda leer las suyas. Solo regresa datos que el cajero ya puede ver de
-- productos (id, código, nombre, precio, stock, unidad): ni montos de venta
-- ni costos.
-- -----------------------------------------------------------------------------
create or replace function public.productos_frecuentes(p_limite int default 8)
returns table (
  id     uuid,
  codigo text,
  nombre text,
  precio numeric,
  stock  numeric,
  unidad text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.usuario_validado(false);

  return query
  select p.id, p.codigo, p.nombre, p.precio, p.stock, p.unidad
  from public.productos p
  join (
    select d.producto_id, count(distinct d.venta_id) as veces
    from public.venta_detalle d
    join public.ventas v on v.id = d.venta_id
    where v.estado = 'completada'
      and v.creado_en >= now() - interval '30 days'
    group by d.producto_id
  ) f on f.producto_id = p.id
  where p.activo
  order by f.veces desc, p.nombre, p.id
  limit least(greatest(coalesce(p_limite, 8), 1), 24);
end;
$$;

revoke execute on function public.productos_frecuentes(int) from public, anon;
grant execute on function public.productos_frecuentes(int) to authenticated;
