# Inventario POS — Ferretería La Tuerca (demo)

## Qué es este proyecto
Demo de portafolio y de ventas: sistema de **inventario + punto de venta** para un negocio local.
Se enseña a prospectos en persona, desde celular o tablet, para que vean cómo controlarían su
negocio. El negocio es ficticio ("Ferretería La Tuerca") y debe poder rebrandearse desde
Configuración (nombre, logo, color) para personalizarlo a cada prospecto.

El plan completo está en `docs/00-plan-general.md`. Trabajar **una fase a la vez**; no adelantar
fases ni agregar funciones fuera del plan sin que yo lo pida.

## Stack
- Next.js (App Router) + TypeScript. Carpeta `app/` en la raíz, sin `src/`.
- Tailwind v4: configuración con `@theme` en CSS, sin `tailwind.config.ts`.
- Supabase: Postgres, Auth y RLS.
- Deploy en Vercel.

## Convenciones
- Texto de la UI en español. Variables, funciones, componentes y nombres de archivos de código en inglés.
- Tablas, columnas y funciones SQL en español, snake_case (mismo criterio que `barberia-citas`).
- Nada de secrets en el código. Variables en `.env.local` (local) y en Vercel (producción).
  Mantener `.env.example` con los nombres de las variables, sin valores.
- La `service_role` key solo en servidor y solo si es estrictamente necesaria.
- Scripts SQL versionados y numerados en `docs/sql/` (`01-...sql`, `02-...sql`). Idempotentes cuando se pueda.
- Al terminar cada fase, documentarla en `docs/fase-N-nombre.md`: qué se hizo, decisiones y pendientes.
- Una rama por fase, PR a `main`.
- Cada página del panel valida sesión en servidor con `verifySession()` (mismo patrón que `barberia-citas`).
- Dinero: `numeric(12,2)` en BD. Cantidades: `numeric(12,3)` (hay productos por metro o por kilo).
  En TypeScript no acumular dinero con floats sin redondear. Formato con
  `Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })`.
- Reportes y "ventas de hoy" calculados en zona `America/Monterrey`.

## Reglas de negocio que no se rompen
- El stock **nunca** se modifica directo desde la app. Solo cambia a través de las funciones SQL
  `registrar_movimiento`, `registrar_venta` y `cancelar_venta`, que son transaccionales y bloquean
  el producto con `FOR UPDATE`.
- El stock no puede quedar negativo.
- Cada movimiento guarda `stock_anterior` y `stock_nuevo`.
- `venta_detalle` guarda copia del nombre, precio y costo del producto al momento de la venta.
- Las ventas no se borran: se cancelan y el stock se regresa con un movimiento.
- Roles: `dueno` (todo) y `cajero` (vender y consultar productos). Validar en servidor y en RLS,
  no solo ocultando botones.

## Diseño
- Para UI usar las skills de Emil Kowalski: `emil-design-eng`, `animate`, `review-animations`.
- Mobile-first: la demo se enseña en un celular. El punto de venta debe ser cómodo en tablet.
- Animaciones discretas. Nada que estorbe o haga lento el cobro.
- Colores de marca como variables en `@theme`, tomando el color primario de la configuración del negocio.

## Modo demo
- Botón "Entrar al demo" en el login. Inicia sesión del lado del servidor con un usuario demo
  (rol `dueno`) cuyas credenciales viven en variables de entorno, nunca en el cliente.
- Función `reset_demo()` que restaura los datos semilla, programada de madrugada con `pg_cron`.
- Banner discreto: "Estás viendo un demo · los datos se reinician cada noche".

## Estado actual (noviembre de 2026)
Todas las fases del plan están terminadas (0 a 9b; la 7 y la 9 se partieron en a/b y hubo una de
endurecimiento). Estado y documentos de cada una: `docs/00-plan-general.md`, sección 8.
Demo en producción: https://inventario-pos-sepia.vercel.app

Lo que cambió desde el plan original y hay que saber antes de tocar algo:
- **Next 16.4.5:** `proxy.ts` (antes middleware) renueva la sesión de Supabase, redirige al login y
  pone la **CSP con nonce** en cada página. `error.tsx` recibe `{ error, retry }`. Todas las rutas son
  dinámicas (el layout lee la cookie del tema), así que el nonce no cuesta nada extra.
- **CSP (`app/lib/csp.ts`):** nada de `<script>` en línea ni scripts de terceros sin agregarlos ahí.
  Única concesión: `style-src-attr 'unsafe-inline'` (colores de marca en `<html style>` y `style={…}`).
  Un origen nuevo (imágenes, fetch) se agrega en `csp.ts`; Supabase ya está, tomado de la variable de entorno.
  Encabezados fijos (X-Frame-Options, nosniff, etc.) en `next.config.ts`.
- **Costos:** el cajero nunca recibe costos ni ganancias. Ni el dueño lee `productos.costo` ni
  `venta_detalle.costo_unitario` directo: solo con funciones `SECURITY DEFINER` (`costos_productos`,
  `mas_vendidos`, `ventas_por_dia`, `valor_inventario`, `reporte_*`). `select *` sobre esas tablas falla.
- **Cobros y movimientos idempotentes** con `clave` (uuid del cliente): reintentar nunca cobra doble.
  **Folios** consecutivos sin huecos con `privado.contador_folios`.
- **Marca:** `brandStyle()` (`app/lib/brand.ts`) escribe `--brand-*` en `<html data-brand>`; `globals.css`
  los mapea a `--color-primary*`. La tinta (`primary-ink`) se calcula para contraste 4.5:1 en claro y oscuro.
  Logo en el bucket público `marca` de Storage, convertido a WEBP con sharp en el servidor.
- **Tema:** cookie `tema` (claro | oscuro | sistema) leída en el servidor: sin parpadeo. El ticket siempre es
  claro (`.tema-claro`) y la impresión usa los tokens claros.
- **Usuarios:** se crean con la secret key (opcional, solo servidor, `app/lib/supabase/admin.ts`). En el demo
  nunca. Un usuario nuevo nace como cajero inactivo (trigger de `02`).
- **Modo demo:** tres usuarios (dueño, cajero y "Cajero de turno"). `reset_demo()` a las 03:00 de Monterrey
  y `avanzar_demo()` cada minuto (cobra las ventas pendientes del día). La marca se restaura sola a los 30 min.
- **SQL:** van del `01` al `31`. Las pruebas (`08`, `10`, `13`…`31`) necesitan la semilla `07`. Para un
  cliente nuevo: el orden del README, sin `07`, `18` ni pruebas, más el bloque del primer dueño.
- **Cómo se ha probado:** SQL en PGlite (suites + fallas intencionales) antes de Supabase; Diego corre los
  SQL en Supabase. La app, con Chrome sin ventana por CDP contra el servidor del 3000 (dev) o un build en
  el 3100 (CSP, Lighthouse), que se cierra al terminar. Scripts de prueba fuera del repo.
- **Secret key:** Diego la borró al cerrar la Fase 8; no usarla en pruebas.

## Referencias
- Reglas de Next 16 para agentes: @AGENTS.md
  (Si algo de ese archivo contradice este CLAUDE.md, manda este CLAUDE.md.)
