-- =============================================================================
-- 27-pruebas-importar-productos.sql — importar_productos
-- Requiere: 01 a 26 (con la semilla cargada).
--
-- Todo dentro de BEGIN … ROLLBACK: no deja cambios.
-- "Success" en el SQL Editor = pasaron todas. Si una falla, el error dice cuál.
--
-- Usa códigos T7B-… (no existen en la semilla), HER-004 como producto que ya
-- existe y la categoría "Eléctrico" de la semilla.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Contexto (como postgres)
-- -----------------------------------------------------------------------------
select
  set_config('pruebas.dueno',
    coalesce((select id::text from auth.users where lower(email) = 'demo@latuerca.test'), ''), true),
  set_config('pruebas.cajero',
    coalesce((select id::text from auth.users where lower(email) = 'cajero@latuerca.test'), ''), true),
  set_config('pruebas.c1', gen_random_uuid()::text, true),
  set_config('pruebas.c2', gen_random_uuid()::text, true),
  set_config('pruebas.c_ajena', gen_random_uuid()::text, true);

do $$
begin
  if current_setting('pruebas.dueno') = '' or current_setting('pruebas.cajero') = '' then
    raise exception '0. Faltan los usuarios demo. Corre 07.';
  end if;
  if to_regprocedure('public.importar_productos(uuid, jsonb, boolean)') is null then
    raise exception '0. Falta 26-importar-productos.sql.';
  end if;
  if not exists (select 1 from public.productos where codigo = 'HER-004')
     or not exists (select 1 from public.categorias where nombre = 'Eléctrico' and activo) then
    raise exception '0. Falta la semilla (HER-004 y la categoría Eléctrico). Corre 07.';
  end if;
  if exists (select 1 from public.productos where codigo like 'T7B-%') then
    raise exception '0. Ya hay productos T7B-…: bórralos o recarga la semilla.';
  end if;

  -- Una categoría y un proveedor desactivados, y una clave usada por otro usuario.
  insert into public.categorias (nombre, activo) values ('Descontinuados 7B', false);
  insert into public.proveedores (nombre, activo) values ('Proveedor Viejo 7B', false);
  insert into privado.importaciones (clave, usuario_id, resumen)
  values (current_setting('pruebas.c_ajena')::uuid, current_setting('pruebas.cajero')::uuid, '{}');
end $$;

-- Datos de HER-004 antes de importar (para comparar).
select
  set_config('pruebas.her_precio', (select precio::text from public.productos where codigo = 'HER-004'), true),
  set_config('pruebas.her_costo',  (select costo::text  from public.productos where codigo = 'HER-004'), true),
  set_config('pruebas.her_stock',  (select stock::text  from public.productos where codigo = 'HER-004'), true),
  set_config('pruebas.cats_antes', (select count(*)::text from public.categorias), true);

-- =============================================================================
-- Como DUEÑO
-- =============================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.dueno'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- 1. Importación normal: nuevos, existente omitido, categorías y proveedores.
do $$
declare
  r jsonb;
