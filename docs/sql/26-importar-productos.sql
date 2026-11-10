-- =============================================================================
-- 26-importar-productos.sql — Importar productos desde Excel o CSV
-- Fase 7b · Requiere: 01 a 25 (09 crear_producto, 14 aplicar_movimiento)
--
-- La app lee el archivo en el servidor, valida cada fila con zod y manda aquí
-- solo las filas válidas, en JSON. Esta función vuelve a validar todo:
--
--   public.importar_productos(p_clave, p_filas, p_actualizar_existentes)
--
-- - Solo dueño. SECURITY DEFINER, search_path = '', sin permiso para anon.
-- - Todo o nada: es una sola llamada. Si una fila falla, no queda nada y el
--   error dice "Fila N: …" (N es la fila del archivo).
-- - Productos nuevos: se crean con public.crear_producto (mismas reglas que
--   el alta a mano), que registra el stock inicial como entrada.
-- - Códigos que ya existen: se omiten. Con p_actualizar_existentes = true se
--   actualizan solo precio y costo (nunca stock, nombre ni categoría).
-- - Categorías y proveedores que no existen: se crean. Se comparan sin
--   importar mayúsculas, acentos ni espacios de más ("electrico " es
--   "Eléctrico"). Si coincide con uno desactivado, la fila es un error.
-- - Idempotente: la clave (uuid del formulario) se guarda en
--   privado.importaciones. Repetir la llamada con la misma clave, aunque sea
--   al mismo tiempo (doble clic), regresa el mismo resumen sin repetir nada.
-- - Regresa un resumen en jsonb sin costos.
--
-- En la demo, cargar_semilla (07) trunca productos, categorías, proveedores,
-- movimientos y privado.importaciones: lo importado se borra cada noche.
--
-- Se puede volver a correr.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Bitácora de importaciones (idempotencia)
-- -----------------------------------------------------------------------------
create table if not exists privado.importaciones (
  clave      uuid primary key,
  usuario_id uuid not null references public.perfiles (id),
  creado_en  timestamptz not null default now(),
  resumen    jsonb
);
revoke all on privado.importaciones from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Nombre normalizado: minúsculas, sin acentos, sin espacios de más.
--    La app usa la misma regla (app/lib/importar.ts) para la vista previa.
-- -----------------------------------------------------------------------------
create or replace function privado.normalizar_nombre(p_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
           translate(lower(trim(coalesce(p_texto, ''))),
                     'áàäâãéèëêíìïîóòöôõúùüûñç',
                     'aaaaaeeeeiiiiooooouuuunc'),
           '\s+', ' ', 'g');
