-- =============================================================================
-- 24-ventas-y-reportes.sql — Quién canceló cada venta y funciones de Reportes
-- Requiere: 01 a 23 y el 07-semilla.sql de esta fase (que ya llena
-- cancelada_por). Si la cargar_semilla instalada es la vieja, este script se
-- detiene antes de cambiar nada (paso 0): el reinicio de la demo tronaría con
-- el CHECK nuevo.
--
-- 1. ventas.cancelada_por (→ perfiles). Se llena con lo que ya registró
--    cancelar_venta en movimientos_inventario (usuario de los movimientos
--    'cancelacion_venta'), y un CHECK lo exige en toda venta cancelada.
-- 2. cancelar_venta: la misma de 05 más cancelada_por = quien cancela.
-- 3. Funciones de Reportes. Todas:
--    - SECURITY DEFINER con search_path = '', solo dueño (LT403), sin permiso
--      para public/anon.
--    - Reciben días de Monterrey [desde, hasta] (inclusivos), máximo 366 días
--      (LT422), y filtran por ventas.creado_en (usa ventas_creado_en_idx).
--    - Solo ventas completadas, con el costo copiado en venta_detalle.
--    reporte_resumen, reporte_ventas_por_periodo, reporte_por_categoria,
--    reporte_por_metodo y reporte_sin_movimiento. Los más vendidos usan
--    mas_vendidos (20).
--
-- Si se vuelve a correr 05, hay que volver a correr 22 y este.
-- Errores: LT401 sin sesión o inactivo, LT403 no es dueño, LT422 rango inválido.
-- Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Candado: la semilla instalada debe llenar cancelada_por.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('privado.cargar_semilla(text, text, text)') is null
     or pg_get_functiondef('privado.cargar_semilla(text, text, text)'::regprocedure)
        not like '%cancelada_por%' then
    raise exception 'Corre primero el 07-semilla.sql nuevo: la semilla instalada cancela su venta de ejemplo sin cancelada_por y, con este script, el reinicio de la demo fallaría. No se cambió nada.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. ventas.cancelada_por
-- -----------------------------------------------------------------------------
alter table public.ventas
  add column if not exists cancelada_por uuid references public.perfiles (id);

create index if not exists ventas_cancelada_por_idx
  on public.ventas (cancelada_por) where cancelada_por is not null;

-- Las canceladas que ya existen: quien canceló es el usuario de sus
-- movimientos 'cancelacion_venta' (cancelar_venta y la semilla los guardan).
update public.ventas v
set cancelada_por = m.usuario_id
from (
  select distinct on (mi.venta_id) mi.venta_id, mi.usuario_id
  from public.movimientos_inventario mi
  where mi.tipo = 'cancelacion_venta'
  order by mi.venta_id, mi.creado_en
) m
where m.venta_id = v.id
  and v.estado = 'cancelada'
  and v.cancelada_por is null;

-- -----------------------------------------------------------------------------
-- 2. cancelar_venta — igual que en 05, más cancelada_por.
-- Va antes del CHECK: a partir de aquí toda cancelación lo llena.
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
      cancelada_en = now(),
      cancelada_por = v_uid
  where v.id = p_venta_id
  returning * into v_venta;

  return v_venta;
end;
$$;