begin
  r := public.importar_productos(current_setting('pruebas.c1')::uuid, jsonb_build_array(
    jsonb_build_object('fila', 2, 'codigo', 'T7B-001', 'nombre', 'Importado uno', 'unidad', 'pieza',
      'costo', '10', 'precio', '15.50', 'stock_inicial', '5', 'stock_minimo', '2',
      'categoria', '  electrico ', 'proveedor', 'Proveedor Nuevo 7B'),
    jsonb_build_object('fila', 3, 'codigo', ' T7B-002 ', 'nombre', 'Importado dos', 'unidad', 'metro',
      'costo', 2.5, 'precio', 4, 'stock_inicial', '12.5',
      'categoria', 'Categoria   Nueva 7b'),
    jsonb_build_object('fila', 4, 'codigo', 'T7B-003', 'nombre', 'Importado tres', 'unidad', 'kilo',
      'costo', '12.345', 'precio', '20', 'descripcion', '  Con descripción  '),
    jsonb_build_object('fila', 5, 'codigo', 'HER-004', 'nombre', 'Otro nombre', 'unidad', 'pieza',
      'costo', '1', 'precio', '2'),
    jsonb_build_object('fila', 6, 'codigo', 'T7B-004', 'nombre', 'Importado cuatro', 'unidad', 'caja',
      'costo', '0', 'precio', '0', 'categoria', 'CATEGORÍA nueva 7B', 'proveedor', 'proveedor  NUEVO 7b')
  ));

  assert (r->>'creados')::int = 4, format('1. creados: %s', r);
  assert (r->>'actualizados')::int = 0 and (r->>'omitidos')::int = 1, format('1. actualizados/omitidos: %s', r);
  assert r->'categorias_creadas' = '["Categoria Nueva 7b"]'::jsonb,
    format('1. categorías creadas (sin duplicar "CATEGORÍA nueva 7B" ni "Eléctrico"): %s', r->'categorias_creadas');
  assert r->'proveedores_creados' = '["Proveedor Nuevo 7B"]'::jsonb,
    format('1. proveedores creados: %s', r->'proveedores_creados');
  assert (r->>'repetida')::boolean = false, '1. repetida debe ser false';
  assert not (r::text ~* 'costo'), '1. El resumen no debe traer costos';
  raise notice '✔ 1. Importación: 4 creados, 1 omitido, 1 categoría y 1 proveedor nuevos';
end $$;

-- 2. Idempotencia: la misma clave regresa el mismo resumen y no crea nada,
--    aunque las filas sean otras.
do $$
declare
  r jsonb;
begin
  r := public.importar_productos(current_setting('pruebas.c1')::uuid, jsonb_build_array(
    jsonb_build_object('fila', 2, 'codigo', 'T7B-099', 'nombre', 'No debe crearse', 'unidad', 'pieza',
      'costo', '1', 'precio', '2')));
  assert (r->>'repetida')::boolean and (r->>'creados')::int = 4, format('2. Repetida: %s', r);
  assert not exists (select 1 from public.productos where codigo = 'T7B-099'), '2. Se creó con una clave repetida';
  raise notice '✔ 2. Misma clave: mismo resumen, nada nuevo';
end $$;

-- 3. Actualizar existentes: solo precio y costo; sin cambios cuenta como omitido.
do $$
declare
  r jsonb;
begin
  r := public.importar_productos(current_setting('pruebas.c2')::uuid, jsonb_build_array(
    jsonb_build_object('fila', 2, 'codigo', 'HER-004', 'nombre', 'Nombre que no se usa', 'unidad', 'metro',
      'costo', (current_setting('pruebas.her_costo')::numeric + 1)::text,
      'precio', (current_setting('pruebas.her_precio')::numeric + 2)::text,
      'stock_inicial', '999', 'categoria', 'Otra categoría 7B'),
    jsonb_build_object('fila', 3, 'codigo', 'T7B-001', 'nombre', 'Importado uno', 'unidad', 'pieza',
      'costo', '10.00', 'precio', '15.5')
  ), true);
  assert (r->>'actualizados')::int = 1 and (r->>'omitidos')::int = 1 and (r->>'creados')::int = 0,
    format('3. Resumen: %s', r);
  assert r->'categorias_creadas' = '[]'::jsonb, '3. Al actualizar no se crean categorías';
  raise notice '✔ 3. Existentes: precio y costo actualizados, sin cambios = omitido';
end $$;