$$;
revoke all on function privado.normalizar_nombre(text) from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Número de una fila: texto o número JSON, sin signo. null si viene vacío.
--    Lanza LT422 con la fila si no es un número.
-- -----------------------------------------------------------------------------
create or replace function privado.numero_de_fila(p_valor text, p_fila int, p_campo text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := trim(coalesce(p_valor, ''));
begin
  if v = '' then
    return null;
  end if;
  if v !~ '^\d{1,12}(\.\d{1,12})?$' then
    raise exception 'Fila %: % no es un número válido.', p_fila, p_campo using errcode = 'LT422';
  end if;
  return v::numeric;
end;
$$;
revoke all on function privado.numero_de_fila(text, int, text) from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. importar_productos
-- -----------------------------------------------------------------------------
create or replace function public.importar_productos(
  p_clave                 uuid,
  p_filas                 jsonb,
  p_actualizar_existentes boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := privado.usuario_validado(true);
  v_previa       privado.importaciones;
  v_fila         jsonb;
  v_i            int := 0;
  v_n            int;
  v_num          int;
  v_codigo       text;
  v_existente    public.productos;
  v_costo        numeric(12,2);
  v_precio       numeric(12,2);
  v_texto        text;
  v_cat_id       bigint;
  v_prov_id      bigint;
  v_activo       boolean;
  v_desc         text;
  v_creados      int := 0;
  v_actualizados int := 0;
  v_omitidos     int := 0;
  v_cats_nuevas  text[] := '{}';
  v_provs_nuevos text[] := '{}';
  v_resumen      jsonb;
  v_estado       text;
  v_mensaje      text;
begin
  -- 1. Entrada ----------------------------------------------------------------
  if p_clave is null then
    raise exception 'Falta la clave de la importación.' using errcode = 'LT422';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
    raise exception 'No hay filas para importar.' using errcode = 'LT422';
  end if;
  v_n := jsonb_array_length(p_filas);
  if v_n = 0 then
    raise exception 'No hay filas para importar.' using errcode = 'LT422';
  end if;
  if v_n > 500 then
    raise exception 'Se pueden importar hasta 500 filas a la vez.' using errcode = 'LT422';
  end if;

  -- 2. Idempotencia -----------------------------------------------------------
  -- Si otra llamada con la misma clave está en curso, este INSERT espera a que
  -- termine: si se guardó, aquí hay conflicto y se regresa su resumen; si se
  -- revirtió, este INSERT entra y la importación corre normal.
  insert into privado.importaciones (clave, usuario_id)
  values (p_clave, v_uid)
  on conflict (clave) do nothing;

  if not found then
    select * into v_previa from privado.importaciones i where i.clave = p_clave;
    if v_previa.usuario_id <> v_uid then
      raise exception 'Esa clave de importación ya se usó.' using errcode = 'LT409';
    end if;
    return v_previa.resumen || jsonb_build_object('repetida', true);
  end if;

  -- Una importación a la vez: así dos importaciones no crean la misma
  -- categoría ni el mismo código al mismo tiempo.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('latuerca:importar_productos'));

  -- 3. Códigos repetidos dentro del archivo -----------------------------------
  select f.n, trim(f.e->>'codigo') into v_num, v_codigo
  from (
    select x.e,
           case when coalesce(x.e->>'fila', '') ~ '^\d{1,6}$' then (x.e->>'fila')::int else x.i::int end as n,
           count(*) over (partition by trim(x.e->>'codigo')) as veces,
           row_number() over (partition by trim(x.e->>'codigo') order by x.i) as orden
    from jsonb_array_elements(p_filas) with ordinality x(e, i)
    where jsonb_typeof(x.e) = 'object' and trim(coalesce(x.e->>'codigo', '')) <> ''
  ) f
  where f.veces > 1 and f.orden = 2
  order by f.n
  limit 1;
  if v_codigo is not null then
    raise exception 'Fila %: el código "%" está repetido en el archivo.', v_num, v_codigo
      using errcode = 'LT422';
  end if;

  -- 4. Fila por fila ----------------------------------------------------------
  for v_fila in select e from jsonb_array_elements(p_filas) e loop
    v_i := v_i + 1;
    if jsonb_typeof(v_fila) <> 'object' then
      raise exception 'Fila %: formato no válido.', v_i using errcode = 'LT422';
    end if;
    v_num := v_i;
    if coalesce(v_fila->>'fila', '') ~ '^\d{1,6}$' then
      v_num := (v_fila->>'fila')::int;
    end if;
    v_codigo := trim(coalesce(v_fila->>'codigo', ''));

    -- a) El código ya existe: omitir, o actualizar precio y costo.
    select * into v_existente from public.productos p where p.codigo = v_codigo for update;
    if found then
      if not coalesce(p_actualizar_existentes, false) then
        v_omitidos := v_omitidos + 1;
        continue;
      end if;
      v_costo  := round(privado.numero_de_fila(v_fila->>'costo', v_num, 'el costo'), 2);
      v_precio := round(privado.numero_de_fila(v_fila->>'precio', v_num, 'el precio'), 2);
      if v_costo is null or v_precio is null then
        raise exception 'Fila %: faltan el costo o el precio.', v_num using errcode = 'LT422';
      end if;
      if v_costo = v_existente.costo and v_precio = v_existente.precio then
        v_omitidos := v_omitidos + 1;
        continue;
      end if;
      update public.productos p set costo = v_costo, precio = v_precio where p.id = v_existente.id;
      v_actualizados := v_actualizados + 1;
      continue;
    end if;

    -- b) Categoría: la existente (sin importar mayúsculas, acentos ni
    --    espacios) o una nueva. Si hay varias que coinciden, la activa más
    --    antigua.
    v_cat_id := null;
    v_texto := regexp_replace(trim(coalesce(v_fila->>'categoria', '')), '\s+', ' ', 'g');
    if v_texto <> '' then
      select c.id, c.activo into v_cat_id, v_activo
      from public.categorias c
      where privado.normalizar_nombre(c.nombre) = privado.normalizar_nombre(v_texto)
      order by c.activo desc, c.id
      limit 1;
      if v_cat_id is null then
        if length(v_texto) > 60 then
          raise exception 'Fila %: la categoría puede tener hasta 60 caracteres.', v_num using errcode = 'LT422';
        end if;
        insert into public.categorias (nombre) values (v_texto) returning id into v_cat_id;
        v_cats_nuevas := v_cats_nuevas || v_texto;
      elsif not v_activo then
        raise exception 'Fila %: la categoría "%" está desactivada.', v_num, v_texto using errcode = 'LT422';
      end if;
    end if;

    -- c) Proveedor: igual que la categoría.
    v_prov_id := null;
    v_texto := regexp_replace(trim(coalesce(v_fila->>'proveedor', '')), '\s+', ' ', 'g');
    if v_texto <> '' then
      select pr.id, pr.activo into v_prov_id, v_activo
      from public.proveedores pr
      where privado.normalizar_nombre(pr.nombre) = privado.normalizar_nombre(v_texto)
      order by pr.activo desc, pr.id
      limit 1;
      if v_prov_id is null then
        if length(v_texto) > 120 then
          raise exception 'Fila %: el proveedor puede tener hasta 120 caracteres.', v_num using errcode = 'LT422';
        end if;
        insert into public.proveedores (nombre) values (v_texto) returning id into v_prov_id;
        v_provs_nuevos := v_provs_nuevos || v_texto;
      elsif not v_activo then
        raise exception 'Fila %: el proveedor "%" está desactivado.', v_num, v_texto using errcode = 'LT422';
      end if;
    end if;

    v_desc := nullif(trim(coalesce(v_fila->>'descripcion', '')), '');
    if length(v_desc) > 500 then
      raise exception 'Fila %: la descripción puede tener hasta 500 caracteres.', v_num using errcode = 'LT422';
    end if;

    -- d) Crear con las reglas de siempre. Su error se reporta con la fila y
    --    conserva su código (LT422, LT409…); la transacción completa se revierte.
    begin
      perform public.crear_producto(
        p_codigo        => v_codigo,
        p_nombre        => v_fila->>'nombre',
        p_unidad        => v_fila->>'unidad',
        p_costo         => privado.numero_de_fila(v_fila->>'costo', v_num, 'el costo'),
        p_precio        => privado.numero_de_fila(v_fila->>'precio', v_num, 'el precio'),
        p_stock_minimo  => coalesce(privado.numero_de_fila(v_fila->>'stock_minimo', v_num, 'el stock mínimo'), 0),
        p_stock_inicial => coalesce(privado.numero_de_fila(v_fila->>'stock_inicial', v_num, 'el stock inicial'), 0),
        p_categoria_id  => v_cat_id,
        p_proveedor_id  => v_prov_id,
        p_descripcion   => v_desc
      );
    exception when others then
      get stacked diagnostics v_estado = returned_sqlstate, v_mensaje = message_text;
      if v_mensaje like 'Fila %' then
        raise exception '%', v_mensaje using errcode = v_estado;
      end if;
      raise exception 'Fila %: %', v_num, v_mensaje using errcode = v_estado;
    end;
    v_creados := v_creados + 1;
  end loop;

  -- 5. Resumen ----------------------------------------------------------------
  v_resumen := jsonb_build_object(
    'creados',            v_creados,
    'actualizados',       v_actualizados,
    'omitidos',           v_omitidos,
    'categorias_creadas', to_jsonb(v_cats_nuevas),
    'proveedores_creados', to_jsonb(v_provs_nuevos),
    'repetida',           false
  );
  update privado.importaciones i set resumen = v_resumen where i.clave = p_clave;
  return v_resumen;
end;
$$;

revoke execute on function public.importar_productos(uuid, jsonb, boolean) from public, anon;
grant execute on function public.importar_productos(uuid, jsonb, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Resumen
-- -----------------------------------------------------------------------------
select
  to_regclass('privado.importaciones') is not null                                  as bitacora,
  (select prosecdef from pg_proc where oid = 'public.importar_productos(uuid, jsonb, boolean)'::regprocedure)
                                                                                    as security_definer,
  not has_function_privilege('anon', 'public.importar_productos(uuid, jsonb, boolean)', 'execute')
                                                                                    as sin_anon,
  privado.normalizar_nombre('  ELÉCTRICO   de  Baño ') = 'electrico de bano'        as normaliza;
