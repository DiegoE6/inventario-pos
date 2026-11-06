-- =============================================================================
-- 14-movimiento-idempotente.sql — Entradas, mermas y conteos sin duplicados
-- Fase 4 · Requiere: 01 a 05 (y 12)
--
-- 1. movimientos_inventario.clave_cliente (uuid, opcional) con índice único
--    PARCIAL: solo los movimientos que registra el usuario desde inventario
--    llevan clave; ventas, cancelaciones y semilla no.
-- 2. registrar_movimiento(..., p_clave): candado consultivo por clave → si ya
--    existe un movimiento con esa clave (del mismo usuario) lo devuelve sin
--    tocar el stock → si no, valida y aplica.
-- 3. registrar_ajuste(..., p_clave, p_stock_esperado): igual con clave, y
--    además, si el stock actual ya no es el que vio la pantalla, responde LT409
--    con hint 'stock_cambio' (la app muestra el stock nuevo y deja confirmar).
--    Sin esto, un reintento después de una venta "regresaría" lo vendido.
-- 4. Respaldo: índice único. Aplicar el movimiento y escribir su clave van en
--    un mismo bloque; si la clave choca, Postgres revierte el bloque completo
--    (stock y movimiento) y se devuelve el movimiento existente.
--
-- privado.aplicar_movimiento NO cambia de firma: 04, 05, 09 y 12 siguen igual.
-- Reemplaza las versiones anteriores de registrar_movimiento (5 parámetros) y
-- registrar_ajuste (3 parámetros). Si vuelves a correr 04, corre este después.
-- Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columna clave_cliente
-- -----------------------------------------------------------------------------
alter table public.movimientos_inventario add column if not exists clave_cliente uuid;

create unique index if not exists movimientos_clave_cliente_key
  on public.movimientos_inventario (clave_cliente)
  where clave_cliente is not null;

-- -----------------------------------------------------------------------------
-- 2. Ayudantes internos
-- -----------------------------------------------------------------------------

-- Movimiento ya registrado con esta clave. Si es de otro usuario: LT409.
-- Si no existe, devuelve una fila vacía (id null).
create or replace function privado.movimiento_por_clave(p_clave uuid, p_usuario_id uuid)
returns public.movimientos_inventario
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov public.movimientos_inventario;
begin
  select * into v_mov from public.movimientos_inventario m where m.clave_cliente = p_clave;
  if found and v_mov.usuario_id <> p_usuario_id then
    raise exception 'Esa clave de operación ya fue usada por otro usuario.' using errcode = 'LT409';
  end if;
  return v_mov;
end;
$$;