-- 4. Todo o nada, con el número de fila en el mensaje.
do $$
declare
  v_casos jsonb := jsonb_build_array(
    -- [filas, código esperado, inicio del mensaje]
    jsonb_build_array(jsonb_build_array(
      jsonb_build_object('fila', 2, 'codigo', 'T7B-010', 'nombre', 'Bueno', 'unidad', 'pieza', 'costo', '1', 'precio', '2',
        'categoria', 'Categoría que no debe quedar'),
      jsonb_build_object('fila', 7, 'codigo', 'T7B-011', 'nombre', 'Decimales', 'unidad', 'pieza', 'costo', '1', 'precio', '2',
        'stock_inicial', '1.5')), 'LT422', 'Fila 7: Los productos por pieza no aceptan decimales'),
    jsonb_build_array(jsonb_build_array(
      jsonb_build_object('fila', 3, 'codigo', 'T7B-012', 'nombre', 'Unidad', 'unidad', 'docena', 'costo', '1', 'precio', '2')),
      'LT422', 'Fila 3: Unidad no válida'),
    jsonb_build_array(jsonb_build_array(
      jsonb_build_object('fila', 4, 'codigo', 'T7B-013', 'nombre', 'Costo', 'unidad', 'pieza', 'costo', 'abc', 'precio', '2')),
      'LT422', 'Fila 4: el costo no es un número válido'),
    jsonb_build_array(jsonb_build_array(
      jsonb_build_object('fila', 5, 'codigo', 'T7B-014', 'nombre', 'Negativo', 'unidad', 'pieza', 'costo', '1', 'precio', '-2')),
      'LT422', 'Fila 5: el precio no es un número válido'),
    jsonb_build_array(jsonb_build_array(
      jsonb_build_object('fila', 6, 'codigo', 'T7B-015', 'nombre', '', 'unidad', 'pieza', 'costo', '1', 'precio', '2')),
      'LT422', 'Fila 6: El nombre es obligatorio'),
    jsonb_build_array(jsonb_build_array(
      jsonb_build_object('fila', 8, 'codigo', 'T7B-016', 'nombre', 'A', 'unidad', 'pieza', 'costo', '1', 'precio', '2'),
      jsonb_build_object('fila', 9, 'codigo', 'T7B-016', 'nombre', 'B', 'unidad', 'pieza', 'costo', '1', 'precio', '2')),
      'LT422', 'Fila 9: el código "T7B-016" está repetido'),
    jsonb_build_array(jsonb_build_array(
      jsonb_build_object('fila', 10, 'codigo', 'T7B-017', 'nombre', 'Cat', 'unidad', 'pieza', 'costo', '1', 'precio', '2',
        'categoria', 'descontinuados 7b')),
      'LT422', 'Fila 10: la categoría "descontinuados 7b" está desactivada'),
    jsonb_build_array(jsonb_build_array(
      jsonb_build_object('fila', 11, 'codigo', 'T7B-018', 'nombre', 'Prov', 'unidad', 'pieza', 'costo', '1', 'precio', '2',
        'proveedor', 'PROVEEDOR VIEJO 7B')),
      'LT422', 'Fila 11: el proveedor "PROVEEDOR VIEJO 7B" está desactivado'),
    jsonb_build_array(jsonb_build_array(
      jsonb_build_object('fila', 12, 'codigo', 'T7B-019', 'nombre', 'Sin precio', 'unidad', 'pieza', 'costo', '1')),
      'LT422', 'Fila 12: El precio debe ser 0 o mayor'),
    jsonb_build_array('[]'::jsonb, 'LT422', 'No hay filas'),
    jsonb_build_array('{}'::jsonb, 'LT422', 'No hay filas'),
    jsonb_build_array((select jsonb_agg(jsonb_build_object('fila', g, 'codigo', 'T7B-L' || g, 'nombre', 'x',
                         'unidad', 'pieza', 'costo', '1', 'precio', '1')) from generate_series(1, 501) g),
      'LT422', 'Se pueden importar hasta 500')
  );
  v_caso   jsonb;
  v_estado text;
  v_msg    text;
begin
  for v_caso in select e from jsonb_array_elements(v_casos) e loop
    begin
      perform public.importar_productos(gen_random_uuid(), v_caso->0);
      raise exception '4. Se aceptó: %', v_caso->>2;
    exception when others then
      get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
      assert v_estado = v_caso->>1 and v_msg like (v_caso->>2) || '%',
        format('4. Esperaba %s "%s…", llegó %s "%s"', v_caso->>1, v_caso->>2, v_estado, v_msg);
    end;
  end loop;

  begin
    perform public.importar_productos(null, '[{"codigo":"T7B-020"}]');
    raise exception '4. Se aceptó una clave nula';
  exception when sqlstate 'LT422' then null;
  end;

  -- Nada de lo anterior quedó: ni productos, ni la categoría, ni las claves.
  assert not exists (select 1 from public.productos where codigo between 'T7B-010' and 'T7B-020'
                                                    or codigo like 'T7B-L%'),
    '4. Quedó un producto de una importación que falló';
  assert not exists (select 1 from public.categorias where nombre = 'Categoría que no debe quedar'),
    '4. Quedó una categoría de una importación que falló';
  raise notice '✔ 4. Todo o nada: 12 rechazos con su fila y su código, sin dejar nada';
