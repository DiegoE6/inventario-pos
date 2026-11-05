# Fase 2 — Login, panel y productos

## Qué se hizo

### Base de datos
| Script | Contenido |
|---|---|
| `09-crear-producto.sql` | `crear_producto(...)`: crea el producto y registra su stock inicial como entrada, en una sola transacción. Solo dueño, `SECURITY DEFINER`, `search_path = ''`, `REVOKE` a `public`/`anon` y `GRANT` a `authenticated`. Código repetido → `LT409`. |
| `10-pruebas-crear-producto.sql` | 8 pruebas en `BEGIN … ROLLBACK`: con y sin stock inicial, código duplicado, datos inválidos sin dejar rastro, categoría/proveedor inexistente o desactivado, cajero (`LT403`) y `anon` (42501). |
| `11-color-primario.sql` | Cambia el default de `color_primario` a `#c2410c` y la fila del negocio solo si seguía con `#ea580c`. `01` y `07` también se actualizaron. |

**Resultado en Supabase:**
- `09`, `10` y `11` terminaron sin errores. El `10` termina mostrando el `set_config` de `anon`, que es el último `SELECT`: es normal.
- Se volvió a correr `07` sin errores (40 productos). Con eso, la semilla de la base ya tiene el naranja nuevo.

En PGlite, del `01` al `10` pasan y la suite `08` sigue pasando. Se rompió `crear_producto` tres veces a propósito (permiso a `anon`, sin validar el rol, stock sin movimiento) y `10` reportó cada caso con su número.

### Autenticación
- **`proxy.ts`** (convención de Next 16, no `middleware.ts`). Corre en `/panel/*` y `/login`.
  - Renueva la sesión con `getClaims()` y devuelve la respuesta que armó `setAll`, con las cookies y los encabezados de caché.
  - Sin sesión → `/login`; con sesión en `/login` → `/panel`.
  - Es solo un chequeo optimista: no consulta la base.
- **`app/lib/auth.ts`**, la verificación real:
  - `verifySession()` (con `cache()`) valida el JWT con `getClaims()`, nunca con `getSession()`. Luego lee el perfil con la sesión del usuario y regresa `{ userId, email, nombre, rol }`. Sin perfil o con perfil inactivo → `/login?error=inactivo`.
  - `requireDueno()` regresa al cajero a `/panel?aviso=solo-dueno`.
  - **Todas** las páginas y Server Actions del panel la llaman; el layout no basta, porque no se vuelve a ejecutar al navegar.
- **Login:**
  - Server Action con `useActionState` y zod.
  - Un solo mensaje para credenciales incorrectas.
  - Si el perfil está inactivo, cierra la sesión recién abierta.
  - Muestra nombre, logo (o iniciales) y color de `configuracion_negocio`, que `anon` puede leer.
- **Cerrar sesión:** Server Action por POST (no un enlace GET).

### Panel
- **Layout:**
  - `color_primario` se valida como `#RRGGBB` antes de ponerlo en `style` (`brandStyle`); si no es válido, usa el default.
  - El color del texto sobre la marca (`--color-on-primary`) se calcula por contraste.
- **Navegación:**
  - Barra lateral en escritorio y barra inferior en celular (Inicio, Vender, Productos, Inventario, Más), con el área segura del iPhone.
  - "Más" agrupa Ventas, Reportes, Categorías, Proveedores y Configuración, filtrados por rol.
- **"Próximamente":** Inicio (Fase 5), Vender (Fase 3), Inventario (Fase 4), Ventas, Reportes y los datos del negocio en Configuración (Fase 8).

### Productos
- **Lista `/panel/productos`:**
  - Paginada desde el servidor (20 por página, `range()` + `count`).
  - Búsqueda por nombre o código con retardo de 300 ms y filtro por categoría. Los filtros viven en la URL y cualquier cambio regresa a la página 1.
  - Etiquetas "Agotado" (rojo sólido) y "Stock bajo" (rojo suave).
  - El dueño puede ver los inactivos.
  - Tarjetas en celular, tabla en escritorio y esqueleto de carga.
- **Alta `/panel/productos/nuevo`:** solo dueño, vía `crear_producto` con stock inicial.
- **Edición `/panel/productos/[id]`:**
  - Solo dueño. El stock se muestra pero no se edita.
  - Si cambias la unidad a pieza o caja con un stock que tiene decimales, se rechaza.
  - El cajero ve una ficha de solo lectura, sin el costo.
- **Margen en vivo:** se calcula en centavos enteros (`toCents`), sin decimales flotantes.

