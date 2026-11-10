# Fase 7a — Ventas y Reportes

Historial de ventas con detalle, reimpresión y cancelación, y la pantalla de Reportes del dueño. La exportación a Excel es la Fase 7b, en otra rama.

## Qué se hizo

### Base de datos
| Script | Contenido |
|---|---|
| `24-ventas-y-reportes.sql` | Columna `ventas.cancelada_por` con su CHECK, `cancelar_venta` que la llena y las 5 funciones de reportes. |
| `25-pruebas-ventas-y-reportes.sql` | 10 pruebas en `BEGIN … ROLLBACK`, con ventas propias en el año 2000 y montos conocidos. |
| `07-semilla.sql` | La venta cancelada de la semilla llena `cancelada_por` si la columna existe (SQL dinámico). Funciona antes y después de `24`. |
| `17`, `19` | Sus cancelaciones de prueba llenan `cancelada_por`. |
| `21` | Las 4 funciones de reportes que devuelven costos entran a su lista de funciones permitidas y a la revisión de `SECURITY DEFINER`. |

**`24`, paso a paso:**
- **Candado:** antes de cambiar nada, revisa que la `cargar_semilla` instalada sea la del `07` nuevo. Si es la vieja, se detiene con "Corre primero el 07-semilla.sql nuevo… No se cambió nada". Así nunca queda una base en la que el reinicio de las 3:00 truene.
- **Columna:** `cancelada_por uuid references perfiles (id)`, con índice parcial. Las canceladas que ya existían se llenan con el usuario de su primer movimiento `cancelacion_venta`.
- **`cancelar_venta`:** igual que en `05`, más `cancelada_por = auth.uid()`. Se reemplaza antes de crear el CHECK.
- **CHECK `ventas_cancelada_por`:** cancelada ⇔ `cancelada_por` no nulo.
  - Se crea `NOT VALID`: no revisa las filas que ya existen al crearlo, pero sí cualquier INSERT o UPDATE posterior.
  - Luego `VALIDATE CONSTRAINT`. Si quedara una cancelada sin quién canceló, el script avisa con un warning y el CHECK se queda `NOT VALID`.
  - El resumen final muestra `canceladas_sin_quien` (debe dar 0) y `check_validado` (debe dar true).
- **Auxiliares en `privado`** (sin permiso para la API):
  - `rango_reporte`: valida el rango (LT422 si falta, si está al revés o si pasa de 366 días) y convierte días de Monterrey a instantes.
  - `agrupacion_reporte`: hasta 31 días agrupa por día; hasta 182, por semana (de lunes a domingo); más, por mes.
- **Funciones de reportes:** todas `SECURITY DEFINER`, `search_path = ''`, `usuario_validado(true)` (solo dueño), sin permiso para `anon`.

| Función | Devuelve |
|---|---|
| `reporte_resumen` | Ventas, costo, ganancia, número de ventas, ticket promedio, y las canceladas del rango (número e importe). |
| `reporte_ventas_por_periodo` | Un renglón por día, semana o mes, con los periodos sin ventas en 0. Trae la agrupación y el `desde`/`hasta` de cada renglón, recortados al rango. |
| `reporte_por_categoria` | Número de ventas, importe, costo y ganancia por categoría ("Sin categoría" para los productos sin categoría). |
| `reporte_por_metodo` | Número de ventas e importe de los tres métodos, aunque alguno esté en 0. |
| `reporte_sin_movimiento` | Productos activos con stock que no se vendieron en el rango, ordenados por dinero detenido (stock × costo), con su última venta. Hasta 200 (la app pide 50). |

Más vendidos reutiliza `mas_vendidos` (de `20`) con un límite de 10.

### Resultado en PGlite
- **Suites:** pasan todas (`08`, `10`, `13`, `15`, `17`, `19`, `21`, `23`, `25`), en instalación limpia y después de recargar la semilla.
- **Fallas a propósito, las 15 detectadas:**
  - una función de reportes sin validar el rol;
  - contar canceladas, en método y en categoría;
  - el día cortado en UTC;
  - la semana empezando en domingo;
  - sin tope de 366 días;
  - agrupación por día hasta 60 días;
  - una venta cancelada que cuenta como movimiento;
  - `cancelar_venta` sin `cancelada_por`;
  - sin el CHECK;
  - `anon` con permiso;
  - una auxiliar de `privado` abierta;
  - una función nueva con costos fuera de la lista de `21`;
  - una función de reportes con `INVOKER`;
  - la `07` vieja, con la que `24` se detiene sin cambiar nada.
- **Siete días simulados** con reinicio nocturno: los 7 reinicios funcionan con el CHECK, los folios no tienen huecos y hay 7 productos en stock bajo.
- **Volver a correr `24`** no cambia nada.
- **Si alguien vuelve a correr `05`:** cancelar truena por el CHECK, en vez de guardar la venta sin quién canceló, y `25` lo detecta. Volver a correr `22` y `24` lo arregla.

