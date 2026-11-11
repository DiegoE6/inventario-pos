# Fase 8 — Roles y marca

Cambiando el nombre, el color y el logo en Configuración, el sistema se ve como otro negocio. El cajero tiene permisos de verdad limitados: en el servidor y en RLS, no solo con botones ocultos.

## Base de datos

| Script | Contenido |
|---|---|
| `28-roles-y-marca.sql` | Límites de la configuración y `logo_url` como ruta relativa. Bucket `marca` con sus políticas. `usuarios()`, `actualizar_usuario()` y proveedores solo para el dueño. Restauración de la marca del demo. |
| `29-pruebas-roles-y-marca.sql` | 8 pruebas en `BEGIN … ROLLBACK`. |
| `18-modo-demo.sql` | `avanzar_demo()` (el job de cada minuto) también restaura la marca 30 minutos después del último cambio. |
| `19-pruebas-modo-demo.sql` | La prueba 11 nueva revisa la restauración automática: a los 29 minutos no, a los 31 sí. |

**`28`:**
- **Configuración:**
  - CHECKs de largo: giro hasta 60, teléfono hasta 30 y dirección hasta 200. El nombre (1–100) y el color hex ya existían.
  - `logo_url` solo acepta `^/storage/v1/object/public/marca/logo\?v=\d+$`: es una ruta relativa, y la app le antepone `NEXT_PUBLIC_SUPABASE_URL`. No acepta dominios externos ni `javascript:`.
- **Storage:**
  - Bucket `marca` público, de 512 KB y solo `image/webp`, porque siempre se sube lo que regresa sharp.
  - Tres políticas (insert, update y select), solo del dueño y solo sobre el objeto `logo`.
  - No hay política de borrado, y nada borra filas de `storage.objects` por SQL.
- **Usuarios:**
  - `usuarios()` regresa el correo, el último acceso y si es usuario demo.
  - `actualizar_usuario()`: el dueño no puede quitarse el rol ni desactivarse, y los usuarios demo no se pueden modificar.
- **Proveedores:** solo los lee el dueño.
- **Demo:**
  - `privado.marca_original()` tiene los valores de la semilla, y `29` revisa que coincidan con `07`.
  - `restaurar_marca_demo()` es el botón del dueño.
  - `privado.restaurar_marca_vencida(ahora)` la usa el job de cada minuto.

## Resultados en Supabase

Orden en que se corrió de verdad:

1. **`28`:** `checks_validados` 4, `logo_url` null, `politicas_logo` 3, `funciones_nuevas` 3. Las 7 funciones nuevas coinciden por md5 con el archivo.
2. **`18`:** solo se aplicó `avanzar_demo()`, que es lo único que cambia en el diff. Coincide por md5, y el job `ventas-demo` sigue en `succeeded` cada minuto.
3. **`19`** (con la prueba 11), **`21`**, **`08`**, **`10`**, **`23`** y **`27`:** pasan.
4. **`13`, `15`, `17` y `25`:** no se corrieron, porque no tocan nada de lo que cambió `28`.
5. **`29`:** falló en la prueba 3 por cómo estaba escrita la prueba, no por las políticas:
   ```
   ERROR 42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification
   ```
   El proyecto tiene el Storage nuevo, con versionado. `storage.objects` no tiene un índice único simple en `(bucket_id, name)`. Sus índices únicos son:
   - `objects_pkey (id)`
   - `objects_bucket_id_name_version_key (bucket_id, name COLLATE "C", version) NULLS NOT DISTINCT`
   - `idx_objects_current_version (bucket_id, name COLLATE "C") WHERE archived_at IS NULL`
   - `idx_objects_null_version (bucket_id, name COLLATE "C") WHERE NOT is_versioned`
   - `objects_archived_order_uq (bucket_id, name COLLATE "C", archived_at) WHERE archived_at IS NOT NULL`

   Con dos cambios en la prueba pasaron las 8, sin dejar nada en la base:
   - **Prueba 3 (dueño):** insert simple, sin `ON CONFLICT`. En el archivo, además, se salta el insert si ya hay un logo subido desde la app, para que `29` se pueda volver a correr después.
   - **Prueba 6 (cajero):** el "upsert" quedó como `insert … on conflict do nothing`. Igual da 42501, porque lo frena la política de insert.

   Esos dos cambios ya están en `29`.

**Lección:** en la app nunca se escribe a `storage.objects` con SQL. La subida del logo va siempre por la API de Storage (`upload` con `upsert: true`), que conoce el esquema con versionado.

## Pruebas en PGlite

