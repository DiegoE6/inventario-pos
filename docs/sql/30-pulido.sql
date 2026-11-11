-- =============================================================================
-- 30-pulido.sql — Fase 9a: stock bajo por urgencia y "Sin movimiento" sin
-- productos nuevos
-- Requiere: 01 a 29.
--
-- 1. v_stock_bajo gana la columna `proporcion` (stock ÷ mínimo; los agotados
--    quedan en 0). Inicio pide los 50 más urgentes ordenando por ella, en
--    lugar de los primeros 50 por nombre. La columna va AL FINAL: así
--    `create or replace view` no rompe a quien ya la lee.
-- 2. reporte_sin_movimiento ya no incluye productos dados de alta dentro del
--    rango: solo los que existían desde el primer día del rango, en día de
--    Monterrey (privado.rango_reporte, igual que las demás funciones de
--    Reportes). Un producto nuevo "sin ventas" no es mercancía detenida.
--
-- 06 y 24 tienen ya estas mismas definiciones: volver a correrlos después de
-- este script no regresa al comportamiento anterior. Este archivo sirve para
-- aplicarlo en una base que ya tenía 06 y 24 viejos.
--
-- Idempotente. No regresa costos nuevos: la vista no tiene costo, y
-- reporte_sin_movimiento ya estaba en la lista de 21 (valor_detenido, solo
-- dueño).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. v_stock_bajo con proporcion
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
  pr.nombre as proveedor,
  -- Urgencia: 0 = agotado; 1 = justo en el mínimo. Sin mínimo (0) solo entra
  -- si está agotado, así que también es 0.
  case when p.stock_minimo > 0 then round(p.stock / p.stock_minimo, 4) else 0 end::numeric(12,4) as proporcion
from public.productos p
left join public.categorias c on c.id = p.categoria_id
left join public.proveedores pr on pr.id = p.proveedor_id
where p.activo
  and p.stock <= p.stock_minimo;

revoke all on table public.v_stock_bajo from public, anon, authenticated, service_role;
grant select on table public.v_stock_bajo to authenticated;

-- -----------------------------------------------------------------------------
-- 2. reporte_sin_movimiento sin productos dados de alta dentro del rango
-- -----------------------------------------------------------------------------
create or replace function public.reporte_sin_movimiento(
  p_desde  date,
  p_hasta  date,
  p_limite int default 50
)
returns table (
  producto_id    uuid,
  codigo         text,
  nombre         text,
  unidad         text,
  categoria      text,
  stock          numeric,
  valor_detenido numeric,
  ultima_venta   timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
begin
  perform privado.usuario_validado(true);
  select * into r from privado.rango_reporte(p_desde, p_hasta);

  return query
  select p.id,
         p.codigo,
         p.nombre,
         p.unidad,
         c.nombre,
         p.stock,
         round(p.stock * p.costo, 2)::numeric(12,2),
         (select max(v2.creado_en)
          from public.venta_detalle d2
          join public.ventas v2 on v2.id = d2.venta_id
          where d2.producto_id = p.id and v2.estado = 'completada')
  from public.productos p
  left join public.categorias c on c.id = p.categoria_id
  where p.activo
    and p.stock > 0
    -- Ya existía cuando empezó el rango (inicio del día p_desde en Monterrey).
    and p.creado_en < r.desde
    and not exists (
      select 1
      from public.venta_detalle d
      join public.ventas v on v.id = d.venta_id
      where d.producto_id = p.id
        and v.estado = 'completada'
        and v.creado_en >= r.desde
        and v.creado_en <  r.hasta
    )
  order by 7 desc, p.codigo
  limit least(greatest(coalesce(p_limite, 50), 1), 200);
end;
$$;

revoke execute on function public.reporte_sin_movimiento(date, date, int) from public, anon;
grant execute on function public.reporte_sin_movimiento(date, date, int) to authenticated;

-- -----------------------------------------------------------------------------
-- Resumen (es lo que muestra el SQL Editor al terminar).
-- columna_proporcion true; regla_alta true; productos_semilla_antes_del_mes_pasado
-- true (si ya se corrió el 07 nuevo; con el 07 viejo, false).
-- -----------------------------------------------------------------------------
select
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'v_stock_bajo' and column_name = 'proporcion')
                                                                                    as columna_proporcion,
  position('p.creado_en < r.desde' in pg_get_functiondef('public.reporte_sin_movimiento(date, date, int)'::regprocedure)) > 0
                                                                                    as regla_alta,
  coalesce((select bool_and(p.creado_en <
                    ((date_trunc('month', (now() at time zone 'America/Monterrey')) - interval '1 month')
                       at time zone 'America/Monterrey'))
            from public.productos p where p.codigo ~ '^[A-Z]{3}-\d{3}$'), false)
                                                                                    as productos_semilla_antes_del_mes_pasado;
