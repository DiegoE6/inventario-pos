# Fase 5 — Inicio

## Qué se hizo

### Base de datos
| Script | Contenido |
|---|---|
| `16-inicio.sql` | `resumen_ventas(desde, hasta)`, `ventas_por_dia(desde, hasta)` y `valor_inventario()`. |
| `17-pruebas-inicio.sql` | 12 pruebas en `BEGIN … ROLLBACK`. |
| `07-semilla.sql` | Ventas de hoy hasta la hora actual y tendencia ligera al alza semana contra semana (ver abajo). El resumen final muestra `ventas_hoy`. |

**Las tres funciones:**
- Son `SECURITY DEFINER` con `search_path = ''`, sin permiso para `public`/`anon`.
- Validan sesión, perfil activo y rol con `privado.usuario_validado()`.
- Filtran las ventas por un rango sobre `creado_en`, así que usan el índice. Solo cuentan ventas completadas.

| Función | Dueño | Cajero |
|---|---|---|
| `resumen_ventas(desde, hasta)` | Todo el negocio: número de ventas, total y ganancia. | Solo sus ventas, con `ganancia = null`. Para él tampoco se leen costos. |
| `ventas_por_dia(desde, hasta)` | Un renglón por día de Monterrey, con los días sin ventas en 0. Máximo 92 días. | `LT403` |
| `valor_inventario()` | Σ stock × costo de los productos activos. | `LT403` |

- **Por qué un rango de instantes y no de días:** `resumen_ventas` recibe instantes para comparar "hoy hasta ahora" contra "el mismo día de la semana pasada hasta la misma hora".
- **Top 5:** se reutiliza `mas_vendidos`, que ya ordena por importe y luego por cantidad.
- **Stock bajo:** se reutiliza `v_stock_bajo`, que no trae costos.

**Semilla con tendencia al alza (ajuste tras la primera prueba):** con ventas sorteadas día por día, la comparación salía negativa casi la mitad de las veces (en PGlite, 57% positiva, de −85% a +2,841%). Con 4 o 5 ventas a mediodía, un solo ticket grande la decide. Ahora:
- Cada día de la semana tiene un **juego fijo de tickets**: el ticket k de los jueves es el mismo todas las semanas, con los mismos productos, cantidades, cajero, pago y hora. Sale de su propia `setseed`.
- Las horas se reparten parejo en el horario.
- **Hoy se dan todos.** Hace una semana faltan los más chicos (~25% del juego) y, más atrás, uno más cada dos semanas.
- **Hoy, desde las 09:30,** se usa el mismo plan de día completo, cortado en la hora actual. Ya no se comprimen las ventas en lo que va del día.
- **Resultado:** a cualquier hora, hoy lleva lo mismo que la semana pasada más algunas ventas chicas. Nunca sale negativo.

Simulado en PGlite (los 7 días de la semana × 7 horas):

| Hora | "vs. semana pasada" |
|---|---|
| 09:00 (antes de abrir, caso especial) | +52% a +481% |
| 10:30 – 12:00 | 0% a +28% ("Igual" en 7 de 14) |
| 14:00 – 20:00 | +3% a +20% |
| Día completo | +6% a +17% |

**Resultado en Supabase:**
- Primera versión: se corrieron `16`, `07` (`ventas_hoy` = 7), `08`, `13`, `15` y `17`, todos sin errores.
- `07` con la tendencia: se corrieron `07`, `08`, `13`, `15` y `17`, todos sin errores.

**PGlite:**
- **Instalación limpia del `01` al `17`:** pasan `08`, `10`, `13`, `15` y `17`. Volver a correr `16` no rompe nada.
- **Recargar la semilla (`07`) después de `12` y `14`:**
  - Ninguna venta queda sin clave. `clave_cliente` toma su valor por defecto.
  - Ningún movimiento queda con clave, porque el índice único es parcial.
  - Ningún producto queda con stock negativo.
  - Después vuelven a pasar `08`, `13`, `15` y `17`.
- **Semilla a distintas horas simuladas (hoy = 6 de noviembre):**

  | Hora | Ventas de hoy | Primera – última |
  |---|---|---|
  | 00:20 | 3 | 00:00 – 00:10 |
  | 08:00 | 3 | 05:00 – 06:38 |
  | 09:45 | 3 | 08:30 – 09:10 |
  | 12:30 | 4 | 08:31 – 10:41 |
  | 18:59 | 10 | 08:33 – 18:17 |
  | 21:00 | 10 | 08:33 – 18:18 |

  Ninguna venta queda en el futuro. El jueves anterior tiene sus 11 ventas del día completo.
