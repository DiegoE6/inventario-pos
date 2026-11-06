# Fase 4 — Inventario

## Qué se hizo

### Base de datos
| Script | Contenido |
|---|---|
| `14-movimiento-idempotente.sql` | `movimientos_inventario.clave_cliente` (uuid, índice único parcial). `registrar_movimiento(..., p_clave)` y `registrar_ajuste(..., p_clave, p_stock_esperado)` con candado consultivo por clave. Ayudantes `privado.movimiento_por_clave` y `privado.aplicar_movimiento_con_clave` (respaldo del índice único). |
| `15-pruebas-movimiento-idempotente.sql` | 11 pruebas en `BEGIN … ROLLBACK`. |
| `04-funciones-inventario.sql` | Nota y `DROP` de las versiones nuevas: si se vuelve a correr `04`, hay que correr `14` después. |

**Resultado en Supabase:**
- `14` y `15` corrieron sin errores. El `15` termina mostrando el último `set_config`, que es lo normal.
- `08` y `13` se volvieron a correr y siguen pasando con las firmas nuevas.

**En PGlite:**
- Instalación limpia del `01` al `15`.
- Re-ejecución `04` → `14`: queda una sola versión de cada función.
- Pasan las suites `08`, `10`, `13` y `15`, y `15` también después de recargar la semilla.
- Se rompió `14` cuatro veces a propósito y `15` detectó cada falla con su número:

  | Falla metida | Prueba que la detecta |
  |---|---|
  | Sin candado | 4 |
  | Sin respaldo del índice | 9 |
  | Sin validar de quién es la clave | 8 |
  | Ajuste sin stock esperado | 7 |

### Pantallas (solo dueño)
| Ruta | Contenido |
|---|---|
| `/panel/inventario` | Accesos a Entrada, Merma y Conteo (si hay un producto filtrado, abren con él) e historial paginado. |
| `/panel/inventario/entrada?producto=<id>` | Cantidad, costo unitario y nota opcional. El costo se prellena con el del producto, leído en el servidor con `requireDueno()`. Vista previa "Stock 18 → 23 pza". |
| `/panel/inventario/merma?producto=<id>` | Cantidad y nota obligatoria. No deja restar más de lo que hay (la BD también lo valida). |
| `/panel/inventario/conteo?producto=<id>` | Lo que contaste, con la diferencia contra el stock actual antes de confirmar ("+3", "−2" o "Sin diferencia"). Manda el stock esperado. |

- **Elegir producto:**
  - Buscador por nombre o código con soporte para lector de barras: Enter con código exacto lo elige.
  - Al elegirlo se navega a `?producto=<id>`, y el servidor carga el producto y sus últimos 5 movimientos. "Cambiar producto" quita el parámetro.
- **Después de registrar:**
  - Aviso con el resultado ("Entrada registrada: +5 pza (18 → 23 pza)") y clave nueva.
  - La cantidad y la nota se limpian, y `router.refresh()` trae del servidor el stock y los movimientos.
- **Historial `/panel/inventario`:**
  - **Filtros en la URL:** desde y hasta (días de Monterrey), tipo y producto (con el mismo buscador, en un chip con ×). Cualquier cambio regresa a la página 1.
  - **Paginado desde el servidor:** 25 por página, con `range()` + `count`.
  - **Cada renglón:** tipo con etiqueta de color, producto, cantidad con signo y unidad, stock anterior → nuevo, fecha y hora, quién lo hizo, folio de la venta y nota.
- **Ficha del producto** (solo dueño):
  - "Registrar entrada" con el producto ya elegido, más "Merma" y "Conteo".
  - Sección **Historial** con los últimos 10 movimientos y "Ver todo", que lleva a `/panel/inventario?producto=<id>`.
  - El cajero sigue viendo la ficha sin historial.
