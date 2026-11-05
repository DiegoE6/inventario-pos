-- =============================================================================
-- 06-vistas.sql — Vistas y consulta de más vendidos
-- Requiere: 01, 02, 03
--
-- Todas con security_invoker = true: se consultan con los permisos y RLS de
-- quien las lee. Un cajero solo suma sus propias ventas; anon no ve nada.
-- Días calculados en zona America/Monterrey.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- v_stock_bajo: productos activos con stock <= stock mínimo.
-- -----------------------------------------------------------------------------
create or replace view public.v_stock_bajo
with (security_invoker = true)
as
select
  p.id,
  p.codigo,
  p.nombre,
  p.unidad,
  p.stock,
  p.stock_minimo,
  p.stock_minimo - p.stock as faltante,
  p.categoria_id,
  c.nombre as categoria,
  p.proveedor_id,
  pr.nombre as proveedor
from public.productos p
left join public.categorias c on c.id = p.categoria_id
left join public.proveedores pr on pr.id = p.proveedor_id
where p.activo
  and p.stock <= p.stock_minimo;

-- -----------------------------------------------------------------------------
-- v_ventas_por_dia: ventas completadas por día. Ganancia = ventas − costo de
-- lo vendido (con el costo copiado en venta_detalle al momento de la venta).
-- -----------------------------------------------------------------------------
create or replace view public.v_ventas_por_dia
with (security_invoker = true)
as
with costo_por_venta as (
  select d.venta_id, round(sum(d.cantidad * d.costo_unitario), 2) as costo
  from public.venta_detalle d
  group by d.venta_id
)
select
  (v.creado_en at time zone 'America/Monterrey')::date as dia,
  count(*)::int                                         as num_ventas,
  sum(v.total)                                          as ventas,
  sum(c.costo)                                          as costo,
  sum(v.total - c.costo)                                as ganancia
from public.ventas v
join costo_por_venta c on c.venta_id = v.id
where v.estado = 'completada'
group by 1;

revoke all on table public.v_stock_bajo, public.v_ventas_por_dia
  from public, anon, authenticated, service_role;
grant select on table public.v_stock_bajo, public.v_ventas_por_dia
  to authenticated;

-- -----------------------------------------------------------------------------
-- public.mas_vendidos(desde, hasta, limite)
-- Productos más vendidos entre dos fechas (inclusivas, hora de Monterrey),
-- solo ventas completadas. Función y no vista porque necesita el rango como
-- parámetro. SECURITY INVOKER: respeta RLS (un cajero ve solo sus ventas).
-- -----------------------------------------------------------------------------
create or replace function public.mas_vendidos(
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
language sql
stable
security invoker
set search_path = ''
as $$
  select
    d.producto_id,
    p.codigo,
    p.nombre,
    p.unidad,
    sum(d.cantidad)                                   as cantidad,
    sum(d.importe)                                    as importe,
    round(sum(d.cantidad * d.costo_unitario), 2)      as costo,
    sum(d.importe) - round(sum(d.cantidad * d.costo_unitario), 2) as ganancia
  from public.venta_detalle d
  join public.ventas v on v.id = d.venta_id
  join public.productos p on p.id = d.producto_id
  where v.estado = 'completada'
    and v.creado_en >= (p_desde::timestamp at time zone 'America/Monterrey')
    and v.creado_en <  ((p_hasta + 1)::timestamp at time zone 'America/Monterrey')
  group by d.producto_id, p.codigo, p.nombre, p.unidad
  order by importe desc, cantidad desc
  limit least(greatest(coalesce(p_limite, 5), 1), 100);
$$;

revoke execute on function public.mas_vendidos(date, date, int) from public, anon;
grant execute on function public.mas_vendidos(date, date, int) to authenticated;