- **Fallas metidas en `16`; `17` detectó todas:**

  | Falla | Prueba |
  |---|---|
  | Resumen sin filtrar al cajero | 9 |
  | Ganancia también para el cajero | 9 |
  | Gráfica que cuenta canceladas | 4 |
  | Gráfica agrupada por día UTC | 4 |
  | Gráfica sin días vacíos | 4 |
  | Gráfica sin validar rol | 10 |
  | Valor del inventario sin validar rol | 10 |
  | `anon` con `EXECUTE` | 12 |
  | Resumen sin límite de rango | 8 |

### Pantalla `/panel` (Inicio)
Todo se lee en el servidor en paralelo. "Hoy" sale de `todayYmd()` y `startOfDay()` (`app/lib/tz.ts`). Lo que es solo del dueño ni se pide para el cajero.

**Dueño:**
1. **Saludo con la fecha de hoy.**
2. **4 tarjetas** (2 × 2 en celular, 4 en fila en escritorio):
   - **Ventas de hoy** y **Ganancia de hoy:** pesos en grande y centavos más chicos, para que quepan en media pantalla de celular. Abajo, la comparación ("+12% vs. jueves pasado") en verde o rojo con flecha. El detalle "a esta misma hora" va en el `title` y para lectores de pantalla.
   - **Número de ventas.**
   - **Stock bajo:** la tarjeta lleva a la lista de abajo.
3. **Ventas** con selector 7 / 30 días. Arriba, el total del periodo; al tocar un día, se muestra ese día. El periodo también aplica a "Más vendidos".
4. **Más vendidos:** top 5 por importe. La cantidad con su unidad va como dato secundario, con una barra fina proporcional al primero.
5. **Se está acabando:** agotados primero y luego por stock entre mínimo. Cada producto tiene "Registrar entrada", que abre `/panel/inventario/entrada?producto=<id>`.
6. **Valor del inventario a costo.**

**Cajero:**
- Botón grande **Vender** arriba.
- **Tus ventas de hoy** (total) y **Número de ventas:** solo las suyas, sin ganancia ni comparación.
- **Se está acabando:** sin costos, sin botón de entrada y con la nota "Avísale al dueño para que lo pida".

**Estados:**
- Sin ventas hoy, la tarjeta dice "Todavía no hay ventas hoy" con enlace a Vender.
- Sin stock bajo: "Todo en orden".
- Si una lectura falla, solo esa sección dice "No se pudo cargar"; el resto de la pantalla sí se muestra.

### Archivos
- `app/lib/inicio.ts`: lecturas, paso a centavos y cálculo del porcentaje.
- `app/panel/page.tsx`: vista del dueño y del cajero. Conserva el aviso de "solo dueño".
- `app/panel/_components/inicio/`:
  - `stat-card.tsx`: tarjeta, dinero en grande y comparación.
  - `sales-chart.tsx`: gráfica; es el único componente del cliente.
  - `sections.tsx`: sección, selector de periodo, más vendidos y stock bajo.

## Decisiones
- **Comparación** contra el mismo día de la semana pasada **a la misma hora**: `resumen_ventas(inicio de hace 7 días, inicio + lo que va de hoy)`. Se oculta si antes fue 0 (o si la ganancia fue ≤ 0), porque no hay contra qué comparar. Si es igual, dice "Igual que el jueves pasado".
- **Gráfica propia, sin librería** (0 KB extra):
  - **Columnas con CSS** (divs) en lugar de SVG: se adaptan al ancho sin deformar las esquinas redondeadas.
  - **Una sola serie**, sin leyenda.
  - **Columnas** de máximo 24 px, esquina de 4 px arriba y 2 px de separación.
  - **Hoy** en el color de marca y los demás días al 35 %. Al tocar o pasar sobre un día, ese día toma el color completo.
  - **Rejilla** de dos líneas finas con montos cortos ("$3 mil"), en pasos redondos de 1, 1.5, 2, 2.5, 3, 4, 5, 6 u 8 × 10ⁿ.
  - **Etiquetas:** todos los días en 7 días, y una por semana en 30.
  - **Toda la franja del día** es el área para tocar.
  - **Teclado:** flechas para recorrer los días y Esc para volver al total.
  - **Tabla oculta** con los mismos datos para lectores de pantalla.
- **Selector 7 / 30:** son enlaces (`?periodo=30`, `replace`, `scroll={false}`); el servidor recalcula. Un valor inválido cae en 7.
- **Sin animaciones de entrada:** es la pantalla que más se abre (Emil). Solo hay respuesta al presionar en tarjetas, botones y selector.
- **Números grandes con cifras proporcionales;** `tabular-nums` solo en columnas y montos de listas.