end $$;

-- 5. Una clave que ya usó otro usuario: LT409.
do $$
begin
  begin
    perform public.importar_productos(current_setting('pruebas.c_ajena')::uuid,
      '[{"fila":2,"codigo":"T7B-030","nombre":"x","unidad":"pieza","costo":"1","precio":"1"}]');
    raise exception '5. Se aceptó la clave de otro usuario';
  exception when sqlstate 'LT409' then null;
  end;
  raise notice '✔ 5. Clave de otro usuario: LT409';
end $$;

-- =============================================================================
-- Como POSTGRES: revisar lo que quedó
-- =============================================================================
reset role;
select set_config('request.jwt.claims', '', true);

-- 6. Productos, stock inicial como entrada, categorías y proveedores.
do $$
declare
  v_elec bigint := (select id from public.categorias where nombre = 'Eléctrico');
  p      public.productos;
  m      public.movimientos_inventario;
begin
  select * into p from public.productos where codigo = 'T7B-001';
  assert p.categoria_id = v_elec, '6. "  electrico " debe usar la categoría Eléctrico';
  assert p.costo = 10 and p.precio = 15.50 and p.stock = 5 and p.stock_minimo = 2 and p.activo,
    format('6. T7B-001: %s', row_to_json(p));
  assert (select nombre from public.proveedores where id = p.proveedor_id) = 'Proveedor Nuevo 7B',
    '6. T7B-001 debe tener el proveedor nuevo';

  select * into m from public.movimientos_inventario where producto_id = p.id;
  assert m.tipo = 'entrada' and m.cantidad = 5 and m.stock_anterior = 0 and m.stock_nuevo = 5
         and m.costo_unitario = 10 and m.nota = 'Inventario inicial'
         and m.usuario_id = current_setting('pruebas.dueno')::uuid,
    format('6. Entrada de T7B-001: %s', row_to_json(m));
  assert (select count(*) from public.movimientos_inventario where producto_id = p.id) = 1,
    '6. T7B-001 debe tener una sola entrada';

  assert (select stock from public.productos where codigo = 'T7B-002') = 12.5, '6. T7B-002 con 12.5 m';
  assert (select costo from public.productos where codigo = 'T7B-003') = 12.35,
    '6. El costo se redondea igual que crear_producto (12.345 → 12.35)';
  assert (select descripcion from public.productos where codigo = 'T7B-003') = 'Con descripción',
    '6. La descripción se guarda sin espacios de más';
  assert not exists (select 1 from public.movimientos_inventario mi
                     join public.productos x on x.id = mi.producto_id where x.codigo = 'T7B-003'),
    '6. Sin stock inicial no hay movimiento';
  assert (select categoria_id from public.productos where codigo = 'T7B-004')
         = (select categoria_id from public.productos where codigo = 'T7B-002'),
    '6. "CATEGORÍA nueva 7B" debe usar la categoría que se creó en la misma importación';
  assert (select proveedor_id from public.productos where codigo = 'T7B-004')
         = (select proveedor_id from public.productos where codigo = 'T7B-001'),
    '6. "proveedor  NUEVO 7b" debe usar el proveedor que se creó en la misma importación';
  assert (select count(*) from public.categorias where privado.normalizar_nombre(nombre) = 'electrico') = 1,
    '6. Se duplicó Eléctrico';
  assert (select count(*) from public.categorias) = current_setting('pruebas.cats_antes')::int + 1,
    '6. Debe haber exactamente una categoría nueva';

  -- HER-004: precio y costo nuevos (3), mismo nombre, unidad y stock, sin movimientos nuevos.
  select * into p from public.productos where codigo = 'HER-004';
  assert p.precio = current_setting('pruebas.her_precio')::numeric + 2
     and p.costo  = current_setting('pruebas.her_costo')::numeric + 1, '6. HER-004 no se actualizó';
  assert p.stock = current_setting('pruebas.her_stock')::numeric and p.unidad = 'pieza'
     and p.nombre <> 'Nombre que no se usa' and p.nombre <> 'Otro nombre',
    '6. HER-004 cambió algo más que precio y costo';
  assert not exists (select 1 from public.categorias where nombre = 'Otra categoría 7B'),
    '6. Actualizar no debe crear categorías';

  -- Bitácora: las dos importaciones con su resumen.
  assert (select count(*) from privado.importaciones
          where clave in (current_setting('pruebas.c1')::uuid, current_setting('pruebas.c2')::uuid)
            and resumen is not null) = 2, '6. Falta el resumen en privado.importaciones';
  raise notice '✔ 6. Productos, entradas, categorías y proveedores como se esperaba';
