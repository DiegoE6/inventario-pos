# Plan general — Demo de inventario y punto de venta

## 1. Objetivo de la demo
Que un dueño de negocio, en 2 minutos y desde un celular, entienda:
1. **Vende algo y el stock baja solo.** Cobra en el punto de venta y ve en el inicio cómo sube la venta del día y baja la existencia.
2. **El sistema le avisa qué se le está acabando.** Lista de productos con stock bajo.
3. **Sabe cuánto ganó, no solo cuánto vendió.** Ganancia del día = ventas − costo de lo vendido.
4. **No empieza de cero.** "Pásame tu lista de Excel y la cargo."

Si una función no ayuda a uno de estos 4 momentos, no entra en la demo.

## 2. Negocio ficticio y datos semilla
- **Ferretería La Tuerca**, rebrandeable desde Configuración (nombre, giro, logo, color, teléfono, dirección).
- ~40 productos en 6 categorías: Tornillería, Herramienta, Eléctrico, Plomería, Pintura, Jardín.
- Unidades variadas: pieza, caja, metro, kilo, litro.
- 4 o 5 proveedores.
- 6 a 8 productos por debajo de su stock mínimo (para que la alerta se vea).
- Ventas generadas de los últimos 30 días, con más movimiento en fines de semana, para que las gráficas y el top de productos se vean vivos.
- Usuarios: `demo` (dueno) y `cajero_demo` (cajero).

## 3. Alcance

### Incluye
- Productos, categorías y proveedores
- Movimientos de inventario: entradas (compra), mermas y ajustes por conteo físico
- Punto de venta con ticket
- Inicio con indicadores
- Reportes con exportación a Excel
- Importar productos desde Excel/CSV
- Roles dueño y cajero
- Configuración del negocio (marca)
- Modo demo con reinicio nocturno

### No incluye (y qué responder si te lo piden)
| Si te piden | Respuesta |
|---|---|
| Facturación electrónica (CFDI) | "Se puede integrar con un proveedor de timbrado. Es un módulo aparte." |
| Varias sucursales | "Se puede, el sistema se adapta para manejar inventario por sucursal." |
| Terminal de tarjeta conectada | "Se registra el método de pago. La conexión con terminal se ve según su banco." |
| Funcionar sin internet | "Se puede valorar según su caso." |
| Contabilidad | "El sistema le da los reportes que su contador necesita." |

## 4. Pantallas

Navegación: barra lateral en escritorio, barra inferior en celular (Inicio, Vender, Productos, Inventario, Más).

### 4.1 `/login`
- Correo y contraseña.
- Botón grande **"Entrar al demo"**.

### 4.2 `/panel` — Inicio
- 4 tarjetas: **Ventas de hoy**, **Ganancia de hoy**, **Número de ventas hoy**, **Productos con stock bajo**.
- Gráfica de ventas de los últimos 7 / 30 días (selector).
- Top 5 productos más vendidos del periodo.
- Lista de stock bajo con botón "Registrar entrada" por producto.
- Valor del inventario a costo (solo dueño).

### 4.3 `/panel/vender` — Punto de venta
- Buscador con foco automático. Busca por nombre o código. Un lector de código de barras funciona como teclado: escanear + Enter agrega el producto.
- Resultados en tarjetas grandes (cómodas para el dedo).
- Carrito: cantidad con + / − y campo editable (acepta decimales si la unidad es metro o kilo), quitar producto, total grande.
- Avisa si la cantidad supera el stock y no deja cobrar.
- Método de pago: efectivo, tarjeta, transferencia. En efectivo pide lo recibido y calcula el cambio.
- Botón **Cobrar** → ticket en modal (folio, fecha, productos, total, pago, cambio) con opción de imprimir y "Nueva venta".

### 4.4 `/panel/productos`
- Tabla/lista con búsqueda, filtro por categoría y etiqueta de stock bajo.
- Alta y edición: código, nombre, descripción, categoría, proveedor, unidad, costo, precio, stock mínimo, activo. Muestra el margen en vivo al capturar costo y precio.
- El stock inicial se registra como movimiento de entrada al crear el producto.
- Detalle del producto con su historial de movimientos.
- Botón **Importar desde Excel** (Fase 7).