### Ajustes tras la primera prueba
- **Gráfica:** las etiquetas del eje ("$3 mil") tenían fondo y tapaban la primera barra. Ahora van en un margen izquierdo de 52 px, fuera del área de las barras.
- **Plural de unidades:** `unidadCorta(unidad, cantidad)` en `app/lib/format.ts`. "1 caja", "3 cajas"; pza, m, kg y L no cambian. Sin cantidad, como en las etiquetas "Cantidad (cajas)", va en plural.
  - `formatQuantity` ya lo usa, así que quedan cubiertos Inicio, productos, búsqueda, ticket y punto de venta.
  - También se aplica en el historial de movimientos, el formulario de entrada, merma y conteo, el formulario de producto ("Stock mínimo (cajas)") y la unidad junto a la cantidad del carrito.
  - "Costo por caja", "Precio por caja" y "$65.00 / caja" se quedan en singular.
- **Montos largos en tarjetas:** `MoneyFigure ajustar` achica el número cuando la parte entera tiene 7 caracteres o más ("$99,999" → 0.88em, "$999,999" → 0.78em, más largo → 0.7em). Los montos normales no cambian.
  - Medido en Chrome con Geist: "$99,999.99" ocupaba 123.8 de 124 px útiles a 360 px. Con el ajuste, hasta "$9,999,999.99" ocupa ≤ 111 px.
  - En escritorio, con 4 columnas a 32 px, "$99,999.99" ocupa 133 de 141 px.

## Verificación

### Prueba manual (Diego)
**Primera prueba, dueño:**
- Las tarjetas y la comparación "a esta misma hora" funcionan.
- **Guion de la demo:** se cobraron 5 m de cable y, al volver a Inicio, ventas, ganancia y número de ventas subieron al centavo. También funciona regresando por el menú, sin recargar.
- "Registrar entrada" desde la lista abre el formulario con el producto, y al volver el producto ya no está en la lista.
- El selector 7 / 30 cambia la gráfica y el top 5 sin mover la pantalla.
- Tocar un día muestra su detalle, y Esc regresa al total.
- El top 5 ordena por importe.
- A 360 px nada se corta.

**Primera prueba, cajero:**
- El botón Vender está arriba.
- Solo ve sus ventas de hoy: $884.50, 4 de las 9 del día.
- No ve ganancia, comparación, gráfica ni valor del inventario, y esos datos no viajan en la página.
- "Se está acabando" sale sin botones y con la nota para el dueño.

**Segunda prueba, dueño (después de los ajustes):**
- Con la semilla nueva, la comparación sale en verde: +15% en ventas y +14% en ganancia vs. viernes pasado.
- Las etiquetas de la gráfica ya no tapan barras, ni en 7 ni en 30 días.
- El plural "3 cajas" / "1 caja" sale en Inicio, productos e inventario.
- A 360 px las tarjetas se ven completas.

### Automática
- `npx tsc --noEmit`, `npm run lint` y `npm run build` sin errores.
- `/panel` sin sesión redirige al login.
- Escala de la gráfica revisada con varios máximos: $37 → $40, $1,654 → $2,000, $5,210 → $6,000.

## Pendientes
- **Antes de instalarlo a un cliente real (Fase 8):** hoy el cajero puede leer costos si llama directo a la API: `productos.costo`, `venta_detalle.costo_unitario` y las columnas de costo y ganancia de `mas_vendidos` y `v_ventas_por_dia`. Inicio no se los muestra, pero hay que cerrarlo con permisos por columna o con vistas y funciones sin costo.
- **Fase 6 (`reset_demo` de madrugada):**
  - Si la semilla se carga antes de las 09:30, las 3 ventas de "hoy" quedan antes de abrir (hasta 3 horas antes de la recarga) y la comparación sale muy alta (+52% a +481%).
  - Si el reinicio corre de madrugada, ese día "hoy" se queda con esas 3 ventas y ya no crece. En la tarde, la comparación contra la semana pasada saldría negativa.
  - Hay que decidir si el reinicio nocturno genera ventas de hoy o si "hoy" empieza en $0 hasta la primera venta.
- **Stock bajo con más de 50 productos:** Inicio pide máximo 50 (por nombre) y los ordena por urgencia. Con un catálogo real grande convendría que la base los regrese ya ordenados por urgencia.
- **Fase 9:** modo oscuro de la gráfica y revisión de animaciones.
