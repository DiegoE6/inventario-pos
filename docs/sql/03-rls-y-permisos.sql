-- =============================================================================
-- 03-rls-y-permisos.sql — Permisos de tabla y políticas RLS
-- Requiere: 01, 02
--
-- Dos capas:
--   1. Permisos (GRANT): qué operación y qué columnas puede tocar cada rol.
--      En cada tabla primero REVOKE ALL y luego solo los GRANT necesarios.
--      Sin el REVOKE previo, un permiso de tabla ya existente (por ejemplo,
--      los que Supabase daba por defecto) dejaría inútiles los permisos de
--      columna: UPDATE a nivel tabla incluye todas las columnas, también stock.
--   2. Políticas (RLS): qué filas.
--
-- Escritura de stock, ventas y movimientos: solo por las funciones de 04/05.
-- Ninguna tabla tiene DELETE: los catálogos se desactivan con `activo`.
--
-- Idempotente: se puede volver a correr.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- RLS en todas las tablas
-- -----------------------------------------------------------------------------
alter table public.configuracion_negocio  enable row level security;
alter table public.perfiles               enable row level security;
alter table public.categorias             enable row level security;
alter table public.proveedores            enable row level security;
alter table public.productos              enable row level security;
alter table public.ventas                 enable row level security;
alter table public.venta_detalle          enable row level security;
alter table public.movimientos_inventario enable row level security;

-- -----------------------------------------------------------------------------
-- Permisos: REVOKE ALL primero, luego lo mínimo.
-- service_role no recibe permisos: si algún proceso de servidor lo necesita
-- en una fase futura, se le da explícitamente y solo lo necesario.
-- -----------------------------------------------------------------------------
revoke all on table
  public.configuracion_negocio,
  public.perfiles,
  public.categorias,
  public.proveedores,
  public.productos,
  public.ventas,
  public.venta_detalle,
  public.movimientos_inventario
from public, anon, authenticated, service_role;

-- configuracion_negocio: la única tabla legible sin sesión (el login muestra
-- nombre, logo y color). Solo el dueño la edita (política abajo).
grant select on public.configuracion_negocio to anon, authenticated;
grant update (nombre, giro, logo_url, color_primario, telefono, direccion)
  on public.configuracion_negocio to authenticated;

-- perfiles: nadie inserta (lo hace el trigger de 02). El dueño edita estas columnas.
grant select on public.perfiles to authenticated;
grant update (nombre, rol, activo) on public.perfiles to authenticated;

-- categorias y proveedores
grant select on public.categorias to authenticated;
grant insert (nombre, activo), update (nombre, activo)
  on public.categorias to authenticated;

grant select on public.proveedores to authenticated;
grant insert (nombre, contacto, telefono, notas, activo),
      update (nombre, contacto, telefono, notas, activo)
  on public.proveedores to authenticated;

-- productos: SIN `stock` en insert ni update. Un producto nuevo nace con
-- stock 0 y su existencia inicial entra con registrar_movimiento('entrada').
grant select on public.productos to authenticated;
grant insert (codigo, nombre, descripcion, categoria_id, proveedor_id, unidad,
              costo, precio, stock_minimo, activo),
      update (codigo, nombre, descripcion, categoria_id, proveedor_id, unidad,
              costo, precio, stock_minimo, activo)
  on public.productos to authenticated;

-- Solo lectura: se escriben únicamente por las funciones.
grant select on public.ventas                 to authenticated;
grant select on public.venta_detalle          to authenticated;
grant select on public.movimientos_inventario to authenticated;

-- -----------------------------------------------------------------------------
-- Políticas
-- Las funciones van envueltas en (select ...) para que se evalúen una vez por
-- consulta y no una vez por fila.
-- -----------------------------------------------------------------------------

-- configuracion_negocio ------------------------------------------------------
drop policy if exists configuracion_select on public.configuracion_negocio;
create policy configuracion_select on public.configuracion_negocio
  for select to anon, authenticated
  using (true);

drop policy if exists configuracion_update on public.configuracion_negocio;
create policy configuracion_update on public.configuracion_negocio
  for update to authenticated
  using ((select public.es_dueno()))
  with check ((select public.es_dueno()));

-- perfiles --------------------------------------------------------------------
-- Cada quien ve el suyo (aunque esté inactivo, para que la app pueda decirle
-- "tu cuenta está desactivada"); el dueño ve todos.
drop policy if exists perfiles_select on public.perfiles;
create policy perfiles_select on public.perfiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.es_dueno()));

-- Solo el dueño edita. Sobre su propio perfil no puede quitarse el rol de
-- dueño ni desactivarse (evita que el negocio se quede sin dueño por error).
drop policy if exists perfiles_update on public.perfiles;
create policy perfiles_update on public.perfiles
  for update to authenticated
  using ((select public.es_dueno()))
  with check (
    (select public.es_dueno())
    and (id <> (select auth.uid()) or (rol = 'dueno' and activo))
  );

-- categorias, proveedores, productos: lectura para cualquier usuario activo;
-- alta y edición solo dueño -----------------------------------------------
drop policy if exists categorias_select on public.categorias;
create policy categorias_select on public.categorias
  for select to authenticated
  using ((select public.rol_actual()) is not null);

drop policy if exists categorias_insert on public.categorias;
create policy categorias_insert on public.categorias
  for insert to authenticated
  with check ((select public.es_dueno()));

drop policy if exists categorias_update on public.categorias;
create policy categorias_update on public.categorias
  for update to authenticated
  using ((select public.es_dueno()))
  with check ((select public.es_dueno()));

drop policy if exists proveedores_select on public.proveedores;
create policy proveedores_select on public.proveedores
  for select to authenticated
  using ((select public.rol_actual()) is not null);

drop policy if exists proveedores_insert on public.proveedores;
create policy proveedores_insert on public.proveedores
  for insert to authenticated
  with check ((select public.es_dueno()));

drop policy if exists proveedores_update on public.proveedores;
create policy proveedores_update on public.proveedores
  for update to authenticated
  using ((select public.es_dueno()))
  with check ((select public.es_dueno()));

drop policy if exists productos_select on public.productos;
create policy productos_select on public.productos
  for select to authenticated
  using ((select public.rol_actual()) is not null);

drop policy if exists productos_insert on public.productos;
create policy productos_insert on public.productos
  for insert to authenticated
  with check ((select public.es_dueno()));

drop policy if exists productos_update on public.productos;
create policy productos_update on public.productos
  for update to authenticated
  using ((select public.es_dueno()))
  with check ((select public.es_dueno()));

-- ventas: el dueño ve todas; el cajero activo solo las suyas -----------------
drop policy if exists ventas_select on public.ventas;
create policy ventas_select on public.ventas
  for select to authenticated
  using (
    (select public.es_dueno())
    or (
      usuario_id = (select auth.uid())
      and (select public.rol_actual()) is not null
    )
  );

-- venta_detalle: visible si la venta es visible. La subconsulta a `ventas`
-- pasa por la política de ventas, así que hereda la misma regla.
drop policy if exists venta_detalle_select on public.venta_detalle;
create policy venta_detalle_select on public.venta_detalle
  for select to authenticated
  using (exists (select 1 from public.ventas v where v.id = venta_id));

-- movimientos_inventario: solo dueño ------------------------------------------
drop policy if exists movimientos_select on public.movimientos_inventario;
create policy movimientos_select on public.movimientos_inventario
  for select to authenticated
  using ((select public.es_dueno()));