end $$;

-- 7. Catálogo.
do $$
begin
  assert (select prosecdef from pg_proc where oid = 'public.importar_productos(uuid, jsonb, boolean)'::regprocedure),
    '7. importar_productos debe ser SECURITY DEFINER';
  assert (select proconfig @> array['search_path=""'] from pg_proc
          where oid = 'public.importar_productos(uuid, jsonb, boolean)'::regprocedure),
    '7. importar_productos debe tener search_path vacío';
  assert pg_get_function_result('public.importar_productos(uuid, jsonb, boolean)'::regprocedure) = 'jsonb',
    '7. importar_productos debe regresar jsonb (sin costos)';
  assert not has_function_privilege('anon', 'public.importar_productos(uuid, jsonb, boolean)', 'execute'),
    '7. anon puede importar';
  assert not has_function_privilege('authenticated', 'privado.normalizar_nombre(text)', 'execute')
     and not has_function_privilege('authenticated', 'privado.numero_de_fila(text, int, text)', 'execute')
     and not has_function_privilege('anon', 'privado.normalizar_nombre(text)', 'execute'),
    '7. La API puede ejecutar las auxiliares de privado';
  assert not has_table_privilege('authenticated', 'privado.importaciones', 'select')
     and not has_table_privilege('anon', 'privado.importaciones', 'select')
     and not has_table_privilege('authenticated', 'privado.importaciones', 'insert'),
    '7. La API puede leer o escribir privado.importaciones';
  assert pg_get_functiondef('privado.cargar_semilla(text, text, text)'::regprocedure) like '%privado.importaciones%',
    '7. La semilla (07) debe borrar privado.importaciones: corre el 07 nuevo';
  assert privado.normalizar_nombre('  ELÉCTRICO   de  Baño ') = 'electrico de bano'
     and privado.normalizar_nombre('Tornillería') = 'tornilleria'
     and privado.normalizar_nombre(null) = '', '7. normalizar_nombre';
  raise notice '✔ 7. SECURITY DEFINER, search_path vacío, jsonb sin costos, sin anon; la semilla borra la bitácora';
end $$;

-- =============================================================================
-- Como CAJERO
-- =============================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('pruebas.cajero'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  begin
    perform public.importar_productos(gen_random_uuid(),
      '[{"fila":2,"codigo":"T7B-040","nombre":"x","unidad":"pieza","costo":"1","precio":"1"}]');
    raise exception '8. El cajero pudo importar';
  exception when sqlstate 'LT403' then null;
  end;
  -- Ni con datos inválidos se le contesta otra cosa (el rol va primero).
  begin
    perform public.importar_productos(null, null);
    raise exception '8. El cajero recibió algo con datos inválidos';
  exception when sqlstate 'LT403' then null;
  end;
  raise notice '✔ 8. Cajero: LT403';
end $$;

-- =============================================================================
-- Como ANON
-- =============================================================================
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

do $$
begin
  begin
    perform public.importar_productos(gen_random_uuid(), '[]');
    raise exception '9. anon pudo importar';
  exception when insufficient_privilege then null;
  end;
  raise notice '✔ 9. anon: 42501';
end $$;

reset role;
rollback;
