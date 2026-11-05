-- =============================================================================
-- 04-funciones-inventario.sql — Único camino para cambiar el stock
-- Requiere: 01, 02, 03
--
--   privado.aplicar_movimiento   interna: bloquea, valida, registra y actualiza
--   public.registrar_movimiento  API (dueño): entrada o merma
--   public.registrar_ajuste      API (dueño): conteo físico
--
-- Las funciones de ventas (05) también pasan por privado.aplicar_movimiento.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- privado.aplicar_movimiento
-- Bloquea el producto con FOR UPDATE, valida que el stock no quede negativo,
-- inserta el movimiento con stock anterior/nuevo y actualiza productos.stock.
-- `p_cantidad` ya viene con signo. No valida sesión ni rol: eso lo hace quien
-- la llama. Por eso no se puede ejecutar desde la API.
-- -----------------------------------------------------------------------------
create or replace function privado.aplicar_movimiento(
  p_producto_id    uuid,
  p_tipo           text,
  p_cantidad       numeric,
  p_costo_unitario numeric,
  p_nota           text,
  p_venta_id       uuid,
  p_usuario_id     uuid
)
returns public.movimientos_inventario
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_producto   public.productos;
  v_stock_nuevo numeric(12,3);
  v_mov        public.movimientos_inventario;
begin
  select * into v_producto
  from public.productos p
  where p.id = p_producto_id
  for update;

  if not found then
    raise exception 'El producto no existe.' using errcode = 'LT404';
  end if;

  if p_cantidad is null or p_cantidad = 0 then
    raise exception 'La cantidad no puede ser cero.' using errcode = 'LT422';
  end if;

  v_stock_nuevo := v_producto.stock + p_cantidad;

  if v_stock_nuevo < 0 then
    raise exception 'Stock insuficiente de "%": hay %, se necesitan %.',
      v_producto.nombre, trim_scale(v_producto.stock), trim_scale(-p_cantidad)
      using errcode = 'LT409';
  end if;

  insert into public.movimientos_inventario (
    producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
    costo_unitario, venta_id, nota, usuario_id
  )
  values (
    p_producto_id, p_tipo, p_cantidad, v_producto.stock, v_stock_nuevo,
    coalesce(p_costo_unitario, v_producto.costo), p_venta_id,
    nullif(trim(p_nota), ''), p_usuario_id
  )
  returning * into v_mov;

  -- En una entrada con costo, el producto toma el último costo de compra.
  update public.productos p
  set stock = v_stock_nuevo,
      costo = case
                when p_tipo = 'entrada' and p_costo_unitario is not null
                  then p_costo_unitario
                else p.costo
              end
  where p.id = p_producto_id;

  return v_mov;
end;
$$;

revoke execute on function privado.aplicar_movimiento(uuid, text, numeric, numeric, text, uuid, uuid)
  from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- privado.validar_cantidad: redondea a 3 decimales y valida contra la unidad.
-- `pieza` y `caja` no aceptan decimales.
-- -----------------------------------------------------------------------------
create or replace function privado.validar_cantidad(
  p_cantidad numeric,
  p_unidad   text,
  p_permite_cero boolean default false
)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_cantidad numeric(12,3) := round(p_cantidad, 3);
begin
  if v_cantidad is null
     or v_cantidad < 0
     or (v_cantidad = 0 and not p_permite_cero) then
    raise exception 'La cantidad debe ser mayor a cero.' using errcode = 'LT422';
  end if;

  if p_unidad in ('pieza', 'caja') and v_cantidad <> trunc(v_cantidad) then
    raise exception 'Los productos por % no aceptan decimales.', p_unidad
      using errcode = 'LT422';
  end if;

  return v_cantidad;
end;
$$;

revoke execute on function privado.validar_cantidad(numeric, text, boolean)
  from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- public.registrar_movimiento — solo dueño
--   p_tipo:      'entrada' (compra) o 'merma' (se rompió / se perdió).
--                'venta' y 'cancelacion_venta' son internos; 'ajuste' va por
--                registrar_ajuste.
--   p_cantidad:  SIEMPRE positiva; la función pone el signo según el tipo.
--   p_costo_unitario: en entrada, costo de compra (opcional; si viene,
--                actualiza el costo del producto). En merma se ignora.
--   p_nota:      obligatoria en merma.
-- -----------------------------------------------------------------------------
create or replace function public.registrar_movimiento(
  p_producto_id    uuid,
  p_tipo           text,
  p_cantidad       numeric,
  p_costo_unitario numeric default null,
  p_nota           text default null
)
returns public.movimientos_inventario
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := privado.usuario_validado(true);
  v_unidad   text;
  v_cantidad numeric(12,3);
  v_costo    numeric(12,2);
begin
  if p_tipo is null or p_tipo not in ('entrada', 'merma') then
    raise exception 'Tipo de movimiento no permitido: %.', coalesce(p_tipo, 'vacío')
      using errcode = 'LT422';
  end if;

  select p.unidad into v_unidad from public.productos p where p.id = p_producto_id;
  if not found then
    raise exception 'El producto no existe.' using errcode = 'LT404';
  end if;

  v_cantidad := privado.validar_cantidad(p_cantidad, v_unidad);

  if p_tipo = 'merma' then
    if length(trim(coalesce(p_nota, ''))) = 0 then
      raise exception 'La merma necesita una nota (qué pasó).' using errcode = 'LT422';
    end if;
    return privado.aplicar_movimiento(
      p_producto_id, 'merma', -v_cantidad, null, p_nota, null, v_uid
    );
  end if;

  -- entrada
  if p_costo_unitario is not null then
    v_costo := round(p_costo_unitario, 2);
    if v_costo < 0 then
      raise exception 'El costo no puede ser negativo.' using errcode = 'LT422';
    end if;
  end if;

  return privado.aplicar_movimiento(
    p_producto_id, 'entrada', v_cantidad, v_costo, p_nota, null, v_uid
  );
end;
$$;

revoke execute on function public.registrar_movimiento(uuid, text, numeric, numeric, text)
  from public, anon;
grant execute on function public.registrar_movimiento(uuid, text, numeric, numeric, text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- public.registrar_ajuste — solo dueño
-- Recibe lo que se contó físicamente y registra la diferencia como 'ajuste'.
-- Si el conteo coincide con el sistema, no registra nada y devuelve null.
-- -----------------------------------------------------------------------------
create or replace function public.registrar_ajuste(
  p_producto_id   uuid,
  p_stock_contado numeric,
  p_nota          text default null
)
returns public.movimientos_inventario
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := privado.usuario_validado(true);
  v_producto   public.productos;
  v_contado    numeric(12,3);
  v_diferencia numeric(12,3);
begin
  -- Se bloquea aquí para que la diferencia se calcule contra el stock que
  -- nadie más puede cambiar hasta terminar.
  select * into v_producto
  from public.productos p
  where p.id = p_producto_id
  for update;

  if not found then
    raise exception 'El producto no existe.' using errcode = 'LT404';
  end if;

  v_contado := privado.validar_cantidad(p_stock_contado, v_producto.unidad, true);
  v_diferencia := v_contado - v_producto.stock;

  if v_diferencia = 0 then
    return null;
  end if;

  return privado.aplicar_movimiento(
    p_producto_id, 'ajuste', v_diferencia, null,
    coalesce(nullif(trim(p_nota), ''), 'Ajuste por conteo físico'),
    null, v_uid
  );
end;
$$;

revoke execute on function public.registrar_ajuste(uuid, numeric, text)
  from public, anon;
grant execute on function public.registrar_ajuste(uuid, numeric, text)
  to authenticated;
