# Endurecimiento (entre la Fase 6 y la 7)

Tres pendientes antes de la Fase 7: Node 22, costos solo para el dueño y folios sin huecos.

## Qué se hizo

### Base de datos
| Script | Contenido |
|---|---|
| `20-costos-solo-dueno.sql` | Quita el `SELECT` de las columnas de costo a la API, quita `v_ventas_por_dia`, crea `costos_productos()` y cambia `mas_vendidos()` a `SECURITY DEFINER`. |
| `21-pruebas-costos-solo-dueno.sql` | 7 pruebas en `BEGIN … ROLLBACK`: catálogo, cajero camino por camino, dueño y `anon`. |
| `22-folios-consecutivos.sql` | Contador de folios dentro de la transacción del cobro y candado en orden en `registrar_venta`. |
| `23-pruebas-folios-consecutivos.sql` | 7 pruebas (más una 5b) en `BEGIN … ROLLBACK`. |
| `07-semilla.sql` | Pone el contador en 0 después del `truncate` (si `22` ya está instalado). Además, los 7 de stock bajo amanecen ya en su mínimo o abajo (ver Stock bajo). |
| `08` y `17` | Se ajustaron porque leían `v_ventas_por_dia` o leían el costo como dueño (ver Decisiones). |
| `19` | La prueba 7 revisa además que, recién cargada la semilla, haya 7 en stock bajo y que alcance el stock para las ventas pendientes del día. |

### Costos: inventario de lo que se exponía
| Camino | Antes, para el cajero | Ahora |
|---|---|---|
| `productos.costo` | Lo leía de todos los productos | Sin `SELECT` para la API (42501), tampoco para filtrar, ordenar ni sumar |
| `venta_detalle.costo_unitario` | Lo leía de sus ventas | Igual: sin `SELECT` |
| `v_ventas_por_dia` (costo, ganancia) | De sus ventas | Se quitó: la reemplaza `ventas_por_dia()` (solo dueño) |
| `mas_vendidos()` (costo, ganancia) | De sus ventas | `SECURITY DEFINER`: al cajero le da solo sus ventas, con costo y ganancia en `null` |
| `movimientos_inventario.costo_unitario` | No (RLS solo dueño) | Sin cambio |
| `resumen_ventas()` | Ganancia `null` | Sin cambio |
| `ventas_por_dia()`, `valor_inventario()` | `LT403` | Sin cambio |
| `crear_producto`, `registrar_movimiento`, `registrar_ajuste`, `cancelar_venta` (regresan filas con costo) | `LT403` | Sin cambio |
| `registrar_venta`, `productos_frecuentes` | Sin costos | Sin cambio |
| GraphQL (`pg_graphql`) | Lo mismo que las tablas | La app no lo usa: se desactiva (ver pasos) |
| Realtime | — | Ninguna tabla con costos está en `supabase_realtime` (prueba 1) |

**El dueño** tampoco lee las columnas directo: obtiene costos solo con funciones `SECURITY DEFINER` que validan su rol. Son `costos_productos(ids)` (nueva, hasta 500 ids), `mas_vendidos`, `ventas_por_dia` y `valor_inventario`.
- Sigue guardando el costo, porque conserva su `UPDATE (costo)` y la política solo deja escribir al dueño.
- `UPDATE … RETURNING costo`, `SET costo = costo + 1` y `select *` sobre esas dos tablas ahora fallan también para él.

### Folios
- **Contador:** `privado.contador_folios` es una sola fila, y `privado.siguiente_folio()` hace `UPDATE … ultimo + 1 RETURNING`.
- **`ventas.folio`** deja de ser `identity` y toma ese valor por default. El número sale dentro de la transacción del cobro, así que si el cobro falla se revierte con todo.
- **`registrar_venta`** es la misma de `12` más una línea: toma el candado del contador **antes** de bloquear los productos.
  - Así el orden de los candados es siempre contador → productos.
  - Sin eso, `avanzar_demo`, que cobra varias ventas en una sola transacción, podía quedar en deadlock con un cobro normal.
- **Cobro idempotente:**
  - Un reintento con la misma clave regresa la venta antes de llegar al contador.
  - Un choque con el índice único de la clave revierte también el folio.