## Pasos en Supabase

Orden: **`07` → `24` → `19` → `25` → `21` → `23` → `08`, `10`, `13`, `15`, `17`**.

- `07` va antes que `24`: la semilla nueva funciona con la base anterior, y `24` se niega a correr con la vieja. No hay ningún momento en que el reinicio nocturno pueda tronar.
- `19` (su prueba 7 llama a `reset_demo`) confirma que el reinicio funciona con el CHECK.
- `23` sigue después de `07`.
- Si algún día se vuelve a correr `05`, después hay que correr `22` y `24`.

### Resultado (Diego, 10 nov 2026)
- **`07`:** semilla nueva; la función coincide por md5.
- **`24`:** `canceladas_sin_quien` = 0, `check_validado` = true y `funciones_reporte` = 5. Las 8 funciones coinciden por md5.
- **`19`, prueba 7:** `reset_demo` funciona con el CHECK.
- **`25`:** completo, sin errores.
- **`21`:** la revisión de catálogo pasa con las funciones de reportes.
- `authenticated` puede leer `ventas.cancelada_por`.

### Prueba contra la API real (solo lectura, cuentas demo)
**Dueño:**
- La lista con el embed `perfiles!usuario_id`: 228 ventas.
- El filtro de canceladas.
- El detalle de la venta cancelada: quién canceló ("Dueño (demo)"), el motivo y los renglones.
- `venta_detalle.costo_unitario` sigue cerrado (42501).
- Las 5 funciones de reportes del mes responden.
- 366 días agrupan por mes (13 meses); 367 días dan LT422.

**Cajero:**
- Solo ve sus ventas (0: en la semilla, el cajero demo no tiene ventas).
- Una venta ajena le llega como `null`.
- Los reportes y `cancelar_venta` le dan LT403.

## Pantallas

### `/panel/ventas`
- **Acceso:** dueño y cajero (`verifySession`). La RLS decide qué se ve: el dueño, todas; el cajero, solo las suyas.
- **Filtros en la URL:** desde, hasta (días de Monterrey), estado y método. Cualquier cambio regresa a la página 1.
- **Por defecto, los últimos 7 días** (hoy incluido, días de Monterrey) si la URL no trae fechas. Así abrir Ventas no cuenta toda la historia cada vez. Para ver otras fechas se eligen en los filtros, y "Últimos 7 días, sin filtros" regresa al rango por defecto.
- **Paginación en la base:** de 25 en 25, con conteo exacto.
- **Lista:** en celular, tarjetas de dos líneas (folio, total, fecha y hora, método, quién atendió). Desde `md`, renglones con columnas: folio, fecha y hora, atendió, método, estado y total. Todo el renglón es el enlace al detalle.
- **Canceladas:** etiqueta "Cancelada" y el total tachado.

### `/panel/ventas/[id]`
- **Datos:** atendió, método, recibido o cobrado, y el cambio.
- **Renglones:** con la copia de nombre, cantidad y precio guardada al vender.
- **Si está cancelada:** un recuadro con quién la canceló, cuándo y el motivo. Al cajero, la RLS de `perfiles` no le deja leer el nombre del dueño, así que ve "el dueño".
- **Reimprimir ticket:** el mismo ticket del punto de venta, ahora en `app/components/ticket.tsx` y compartido por los dos. Si la venta está cancelada, el ticket lo dice arriba.
- **Cancelar venta:** solo el dueño, y solo si la venta está completada.
  - Abre un diálogo con un motivo obligatorio (3 a 200 caracteres) y avisa que el stock regresa y que no se puede deshacer.
  - La Server Action valida con `requireDueno` y zod, y llama a `cancelar_venta` con la sesión del usuario, que vuelve a validar el rol.
  - Al terminar, revalida la página y aparece el recuadro de cancelada.
- **Venta inexistente o ajena:** 404 en español ("No encontramos esta venta").

### 404 general
`app/not-found.tsx`, con el mismo estilo que el de Ventas: "No encontramos esta página" y un enlace "Ir al inicio" (`/panel`; sin sesión, el proxy manda al login). Cubre las rutas que no existen y los `notFound()` sin página propia, como la ficha de un producto que no existe.

### `/panel/reportes`
- **Acceso:** solo el dueño (`requireDueno`). El cajero regresa a Inicio con el aviso "solo dueño".
- **Rango:** atajos (hoy, esta semana, este mes, mes pasado) o fechas libres; sin nada, este mes.
  - La semana empieza en lunes, igual que en la base.
  - Más de 366 días: un aviso y no se consulta nada.
  - Debajo dice el rango, los días y cómo se agrupó.
- **Tarjetas:** ventas, costo de lo vendido, ganancia (con margen), número de ventas, ticket promedio y canceladas (no cuentan en el reporte).
- **Ventas en el periodo:** la gráfica de Inicio, ahora con agrupación por día, semana o mes.
  - Si hoy no está en la gráfica, todas las columnas van en el color pleno.
  - "Ver como tabla" muestra cada periodo con importe, costo y ganancia.