revoke execute on function privado.movimiento_por_clave(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Aplica el movimiento y le escribe la clave, en un solo bloque. Si la clave
-- choca con el índice único, el bloque se revierte completo (stock y
-- movimiento) y se devuelve el movimiento que ya existía.
create or replace function privado.aplicar_movimiento_con_clave(
  p_producto_id    uuid,
  p_tipo           text,
  p_cantidad       numeric,
  p_costo_unitario numeric,
  p_nota           text,
  p_usuario_id     uuid,
  p_clave          uuid
)
returns public.movimientos_inventario
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov public.movimientos_inventario;
begin
  begin
    v_mov := privado.aplicar_movimiento(
      p_producto_id, p_tipo, p_cantidad, p_costo_unitario, p_nota, null, p_usuario_id
    );
    if p_clave is not null then
      update public.movimientos_inventario m
      set clave_cliente = p_clave
      where m.id = v_mov.id
      returning * into v_mov;
    end if;
  exception when unique_violation then
    v_mov := privado.movimiento_por_clave(p_clave, p_usuario_id);
    if v_mov.id is null then
      raise exception 'Esa clave de operación ya fue usada.' using errcode = 'LT409';
    end if;
  end;
  return v_mov;
end;
$$;

revoke execute on function privado.aplicar_movimiento_con_clave(uuid, text, numeric, numeric, text, uuid, uuid)
  from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. registrar_movimiento — solo dueño (entrada o merma)
-- -----------------------------------------------------------------------------
drop function if exists public.registrar_movimiento(uuid, text, numeric, numeric, text);

create or replace function public.registrar_movimiento(
  p_producto_id    uuid,
  p_tipo           text,
  p_cantidad       numeric,
  p_costo_unitario numeric default null,
  p_nota           text    default null,
  p_clave          uuid    default null
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
  v_mov      public.movimientos_inventario;
begin
  -- 0. Idempotencia ------------------------------------------------------------
  if p_clave is not null then
    perform pg_advisory_xact_lock(hashtextextended('registrar_movimiento:' || p_clave::text, 0));
    -- [chequeo-clave:inicio]
    v_mov := privado.movimiento_por_clave(p_clave, v_uid);
    if v_mov.id is not null then
      return v_mov;  -- reintento: el mismo movimiento, sin tocar el stock
    end if;
    -- [chequeo-clave:fin]
  end if;

  -- 1. Validar ------------------------------------------------------------------
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
    return privado.aplicar_movimiento_con_clave(
      p_producto_id, 'merma', -v_cantidad, null, p_nota, v_uid, p_clave
    );
  end if;

  -- entrada
  if p_costo_unitario is not null then
    v_costo := round(p_costo_unitario, 2);
    if v_costo < 0 then
      raise exception 'El costo no puede ser negativo.' using errcode = 'LT422';
    end if;
  end if;

  return privado.aplicar_movimiento_con_clave(
    p_producto_id, 'entrada', v_cantidad, v_costo, p_nota, v_uid, p_clave
  );
end;
$$;

revoke execute on function public.registrar_movimiento(uuid, text, numeric, numeric, text, uuid)
  from public, anon;
grant execute on function public.registrar_movimiento(uuid, text, numeric, numeric, text, uuid)
  to authenticated;

-- -----------------------------------------------------------------------------
-- 4. registrar_ajuste — solo dueño (conteo físico)
--   p_stock_esperado: el stock que la pantalla mostró al calcular la
--   diferencia. Si al confirmar ya es otro: LT409, hint 'stock_cambio'.
--   Si el conteo coincide con el stock, no registra nada y devuelve null.
-- -----------------------------------------------------------------------------
drop function if exists public.registrar_ajuste(uuid, numeric, text);

create or replace function public.registrar_ajuste(
  p_producto_id    uuid,
  p_stock_contado  numeric,
  p_nota           text    default null,
  p_clave          uuid    default null,
  p_stock_esperado numeric default null
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
  v_mov        public.movimientos_inventario;
begin
  -- 0. Idempotencia ------------------------------------------------------------
  if p_clave is not null then
    perform pg_advisory_xact_lock(hashtextextended('registrar_movimiento:' || p_clave::text, 0));
    -- [chequeo-clave:inicio]
    v_mov := privado.movimiento_por_clave(p_clave, v_uid);
    if v_mov.id is not null then
      return v_mov;
    end if;
    -- [chequeo-clave:fin]
  end if;

  -- 1. Bloquear y validar contra el stock actual --------------------------------
  select * into v_producto
  from public.productos p
  where p.id = p_producto_id
  for update;

  if not found then
    raise exception 'El producto no existe.' using errcode = 'LT404';
  end if;

  v_contado := privado.validar_cantidad(p_stock_contado, v_producto.unidad, true);

  if p_stock_esperado is not null and round(p_stock_esperado, 3) <> v_producto.stock then
    raise exception 'El stock cambió mientras contabas: ahora hay %.', trim_scale(v_producto.stock)
      using errcode = 'LT409', hint = 'stock_cambio';
  end if;

  v_diferencia := v_contado - v_producto.stock;
  if v_diferencia = 0 then
    return null;
  end if;

  return privado.aplicar_movimiento_con_clave(
    p_producto_id, 'ajuste', v_diferencia, null,
    coalesce(nullif(trim(p_nota), ''), 'Ajuste por conteo físico'),
    v_uid, p_clave
  );
end;
$$;

revoke execute on function public.registrar_ajuste(uuid, numeric, text, uuid, numeric)
  from public, anon;
grant execute on function public.registrar_ajuste(uuid, numeric, text, uuid, numeric)
  to authenticated;