- **Esquema `storage`:** es mínimo, porque PGlite no lo trae. Ahora tiene los mismos índices únicos que el proyecto real: parciales y con versión, sin el único simple en `(bucket_id, name)`.
- **Controles del esquema:**
  - el `29` viejo da el mismo `42P10` que en Supabase;
  - el `29` nuevo pasa y no deja filas;
  - con un logo ya subido, también pasa, y el logo sigue ahí.
- **Suites:** pasan todas, de `08` a `29`: en instalación limpia, después de volver a correr `28` y `18`, y después de `reset_demo()`.
- **Orden:** con el `18` viejo, `19` falla con "avanzar_demo no revisa la marca: vuelve a correr 18 después de 28". Con el `18` nuevo pasa.
- **Fallas a propósito, las 23 detectadas** con el esquema versionado:
  - `logo_url` con dominio externo;
  - `logo_url` con cualquier cosa, incluido `javascript:`;
  - giro de hasta 100;
  - bucket que acepta SVG;
  - insert sin `es_dueno`: ahora choca con `objects_bucket_id_name_version_key`;
  - insert sin revisar el nombre;
  - insert en cualquier bucket;
  - política de borrado;
  - política para `anon`;
  - el dueño se quita el rol;
  - el dueño se desactiva;
  - usuario demo editable;
  - `usuarios()` sin validar el rol;
  - `usuarios()` para `anon`;
  - una auxiliar de `privado` abierta;
  - proveedores para el cajero;
  - el botón de restaurar sin validar el rol;
  - una marca original distinta de la semilla;
  - restaura a los 28 minutos;
  - restaura a los 32 minutos;
  - restaura sin esperar;
  - restaura aunque ya esté original;
  - el `18` viejo.

## sharp