- **Navegación:**
  - Inventario es `soloDueno`: el cajero ya no lo ve, ni en la barra inferior (4 columnas) ni en la lateral.
  - Las páginas usan `requireDueno()` y las Server Actions también; la BD responde `LT403`.

### Archivos
- `app/panel/inventario/`:
  - `page.tsx` (historial), `entrada/`, `merma/` y `conteo/`.
  - `actions.ts`: `registrarEntrada`, `registrarMerma` y `registrarConteo`.
  - `_components/`: `operacion-page`, `operacion-form`, `movimiento-list` y `movimientos-filters`.
- `app/components/product-search/`: `use-product-search.ts` (hook compartido), `search-input.tsx`, `product-picker.tsx` y `fetch.ts` (movido desde el punto de venta).
- `app/components/pagination.tsx`: paginación genérica. La de productos ahora la usa.
- `app/lib/inventario.ts`: lecturas de movimientos.
- `app/lib/tz.ts`: días de Monterrey ↔ UTC.
- Cambios: `app/lib/nav.ts`, `app/components/bottom-nav.tsx`, `app/panel/_components/nav-links.tsx`, `app/panel/layout.tsx`, `app/panel/vender/_components/search-panel.tsx` (ahora usa el hook) y `app/panel/productos/[id]/page.tsx`.

## Decisiones

### Idempotencia
- **Cada formulario genera una clave** con `uuidv4()`, la reusa en los reintentos y la cambia después de un registro exitoso. Una bandera evita el doble toque antes del re-render.
- **La clave vive solo en memoria,** como se acordó.
- **Si la respuesta se pierde** (error de red, sin saber si quedó):
  - El formulario lo dice, conserva lo capturado y la clave, y recarga los últimos movimientos del producto para que se vea si ya quedó.
  - Un botón "Actualizar movimientos" vuelve a pedirlos.
  - Reintentar con la misma clave nunca registra dos veces.
- **En la BD:** el mismo patrón que el cobro.
  1. Candado consultivo por clave.
  2. Si la clave ya existe y es del mismo usuario, se devuelve el movimiento sin tocar el stock. Si es de otro usuario, `LT409`.
  3. Se aplica el movimiento.

  Respaldo: índice único parcial. Aplicar el movimiento y escribir su clave van en un mismo bloque; si la clave choca, se revierte el bloque completo.

### Conteo
- **El ajuste también lleva clave,** aunque fije un valor absoluto. Sin ella, un reintento después de una venta "regresaría" lo vendido (prueba 6 del `15`).
- **Además manda el stock esperado** (el que se mostró al calcular la diferencia). Si ya cambió, la BD responde `LT409` con la pista `stock_cambio`. La pantalla entonces:
  - muestra el stock actual;
  - recalcula la diferencia contra lo capturado, sin borrarlo;
  - ofrece "Confirmar con el stock actual", que reenvía con el nuevo stock esperado y la misma clave (el intento rechazado no registró nada).

### Otros
- **Costo para prellenar la entrada:** se lee en el servidor, en la página, con `requireDueno()`. La ruta de búsqueda `/panel/vender/productos` sigue sin costos y sin cambios.
- **Búsqueda compartida:**
  - La lógica (retardo de 150 ms, descarte de respuestas viejas, Enter con código exacto y 401 → login) vive en `useProductSearch`, que usan el punto de venta y el inventario.
  - `irAlLogin()` ahora regresa a la página actual con `?next`.
- **Fechas del historial:** cada día de Monterrey se convierte a un rango UTC sobre `creado_en` (usa su índice). El desfase se obtiene con `Intl`, sin escribir `-06:00` a mano.
- **Sin SQL nuevo para el historial:** lee `movimientos_inventario` con producto, perfil y folio incluidos en la misma consulta de PostgREST. RLS ya limita la lectura al dueño.

