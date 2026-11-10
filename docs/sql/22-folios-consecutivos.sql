-- =============================================================================
-- 22-folios-consecutivos.sql — Folios sin huecos
-- Endurecimiento · Requiere: 01 a 21
--
-- Antes ventas.folio era identity: una secuencia nunca regresa un número,
-- así que un cobro rechazado se llevaba su folio (231, 232, 233, 235).
--
-- Ahora:
--   1. privado.contador_folios: una sola fila con el último folio. Arranca en
--      el folio más alto que ya exista.
--   2. privado.siguiente_folio(): UPDATE … ultimo + 1 RETURNING. Como es un
--      UPDATE dentro de la transacción del cobro, si el cobro falla se
--      revierte con todo lo demás.
--   3. ventas.folio deja de ser identity: default privado.siguiente_folio().
--      Sigue siendo único y obligatorio. Quien inserte una venta (registrar_venta,
--      la semilla, las pruebas) recibe el siguiente folio sin hacer nada.
--   4. registrar_venta (misma de 12 + una línea): toma el candado del
--      contador antes de bloquear los productos, para que el orden de los
--      candados sea siempre el mismo y no haya deadlocks.
--
-- Cobro idempotente: un reintento con la misma clave regresa la venta antes
-- de llegar al contador. Si choca con el índice único de la clave, el bloque
-- EXCEPTION revierte también el folio.
-- La semilla (07) pone el contador en 0 después del truncate: los folios
-- empiezan en 1 en cada reinicio.
--
-- ⚠️  Si se vuelve a correr 12 (o 05), hay que volver a correr 22 después:
--     redefine registrar_venta.
-- Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Contador
-- -----------------------------------------------------------------------------
create table if not exists privado.contador_folios (
  id     int primary key default 1 check (id = 1),
  ultimo bigint not null check (ultimo >= 0)
);
revoke all on privado.contador_folios from public, anon, authenticated, service_role;

insert into privado.contador_folios (id, ultimo)
values (1, coalesce((select max(v.folio) from public.ventas v), 0))
on conflict (id) do update
  set ultimo = greatest(privado.contador_folios.ultimo, excluded.ultimo);

-- -----------------------------------------------------------------------------
-- 2. Siguiente folio
-- -----------------------------------------------------------------------------
create or replace function privado.siguiente_folio()
returns bigint
language sql
volatile
security definer
set search_path = ''
as $$
  update privado.contador_folios set ultimo = ultimo + 1 where id = 1 returning ultimo;
$$;

revoke execute on function privado.siguiente_folio()
  from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. ventas.folio: sin identity, con el contador como default
-- -----------------------------------------------------------------------------
alter table public.ventas alter column folio drop identity if exists;
alter table public.ventas alter column folio set default privado.siguiente_folio();
alter table public.ventas alter column folio set not null;

-- -----------------------------------------------------------------------------
-- 4. registrar_venta: la de 12, con el candado del contador (paso 2b)
-- -----------------------------------------------------------------------------
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

  -- 2b. Folio (22): tomar el contador ANTES de bloquear los productos. Así
  -- todos los cobros toman los candados en el mismo orden (contador →
  -- productos) y no hay deadlock, tampoco con avanzar_demo, que cobra varias
  -- ventas en una sola transacción. El folio se asigna al insertar la venta
  -- (default de ventas.folio) y, si el cobro falla, se revierte con todo.
  perform 1 from privado.contador_folios c where c.id = 1 for update;

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

-- Resumen.
select
  (select ultimo from privado.contador_folios)                      as ultimo_folio,
  (select max(folio) from public.ventas)                            as folio_maximo,
  (select column_default from information_schema.columns
   where table_schema = 'public' and table_name = 'ventas' and column_name = 'folio') as default_folio,
  (select is_identity from information_schema.columns
   where table_schema = 'public' and table_name = 'ventas' and column_name = 'folio') as es_identity;