### 4.5 `/panel/inventario`
- Registrar **entrada** (compra a proveedor, con costo unitario).
- Registrar **merma** (se rompió, se perdió) con nota obligatoria.
- **Ajuste por conteo**: capturas lo que contaste físicamente y el sistema calcula la diferencia.
- Historial de movimientos filtrable por fecha, tipo y producto.

### 4.6 `/panel/ventas`
- Lista por fecha con folio, hora, total, método de pago y estado.
- Detalle de la venta y reimprimir ticket.
- Cancelar venta (solo dueño, con motivo) → regresa stock.

### 4.7 `/panel/reportes` (solo dueño)
- Rango de fechas.
- Ventas, costo, ganancia y ticket promedio.
- Ventas por día, por categoría y por método de pago.
- Productos más vendidos y productos sin movimiento.
- Exportar a Excel.

### 4.8 `/panel/configuracion` (solo dueño)
- Datos del negocio y marca (nombre, logo, color primario).
- Categorías y proveedores.
- Usuarios y roles.

## 5. Modelo de datos

### `configuracion_negocio` (una sola fila)
`id` (=1), `nombre`, `giro`, `logo_url`, `color_primario`, `telefono`, `direccion`, `actualizado_en`

### `perfiles`
`id` (= auth.users.id), `nombre`, `rol` (`dueno` | `cajero`), `activo`, `creado_en`

### `categorias`
`id`, `nombre` (único), `activo`

### `proveedores`
`id`, `nombre`, `contacto`, `telefono`, `notas`, `activo`

### `productos`
`id` (uuid), `codigo` (único), `nombre`, `descripcion`, `categoria_id`, `proveedor_id`,
`unidad` (`pieza` | `caja` | `metro` | `kilo` | `litro`), `costo` numeric(12,2), `precio` numeric(12,2),
`stock` numeric(12,3), `stock_minimo` numeric(12,3), `activo`, `creado_en`, `actualizado_en`
- CHECK: `costo >= 0`, `precio >= 0`, `stock >= 0`, `stock_minimo >= 0`

### `movimientos_inventario`
`id`, `producto_id`, `tipo` (`entrada` | `venta` | `merma` | `ajuste` | `cancelacion_venta`),
`cantidad` (con signo: + entra, − sale), `stock_anterior`, `stock_nuevo`, `costo_unitario`,
`venta_id` (nullable), `nota`, `usuario_id`, `creado_en`

### `ventas`
`id`, `folio` (consecutivo), `subtotal`, `total`, `metodo_pago` (`efectivo` | `tarjeta` | `transferencia`),
`pago_recibido`, `cambio`, `estado` (`completada` | `cancelada`), `motivo_cancelacion`,
`usuario_id`, `creado_en`, `cancelada_en`

### `venta_detalle`
`id`, `venta_id`, `producto_id`, `nombre_producto` (copia), `unidad` (copia), `cantidad`,
`precio_unitario` (copia), `costo_unitario` (copia), `importe`

Índices: `productos(codigo)`, `productos(nombre)` para búsqueda, `movimientos_inventario(producto_id, creado_en)`,
`ventas(creado_en)`, `venta_detalle(venta_id)`.

## 6. Funciones SQL y vistas

### Funciones (transaccionales)
- **`registrar_movimiento(p_producto_id, p_tipo, p_cantidad, p_costo_unitario, p_nota)`**
  Bloquea el producto con `FOR UPDATE`, valida que el stock no quede negativo, inserta el movimiento con stock anterior/nuevo y actualiza `productos.stock`. Para `entrada` puede actualizar el costo del producto.
- **`registrar_ajuste(p_producto_id, p_stock_contado, p_nota)`**
  Calcula la diferencia contra el stock actual y llama a `registrar_movimiento` con tipo `ajuste`.
