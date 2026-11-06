# Fase 3 — Punto de venta

## Qué se hizo

### Base de datos
| Script | Contenido |
|---|---|
| `12-venta-idempotente.sql` | Columna `ventas.clave_cliente` (uuid, única, con default). `registrar_venta(p_items, p_metodo_pago, p_pago_recibido, p_clave)` con candado consultivo por clave. `productos_frecuentes(p_limite)`. Borra la `registrar_venta` de 3 parámetros. |
| `13-pruebas-venta-idempotente.sql` | 9 pruebas en `BEGIN … ROLLBACK` (ver Verificación). |
| `05-funciones-ventas.sql` | Nota y `DROP` de la versión de 4 parámetros: si se vuelve a correr `05`, hay que correr `12` después. |

**Resultado en Supabase:**
- `12` y `13` corrieron sin errores. El `13` termina mostrando el último `set_config`, que es lo normal.
- `08` se volvió a correr y sigue pasando con la nueva `registrar_venta`: las llamadas con 3 argumentos usan el default `p_clave = null`.

### Punto de venta `/panel/vender` (dueño y cajero)
- **Página (Server Component):** `verifySession()` y `productos_frecuentes(8)`.
- **El POS se renderiza solo en el cliente** (`dynamic` con `ssr: false`), para restaurar el carrito de `localStorage` sin diferencias de hidratación.
- **Buscador:**
  - Foco automático y búsqueda 150 ms después de dejar de escribir.
  - Cada búsqueda lleva un número de petición y las respuestas viejas se descartan.
  - **Enter** (lo que manda el lector de barras al final) busca el código exacto, sin distinguir mayúsculas. Si existe, lo agrega directo, limpia el campo y deja el foco ahí.
  - Si no existe, avisa y muestra resultados parecidos.
  - Con el buscador vacío, muestra los 8 más vendidos de toda la tienda.
- **Resultados:** tarjetas grandes con nombre, código, existencias, precio y "En carrito: N". Las agotadas se ven pero no se pueden agregar.
- **Carrito:**
  - − / + y cantidad editable, con teclado numérico o decimal según la unidad. Decimales solo en metro, kilo y litro, con hasta 3.
  - Quitar renglón y vaciar el carrito (con confirmación).
  - Un renglón inválido o que supera el stock se marca en rojo ("Solo hay 2.5 kg") y Cobrar queda deshabilitado.
- **Pago:**
  - Efectivo, tarjeta o transferencia.
  - En efectivo: campo "Recibido", botones rápidos ("Exacto" y los billetes que alcanzan), cambio en grande o "Faltan $X".
  - Enter en "Recibido" cobra.
- **Cobro:** Server Action `cobrar` → `registrar_venta` con la clave. El ticket se arma con lo que regresa la BD: folio, fecha, renglones del detalle, total, recibido, cambio y quién atendió.
- **Si la BD rechaza la venta:** la acción vuelve a leer cada producto del carrito y regresa el problema por renglón ("Solo hay 2 pza", "Producto desactivado", "Este producto ya no existe"). No depende del texto del error.
- **Ticket:**
  - `<dialog>` nativo, sin animación.
  - Nombre, dirección y teléfono del negocio; folio, fecha y hora (Monterrey) y quién atendió; renglones, total, pago y cambio.
  - Al final: "¡Gracias por su compra!" y "Este ticket no es un comprobante fiscal".
  - "Nueva venta" tiene el foco, así que Enter pasa al siguiente cliente. Cerrar el ticket por cualquier vía (incluido Escape) empieza una venta nueva.
- **Impresión** (`@media print` en `globals.css`):
  - Solo el ticket, monoespaciado de 12px y en negro.
  - Ancho del 100% del papel, hasta 80 mm, con `@page { margin: 0 }`.
  - El ancho real (58 u 80 mm) lo pone el driver de la impresora térmica.
- **Layout:**
  - Menos de 1024px: buscador fijo arriba, resultados y una barra fija con el número de productos y el total. En celular va encima de la navegación; en tablet vertical, al fondo. Al tocarla se abre el carrito a pantalla completa.
  - Desde 1024px: dos columnas, con el carrito fijo a la derecha.
- **Sin animaciones** en agregar, cantidades, abrir el carrito ni el ticket. Solo la respuesta al presionar (`scale`, 150 ms).

### Archivos
- `app/panel/vender/page.tsx`, `actions.ts` (`cobrar`) y `productos/route.ts` (búsqueda).
- `app/panel/vender/_components/`: `pos-loader`, `pos`, `search-panel`, `cart-panel`, `cart-bar`, `ticket-dialog` y `fetch-pos`.
- `app/lib/cart.ts`: lógica del carrito en enteros (milésimas y centavos).
- `app/lib/search.ts`: el escape de búsqueda que antes vivía en `data.ts`, ahora compartido.
- `app/lib/auth.ts`: agrega `getSessionOrNull()` para Route Handlers.
- `proxy.ts`: no redirige `/panel/vender/productos`.

