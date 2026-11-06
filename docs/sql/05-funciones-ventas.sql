-- =============================================================================
-- 05-funciones-ventas.sql — Cobrar y cancelar ventas
-- Requiere: 01, 02, 03, 04
--
-- Nota (Fase 3): 12-venta-idempotente.sql reemplaza registrar_venta por una
-- versión con clave de idempotencia (4 parámetros). Si vuelves a correr este
-- script, corre 12 después. El DROP de abajo evita que convivan las dos
-- versiones (una llamada con 3 argumentos sería ambigua).
-- =============================================================================

drop function if exists public.registrar_venta(jsonb, text, numeric, uuid);

-- -----------------------------------------------------------------------------
-- public.registrar_venta — cualquier usuario activo (dueño o cajero)
--
--   p_items:         [{"producto_id": "<uuid>", "cantidad": 2}, ...]
--                    Si un producto viene repetido, se suman sus cantidades.
--   p_metodo_pago:   'efectivo' | 'tarjeta' | 'transferencia'
--   p_pago_recibido: obligatorio en efectivo (debe alcanzar). En tarjeta y
--                    transferencia se ignora y se registra igual al total.
--
-- Precio y costo se toman de la BD, nunca del cliente. Los productos se
-- bloquean con FOR UPDATE en orden por id: dos ventas simultáneas con los
-- mismos productos se forman en fila en vez de bloquearse entre sí (deadlock).
--
-- Devuelve la fila de la venta (id, folio, total, cambio...) para el ticket.
-- -----------------------------------------------------------------------------
create or replace function public.registrar_venta(
  p_items         jsonb,
  p_metodo_pago   text,
  p_pago_recibido numeric default null
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
       -- CASE para que el cast a numeric solo ocurra si es un número JSON
       -- (SQL no garantiza el orden de evaluación de los OR).
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

  -- 6. Registrar venta, detalle y movimientos --------------------------------
  insert into public.ventas (
    subtotal, total, metodo_pago, pago_recibido, cambio, usuario_id
  )
  values (v_total, v_total, p_metodo_pago, v_pago, v_pago - v_total, v_uid)
  returning * into v_venta;

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

revoke execute on function public.registrar_venta(jsonb, text, numeric)
  from public, anon;
grant execute on function public.registrar_venta(jsonb, text, numeric)
  to authenticated;

-- -----------------------------------------------------------------------------
-- public.cancelar_venta — solo dueño
-- Marca la venta como cancelada y regresa el stock con movimientos
-- 'cancelacion_venta'. Una venta cancelada no se puede volver a cancelar.
-- -----------------------------------------------------------------------------
create or replace function public.cancelar_venta(
  p_venta_id uuid,
  p_motivo   text
)
returns public.ventas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := privado.usuario_validado(true);
  v_venta   public.ventas;
  v_motivo  text := nullif(trim(p_motivo), '');
  v_detalle record;
begin
  if v_motivo is null then
    raise exception 'Escribe el motivo de la cancelación.' using errcode = 'LT422';
  end if;

  select * into v_venta
  from public.ventas v
  where v.id = p_venta_id
  for update;

  if not found then
    raise exception 'La venta no existe.' using errcode = 'LT404';
  end if;

  if v_venta.estado = 'cancelada' then
    raise exception 'La venta con folio % ya estaba cancelada.', v_venta.folio
      using errcode = 'LT409';
  end if;

  -- Bloquear productos en orden por id, igual que registrar_venta.
  perform 1
  from public.productos p
  where p.id in (
    select d.producto_id from public.venta_detalle d where d.venta_id = p_venta_id
  )
  order by p.id
  for update;

  for v_detalle in
    select d.producto_id,
           sum(d.cantidad) as cantidad,
           max(d.costo_unitario) as costo_unitario
    from public.venta_detalle d
    where d.venta_id = p_venta_id
    group by d.producto_id
    order by d.producto_id
  loop
    perform privado.aplicar_movimiento(
      v_detalle.producto_id, 'cancelacion_venta', v_detalle.cantidad,
      v_detalle.costo_unitario, 'Cancelación: ' || v_motivo, p_venta_id, v_uid
    );
  end loop;

  update public.ventas v
  set estado = 'cancelada',
      motivo_cancelacion = v_motivo,
      cancelada_en = now()
  where v.id = p_venta_id
  returning * into v_venta;

  return v_venta;
end;
$$;

revoke execute on function public.cancelar_venta(uuid, text) from public, anon;
grant execute on function public.cancelar_venta(uuid, text) to authenticated;
