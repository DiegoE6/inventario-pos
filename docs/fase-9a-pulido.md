# Fase 9a — Pulido

Objetivo de la Fase 9: "Lo enseñarías sin pena a cualquier dueño". La fase se dividió en dos ramas:

- **9a (esta):** Lighthouse "antes", SQL `30`/`31`, pendientes de fases anteriores, estados vacíos, de carga y de error, correcciones de diseño y movimiento, y modo oscuro.
- **9b:** CSP y encabezados de seguridad, Lighthouse "después" y README con capturas. Se crea desde `main` cuando 9a esté en producción.

## Lighthouse "antes"

Celular, mediana de 3 corridas, build de producción (`next start` en el puerto 3100), con la sesión del dueño demo y Lighthouse 12.6.1 por `npx`:

| Pantalla | Rendimiento | Accesibilidad | Buenas prácticas | FCP | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| Inicio | 96 | 100 | 100 | 0.8 s | 2.7 s | 0 | 91 ms |
| Vender | 96 | 100 | 100 | 0.8 s | 2.6 s | 0 | 67 ms |
| Productos | 97 | 100 | 100 | 0.9 s | 2.6 s | 0 | 53 ms |

- **LCP:** casi todo es el tiempo entre la respuesta del servidor (0.3–0.6 s) y el pintado del texto principal (2.1–2.4 s).
- **Servidores:** `next dev` escribe en `.next/dev` y `next build` en `.next` (documentación de Next 16.4.5: "now use separate output directories, enabling concurrent execution"). El servidor del 3000 siguió arriba durante la compilación, y el del 3100 se cerró al terminar.

El "después" se mide en 9b.

## Base de datos

| Script | Contenido |
|---|---|
| `30-pulido.sql` | `v_stock_bajo` con la columna `proporcion` (stock ÷ mínimo, 0 = agotado), al final de la vista. `reporte_sin_movimiento` ya no incluye productos dados de alta dentro del rango (`creado_en < inicio del día p_desde en Monterrey`, con `privado.rango_reporte`). |
| `31-pruebas-pulido.sql` | 6 pruebas en `BEGIN … ROLLBACK`. |
| `06` y `24` | Tienen las mismas definiciones que `30`: volver a correrlos no regresa al comportamiento anterior. La función de `24` es idéntica a la de `30`. |
| `07-semilla.sql` | Los productos se dan de alta el último día del antepasado mes. Así "Sin movimiento" tiene datos en "Este mes" y en "Mes pasado". |
| `25` | La prueba 4 fecha los productos de la semilla en 1999, dentro de su transacción. Pasa con o sin `30`. |

### PGlite
- **Suites:** pasan todas, de `08` a `31`, en instalación limpia, después de `reset_demo()` y en el orden real de Supabase (partiendo de `06`, `07` y `24` de `main`).
- **Con el `07` viejo**, `31` falla con "vuelve a correr 07".
- **Fallas a propósito, las 15 detectadas:**
  - `proporcion`: al revés, agotado sin mínimo con 1, sin redondear;
  - la vista: sin `security_invoker`, para `anon`, con costo;
  - "Sin movimiento": sin la regla, con `<=`, con la fecha UTC, contra el fin del rango;
  - la función: `INVOKER`, para `anon`, sin validar el rol;
  - el `07` viejo;
  - el `25` de `main`, que con `30` ya no pasa (por eso se ajustó).
- **Simulación de 7 días:** igual que antes (7 en stock bajo, folios sin huecos).

### Supabase (lo corrió Diego)
1. **`30`:** `columna_proporcion` true, `regla_alta` true, y el tercer valor false con el `07` viejo.
2. **`07`:** solo cambiaba `cargar_semilla`. Se parchó partiendo de la de `main` (md5 `16eec519…`) y quedó igual al archivo nuevo (md5 `f5b95fe1…`).
   - Recarga de la semilla: 40 productos, 7 en stock bajo, 227 completadas y 1 cancelada, folios 1–228, 7 pendientes, productos dados de alta el 2026-09-30.
   - El tercer valor de `30` ya da true.