revoke execute on function public.cancelar_venta(uuid, text) from public, anon;
grant execute on function public.cancelar_venta(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. CHECK: cancelada ⇔ con cancelada_por.
-- Se agrega NOT VALID (no revisa las filas existentes al crearlo, pero sí todo
-- INSERT/UPDATE desde ya) y luego se valida: después del paso 1 no debería
-- quedar ninguna cancelada sin quien canceló. Si quedara alguna (una
-- cancelación hecha a mano sin movimientos), el constraint se queda NOT VALID
-- con un aviso, en lugar de tumbar el script, y el resumen lo muestra.
-- -----------------------------------------------------------------------------
alter table public.ventas drop constraint if exists ventas_cancelada_por;
alter table public.ventas
  add constraint ventas_cancelada_por
  check ((estado = 'cancelada') = (cancelada_por is not null)) not valid;

do $$
begin
  alter table public.ventas validate constraint ventas_cancelada_por;
exception when check_violation then
  raise warning 'Hay ventas canceladas sin cancelada_por: el CHECK queda NOT VALID (las nuevas sí se revisan).';
end $$;

-- -----------------------------------------------------------------------------
-- 4. Auxiliares de Reportes (privado: la API no las ve)
-- -----------------------------------------------------------------------------
-- Días de Monterrey [desde, hasta] → instantes [desde, hasta), validando el rango.
create or replace function privado.rango_reporte(
  p_desde date,
  p_hasta date,
  out desde timestamptz,
  out hasta timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'Rango de fechas inválido.' using errcode = 'LT422';
  end if;
  if p_hasta - p_desde > 365 then
    raise exception 'El rango no puede ser mayor a 366 días.' using errcode = 'LT422';
  end if;
  desde := p_desde::timestamp at time zone 'America/Monterrey';
  hasta := (p_hasta + 1)::timestamp at time zone 'America/Monterrey';
end;
$$;

-- Agrupación según el largo del rango: hasta 31 días por día, hasta 182 por
-- semana (de lunes a domingo) y si no, por mes. Así nunca pasa de 31 barras.
create or replace function privado.agrupacion_reporte(p_desde date, p_hasta date)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when p_hasta - p_desde + 1 <= 31  then 'dia'
           when p_hasta - p_desde + 1 <= 182 then 'semana'
           else 'mes'
         end;
$$;

revoke all on function privado.rango_reporte(date, date) from public, anon, authenticated;
revoke all on function privado.agrupacion_reporte(date, date) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. reporte_resumen: ventas, costo, ganancia, número de ventas, ticket
-- promedio y las canceladas del periodo (por fecha de la venta).
-- Costo por venta redondeado a centavos, igual que Inicio (16).
-- -----------------------------------------------------------------------------
create or replace function public.reporte_resumen(p_desde date, p_hasta date)
returns table (
  num_ventas      int,
  ventas          numeric,
  costo           numeric,
  ganancia        numeric,
  ticket_promedio numeric,
  num_canceladas  int,
  canceladas      numeric
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
  with v as (
    select x.id, x.total, x.estado
    from public.ventas x
    where x.creado_en >= r.desde
      and x.creado_en <  r.hasta
  ),
  c as (
    select dt.venta_id, round(sum(dt.cantidad * dt.costo_unitario), 2) as costo
    from public.venta_detalle dt
    join v on v.id = dt.venta_id and v.estado = 'completada'
    group by dt.venta_id
  ),
  t as (
    select count(*) filter (where v.estado = 'completada')::int             as n,
           coalesce(sum(v.total) filter (where v.estado = 'completada'), 0) as total,
           coalesce(sum(c.costo), 0)                                         as costo,
           count(*) filter (where v.estado = 'cancelada')::int              as n_cancel,
           coalesce(sum(v.total) filter (where v.estado = 'cancelada'), 0)  as total_cancel
    from v
    left join c on c.venta_id = v.id
  )
  select t.n,
         t.total::numeric(12,2),
         t.costo::numeric(12,2),
         (t.total - t.costo)::numeric(12,2),
         case when t.n > 0 then round(t.total / t.n, 2) else 0 end::numeric(12,2),
         t.n_cancel,
         t.total_cancel::numeric(12,2)
  from t;
end;
$$;

revoke execute on function public.reporte_resumen(date, date) from public, anon;
grant execute on function public.reporte_resumen(date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. reporte_ventas_por_periodo: un renglón por día, semana o mes (la
-- agrupación la decide el largo del rango), con los periodos sin ventas en 0.
-- desde/hasta de cada renglón vienen recortados al rango pedido (la primera y
-- la última semana o mes pueden estar incompletas).
-- -----------------------------------------------------------------------------
create or replace function public.reporte_ventas_por_periodo(p_desde date, p_hasta date)
returns table (
  agrupacion text,
  periodo    date,
  desde      date,
  hasta      date,
  num_ventas int,
  ventas     numeric,
  costo      numeric,
  ganancia   numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r      record;
  v_agr  text;
  v_unit text;
  v_paso interval;
begin
  perform privado.usuario_validado(true);
  select * into r from privado.rango_reporte(p_desde, p_hasta);
  v_agr  := privado.agrupacion_reporte(p_desde, p_hasta);
  v_unit := case v_agr when 'dia' then 'day' when 'semana' then 'week' else 'month' end;
  v_paso := case v_agr when 'dia' then interval '1 day' when 'semana' then interval '1 week'
                       else interval '1 month' end;

  return query
  with v as (
    select x.id, x.total,
           date_trunc(v_unit, (x.creado_en at time zone 'America/Monterrey'))::date as p
    from public.ventas x
    where x.estado = 'completada'
      and x.creado_en >= r.desde
      and x.creado_en <  r.hasta
  ),
  c as (
    select dt.venta_id, round(sum(dt.cantidad * dt.costo_unitario), 2) as costo
    from public.venta_detalle dt
    join v on v.id = dt.venta_id
    group by dt.venta_id
  ),
  por as (
    select v.p,
           count(*)::int                   as n,
           sum(v.total)                    as total,
           sum(coalesce(c.costo, 0))       as costo
    from v
    left join c on c.venta_id = v.id
    group by v.p
  ),
  s as (
    select g::date as p
    from generate_series(date_trunc(v_unit, p_desde::timestamp),
                         p_hasta::timestamp, v_paso) g
  )
  select v_agr,
         s.p,
         greatest(s.p, p_desde),
         least((s.p + v_paso - interval '1 day')::date, p_hasta),
         coalesce(por.n, 0),
         coalesce(por.total, 0)::numeric(12,2),
         coalesce(por.costo, 0)::numeric(12,2),
         coalesce(por.total - por.costo, 0)::numeric(12,2)
  from s
  left join por on por.p = s.p
  order by s.p;
end;
$$;

revoke execute on function public.reporte_ventas_por_periodo(date, date) from public, anon;
grant execute on function public.reporte_ventas_por_periodo(date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. reporte_por_categoria: importe, costo y ganancia por categoría.
-- Limitación conocida: usa la categoría que el producto tiene HOY (venta_detalle
-- no guarda copia). Si un producto cambia de categoría, sus ventas pasadas se
-- van con él. El costo se redondea por categoría; la suma de categorías puede
-- diferir por centavos del costo del resumen (que redondea por venta).
-- -----------------------------------------------------------------------------
create or replace function public.reporte_por_categoria(p_desde date, p_hasta date)
returns table (
  categoria_id int,
  categoria    text,
  num_ventas   int,
  ventas       numeric,
  costo        numeric,
  ganancia     numeric
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
  select c.id::int,
         coalesce(c.nombre, 'Sin categoría'),
         count(distinct d.venta_id)::int,
         sum(d.importe)::numeric(12,2),
         round(sum(d.cantidad * d.costo_unitario), 2)::numeric(12,2),
         (sum(d.importe) - round(sum(d.cantidad * d.costo_unitario), 2))::numeric(12,2)
  from public.venta_detalle d
  join public.ventas v on v.id = d.venta_id
  join public.productos p on p.id = d.producto_id
  left join public.categorias c on c.id = p.categoria_id
  where v.estado = 'completada'
    and v.creado_en >= r.desde
    and v.creado_en <  r.hasta
  group by c.id, c.nombre
  order by 4 desc, 2;
end;
$$;

revoke execute on function public.reporte_por_categoria(date, date) from public, anon;
grant execute on function public.reporte_por_categoria(date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. reporte_por_metodo: número de ventas y total por método de pago (los
-- tres, aunque alguno esté en 0). No lleva costos, pero es de Reportes: solo
-- dueño, como las demás.
-- -----------------------------------------------------------------------------
create or replace function public.reporte_por_metodo(p_desde date, p_hasta date)
returns table (
  metodo_pago text,
  num_ventas  int,
  ventas      numeric
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
  select m.metodo,
         count(v.id)::int,
         coalesce(sum(v.total), 0)::numeric(12,2)
  from (values (1, 'efectivo'), (2, 'tarjeta'), (3, 'transferencia')) m(orden, metodo)
  left join public.ventas v
    on v.metodo_pago = m.metodo
   and v.estado = 'completada'
   and v.creado_en >= r.desde
   and v.creado_en <  r.hasta
  group by m.orden, m.metodo
  order by 3 desc, m.orden;
end;
$$;

revoke execute on function public.reporte_por_metodo(date, date) from public, anon;
grant execute on function public.reporte_por_metodo(date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. reporte_sin_movimiento: productos activos con stock que no se vendieron
-- en el periodo (ventas completadas), del que más dinero tiene detenido
-- (stock × costo) al que menos. ultima_venta: la última venta completada del
-- producto, cuando sea (null si nunca se ha vendido).
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
-- canceladas_sin_quien debe ser 0 y check_validado true.
-- -----------------------------------------------------------------------------
select
  (select count(*) from public.ventas where estado = 'cancelada')                         as canceladas,
  (select count(*) from public.ventas where estado = 'cancelada' and cancelada_por is null) as canceladas_sin_quien,
  (select convalidated from pg_constraint
    where conname = 'ventas_cancelada_por' and conrelid = 'public.ventas'::regclass)      as check_validado,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'reporte\_%' and p.prosecdef)           as funciones_reporte;