### App
- **`getProducto`** ya no pide `costo`, y el tipo `Producto` ya no lo tiene.
- **Nuevo `getCostoProducto(id)`** (`app/lib/data.ts`): llama a `costos_productos` y regresa `null` si no se pudo leer.
- **Editar producto (dueño):** el costo se pide aparte, en paralelo con categorías y proveedores. Si no se pudo leer, en lugar del formulario sale "No se pudo cargar el costo del producto". Guardar exige costo, y no debe sobrescribirse sin ver el actual.
- **Entrada de inventario:** el último costo se pide solo en entradas.
  - Si no se pudo leer, el campo queda vacío con el aviso "No se pudo leer el último costo. Si lo dejas vacío, el costo del producto no cambia". Vacío llega a la BD como `null` y no toca el costo.
  - No se prellena con 0, porque se guardaría como costo del producto.
- **Escrituras revisadas:** ninguna pide `costo` de regreso.
  - Actualizar producto devuelve solo `id`.
  - Crear producto, entradas, mermas y ajustes van por funciones.
  - Las demás lecturas de `productos` y `venta_detalle` listan columnas sin costo.
  - La única que lee `costo_unitario` es el historial de movimientos, que es solo del dueño por RLS y esa columna no cambió.

### Node 22
- **`package.json`:** `"engines": { "node": "22.x" }` y `@types/node` en `^22` (instaló 22.20.5). `package-lock.json` actualizado.
- **Vercel:** respeta `engines`, que manda sobre lo que diga Settings → Build and Deployment → Node.js Version.
  - En el primer deploy hay que revisar que el log diga Node 22.x.
  - Si en Settings hay otra versión elegida, solo sale una advertencia; conviene ponerla también en 22.x.

**Verificación:** `npx tsc --noEmit`, `npm run lint` y `npm run build` sin errores.

### Resultado en PGlite
- **Instalación limpia del `01` al `23`:** pasan `08`, `10`, `13`, `15`, `17`, `19`, `21` y `23`. Después de recargar la semilla y volver a correr `18` y `reset_demo()`, pasan otra vez.
- **Volver a correr `20` y `22`:** no rompe nada.
- **Si alguien vuelve a correr `03` o `06`:** se vuelven a abrir los costos y `21` lo detecta. Volver a correr `20` lo cierra.
- **Si alguien vuelve a correr `12`:** se pierde el candado del contador y `23` lo detecta. Volver a correr `22` lo arregla.
- **Fallas metidas a propósito, todas detectadas:**

  | Falla | Prueba |
  |---|---|
  | `productos.costo` sigue legible | 21 · 1 |
  | `venta_detalle.costo_unitario` sigue legible | 21 · 1 |
  | No se quita `v_ventas_por_dia` | 21 · 1 |
  | `mas_vendidos` le da costo al cajero | 21 · 5 |
  | `mas_vendidos` sin filtrar las ventas del cajero | 21 · 5 |
  | `costos_productos` sin validar el rol | 21 · 5 |
  | `costos_productos` sin límite de ids | 21 · 6 |
  | Una función nueva que regresa costos | 21 · 1 |
  | Folio con secuencia (deja huecos) | 23 · 3 |
  | `registrar_venta` sin el candado del contador | 23 · 1 |
  | `authenticated` puede pedir folios | 23 · 1 |
  | La semilla no reinicia el contador | 23 · 7 |

- **Días completos simulados** (reinicio a las 03:00 y ventas automáticas cada minuto, de lunes a domingo): folios del 1 al N sin huecos todos los días. Siguen siendo 7 de stock bajo, sin negativos, y las mismas comparaciones que en la Fase 6.

## Pasos en Supabase
1. **Desactivar GraphQL:** en Database → Extensions, buscar `pg_graphql` y apagarlo.
   - La app no lo usa: no hay ninguna referencia a GraphQL en `app/`.
   - Con eso, `/graphql/v1` deja de responder datos. La prueba 1 de `21` lo revisa.
2. **SQL Editor, en orden:**
   1. `20-costos-solo-dueno.sql`: el resumen debe dar `columnas_de_costo_legibles` = 0.
   2. `21-pruebas-costos-solo-dueno.sql`.
   3. `22-folios-consecutivos.sql`: el resumen debe dar `ultimo_folio` = `folio_maximo` y `es_identity` = `NO`.
   4. `07-semilla.sql`: recarga con folios del 1 al N y deja el contador en N.
   5. `23-pruebas-folios-consecutivos.sql`. **Va después de `07`:** su prueba 7 recarga la semilla y espera que la `07` instalada reinicie el contador. Con la `07` vieja falla con "Folios 228…451 para 224 ventas".
   6. `08`, `10`, `13`, `15`, `17`, `19` y `21`.