## Decisiones

### Cobro sin duplicados
1. **En el cliente:**
   - Cada venta tiene una clave (`crypto.randomUUID()`), que se guarda con el carrito y se reusa en cada reintento.
   - Solo cambia cuando la venta se registra.
   - Una bandera evita el doble toque antes del re-render, y el botón se deshabilita mientras cobra.
2. **En la BD:** `registrar_venta` toma `pg_advisory_xact_lock(hashtextextended('registrar_venta:' || clave, 0))`.
   - Dos cobros con la misma clave nunca corren a la vez, aunque el carrito haya cambiado.
   - Después revisa si la clave ya tiene venta. Si es del mismo usuario, la devuelve sin tocar el stock; si es de otro, responde `LT409`.
   - Solo entonces bloquea los productos (`FOR UPDATE` por id).
3. **Respaldo:** índice único en `clave_cliente`. La venta se inserta antes que el detalle y los movimientos; si choca, se devuelve la existente y el segundo intento no deja nada.
4. **Si la red falla** (respuesta perdida), el carrito y la clave se conservan: tocar Cobrar otra vez nunca cobra doble.
   - Si la venta sí se había registrado, el ticket lo dice ("No se cobró doble; este es su ticket") y muestra lo que la BD registró.
   - Si mientras tanto cambiaron el carrito, se devuelve la venta original, no la del carrito nuevo.

### Más decisiones
- **Búsqueda en un Route Handler GET** con la sesión del usuario: las Server Actions corren en fila y son POST, así que no sirven para buscar mientras se escribe. Sin sesión responde **401 JSON con `Cache-Control: no-store`** (el proxy no la redirige), y el cliente manda al login con una navegación completa.
- **`productos_frecuentes` es `SECURITY DEFINER`:** cuenta las ventas de toda la tienda aunque el cajero solo pueda leer las suyas. Solo regresa datos que el cajero ya puede ver del catálogo, sin montos de venta ni costos.
- **Carrito persistente:** `localStorage` por usuario (`pos:carrito:<userId>`), con `try/catch`. Al recargar se restaura y se refrescan precio, stock y estado con `?ids=`. Al registrarse la venta se limpia en ese momento, para que una recarga no muestre lo ya cobrado.
- **El total del carrito es un estimado:** se calcula en centavos enteros con el mismo redondeo que la BD. El total del ticket es el de la BD.
- **Foco tras agregar:** con lector o mouse, regresa al buscador. En pantallas táctiles no, para que el teclado no tape los resultados.

## Verificación
- **PGlite:**
  - Instalación limpia del `01` al `13` y re-ejecución `05` → `12` (queda una sola `registrar_venta`).
  - Pasan las suites `08`, `10` y `13`, y `07` funciona con la columna nueva.
- **`13` sí detecta fallas.** Se rompió `12` cuatro veces a propósito y `13` reportó cada una con su número:

  | Falla metida | Prueba que la detecta |
  |---|---|
  | Sin candado consultivo | 3 |
  | Sin respaldo del índice único | 7 |
  | Sin validar de quién es la clave | 5 |
  | Frecuentes filtrado por RLS | 6 |

- **Qué cubre `13`:**
  - La misma clave dos veces da la misma venta y el stock baja una sola vez; con otro carrito, devuelve la original sin tocar nada.
  - El candado consultivo queda tomado.
  - Sin clave, cada cobro es una venta distinta.
  - La clave de otro usuario da `LT409`.
  - **El respaldo del índice:** se prueba con una copia temporal de la función sin la búsqueda de la clave, para forzar el choque en una sola sesión. El segundo intento no deja ventas, renglones, movimientos ni stock.
  - `productos_frecuentes` da al cajero el ranking de toda la tienda y solo columnas de catálogo.
  - `anon` recibe 42501 y un usuario inactivo `LT401`.
- **Código:** `npm run lint`, `npx tsc --noEmit` y `npm run build` sin errores ni advertencias.
- **Lógica del carrito** (`app/lib/cart.ts`): 33 comprobaciones con node.
  - Cantidades por unidad e importes sin error de flotantes (`0.10 × 3 = 0.30`).
  - Redondeo igual a la BD (`16 × 0.333 = 5.33`), total, stock excedido, pago, cambio y billetes sugeridos.
- **Sin sesión:** `/panel/vender/productos` responde 401 JSON con `no-store` en sus tres modos, y `/panel/vender` redirige al login.
- **Búsqueda exacta de código** contra el PostgREST real: no distingue mayúsculas y `%` / `_` no actúan como comodines.