3. **`31`, `25` (ajustada) y `21`:** pasan.
4. **Revisado con la sesión del dueño:** "Sin movimiento" trae 2 productos en "Este mes" y 2 en "Mes pasado", y `v_stock_bajo` sale ordenada por `proporcion` (0.3333 … 0.75).
5. **No se corrieron** `08`, `17`, `19`, `23` y `29`: no tocan nada de `30`, y la recarga ya confirmó el stock bajo y los folios.

## Pendientes de fases anteriores

1. **"Registrando…" pegado en segundo plano.**
   - **Causa:** el estado del botón vivía en una transición que incluía `router.refresh()`, y el botón no se liberaba hasta volver a pintar la página. En una pestaña en segundo plano el navegador frena ese repintado.
   - **Arreglo:**
     - el estado "enviando" es propio y se libera en cuanto responde el servidor;
     - el refresco va aparte, y si la pestaña está oculta espera a `visibilitychange`;
     - el aviso de éxito sale de inmediato, aunque regresar al buscador tarde.
   - **Prueba:** se retuvo 10 s el refresco (la petición GET de RSC) con Chrome. Con el código de `main`, el botón se quedó en "Registrando…"; con el arreglo, el aviso sale en 0.5 s. Las entradas y mermas de prueba se compensan (27 → 28 → 27).
2. **Stock bajo con más de 50 productos:** Inicio ordena por `proporcion` en la base (luego por nombre).
3. **Fórmulas sin resultado al importar:**
   - `revisarZip` ya descomprimía cada parte; ahora las regresa.
   - `formulas.ts` revisa el XML de la primera hoja del libro (por `workbook.xml` y sus relaciones) y marca las celdas con `<f>` sin `<v>` y las de error (`t="e"`).
   - **Mensaje:** "Precio (celda E2) tiene una fórmula sin resultado guardado. Ábrelo en Excel, guárdalo otra vez y vuelve a subirlo." Reemplaza al "Falta el precio" de zod.
   - Una fila hecha solo de fórmulas ya no se pierde como vacía. Las columnas que no se usan no avisan.
4. **"Sin movimiento" con productos nuevos:** `30` y el texto de la pantalla ("No incluye los productos que todavía no existían al empezar el rango").

## Estados vacíos, de carga y de error

**Vacíos** (`EstadoVacio`): qué pasó y qué hacer después.

| Pantalla | Estado | Acciones |
|---|---|---|
| Productos | Sin resultados «x» | Quitar filtros; el dueño, también Nuevo producto |
| Productos | Catálogo vacío | Agregar el primero, Importar desde Excel |
| Vender | Sin resultados | Limpiar búsqueda; el dueño, Dar de alta (abre Nuevo producto con el código) |
| Inventario (buscador) | Sin resultados | Limpiar búsqueda |
| Ventas | Con filtros / sin ventas en 7 días | Quitar filtros / Ir a Vender |
| Inventario | Con filtros | Quitar filtros (sin resultados, la barra ya no repite el suyo) |
| Reportes | Rango sin ventas | Un aviso en lugar de 6 tarjetas en $0.00, más los atajos Este mes y Mes pasado. "Sin movimiento" se queda |
| Inicio (cajero) | Sin ventas hoy | "Ir a Vender" de 44 px |

**Carga:** esqueletos con `role="status"`, y el pulso se apaga con movimiento reducido.
- Panel (genérico, "Cargando…": lo heredan Inicio y Más, y se ve un instante al abrir otra sección directo), Vender, Productos, Detalle de producto, Ventas, Detalle de venta, Inventario, Reportes y Configuración.

**Error:**
- `error.tsx` en el panel y en Vender, Productos, Ventas, Inventario, Reportes y Configuración, más `app/error.tsx` y `app/global-error.tsx`.
- **Mensaje:** "No se pudo cargar …", con "Reintentar" (`retry()` en Next 16.4) e "Ir al inicio". Sin detalles técnicos; si el navegador está sin red, lo dice.
- **Prueba:** se forzó un error temporal en Ventas (ya se quitó). Sale el mensaje sin el texto del error, y el menú sigue.

