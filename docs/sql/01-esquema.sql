-- =============================================================================
-- 01-esquema.sql — Tablas, restricciones e índices
-- Fase 1 · Inventario POS (Ferretería La Tuerca)
--
-- Las 8 tablas viven en `public` (las expone la Data API, protegidas por RLS
-- en 03). El esquema `privado` es solo para funciones internas: no se expone
-- a la API y ningún rol de la API tiene USAGE sobre él.
--
-- Idempotente en la primera creación: `create ... if not exists`. Si una
-- tabla ya existe, NO se le agregan columnas ni restricciones nuevas.
-- =============================================================================

-- Búsqueda de productos por nombre con ILIKE '%texto%' (punto de venta).
create extension if not exists pg_trgm with schema extensions;

create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Trigger genérico: actualiza `actualizado_en` en cada UPDATE.
-- -----------------------------------------------------------------------------
create or replace function privado.tg_actualizado_en()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

revoke execute on function privado.tg_actualizado_en()
  from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- configuracion_negocio: una sola fila (id = 1). Marca del negocio.
-- -----------------------------------------------------------------------------
create table if not exists public.configuracion_negocio (
  id              smallint primary key default 1 check (id = 1),
  nombre          text not null check (length(trim(nombre)) between 1 and 100),
  giro            text,
  logo_url        text,
  color_primario  text not null default '#c2410c'
                  check (color_primario ~ '^#[0-9a-fA-F]{6}$'),
  telefono        text,
  direccion       text,
  actualizado_en  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- perfiles: 1 a 1 con auth.users. El trigger de 02 lo crea como cajero inactivo.
-- Borrar un usuario de Auth borra su perfil, salvo que tenga ventas o
-- movimientos (las FK lo impiden): a esos se les desactiva, no se borran.
-- -----------------------------------------------------------------------------
create table if not exists public.perfiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nombre     text not null default '',
  rol        text not null default 'cajero' check (rol in ('dueno', 'cajero')),
  activo     boolean not null default false,
  creado_en  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Catálogos
-- -----------------------------------------------------------------------------
create table if not exists public.categorias (
  id      bigint generated always as identity primary key,
  nombre  text not null check (length(trim(nombre)) between 1 and 60),
  activo  boolean not null default true
);
create unique index if not exists categorias_nombre_key
  on public.categorias (lower(nombre));

create table if not exists public.proveedores (
  id        bigint generated always as identity primary key,
  nombre    text not null check (length(trim(nombre)) between 1 and 120),
  contacto  text,
  telefono  text,
  notas     text,
  activo    boolean not null default true
);

-- -----------------------------------------------------------------------------
-- productos. `stock` solo lo cambian las funciones de 04 y 05: el permiso de
-- columna de 03 no deja tocarlo desde la API (ni al dueño).
-- -----------------------------------------------------------------------------
create table if not exists public.productos (
  id              uuid primary key default gen_random_uuid(),
  codigo          text not null check (length(trim(codigo)) between 1 and 50),
  nombre          text not null check (length(trim(nombre)) between 1 and 150),
  descripcion     text,
  categoria_id    bigint references public.categorias (id),
  proveedor_id    bigint references public.proveedores (id),
  unidad          text not null
                  check (unidad in ('pieza', 'caja', 'metro', 'kilo', 'litro')),
  costo           numeric(12,2) not null default 0 check (costo >= 0),
  precio          numeric(12,2) not null default 0 check (precio >= 0),
  stock           numeric(12,3) not null default 0 check (stock >= 0),
  stock_minimo    numeric(12,3) not null default 0 check (stock_minimo >= 0),
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create unique index if not exists productos_codigo_key
  on public.productos (codigo);
create index if not exists productos_nombre_trgm_idx
  on public.productos using gin (nombre extensions.gin_trgm_ops);
create index if not exists productos_categoria_id_idx
  on public.productos (categoria_id);
create index if not exists productos_proveedor_id_idx
  on public.productos (proveedor_id);

-- -----------------------------------------------------------------------------
-- ventas. Nunca se borran: se cancelan (05). El folio es consecutivo; puede
-- tener huecos si una venta falla a la mitad (la secuencia no retrocede).
-- -----------------------------------------------------------------------------
create table if not exists public.ventas (
  id                  uuid primary key default gen_random_uuid(),
  folio               bigint generated always as identity unique,
  subtotal            numeric(12,2) not null check (subtotal >= 0),
  total               numeric(12,2) not null check (total >= 0),
  metodo_pago         text not null
                      check (metodo_pago in ('efectivo', 'tarjeta', 'transferencia')),
  pago_recibido       numeric(12,2) not null,
  cambio              numeric(12,2) not null default 0 check (cambio >= 0),
  estado              text not null default 'completada'
                      check (estado in ('completada', 'cancelada')),
  motivo_cancelacion  text,
  usuario_id          uuid not null references public.perfiles (id),
  creado_en           timestamptz not null default now(),
  cancelada_en        timestamptz,
  constraint ventas_pago_alcanza check (pago_recibido >= total),
  constraint ventas_cambio_cuadra check (cambio = pago_recibido - total),
  constraint ventas_cambio_solo_efectivo check (metodo_pago = 'efectivo' or cambio = 0),
  constraint ventas_cancelacion_completa check (
    (estado = 'cancelada') = (cancelada_en is not null and motivo_cancelacion is not null)
  )
);
create index if not exists ventas_creado_en_idx on public.ventas (creado_en);
create index if not exists ventas_usuario_id_idx on public.ventas (usuario_id);

-- -----------------------------------------------------------------------------
-- venta_detalle: copia nombre, unidad, precio y costo al momento de la venta.
-- -----------------------------------------------------------------------------
create table if not exists public.venta_detalle (
  id               bigint generated always as identity primary key,
  venta_id         uuid not null references public.ventas (id),
  producto_id      uuid not null references public.productos (id),
  nombre_producto  text not null,
  unidad           text not null,
  cantidad         numeric(12,3) not null check (cantidad > 0),
  precio_unitario  numeric(12,2) not null check (precio_unitario >= 0),
  costo_unitario   numeric(12,2) not null check (costo_unitario >= 0),
  importe          numeric(12,2) not null check (importe >= 0)
);
create index if not exists venta_detalle_venta_id_idx on public.venta_detalle (venta_id);
create index if not exists venta_detalle_producto_id_idx on public.venta_detalle (producto_id);

-- -----------------------------------------------------------------------------
-- movimientos_inventario: bitácora de cada cambio de stock.
-- `cantidad` con signo: + entra, − sale.
-- -----------------------------------------------------------------------------
create table if not exists public.movimientos_inventario (
  id              bigint generated always as identity primary key,
  producto_id     uuid not null references public.productos (id),
  tipo            text not null
                  check (tipo in ('entrada', 'venta', 'merma', 'ajuste', 'cancelacion_venta')),
  cantidad        numeric(12,3) not null check (cantidad <> 0),
  stock_anterior  numeric(12,3) not null check (stock_anterior >= 0),
  stock_nuevo     numeric(12,3) not null check (stock_nuevo >= 0),
  costo_unitario  numeric(12,2) check (costo_unitario >= 0),
  venta_id        uuid references public.ventas (id),
  nota            text,
  usuario_id      uuid not null references public.perfiles (id),
  creado_en       timestamptz not null default now(),
  constraint movimientos_stock_cuadra check (stock_nuevo = stock_anterior + cantidad),
  constraint movimientos_signo_por_tipo check (
    (tipo in ('entrada', 'cancelacion_venta') and cantidad > 0)
    or (tipo in ('venta', 'merma') and cantidad < 0)
    or tipo = 'ajuste'
  ),
  constraint movimientos_venta_por_tipo check (
    (tipo in ('venta', 'cancelacion_venta')) = (venta_id is not null)
  ),
  constraint movimientos_merma_con_nota check (
    tipo <> 'merma' or length(trim(coalesce(nota, ''))) > 0
  )
);
create index if not exists movimientos_producto_fecha_idx
  on public.movimientos_inventario (producto_id, creado_en);
create index if not exists movimientos_venta_id_idx
  on public.movimientos_inventario (venta_id);
create index if not exists movimientos_usuario_id_idx
  on public.movimientos_inventario (usuario_id);
create index if not exists movimientos_creado_en_idx
  on public.movimientos_inventario (creado_en);

-- -----------------------------------------------------------------------------
-- Triggers de actualizado_en
-- -----------------------------------------------------------------------------
drop trigger if exists tg_actualizado_en on public.configuracion_negocio;
create trigger tg_actualizado_en
  before update on public.configuracion_negocio
  for each row execute function privado.tg_actualizado_en();

drop trigger if exists tg_actualizado_en on public.productos;
create trigger tg_actualizado_en
  before update on public.productos
  for each row execute function privado.tg_actualizado_en();