- **`registrar_venta(p_items jsonb, p_metodo_pago, p_pago_recibido)`**
  Recibe `[{producto_id, cantidad}]`. Toma precios y costos **desde la BD**, no del cliente. Bloquea los productos en orden por id (evita deadlocks), valida stock, crea venta, detalle y movimientos, y regresa `folio` e `id`.
- **`cancelar_venta(p_venta_id, p_motivo)`**
  Solo dueño. Marca la venta como cancelada y regresa el stock con movimientos `cancelacion_venta`.
- **`reset_demo()`**
  Borra y vuelve a cargar los datos semilla, incluyendo ventas de los últimos 30 días relativas a la fecha actual.
- Auxiliares: `rol_actual()`, `es_dueno()`.

Todas validan `auth.uid()` y el rol cuando aplique, con `SECURITY DEFINER` y `search_path` fijo.

### Vistas
- `v_stock_bajo`: productos activos con `stock <= stock_minimo`.
- `v_ventas_por_dia`: total, costo y ganancia por día (zona America/Monterrey), solo ventas completadas.
- `v_mas_vendidos`: cantidad e importe por producto en un rango.

## 7. Seguridad
- RLS activado en todas las tablas.
- Lectura: usuarios autenticados y activos.
- `productos`, `categorias`, `proveedores`, `configuracion_negocio`: insertar/editar solo `dueno`.
- `movimientos_inventario`, `ventas`, `venta_detalle`: **sin** políticas de insert/update; solo se escriben a través de las funciones.
- `perfiles`: cada quien lee el suyo; el dueño ve y edita todos.
- Reportes y valor del inventario: solo dueño (validado en servidor, no solo oculto).
- Importación de Excel validada en servidor: tamaño máximo, columnas esperadas y vista previa antes de guardar.

## 8. Fases

| Fase | Qué se hace | Terminado cuando |
|---|---|---|
| **0. Arranque** | Proyecto Next.js + TS + Tailwind v4, clientes de Supabase, `.env.example`, deploy vacío en Vercel | La página temporal se ve en el link de Vercel |
| **1. Base de datos** | Tablas, CHECKs, índices, RLS, funciones, vistas y datos semilla en `docs/sql/` | Desde el editor SQL de Supabase se puede registrar una venta y el stock baja |
| **2. Panel y productos** | Login, `verifySession()`, layout con navegación, CRUD de productos, categorías y proveedores | Se puede crear y editar un producto desde el celular |
| **3. Punto de venta** | Pantalla de vender, carrito, cobro, ticket | Una venta completa en menos de 15 segundos |
| **4. Inventario** | Entradas, mermas, ajustes por conteo, historial | Cada cambio de stock aparece en el historial del producto |
| **5. Inicio** | Tarjetas, gráfica, top de productos, stock bajo | **Ya se puede enseñar a prospectos** |
| **6. Modo demo** | Botón "Entrar al demo", banner, `reset_demo()` con `pg_cron` | Un prospecto puede entrar desde el QR y al día siguiente todo está como nuevo |
| **7. Reportes e importación** | Reportes por rango, exportar a Excel, importar productos desde Excel/CSV | Se carga una lista de 100 productos desde Excel con vista previa |
| **8. Roles y marca** | Cajero con permisos limitados, ventas canceladas por dueño, configuración de marca | Cambiando nombre y color en Configuración, el sistema se ve como otro negocio |
| **9. Pulido** | Revisión de animaciones y diseño, estados vacíos y de error, README con capturas, link en el portafolio | Lo enseñarías sin pena a cualquier dueño |

## 9. Guion para presentar la demo (2 minutos)
1. "Imagínese que esta es su ferretería." Abre **Inicio**: ventas de hoy, ganancia y lo que se está acabando.
2. "Vamos a venderle algo a un cliente." Ve a **Vender**, busca un producto, agrégalo y cobra en efectivo. Enseña el cambio y el ticket.
3. Regresa a **Inicio**: subió la venta del día y bajó la existencia.
4. "Y esto ya le avisa qué tiene que pedir." Enseña el **stock bajo** y registra una entrada.
5. Cierre: "Si ya tiene su lista de productos en Excel, la cargo y en unos días lo tiene así, con el nombre de su negocio."