**404 dentro del panel:**
- `app/panel/not-found.tsx` y `productos/[id]/not-found.tsx`: conservan el menú.
- En una ruta que no existe, el 404 general.

**Sin internet a la mitad de un cobro** (probado con Chrome contra el proyecto real; dejó 2 ventas del demo):
- **Sin red antes de cobrar:**
  - aviso "Sin internet. Puedes seguir armando la venta; cobra cuando vuelva la conexión.";
  - el cobro dice "No se pudo confirmar el cobro… no se cobrará doble" y el carrito se conserva;
  - al volver la red, el aviso se va y se cobra una sola venta (folio 229).
- **La venta llega al servidor y se pierde la respuesta:** el reintento regresa la misma venta (folio 230). Las ventas suben de 229 a 230, no a 231.
- **Navegar sin red:** Next 16 no usa `error.tsx` en ese caso. Hace una navegación completa, y el navegador muestra su propia página de "sin conexión". Una página propia sin conexión requeriría un service worker, que queda fuera de esta fase.

## Diseño y movimiento

Revisión de las pantallas como dueño y cajero, a 390 y 1280: 76 capturas con mediciones. No hubo scroll horizontal, errores de consola, imágenes sin `alt` ni páginas con más de un `h1`.

### Áreas táctiles
- **Enlaces de 20–28 px a 44 px** (con márgenes negativos, sin moverlos de donde se ven): "Volver", "Ver todo", "Quitar filtros", "Últimos 7 días, sin filtros" e "Ir a Vender".
- **Pestañas de periodo** de Inicio y Reportes: de 36 a 40 px.
- **"Borrar búsqueda":** de 32/36 a 40 px.
- **Filas de Inicio, Inventario, Reportes y la tabla de Productos:** "enlace estirado", toda la fila es el área táctil y sigue siendo un solo enlace para el teclado. Comprobado con `elementFromPoint` en las esquinas de cada fila: mínimo 52 px de alto, y el botón "Registrar entrada" sigue aparte.
- **Carrito vacío** en celular: neutro, no naranja, hasta que tiene algo.

### Movimiento (`/review-animations`)

| Antes | Después | Por qué |
|---|---|---|
| Avisos de éxito o error sin entrada | `opacity` + `translateY(4px)` en 150 ms, `--ease-out`, con `@starting-style` | El texto "brincaba" al llegar la respuesta; es ocasional, sí lleva animación |
| Hoja del carrito en celular sin entrada | `opacity` + `translateY(12px)` en 150 ms; cierre instantáneo | Se abre una vez por venta (decenas al día): movimiento mínimo que dice de dónde viene, sin frenar el cobro |
| `active:scale-[0.9]` en − / + del carrito | `scale-[0.95]` | 0.9 es demasiado para algo que se toca muchas veces; rango 0.95–0.98 |
| `active:scale-[0.94]` en los colores de marca | `scale-[0.95]` | Mismo rango |
| Barra del carrito sin transición de color | `transition-[transform,background-color,color]` 150 ms | El paso de vacío a con productos es un cambio de estado |
| Con movimiento reducido: los nuevos avisos y la hoja se desplazaban | Solo opacidad | Movimiento reducido = sin desplazamientos, se queda lo que ayuda a entender |

**Se revisó y se queda como está:**
- La curva: `ease-out` de Tailwind ya es `cubic-bezier(0.23, 1, 0.32, 1)` desde `@theme`.
- `hover:` solo aplica con puntero en Tailwind v4.
- Los diálogos ocasionales: 200 ms desde 0.96, centrados, cierre instantáneo.
- El ticket del cobro: sin animación.
- Las gráficas: sin animación.
- Los spinners: comunican que algo está pasando.

**Veredicto:** se aprueba. No hay animación en acciones frecuentes que frene, todo dura menos de 300 ms, solo se anima `transform` y `opacity`, y se respeta el movimiento reducido.