### Resultado en Supabase (10 de noviembre de 2026)
- **Ya corridos sin errores:** `20` (`columnas_de_costo_legibles` = 0), `21`, `22` (`ultimo_folio` = `folio_maximo` = 224, `es_identity` = NO), `07` (40 productos, folios 1…224, contador en 224), `23`, y `08`, `10`, `13`, `15`, `17` y `19`.
- **`pg_graphql`:** ya estaba apagado.
- **Funciones idénticas a los archivos:** `registrar_venta`, `costos_productos`, `mas_vendidos` y `cargar_semilla` coinciden en la base por md5.
- **pg_cron:** el `reset-demo` de la noche anterior salió `succeeded`, y `ventas-demo` corre cada minuto sin errores.
- **Stock bajo:** recién cargada la semilla el martes, `v_stock_bajo` dio 6 y no 7. Se corrigió en `07` (ver Stock bajo).
  - Con la `07` nueva corrida: `stock_bajo` = 7 recién cargada, con PIN-002 en 8/8, y la prueba 7 de `19` pasa.
  - Las funciones en la base siguen coincidiendo con los archivos.

### Prueba en la app como dueño
- **Inicio:** muestra ganancia y valor del inventario ($36,522.50).
- **Editar producto:** carga el costo y el margen. Guardar el costo funciona: se cambió a 66 y se regresó a 65.
- **Entrada de inventario:** prellena el costo guardado.
- **Venta:** tomó el folio 225, justo después del 224. Inicio muestra la ganancia correcta: $230 de venta, $100 de ganancia.

### Prueba contra la API real (10 de noviembre de 2026, 08:15 Monterrey)
Con los usuarios demo y la publishable key, igual que la app. El script está fuera del repo.

**Cajero, por REST.** Todos dan 403 `42501`:
- `productos?select=costo`
- `productos?select=*`
- filtrar por `costo` (`costo=gt.0` y dentro de `or=(…)`)
- ordenar por `costo`
- `venta_detalle?select=costo_unitario`
- `venta_detalle?select=*`
- filtrar por `costo_unitario`
- embebidos: `ventas → venta_detalle(costo_unitario)`, `ventas → venta_detalle(*)`, `venta_detalle → productos(costo)` y `productos → venta_detalle(costo_unitario)`

**Cajero, otros caminos de REST:**
- Sumar con `costo.sum()`: 400 `PGRST123` (los agregados están apagados en la API).
- `v_ventas_por_dia`: 404 `PGRST205`, ya no existe.
- `movimientos_inventario?select=costo_unitario`: 200 con 0 filas (RLS).
- Las columnas permitidas siguen funcionando: `productos` (id, código, nombre, precio, stock, mínimo), `venta_detalle` (nombre, precio, cantidad, importe) y `v_stock_bajo`.

**Cajero, por RPC:**
- `mas_vendidos` (30 días): 200, sin filas. Solo le da sus ventas, y el cajero demo no tiene.
- `resumen_ventas`: 200, `ganancia` en `null`.
- `costos_productos`, `ventas_por_dia`, `valor_inventario` y `registrar_movimiento`: 400 `LT403` "Solo el dueño puede hacer esto".
- `siguiente_folio` y `set_config`: 404 `PGRST202`.
- Con `Content-Profile: privado`: 406 `PGRST106`, el esquema no está expuesto.

**GraphQL.** `POST /graphql/v1` como cajero y como `anon` responde `{"errors":[{"message":"pg_graphql extension is not enabled."}]}`, sin datos.

**Dueño:**
- `productos?select=costo`: 403 `42501`. Tampoco lee la columna directo.
- `costos_productos` (ELE-001): 9.50.
- **Guardar producto con la misma llamada que `actualizarProducto`** (`update` de todos los campos con `costo`, más `.select("id")`): funciona.
  - Se guardó un costo de 9.51 y `costos_productos` lo leyó.
  - Se regresó a 9.50 y quedó como estaba.
- `PATCH` con `Prefer: return=representation` sin `select`: 403 `42501`. PostgREST pediría todas las columnas, costo incluido.
- `PATCH … select=id,costo`: 403 `42501`.
- `PATCH` con `return=minimal`: 204.

Todas las comprobaciones salieron como se esperaba.

