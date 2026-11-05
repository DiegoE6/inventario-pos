-- =============================================================================
-- 09-crear-producto.sql — Alta de producto con su stock inicial
-- Fase 2 · Requiere: 01 a 05
--
-- public.crear_producto crea el producto y, si trae stock inicial, registra la
-- entrada correspondiente. Todo en una sola transacción: si algo falla, no
-- queda ni el producto ni el movimiento.
--
-- Solo dueño. Mismas reglas que la Fase 1: SECURITY DEFINER, search_path = '',
-- nombres calificados, REVOKE a public y anon, GRANT solo a authenticated.
--
-- Idempotente: se puede volver a correr.
-- =============================================================================

create or replace function public.crear_producto(
  p_codigo        text,
  p_nombre        text,
  p_unidad        text,
  p_costo         numeric,
  p_precio        numeric,
  p_stock_minimo  numeric default 0,
  p_stock_inicial numeric default 0,
  p_categoria_id  bigint  default null,
  p_proveedor_id  bigint  default null,
  p_descripcion   text    default null,
  p_activo        boolean default true
)
returns public.productos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid           uuid := privado.usuario_validado(true);
  v_codigo        text := trim(coalesce(p_codigo, ''));
  v_nombre        text := trim(coalesce(p_nombre, ''));
  v_costo         numeric(12,2) := round(p_costo, 2);
  v_precio        numeric(12,2) := round(p_precio, 2);
  v_stock_minimo  numeric(12,3);
  v_stock_inicial numeric(12,3);
  v_activo_cat    boolean;
  v_producto      public.productos;
begin
  -- 1. Validar datos ----------------------------------------------------------
  if length(v_codigo) not between 1 and 50 then
    raise exception 'El código es obligatorio (máximo 50 caracteres).' using errcode = 'LT422';
  end if;

  if length(v_nombre) not between 1 and 150 then
    raise exception 'El nombre es obligatorio (máximo 150 caracteres).' using errcode = 'LT422';
  end if;

  if p_unidad is null or p_unidad not in ('pieza', 'caja', 'metro', 'kilo', 'litro') then
    raise exception 'Unidad no válida.' using errcode = 'LT422';
  end if;

  if v_costo is null or v_costo < 0 then
    raise exception 'El costo debe ser 0 o mayor.' using errcode = 'LT422';
  end if;

  if v_precio is null or v_precio < 0 then
    raise exception 'El precio debe ser 0 o mayor.' using errcode = 'LT422';
  end if;

  v_stock_minimo  := privado.validar_cantidad(coalesce(p_stock_minimo, 0), p_unidad, true);
  v_stock_inicial := privado.validar_cantidad(coalesce(p_stock_inicial, 0), p_unidad, true);

  if p_categoria_id is not null then
    select c.activo into v_activo_cat from public.categorias c where c.id = p_categoria_id;
    if not found then
      raise exception 'La categoría no existe.' using errcode = 'LT404';
    elsif not v_activo_cat then
      raise exception 'La categoría está desactivada.' using errcode = 'LT422';
    end if;
  end if;

  if p_proveedor_id is not null then
    select pr.activo into v_activo_cat from public.proveedores pr where pr.id = p_proveedor_id;
    if not found then
      raise exception 'El proveedor no existe.' using errcode = 'LT404';
    elsif not v_activo_cat then
      raise exception 'El proveedor está desactivado.' using errcode = 'LT422';
    end if;
  end if;

  -- 2. Crear el producto con stock 0 -----------------------------------------
  begin
    insert into public.productos (
      codigo, nombre, descripcion, categoria_id, proveedor_id, unidad,
      costo, precio, stock_minimo, activo
    )
    values (
      v_codigo, v_nombre, nullif(trim(p_descripcion), ''), p_categoria_id,
      p_proveedor_id, p_unidad, v_costo, v_precio, v_stock_minimo,
      coalesce(p_activo, true)
    )
    returning * into v_producto;
  exception when unique_violation then
    raise exception 'Ya existe un producto con el código "%".', v_codigo
      using errcode = 'LT409';
  end;

  -- 3. Stock inicial como movimiento de entrada -------------------------------
  if v_stock_inicial > 0 then
    perform privado.aplicar_movimiento(
      v_producto.id, 'entrada', v_stock_inicial, v_costo,
      'Inventario inicial', null, v_uid
    );

    select * into v_producto from public.productos p where p.id = v_producto.id;
  end if;

  return v_producto;
end;
$$;

revoke execute on function public.crear_producto(
  text, text, text, numeric, numeric, numeric, numeric, bigint, bigint, text, boolean
) from public, anon;

grant execute on function public.crear_producto(
  text, text, text, numeric, numeric, numeric, numeric, bigint, bigint, text, boolean
) to authenticated;