### Catálogos
- `/panel/configuracion/categorias` y `/panel/configuracion/proveedores` (solo dueño): alta, edición en línea y activar/desactivar. No se borran, porque los productos y ventas los referencian.

### Sistema visual
- Tokens en `@theme` (`app/globals.css`):
  - Naranja `#c2410c` y neutros stone.
  - Éxito en verde; peligro y stock bajo en rojo.
  - Curva `--ease-out` de Emil Kowalski.
- Componentes en `app/components/`: `Button`, `SubmitButton`, `Field`, `Input`, `Select`, `StockBadge`, `MarginPill`, `ProductCard`, `BottomNav`, `PageHeader`, `ComingSoon`, `Notice` y `BrandMark`.
- **Movimiento:** solo la respuesta al presionar (`scale(0.97)`, 150 ms) y el esqueleto de carga, con respeto a `prefers-reduced-motion`. La navegación y la búsqueda no se animan.
- **Página de muestra `/dev/muestra`:** solo en desarrollo; en producción responde 404 y no publica ni el título.

### Otros
- Skills instaladas y versionadas: `emil-design-eng`, `animate` y `review-animations` (`skills-lock.json`).
- Dependencias: `zod@4.6.7` y `lucide-react@1.69.0`, en versión exacta.
- `next.config.ts`: `allowedDevOrigins` con redes locales. Solo aplica en desarrollo y sirve para probar desde el celular.

## Decisiones
- **Lecturas y escrituras:** las lecturas van en Server Components (`app/lib/data.ts`) y las escrituras en Server Actions, siempre con la sesión del usuario y nunca con `service_role`. La base vuelve a validar todo (RLS y funciones).
- **Validación en servidor con zod** (`app/lib/validation.ts`). Montos y cantidades viajan a la base como texto (`"12.50"`), no como float.
- **Errores (`app/lib/errors.ts`):** un solo módulo traduce los `LT401`–`LT422` y los errores de Postgres (23505, 42501…) a mensajes en español. Los errores desconocidos van al log del servidor y el usuario ve un mensaje genérico.
- **Búsqueda segura:** el texto se escapa para `LIKE` (`% _ \`) y para la sintaxis de `or=(...)` de PostgREST (comillas). Se probó contra el PostgREST real con comas, paréntesis, comillas y comodines: ningún error y ningún filtro inyectado.
- **Formularios controlados:** React 19 limpia los formularios no controlados después de cada envío; con campos controlados no se pierde lo capturado cuando hay errores.
- **Sin ciclo por usuario inactivo:** `verifySession` manda a `/login?error=inactivo`, y el proxy deja ver `/login` con `?error` aunque haya sesión. Si no, se armaría un ciclo `/panel` → `/login` → `/panel`.
- **Solo tema claro.** El modo oscuro queda para la Fase 9.

## Verificación
- `npm run lint`, `npx tsc --noEmit` y `npm run build`: sin errores ni advertencias.
- **Sin sesión:** `/`, `/panel`, `/panel/productos`, `/panel/productos/nuevo` y `/panel/configuracion/categorias` redirigen a `/login` (307). `/login` responde 200 con la marca de Supabase (`#c2410c`), y `/login?error=inactivo` muestra el aviso.
- **Escape de búsqueda** contra Supabase: 10 de 10 casos correctos.
- **Utilidades:**
  - `toCents`, `computeMargin`, `stockStatus`, `onColorFor`.
  - `brandStyle` con valores maliciosos: cae al color por defecto.
- **Prueba manual en celular con usuarios reales (dueño y cajero):** todo funciona.
  - Login, búsqueda, filtros y paginación, alta y edición de productos, y catálogos.
  - Con el cajero, la vista queda restringida.
  - Después de cerrar sesión, el botón "atrás" no muestra el panel.
  - La sesión se mantiene al reabrir la pestaña.
  - Un doble toque en "Crear" solo crea un producto.

## Pendientes
- **Fase 4:** historial de movimientos en el detalle del producto y botón "Registrar entrada" desde stock bajo.
- **Fase 6:** el botón "Entrar al demo".
- **Fase 8:**
  - RLS no oculta columnas: el cajero puede leer `productos.costo` desde la API, aunque la pantalla no lo muestre. Se resuelve con una vista sin costo si importa.
  - El color de marca se edita desde Configuración. El layout ya lo lee y lo valida.
  - El logo se muestra solo si su URL es `https://`. Cuando se suba a Supabase Storage, revisar si conviene `next/image` con `remotePatterns`.
- **Fase 9:** modo oscuro; revisar las animaciones con `review-animations`.