## Modo oscuro

- **Preferencia:**
  - Cookie `tema` = `claro`, `oscuro` o `sistema`, de un año, por dispositivo.
  - La lee el servidor (`app/lib/tema-servidor.ts`) y pone `data-theme` en `<html>`, así que no hay parpadeo.
  - Con "Sistema" no hay atributo y decide `prefers-color-scheme`.
- **Selector** Claro / Oscuro / Sistema: en "Más" y abajo en la barra lateral. Cambia al instante, sin recargar, y las dos instancias se sincronizan.
- **Tokens oscuros** en tonos cálidos (`#0c0a09`, `#1c1917`, `#292524`; texto `#fafaf9` / `#a8a29e`), con éxito y peligro propios. Token nuevo `on-danger` para el botón de peligro y la etiqueta "Agotado".
- **Marca:**
  - `brandStyle` escribe `--brand-…` con la versión clara y la oscura, y `globals.css` elige. Un `style` en línea le gana a cualquier regla CSS: por eso ya no escribe `--color-…` directo.
  - En oscuro, la tinta se aclara hasta ≥ 4.6:1 sobre las superficies oscuras, y el relleno de botones se aclara solo si no llega a 3:1.

  | Color | Tinta en oscuro | Relleno en oscuro | Tinta atenuada |
  |---|---|---|---|
  | `#fde047` | `#fde047` (11.5:1) | `#fde047`, texto negro | `#7f712c` (3.1:1) |
  | `#1e3a8a` | `#8695c0` (5.1:1) | `#5065a4` (3.1:1), texto blanco | `#687291` (3.2:1) |
  | `#c2410c` | `#d7825f` (5.2:1) | `#c2410c` (3.4:1), texto blanco | `#9f6349` (3.2:1) |
- **Logo:** en oscuro va sobre una ficha clara.
- **Ticket siempre claro:** los diálogos del ticket llevan `.tema-claro` (en pantalla se ve como papel), y al imprimir, los tokens oscuros no aplican (`@media screen`).
- **`theme-color`:** con "Sistema" lleva dos `<meta>` con `media`; con una elección, uno solo.

## Cómo se probó

- `tsc`, `eslint` y `next build` sin errores. En `.next/static` no hay rastro de la secret key ni de sharp.
- **En Chrome sin ventana, contra el servidor del 3000 y el proyecto real:**
  - **Fase 8 otra vez:** marca, logo, Excel y usuarios (42/42), y anchos y logos (todo bien).
  - **"Registrando…"** con el refresco retenido y con la pestaña en segundo plano.
  - **Importador** con fórmulas sin resultado (solo vista previa, no se guardó nada).
  - **Estados vacíos, 404 y error forzado.**
  - **Sin internet a la mitad de un cobro**, en los dos casos.
  - **Modo oscuro:**
    - HTML del servidor con `data-theme` según la cookie;
    - `#fde047`, `#1e3a8a` y `#c2410c` en Inicio y Reportes a 390 y 1280;
    - ticket claro e impresión en claro;
    - selector inmediato, guardado y aplicado por el servidor;
    - "Sistema" sigue al sistema en los dos sentidos.
  - **Áreas táctiles** con `elementFromPoint`.
  - La marca se restauró al final de cada prueba.

## Ajustes tras la revisión de Diego
- `app/panel/loading.tsx` decía "Cargando inicio…" y lo heredaban todas las secciones: ahora es genérico ("Cargando…").
- "Sin movimiento": el texto vacío y la nota dicen "No cuentan/No incluye los productos que todavía no existían al empezar el rango".
- Inventario sin resultados: solo queda el "Quitar filtros" del estado vacío.
- Las pestañas de periodo se quedan en 40 px. La página sin conexión con service worker queda fuera de la fase.

## Pendientes (9b)
- CSP con nonce y encabezados de seguridad.
- Lighthouse "después".
- README con capturas en `docs/capturas/` y la liga a la demo.
