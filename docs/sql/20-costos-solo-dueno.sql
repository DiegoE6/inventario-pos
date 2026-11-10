-- =============================================================================
-- 20-costos-solo-dueno.sql — Costos y ganancias solo para el dueño
-- Endurecimiento · Requiere: 01 a 19
--
-- Dueño y cajero son el mismo rol de Postgres (authenticated), así que los
-- costos no pueden depender de RLS por fila. La regla queda así:
--
--   1. Nadie de la API (tampoco el dueño) puede leer las columnas de costo
--      directamente: se quita el SELECT de productos.costo y
--      venta_detalle.costo_unitario a authenticated. Sin SELECT tampoco se
--      puede filtrar, ordenar ni agregar por esas columnas (REST y GraphQL).
--   2. El dueño obtiene costos solo con funciones SECURITY DEFINER que validan
--      su rol: costos_productos() (nueva), mas_vendidos() (ahora con la regla
--      de resumen_ventas), ventas_por_dia() y valor_inventario() (Fase 5).
--   3. Se quita la vista v_ventas_por_dia: la reemplaza ventas_por_dia()
--      (solo dueño) desde la Fase 5 y la app no la usa.
--
-- Escrituras sin cambio: el dueño sigue con UPDATE (costo) y la política de
-- productos solo deja escribir al dueño. Ojo: un UPDATE … RETURNING costo, o
-- un select("*") sobre productos o venta_detalle, ahora fallan también para el
-- dueño (42501). La app pide columnas explícitas.
--
-- Si en el futuro se agregan columnas a productos o venta_detalle, hay que
-- darles SELECT (este script se puede volver a correr y lo hace solo).
--
-- movimientos_inventario.costo_unitario ya era solo del dueño (RLS por fila).
-- Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Permisos por columna: SELECT de todo menos el costo
-- -----------------------------------------------------------------------------
do $$
declare
  v_cols text;
begin
  -- productos (sin costo)
  revoke select on table public.productos from authenticated;
  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position) into v_cols
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'productos' and c.column_name <> 'costo';
  execute format('grant select (%s) on public.productos to authenticated', v_cols);

  -- venta_detalle (sin costo_unitario)
  revoke select on table public.venta_detalle from authenticated;
  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position) into v_cols
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'venta_detalle' and c.column_name <> 'costo_unitario';
  execute format('grant select (%s) on public.venta_detalle to authenticated', v_cols);
end $$;

-- Por si quedó de antes un permiso de columna explícito.
revoke select (costo) on public.productos from public, anon, authenticated, service_role;
revoke select (costo_unitario) on public.venta_detalle from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. v_ventas_por_dia: fuera (la reemplaza ventas_por_dia(), solo dueño)
-- -----------------------------------------------------------------------------
drop view if exists public.v_ventas_por_dia;

-- -----------------------------------------------------------------------------
-- 3. costos_productos(ids): costo de los productos pedidos. Solo dueño.
-- -----------------------------------------------------------------------------
create or replace function public.costos_productos(p_ids uuid[])
returns table (id uuid, costo numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.usuario_validado(true);

  if p_ids is null or cardinality(p_ids) > 500 then
    raise exception 'Pide entre 0 y 500 productos.' using errcode = 'LT422';
  end if;

  return query
  select p.id, p.costo
  from public.productos p
  where p.id = any (p_ids);
end;
$$;

revoke execute on function public.costos_productos(uuid[]) from public, anon;
grant execute on function public.costos_productos(uuid[]) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. mas_vendidos: SECURITY DEFINER con la regla de resumen_ventas.
--    Dueño: todas las ventas, con costo y ganancia.
--    Cajero: solo sus ventas; costo y ganancia en null (ni se calculan).
--    Mismas columnas y orden que antes: Inicio no cambia.
--    (Antes era SECURITY INVOKER y ahora fallaría al leer costo_unitario.)
-- -----------------------------------------------------------------------------
drop function if exists public.mas_vendidos(date, date, int);

create function public.mas_vendidos(
  p_desde  date,
  p_hasta  date,
  p_limite int default 5
)
returns table (
  producto_id uuid,
  codigo      text,
  nombre      text,
  unidad      text,
  cantidad    numeric,
  importe     numeric,
  costo       numeric,
  ganancia    numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := privado.usuario_validado(false);
  v_dueno boolean := public.es_dueno();
begin
  return query
  select
    d.producto_id,
    p.codigo,
    p.nombre,
    p.unidad,
    sum(d.cantidad),
    sum(d.importe),
    case when v_dueno then round(sum(d.cantidad * d.costo_unitario), 2) end,
    case when v_dueno then sum(d.importe) - round(sum(d.cantidad * d.costo_unitario), 2) end
  from public.venta_detalle d
  join public.ventas v on v.id = d.venta_id
  join public.productos p on p.id = d.producto_id
  where v.estado = 'completada'
    and (v_dueno or v.usuario_id = v_uid)
    and v.creado_en >= (p_desde::timestamp at time zone 'America/Monterrey')
    and v.creado_en <  ((p_hasta + 1)::timestamp at time zone 'America/Monterrey')
  group by d.producto_id, p.codigo, p.nombre, p.unidad
  order by 6 desc, 5 desc, 1
  limit least(greatest(coalesce(p_limite, 5), 1), 100);
end;
$$;

revoke execute on function public.mas_vendidos(date, date, int) from public, anon;
grant execute on function public.mas_vendidos(date, date, int) to authenticated;

-- Resumen: columnas de costo que authenticated todavía puede leer (debe salir 0).
select count(*) as columnas_de_costo_legibles
from information_schema.column_privileges cp
where cp.grantee = 'authenticated'
  and cp.privilege_type = 'SELECT'
  and cp.table_schema = 'public'
  and (cp.table_name, cp.column_name) in (('productos', 'costo'), ('venta_detalle', 'costo_unitario'));