### Stock bajo: por qué dio 6 y no 7
- **El que faltaba era PIN-002** (esmalte negro, mínimo 8, `stock_final` 6). En la base real hay un ticket de los martes a las 11:19 que vende 4. Al cargar a las 08:00 su stock era 6 + 4 = 10, arriba del mínimo, y no salía en la alerta hasta que se cobrara ese ticket.
- **En PGlite no se vio:** con la misma `setseed`, PGlite genera otros tickets que el Postgres de Supabase. Las cantidades de folios ya lo mostraban: 224 en Supabase y 233 en PGlite para el mismo martes. Por eso el "7 desde la mañana" que se midió en PGlite no aplicaba a la base real.
- **No se cambió el `stock_final`:** dependería de qué tickets salgan, y eso cambia de una versión de Postgres a otra.
- **Arreglo en `07`, paso 8:** un producto de stock bajo (`stock_final` ≤ mínimo) amanece como máximo en su mínimo. Si lo pendiente del día es mayor, amanece en lo pendiente, para que `avanzar_demo` pueda cobrarlo todo.
  - Ejemplo: PIN-002 amanece en 8/8 y, después del ticket de las 11:19, queda en 4.
  - Los demás productos no cambian.
- **Prueba nueva en `19`, prueba 7:**
  - Recién cargada la semilla hay exactamente 7 en stock bajo.
  - Ninguna venta pendiente de hoy pide más de lo que hay en stock.
- **En PGlite:**
  - Pasan todas las suites, en instalación limpia y después de recargar.
  - En los días simulados hay 7 de stock bajo en la mañana y en la noche, sin negativos.
  - **Falla metida a propósito:** la `07` sin el tope, con el mínimo de PIN-002 en 6 y cargada el domingo a las 03:00, cuando le queda una venta pendiente. Da 6 en stock bajo y `19` falla con "Recién cargada la semilla hay 6 productos en stock bajo (deben ser 7)". Con el tope da 7 y pasa.

**Ojo con producción:** Vercel usa la misma base. Desde que corras `20` y hasta que se mergee el cambio de la app, en producción fallan la edición de productos y la entrada de inventario, porque todavía piden `costo` directo. Lo demás (vender, Inicio, el demo) sigue funcionando.

**Si se vuelve a correr un script viejo:** después de `03` o `06` hay que correr `20`, y después de `05` o `12` hay que correr `22`. Si se olvida, `21` y `23` lo detectan.

## Decisiones
- **Permisos por columna con funciones de dueño, y no una tabla aparte.** Con una tabla aparte habría que cambiar `registrar_venta`, `cancelar_venta`, `aplicar_movimiento`, `crear_producto`, la semilla y las funciones de Inicio, y el cambio de costo desde la app quedaría en dos escrituras sin transacción. Con permisos por columna, las escrituras no cambian.
- **Se quitó `v_ventas_por_dia`:** una vista `security_invoker` no puede leer el costo ni para el dueño. Además ya estaba reemplazada por `ventas_por_dia()` y nadie la usaba.
- **`mas_vendidos` conserva sus columnas,** así que Inicio no cambia. Al cajero le regresa costo y ganancia en `null`, como `resumen_ventas`.
- **Candado de catálogo en `21` (prueba 1e):** solo una lista conocida de funciones de `public` puede devolver costos o filas con costo. Si alguien agrega otra, la prueba falla hasta que se revise y se sume a la lista.
- **Pruebas viejas ajustadas:**
  - `08` · 7 usaba la vista; ahora cuenta las ventas del cajero con `resumen_ventas`.
  - `08` · 9 leía `venta_detalle` con `select *` como dueño. Ahora pide columnas, y la copia del costo se revisa como `postgres` en la nueva 9b.
  - `08` · 11 leía `productos.costo` como dueño; ahora usa `costos_productos`.
  - `08` · 13 (`anon`) revisa `costos_productos` en lugar de la vista.
  - `17` calcula la ganancia esperada desde las tablas.
- **Concurrencia de folios:** dos cobros simultáneos se forman uno tras otro un instante, el tiempo de un cobro, que para una tienda es imperceptible. PGlite tiene una sola conexión, así que esto lo cubren el diseño y la prueba de orden de candados (23 · 1).

## Pendientes
- Merge de la rama. Hasta entonces, en producción no funcionan editar producto ni la entrada de inventario.
- En el primer deploy, revisar que Vercel use Node 22.x.