- **Versión:** `sharp@0.35.5` exacta (`--save-exact`), la misma de la que depende `next@16.4.5`. `npm ls sharp` la muestra deduplicada, así que hay una sola copia de libvips.
- **`npm audit`:** 8 moderadas, las mismas de antes. Vienen de `minimatch` dentro de la cadena de ESLint, que es solo de desarrollo. `npm audit --omit=dev` da **0 vulnerabilidades**.
- **Vercel:** el bug de sharp 0.35 en Vercel con Turbopack ([lovell/sharp#4567](https://github.com/lovell/sharp/issues/4567)) se cerró como arreglado en Next 16.3+, y usamos 16.4.5. Que funcione se confirma en el deploy de vista previa de la rama. Si ahí falla, la alternativa es fijar `0.34.5`.

## Pantallas

### Marca en toda la app
- **`<html data-brand>`:** la marca se pone desde `app/layout.tsx` con `brandStyle()`. Va en el HTML del servidor, así que no hay parpadeo del color por defecto.
  - `generateMetadata` arma el título (`%s · Nombre`) y `generateViewport` el `theme-color`.
  - `getConfiguracion` usa `cache()` de React, que dura una sola petición. Todas las rutas son dinámicas (ƒ en el build): un cambio se ve en la siguiente navegación.
- **Tokens:**
  - `--color-primary` es para fondos (botones, barra del carrito), con `--color-on-primary` encima, blanco o negro según WCAG.
  - `--color-primary-ink` es el primario oscurecido hasta ≥ 4.6:1 contra blanco, el fondo, el gris de las tarjetas y `primary-soft`. Lo usan texto, contornos de foco, bordes activos, checkboxes y barras de gráficas.
  - `--color-primary-ink-muted` es la tinta aclarada lo más posible sin bajar de 3:1 (WCAG 1.4.11). Lo usan las barras no seleccionadas de la gráfica de ventas.

  | Color | Texto encima | Tinta | Tinta atenuada |
  |---|---|---|---|
  | `#fde047` | negro | `#796c22` | `#968c53` (3.1:1) |
  | `#1e3a8a` | blanco | `#1e3a8a` (igual) | `#7889b9` (3.2:1) |
  | `#c2410c` | blanco | `#be400c` | `#cf724b` (3.1:1) |
- **Dónde sale la marca:** login, barra lateral, título de la pestaña, `theme-color` y ticket.
  - En el ticket, el logo mide 12 mm de alto como máximo y se imprime en gris.
  - Los Excel se llaman `<negocio>-<tipo>-<fechas>.xlsx`, con el nombre sin acentos, solo `a-z`, `0-9` y guiones, y máximo 40 caracteres. Si el nombre no deja nada usable, solo el tipo y la fecha.
- **`logo_url`:** la app solo acepta la ruta del bucket `marca` (`logoSrc`) y le antepone `NEXT_PUBLIC_SUPABASE_URL`. Cualquier otra cosa se ignora y salen las iniciales.

### Configuración › Negocio y marca
- **Datos:** nombre, giro, teléfono, dirección y color, con zod en el servidor; la BD los vuelve a validar con los CHECK.
- **Color:** 7 colores sugeridos, un selector y el código hex. Debajo dice qué texto lleva encima y qué tinta se usa.
- **Vista previa en vivo antes de guardar**, con los mismos tokens de la app. En celular va junto al color, antes de Guardar; en escritorio, en una columna fija.
- **Logo** (`app/lib/logo.ts`):
  - El tipo se decide por la firma del archivo (PNG, JPG o WEBP; SVG no).
  - Ancho y alto se leen del encabezado, sin decodificar: más de 4000 px por lado se rechaza, y `limitInputPixels` es una segunda barrera.
  - El archivo pesa hasta 3 MB, por debajo de los 4.5 MB que acepta Vercel. `bodySizeLimit` subió a `4mb`.
  - sharp lo convierte a WEBP de máximo 512 px, sin EXIF, GPS, ICC ni XMP.
  - Se sube solo ese WEBP, con la API de Storage (`upload` con `upsert: true`) y la sesión del dueño. Después se guarda `logo_url` con `?v=<timestamp>`.
  - "Quitar logo" solo pone `logo_url` en null: no hay política de borrado.
- **Demo:** aviso "En el demo, los cambios de marca los ven todos y se restauran solos en 30 minutos" y botón "Restaurar marca del demo".

### Configuración › Usuarios
- **Lista con `usuarios()`:** nombre, correo, rol, último acceso y "Tú". Los activos y los desactivados van separados.
- **Usuarios demo:** se muestran bloqueados ("Usuario del demo: no se puede modificar"), sin botón Editar.
- **Editar** (nombre, rol y activo) va por `actualizar_usuario()`. En tu propio usuario, el rol y "Activo" vienen deshabilitados con su explicación, y la BD lo vuelve a impedir.
- **Crear** (opción A):
  - `app/lib/supabase/admin.ts` es lo único que lee `SUPABASE_SECRET_KEY` (`server-only`, sin `NEXT_PUBLIC_`). Solo lo usa `crearUsuario`.
  - Antes de usar la llave: `requireDueno`, `demoActivo()` falso, zod, y `es_dueno()` por RPC con la sesión del usuario.
  - El alta en Auth se hace con `email_confirm: true`. Luego se activa y se le da rol con la sesión del dueño. Si eso falla, se borra el usuario recién creado.
  - Si el correo ya existe: "Ya existe un usuario con ese correo."
  - La contraseña temporal (formato `Kp7m-Qx3z-Hr9w`) se muestra una sola vez, con botón de copiar.
  - **En el demo:** el botón sale deshabilitado con aviso y el servidor lo vuelve a rechazar. El demo no necesita la secret key.
- **`.env.example`:** tiene `SUPABASE_SECRET_KEY=` vacía, como opcional y solo de servidor.

### Otros
- **Singulares:**
  - "Se creará 1 producto";
  - "La fila con error no se importa";
  - "1 sin cambios: se omite";
  - "Columna que no se usa";
  - "Falta la columna";
  - "1 producto activo".
  - También se corrigió que "se actualizará 1." empezaba en minúscula cuando no había productos nuevos.
- **Proveedores:** el detalle de producto ya no los pide para el cajero. Ninguna pantalla del cajero usa proveedores embebidos; solo los usa la exportación de productos, que es del dueño.

## Cómo se probó
- `tsc`, `eslint` y `next build` sin errores. En `.next/static` no hay rastro de la secret key, `auth.admin` ni sharp.
- **`logo.ts` y `brand.ts`: 44 de 44.**
  - PNG, JPG (normal, progresivo y con EXIF y GPS) y WEBP (con pérdida, sin pérdida y con alfa): el encabezado coincide con sharp, sale WEBP de ≤ 512 px y sin metadatos.
  - Se rechazan SVG, GIF, 4001 px, un encabezado falso de 60000 px, un archivo truncado, uno vacío, más de 3 MB y texto renombrado a `.png`.
  - Tinta ≥ 4.5:1 para 6 colores.
  - Slug con comillas, punto y coma, salto de línea, kanji, más de 40 caracteres y `../`.
  - `logoSrc` rechaza dominios externos, `javascript:`, `//`, `&` y otras rutas.
- **De punta a punta contra el proyecto real** (modo demo local, Chrome sin ventana): 42 de 42.
  - HTML del servidor con la marca en `<html>`, `theme-color` y título.
  - La vista previa cambia antes de guardar y el resto de la app no. El nombre vacío se rechaza.
  - Amarillo guardado. SVG rechazado. Un JPG de 1600 px con GPS quedó como WEBP de 512×320 y 2.9 KB, sin EXIF.
  - El logo aparece en la barra lateral y en el login.
  - Barras con tinta y tinta atenuada. Los tres Excel con el nombre en slug. `#1e3a8a` y `#c2410c` probados.
  - Usuarios demo bloqueados y crear deshabilitado.
  - El botón de restaurar deja la marca original y el formulario se actualiza.
  - El cajero va a `/panel?aviso=solo-dueno` en Negocio y en Usuarios, y su detalle de producto y Vender cargan.
  - Sin errores en consola. La marca quedó restaurada al terminar.

## Ajustes después de la revisión
- **Formulario de Negocio y marca:** las dos columnas (formulario y vista previa) dependen del ancho del área de contenido, con container queries (`@container/negocio`, `@3xl`), no del de la ventana. Dirección va siempre en su propia fila. Giro y teléfono van lado a lado solo si el formulario mide ≥ 32rem.

  | Ventana | Contenido | Columnas | Giro | Teléfono | Dirección |
  |---|---|---|---|---|---|
  | 390 | 390 | 1 | 324 | 324 | 324 |
  | 768 | 528 | 1 | 438 | 438 | 438 |
  | 800 | 560 | 1 | 470 | 470 | 470 |
  | 1024 | 784 | 1 | 337 | 337 | 694 |
  | 1280 | 1040 | 2 | 303 | 303 | 626 |
- **Logos anchos:** alto fijo y ancho hasta 3 veces el alto, con `object-contain`.
  - Un logo de 1200×450 se guarda en 512×192 (sin recortar).
  - Barra lateral: 96×36. Login: 149×56. Ticket: 12 × 31 mm (máximo 36 mm).
  - Un logo cuadrado queda en 36×36.
- **Texto del logo:** "Se ajusta a 512 px como máximo, sin recortarla, y se quitan los datos de la cámara".
- **Copiar la contraseña temporal:** `navigator.clipboard` no existe fuera de HTTPS (por ejemplo, abriendo el servidor local por la IP de la red). Si falla, copia la selección; si tampoco se puede, deja la contraseña seleccionada con un aviso.
- **Cajero en el detalle de producto:** el 500 ("Jest worker encountered 2 child process exceptions") salía porque había dos servidores de desarrollo corriendo, no por el código. Con un solo servidor, 10 detalles de producto dieron 200 sin proveedor.

## Pruebas con la secret key (local)
- **Usuario desactivado contra la API real** (`desactivado-8.mjs`), con su sesión todavía abierta:
  1. **Página:** la siguiente petición lo manda a `/login?error=inactivo`, con el mensaje de cuenta desactivada.
  2. **REST:** 0 productos con el JWT viejo (antes, 40).
  3. **RPC `rol_actual()`:** null.
  4. **RPC `registrar_venta`:** LT401 "Tu usuario no está activo."
- **Crear desde la pantalla** (con `DEMO_MODE=false` temporal):
  - el servidor valida los datos vacíos;
  - el usuario se crea activo, con contraseña `Xxxx-Xxxx-Xxxx` que no vuelve a aparecer al cerrar ni al recargar;
  - el correo se guarda en minúsculas y el nombre sin espacios dobles;
  - un correo repetido da "Ya existe un usuario con ese correo.";
  - el cajero nuevo entra; el dueño lo desactiva desde la pantalla; su siguiente página lo saca y ya no puede volver a entrar.
- **Al terminar:** `DEMO_MODE=true` otra vez y los usuarios de prueba borrados. `auth.users` quedó con los 3 del demo. La llave no aparece en ningún archivo del repo, en `.next/static`, en los logs ni en los scripts de prueba.

## Revisión en el navegador (Diego)
- 20 fichas de producto como cajero, sin errores y sin proveedor.
- Formulario de Negocio y marca a 800, 1024 y 1280: sin campos apretados, una sola vista previa y sin scroll horizontal.
- `auth.users` quedó solo con los 3 usuarios demo.
- La secret key que se usó para las pruebas locales se borra en Supabase y se quita de `.env.local`. No se vuelve a usar.

## Pendientes
- **sharp en Vercel:** se confirma en el deploy de vista previa de la rama.
- **Producción:** si se quiere crear usuarios en una instalación real, poner `SUPABASE_SECRET_KEY` en Vercel (solo servidor). En el demo, no.
