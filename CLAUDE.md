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

## Referencias
- Reglas de Next 16 para agentes: @AGENTS.md
  (Si algo de ese archivo contradice este CLAUDE.md, manda este CLAUDE.md.)