**Prueba manual en dispositivos (usuario real):**
- **Dueño:**
  - Venta completa y doble cobro (queda una sola venta).
  - Clave nueva tras cerrar el ticket con Escape.
  - Código exacto con Enter y código inexistente.
  - Decimales por unidad, exceso de stock y rechazo por producto desactivado, marcado en su renglón.
  - Recarga, sesión vencida conservando el carrito y regreso con `next` tras el login.
  - Los tres tamaños de pantalla.
- **Cajero:**
  - "Más" solo muestra Ventas.
  - Productos sin "Nuevo" ni costo; el costo tampoco viaja en los datos de la página.
  - Las rutas de dueño regresan con el aviso.
  - Más vendidos de toda la tienda.
  - Cobro con tarjeta (folio 000300, "Atendió: Cajero").
  - La búsqueda no regresa costos.
- **Correcciones verificadas:** foco del ticket, casilla "Activo", aviso del carrito, uuid con respaldo, más vendidos con orden fijo y stock de las tarjetas después del cobro (58 → 55 al vender 3 focos, sin cambiar el orden; "Solo hay 55 pza" usa el dato nuevo).
- **Impresión:** la vista previa muestra solo el ticket, en una hoja, monoespaciado y a 80 mm de ancho. En papel carta sale arriba a la izquierda, como se espera.

**Sin probar todavía:**
- Dos cobros realmente simultáneos desde dos conexiones: el SQL Editor y PGlite usan una sola sesión. Lo cubren el diseño (candado más índice) y la prueba 7.
- La impresión en una impresora térmica real (58 u 80 mm); hasta ahora solo en vista previa.

## Correcciones tras la prueba en dispositivos
1. **Foco del ticket:** `showModal()` enfoca el primer botón ("Imprimir"), y el `autoFocus` de React corre antes de abrir el diálogo. Ahora "Nueva venta" se enfoca explícitamente después de `showModal()`.
2. **Casilla "Activo" en la edición de producto:**
   - Con `<form action>`, React 19 hace `form.reset()` al terminar, y la casilla controlada volvía a mostrarse marcada. El formulario ahora se envía con `onSubmit` + `startTransition`.
   - Las casillas "Activo" e "Inactivos" (filtros) quedan ligadas a su texto con `id`/`htmlFor`; "Activo" también lleva `aria-describedby` a su ayuda. No hay más casillas en la app.
3. **Problema guardado en el carrito:** al refrescar con `?ids=`, un producto encontrado borra el problema que traía guardado. `lineIssue()` lo vuelve a evaluar con los datos frescos, así que un producto reactivado ya no bloquea el cobro.
4. **`crypto.randomUUID`:** solo existe en contextos seguros. `app/lib/uuid.ts` agrega `uuidv4()`, que usa `crypto.getRandomValues` como respaldo (v4, variante RFC 4122); lo usa `nuevaVenta()`.
5. **Regresar a donde estaba tras el login:**
   - El proxy manda a `/login?next=<ruta>` y el formulario lo envía oculto.
   - El servidor lo valida con `safeNext()` (`app/lib/safe-next.ts`): solo acepta `/panel` y sus subrutas. Se rechazan `//`, `\`, URLs absolutas y la ruta JSON de búsqueda; cualquier otro valor manda a `/panel`.
   - Con sesión, `/login?next=...` también redirige a ese destino validado.
   - Una sesión vencida en el punto de venta regresa a `/panel/vender`.
6. **Más vendidos estables:**
   - Se fijan al cargar la página con `useState`.
   - `cobrar` ya no llama a `revalidatePath`. Esa llamada hacía que Next volviera a pedir la página tras cada venta, lo que reordenaba la lista y agregaba una petición extra.

7. **Stock de los más vendidos tras cobrar:** al quitar `revalidatePath` (punto 6), las tarjetas se quedaban con el stock de cuando cargó la página. Por ejemplo, después de vender 3 focos seguía mostrando "Hay 61 pza" cuando en la BD había 58, y el aviso "Solo hay X" usaba ese dato viejo.
   - Ahora, después de cada cobro exitoso, se pide `?ids=` solo de los productos vendidos y se reemplazan en la lista **sin cambiar el orden** ni pedir la página completa.
   - Corre en segundo plano: el ticket no espera.
   - Los resultados de una búsqueda escrita no se tocan; se vuelven a leer en la siguiente búsqueda.

## Pendientes
- **Fase 4:**
  - La sección **Inventario** y su enlace deben ser **solo para el dueño**, porque los movimientos son del dueño. Hoy el cajero la ve en la navegación (solo con "Próximamente").
  - "Registrar entrada" desde el stock bajo; historial de movimientos.
- **Ventas (sección 4.6):** lista, detalle, reimprimir el ticket y cancelar. El ticket ya está separado en un componente para reusarlo.
- **Fase 8:** elegir 58 u 80 mm en Configuración, si alguna impresora no respeta el ancho del papel.
- **Fase 9:** revisar el flujo completo con `review-animations` y medir con prospectos la meta de menos de 15 segundos.