## Verificación
- `npm run lint`, `npx tsc --noEmit` y `npm run build` sin errores.
- **Zona horaria** (`app/lib/tz.ts`), 10 comprobaciones con node:
  - Inicio del día en UTC−6 y rango `[desde, hasta+1)`.
  - Las 23:59 caen dentro de su día y las 23:30 de Monterrey todavía son "hoy".
  - Fechas inválidas, cambio de año y año bisiesto.
- **Sin sesión:** `/panel/inventario`, `/panel/inventario/entrada?producto=…` y `/panel/inventario/conteo` redirigen al login con `next`. La búsqueda sigue respondiendo 401.

**Prueba manual en dispositivos (usuario real):**
- **Dueño:**
  - Entrada con lector (`her-004` + Enter), costo prellenado y vista previa.
  - Doble toque: un solo movimiento.
  - Respuesta perdida simulada: aviso y datos conservados; el reintento dijo "ya se había registrado" sin duplicar.
  - Merma que no deja restar de más, y merma con nota.
  - Conteo con diferencia.
  - **"El stock cambió":** se vendió en otra pestaña y apareció el aviso con el stock nuevo, la diferencia recalculada y lo capturado intacto. "Confirmar con el stock actual" aplicó el ajuste.
  - Historial con filtros por tipo, fecha y producto (chip), regreso a página 1 y paginación.
  - Ficha con "Registrar entrada", "Ver todo" y los últimos 10 movimientos.
  - Punto de venta con el hook compartido: código inexistente, código exacto y stock de las tarjetas tras cobrar.
- **Cajero:**
  - Navegación sin Inventario (4 secciones).
  - `/panel/inventario` y `/panel/inventario/entrada` regresan con el aviso de solo dueño.
  - Ficha sin historial, que tampoco viaja en los datos.
  - Sesión vencida que regresa a `/panel/vender` con `next`, conservando el carrito.
- **Incidente:** a media prueba el servidor de desarrollo se cayó con "Jest worker encountered 2 child process exceptions", porque había dos servidores corriendo. Se detuvieron los dos, se borró la caché `.next/dev` y se levantó uno solo; no volvió a pasar. No es del código.

## Correcciones tras la prueba
1. **Merma sin nota:** el botón ya no se apaga por la nota. Al tocarlo, el campo se marca con "Escribe qué pasó." y recibe el foco.
2. **Foco al buscador:** después de registrar una entrada o una merma, se regresa al buscador de producto (con foco y el aviso del registro), para capturar un pedido completo seguido. El conteo se queda en el producto para revisar el resultado.
3. **Conteo con `stock_cambio`:** además de recalcular la diferencia, `router.refresh()` actualiza el "Stock actual" de arriba y los últimos movimientos.
4. **Vista previa de la merma:** con una cantidad no válida (por ejemplo, mayor al stock) se oculta la vista previa y solo queda el aviso; nunca muestra un stock negativo.
5. **Espacio en los avisos:** "Entrada registrada: +5 pza (…)", y lo mismo en merma y ajuste.

**Segunda prueba (dueño):** los cinco arreglos funcionan.
- La merma sin nota muestra "Escribe qué pasó." con el campo en rojo y el foco en él.
- Después de una entrada o una merma, el foco regresa al buscador con "Siguiente producto". Una entrada completa se puede hacer solo con teclado.
- El conteo con el stock cambiado actualiza el aviso, el "Stock actual" y los últimos movimientos.
- La merma con una cantidad de más ya no muestra stock negativo.
- Los avisos llevan el espacio.

## Pendientes
- **Fase 5:** botón "Registrar entrada" desde el stock bajo del Inicio, que solo abre `/panel/inventario/entrada?producto=<id>`.
- **Ventas (4.6):** lista, detalle, reimpresión y cancelación.
- **Fase 9:** si se registra una entrada o una merma con la pestaña en segundo plano, el movimiento sí queda en la base, pero la pantalla se queda en "Registrando…" porque el navegador frena la pestaña. Al recargar se ve lo correcto, y reintentar no duplica.