- **Por método de pago y por categoría:** listas con barras finas de un solo color, la parte del total y, en categoría, la ganancia y el margen.
- **Más vendidos:** los 10 de mayor importe.
- **Sin movimiento:** los 50 con más dinero detenido, con su existencia, categoría y última venta (o "Nunca se ha vendido").
- **Carga:** las 6 consultas van en paralelo; si una falla, solo esa sección dice que no cargó.

### Prueba en navegador (Chrome headless, 360 px y 1024 px)
- **Dueño:**
  - Ventas: lista de 228 y filtros.
  - El detalle de la cancelada: sin botón de cancelar, y el ticket reimpreso dice "VENTA CANCELADA".
  - El diálogo de cancelar: el foco va al motivo y no se envía vacío.
  - Reportes: hoy, este mes, mes pasado, 102 días (semana) y 365 días (mes); el rango inválido muestra el aviso.
- **Cajero:**
  - "Tus ventas" vacía.
  - Una venta ajena da 404.
  - `/panel/reportes` lo regresa a `/panel?aviso=solo-dueno`.
- **Sin scroll horizontal a 360 px** en Ventas, el detalle y Reportes.
  - Se encontró y corrigió uno: la tabla `sr-only` de la gráfica se ensanchaba, porque una `<table>` no respeta `width: 1px`. Ahora va dentro de un `div.sr-only`. La gráfica de Inicio también se beneficia.
- **Consola:** sin errores.
- **Revisiones:** `tsc`, `eslint` y `next build` limpios.
- **Cancelación real desde la app:** no se hizo en esta prueba, para no tocar los datos de la demo; la hizo Diego (abajo).

### Prueba de Diego (10 nov 2026)
**Dueño:**
- Lista de 228 ventas.
- Canceló la 000228 ($874) con motivo; el detalle muestra quién, cuándo y por qué.
- Inicio bajó al centavo:
  - ventas: $1,652 → $778;
  - ganancia: $641 → $315;
  - número de ventas: 4 → 3.
- Inventario tiene los movimientos "Cancelación" (tubo 40 → 46 m).
- Reportes del mes cuadra: categorías y métodos suman el total, y hay 2 canceladas por $1,164.
- A 360 px, sin scroll horizontal en Ventas y Reportes.

**Cajero:**
- "Tus ventas" vacía.
- Cobró el folio 000229 (seguido del 228) y es la única venta que ve.
- Su detalle no tiene "Cancelar" ni costos.
- La venta del dueño le da el 404 en español.
- `/panel/reportes` lo regresa a Inicio con el aviso "solo dueño".

### Ajustes después de la prueba
- **Ventas abre con los últimos 7 días.** Verificado en navegador:
  - sin fechas en la URL, los filtros muestran del 4 al 10 de nov, con 69 ventas;
  - con un rango explícito, 229 ventas y aparece el botón para regresar;
  - al tocarlo, vuelve a `/panel/ventas` con los 7 días.
- **404 general en español.** Verificado sin sesión, con sesión (`/panel/algo-que-no-existe`) y a 360 px. El de Ventas sigue siendo el suyo.
- **Revisiones:** `tsc`, `eslint` y `next build` limpios; sin errores en consola.

## Decisiones
- **`cancelada_por` en la tabla.** Antes, quién canceló solo se podía deducir de los movimientos, y el cajero no puede leer movimientos.
- **La base decide la agrupación.** `reporte_ventas_por_periodo` no recibe la agrupación, sino que la decide por el largo del rango y la regresa. La regla vive en un solo lugar, y no se puede pedir una agrupación por día de un año entero.
- **366 días como máximo**, contando ambos extremos.
- **El costo se redondea por venta en el resumen y por periodo**, igual que Inicio. Por categoría se redondea por categoría, así que la suma de categorías puede diferir del resumen por centavos.
- **Ticket compartido:** `TicketContent` salió de `ticket-dialog.tsx` a `app/components/ticket.tsx`, sin cambios visuales en el punto de venta.
- **Diálogos de cancelar y reimprimir:** entrada de 200 ms con `@starting-style` (opacidad y escala desde 0.96) y cierre instantáneo, sin animación con movimiento reducido. El ticket del cobro no la usa, para no frenar la venta.
- **Sin `service_role`:** todo usa la sesión del usuario.

## Limitación conocida
- **Categoría actual, no la del momento de la venta.** `reporte_por_categoria` usa la categoría que el producto tiene hoy: `venta_detalle` no guarda copia de la categoría. Si un producto cambia de categoría, sus ventas pasadas se van con él. Aceptado para la demo.

## Pendientes
- **Merge del PR.** No requiere correr SQL nuevo: `07`, `24`, `19`, `25` y `21` ya se corrieron en Supabase.
- **Fase 7b:** exportar a Excel.
