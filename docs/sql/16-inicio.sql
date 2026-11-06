-- =============================================================================
-- 16-inicio.sql — Indicadores de la pantalla de Inicio
-- Requiere: 01 a 15.
--
-- Tres funciones. Las tres:
--   - SECURITY DEFINER con search_path = '', sin permiso para public/anon.
--   - Validan sesión, perfil activo y rol con privado.usuario_validado().
--   - Filtran ventas por un rango sobre creado_en (usa ventas_creado_en_idx),
--     solo ventas completadas.
--
-- 1. resumen_ventas(desde, hasta): número de ventas, total y ganancia en un
--    rango de instantes [desde, hasta). Dueño: todo el negocio. Cajero: solo
--    sus ventas y SIN ganancia (null: ni siquiera se calcula para él).
--    Rango de instantes y no de días para comparar "hoy hasta ahora" contra
--    "el mismo día de la semana pasada hasta la misma hora".
-- 2. ventas_por_dia(desde, hasta): un renglón por día de Monterrey, con los
--    días sin ventas en 0. Solo dueño.
-- 3. valor_inventario(): Σ stock × costo de los productos activos. Solo dueño.
--
-- Ganancia = ventas − costo de lo vendido, con el costo copiado en
-- venta_detalle al momento de la venta (mismo cálculo que v_ventas_por_dia).
--
-- Errores: LT401 sin sesión o inactivo, LT403 cajero donde es solo dueño,
-- LT422 rango inválido. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. resumen_ventas
-- -----------------------------------------------------------------------------
create or replace function public.resumen_ventas(
  p_desde timestamptz,
  p_hasta timestamptz
)
returns table (
  num_ventas int,
  ventas     numeric,
  ganancia   numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid    := privado.usuario_validado(false);
  v_dueno boolean := public.es_dueno();
begin
  if p_desde is null or p_hasta is null or p_desde >= p_hasta then
    raise exception 'Rango de fechas inválido.' using errcode = 'LT422';
  end if;
  if p_hasta - p_desde > interval '93 days' then
    raise exception 'El rango no puede ser mayor a 92 días.' using errcode = 'LT422';
  end if;

  return query
  with v as (
    select x.id, x.total
    from public.ventas x
    where x.estado = 'completada'
      and x.creado_en >= p_desde
      and x.creado_en <  p_hasta
      and (v_dueno or x.usuario_id = v_uid)
  ),
  c as (
    -- Solo para el dueño: con v_dueno = false no se lee ningún costo.
    select d.venta_id, round(sum(d.cantidad * d.costo_unitario), 2) as costo
    from public.venta_detalle d
    join v on v.id = d.venta_id
    where v_dueno
    group by d.venta_id
  )
  select
    (select count(*) from v)::int,
    (select coalesce(sum(v.total), 0) from v)::numeric(12,2),
    case when v_dueno then
      ((select coalesce(sum(v.total), 0) from v)
       - (select coalesce(sum(c.costo), 0) from c))::numeric(12,2)
    end;
end;
$$;

revoke execute on function public.resumen_ventas(timestamptz, timestamptz) from public, anon;
grant execute on function public.resumen_ventas(timestamptz, timestamptz) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. ventas_por_dia — para la gráfica (solo dueño)
-- -----------------------------------------------------------------------------
create or replace function public.ventas_por_dia(
  p_desde date,
  p_hasta date
)
returns table (
  dia        date,
  num_ventas int,
  ventas     numeric,
  ganancia   numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_desde timestamptz;
  v_hasta timestamptz;
begin
  perform privado.usuario_validado(true);

  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'Rango de fechas inválido.' using errcode = 'LT422';
  end if;
  if p_hasta - p_desde > 91 then
    raise exception 'El rango no puede ser mayor a 92 días.' using errcode = 'LT422';
  end if;

  -- Días de Monterrey → instantes, para usar el índice de creado_en.
  v_desde := p_desde::timestamp at time zone 'America/Monterrey';
  v_hasta := (p_hasta + 1)::timestamp at time zone 'America/Monterrey';

  return query
  with v as (
    select x.id, x.total,
           (x.creado_en at time zone 'America/Monterrey')::date as d
    from public.ventas x
    where x.estado = 'completada'
      and x.creado_en >= v_desde
      and x.creado_en <  v_hasta
  ),
  c as (
    select dt.venta_id, round(sum(dt.cantidad * dt.costo_unitario), 2) as costo
    from public.venta_detalle dt
    join v on v.id = dt.venta_id
    group by dt.venta_id
  ),
  por_dia as (
    select v.d,
           count(*)::int                           as n,
           sum(v.total)                            as total_dia,
           sum(v.total - coalesce(c.costo, 0))     as ganancia_dia
    from v
    left join c on c.venta_id = v.id
    group by v.d
  )
  select s.d::date,
         coalesce(p.n, 0),
         coalesce(p.total_dia, 0)::numeric(12,2),
         coalesce(p.ganancia_dia, 0)::numeric(12,2)
  from generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day') s(d)
  left join por_dia p on p.d = s.d::date
  order by 1;
end;
$$;

revoke execute on function public.ventas_por_dia(date, date) from public, anon;
grant execute on function public.ventas_por_dia(date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. valor_inventario (solo dueño)
-- -----------------------------------------------------------------------------
create or replace function public.valor_inventario()
returns table (
  valor     numeric,
  productos int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.usuario_validado(true);

  return query
  select coalesce(round(sum(p.stock * p.costo), 2), 0)::numeric(12,2),
         count(*)::int
  from public.productos p
  where p.activo;
end;
$$;

revoke execute on function public.valor_inventario() from public, anon;
grant execute on function public.valor_inventario() to authenticated;
