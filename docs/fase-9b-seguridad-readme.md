# Fase 9b — Encabezados de seguridad y README

Segunda parte de la Fase 9 (la primera fue [9a](fase-9a-pulido.md)): Content Security Policy con nonce, encabezados de seguridad, Lighthouse "después", README con capturas y cierre del proyecto.

## CSP y encabezados

### Content Security Policy (`app/lib/csp.ts`, la pone `proxy.ts`)

Nonce nuevo en cada petición (128 bits aleatorios). Va en el encabezado de la petición, de donde Next lo toma para sus scripts, y en el de la respuesta, que es el que aplica el navegador.

| Directiva | Valor | Por qué |
|---|---|---|
| `default-src` | `'self'` | Todo lo que no se nombra abajo, solo del propio sitio. |
| `script-src` | `'self' 'nonce-…' 'strict-dynamic'` (+ `'unsafe-eval'` solo en desarrollo) | Solo corren los scripts con el nonce de esta petición y los que ellos carguen (los chunks de Next). En desarrollo, React usa `eval` para las pilas de error. |
| `style-src` | `'self' 'nonce-…'` (en desarrollo, `'unsafe-inline'`) | Hojas propias y `<style>` con nonce. En desarrollo Next inyecta `<style>` sin nonce. |
| `style-src-attr` | `'unsafe-inline'` | **Única concesión.** El atributo `style` de `<html>` lleva los colores de la marca y React escribe `style={…}` como atributo. Un atributo `style` no ejecuta código. |
| `img-src` | `'self' data: blob:` + Supabase | Logo en Storage, vista previa del logo (`blob:`). |
| `font-src` | `'self'` | Fuentes de `next/font`, servidas por la app. |
| `connect-src` | `'self'` + `https://` y `wss://` de Supabase | Cliente de Supabase en el navegador. El origen sale de `NEXT_PUBLIC_SUPABASE_URL`. |
| `object-src` | `'none'` | Sin plugins. |
| `base-uri` | `'self'` | Nadie puede cambiar la base de las rutas relativas. |
| `form-action` | `'self'` | Los formularios solo se envían a la app. |
| `frame-ancestors` | `'none'` | Nadie puede meter la app en un iframe. |

**Proxy:**
- **Matcher:** todo menos `_next/static`, `_next/image`, `favicon.ico`, imágenes por extensión y `/api/`. `/api/vida` (cron) no pasa por el proxy.
- **Sesión:** la parte de Supabase sigue igual, solo en `/panel` y `/login`. Fuera de ahí (404, `/dev/…`), solo la CSP.
- **Cookies:** la copia de los encabezados de la petición se arma después de que `setAll` cambia las cookies, para que la página reciba las renovadas.

**Páginas dinámicas:** ya lo eran todas antes de esta fase (el layout lee la cookie del tema desde la 9a), así que el nonce no cambia el tipo de render. El build lo confirma: todas las rutas salen con `ƒ`.

### Encabezados fijos (`next.config.ts`, en todas las rutas)

| Encabezado | Valor |
|---|---|
| `X-Frame-Options` | `DENY` (respaldo de `frame-ancestors` para navegadores viejos) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Content-Type-Options` | `nosniff` |
| `Permissions-Policy` | `camera=(self), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()` |

Además, `poweredByHeader: false` (sin `X-Powered-By: Next.js`).

**Cámara:** la app no usa la cámara hoy; el "escáner" es un lector de barras que escribe como teclado. `camera=(self)` deja la puerta abierta a un lector por cámara sin dársela a nadie más.

### Cómo se probó

Con el build de producción (`next build` + `next start` en el 3100). El 3000 no se tocó.

- **Encabezados** (curl):
  - `/login` y el 404 traen la CSP con nonce, sin `'unsafe-eval'` y sin `'unsafe-inline'` en `style-src`;
  - `/api/vida` responde `{"ok":true}`;
  - `/_next/static` y el favicon no pasan por el proxy (sin CSP);
  - los 4 encabezados fijos van en todo.
- **HTML del login:** 12 de 12 `<script>` llevan nonce; ningún `<style>` sin nonce.
- **Recorrido en Chrome sin ventana**, escuchando `securitypolicyviolation` en cada documento y los "Refused to…" de la consola. **Cero violaciones, cero rechazos y cero errores en consola:**
  - login con correo y contraseña, cerrar sesión, login de demo;
  - las 19 pantallas del panel, más el 404 dentro del panel y el general;
  - Vender con el lector (código + Enter), cobrar con tarjeta, ticket e Imprimir (vista de impresión);
  - Permissions-Policy: cámara permitida para la app; micrófono y ubicación, no;
  - logo: vista previa (`blob:`), guardado y la imagen de Storage en Inicio;
  - Excel: importar con errores, "Descargar filas con error", plantilla y exportar productos, ventas y reportes (5 archivos);
  - modo oscuro desde el selector, y pantallas en oscuro;
  - escritorio (1280) con la barra lateral.
- **Control negativo**, para saber que el detector sí ve lo que se bloquea. Todo bloqueado y reportado:

  | Inyección | Directiva |
  |---|---|
  | `<img onerror="…">` | `script-src-attr` |
  | `setTimeout("…")` | `script-src` (eval) |
  | `<script>` sin nonce en el HTML (iframe `srcdoc`, que hereda la CSP) | `script-src-elem` |
  | Imagen de otro dominio | `img-src` |
  | iframe de otro dominio | `frame-src` |

  Un `<script>` creado con `createElement` por código que ya está corriendo sí se ejecuta: es lo que permite `'strict-dynamic'` (así carga Next sus chunks). Para llegar ahí, un atacante tendría que ejecutar código primero, y eso es lo que bloquea la tabla.

## Lighthouse "después"

Mismo método que el "antes":
- celular, mediana de 3 corridas;
- build de producción en el 3100;
- sesión del dueño demo;
- Lighthouse 12.6.1;
- mismo script.

| Pantalla | Rendimiento | Accesibilidad | Buenas prácticas | FCP | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| Inicio | 96 → **95** | 100 → 100 | 100 → 100 | 0.8 → 0.9 s | 2.7 → 2.9 s | 0 → 0 | 91 → 57 ms |
| Vender | 96 → **97** | 100 → 100 | 100 → 100 | 0.8 → 0.8 s | 2.6 → 2.6 s | 0 → 0 | 67 → 56 ms |
| Productos | 97 → **95** | 100 → 100 | 100 → 100 | 0.9 → 0.9 s | 2.6 → 2.8 s | 0 → 0 | 53 → 30 ms |

**Lo que se ve:**
- Ninguna pantalla baja más de 3 puntos (la mayor baja es de 2, en Productos). Es ruido de medición, no un efecto de la CSP:
  - **Render:** todas las páginas ya eran dinámicas; la CSP no agrega JavaScript y el proxy ya corría en todo el panel.
  - **Respuesta del servidor:** fue más rápida que en el "antes" (220–270 ms contra 240–890 ms).
  - **LCP:** la diferencia está en el "render delay" del texto, que entre corridas de la misma medición varía ±0.2 s (2.6 a 2.9 s en Inicio dentro del mismo "después").
- **Primera medición:** coincidió en parte con pruebas de PGlite que usaban CPU y dio 95/95/95. Se repitió con la máquina libre y la tabla es esa segunda.
- **"CSP efectiva contra XSS"** (auditoría informativa de Buenas prácticas):
  - **antes:** "High · No CSP found in enforcement mode";
  - **después:** quedan dos sugerencias "Medium" para navegadores viejos: agregar `'unsafe-inline'` y `https:` a `script-src` como respaldo.
  - Los navegadores actuales las ignoran cuando hay nonce y `'strict-dynamic'`. **No se agregaron:** la única concesión de la CSP es `style-src-attr`.

**¿Vale la pena corregir algo?** No por la CSP. Lo que pesa en el LCP (unos 2 s de "render delay" con la red y la CPU de celular que simula Lighthouse) es igual que en el "antes": hidratación y JavaScript de Next y React. Bajarlo sería trabajo de otra fase (menos JavaScript en el cliente), con poca ganancia sobre 95–97.

## SQL: orden para un cliente nuevo

Al revisar el orden del README archivo por archivo, salió un problema: **`24-ventas-y-reportes.sql` no se podía instalar sin `07`**. Su candado (paso 0) exigía que existiera `privado.cargar_semilla` y se detenía con "Corre primero el 07-semilla.sql nuevo".

- **Cambio en `24`:** el candado solo revisa la semilla si está instalada. Con la semilla vieja se sigue deteniendo igual; sin semilla, sigue de largo. Solo cambia el bloque `do` del paso 0, no las funciones.
- **En Supabase no hay que correr nada:** el proyecto del demo ya tiene `24` y la semilla nueva, y el candado solo corre al instalar.
- **Prueba de cliente nuevo en PGlite** (arnés aparte):
  - base limpia con los 17 scripts del README, en ese orden, sin `07`, `18`, `19` ni pruebas;
  - el bloque SQL del README, extraído tal cual del README;
  - sin el usuario creado, el bloque avisa y no deja nada;
  - con el usuario: fila del negocio y dueño activo (dos veces, sin duplicar);
  - como ese dueño: alta de producto con stock inicial, venta con folio 1, Reportes e Inicio.
- **Regresión:** suites completas, orden de la 9a y fallas intencionales con el `24` nuevo (ver "Cómo se probó").
- **Revisión automática del README:** la tabla de instalación coincide archivo por archivo con lo que instaló el arnés, y la lista de pruebas excluidas está completa.

## README

- Liga a la demo y qué hace, con capturas.
- Stack, seguridad, cómo correrlo en local y variables (sin valores).
- Instalación para un cliente nuevo:
  - orden de los SQL;
  - lo que no se corre (`07`, `18`, pruebas);
  - primer dueño y fila del negocio.
- Las pruebas SQL necesitan la semilla: van en una copia de prueba, nunca en la base de un cliente.
- **Sin llaves, sin la URL del proyecto de Supabase y sin correos reales.** El correo del ejemplo es `dueno@ejemplo.test`.

**Capturas (`docs/capturas/`):**
- WEBP, a 390 y 1280, del build de producción, con la marca original y en modo claro, sin el indicador de Next.
- Una de Inicio en oscuro.

## Cierre del proyecto

- `docs/00-plan-general.md`: tabla de estado de cada fase con su documento y PR, y lo que cambió respecto al plan.
- `CLAUDE.md`: sección "Estado actual" con lo que una sesión nueva necesita saber:
  - CSP;
  - costos solo para el dueño;
  - idempotencia;
  - marca y tema;
  - usuarios;
  - modo demo;
  - SQL;
  - cómo se ha probado.

## Cómo se probó

- `tsc`, `eslint` y `next build` sin errores; todas las rutas dinámicas (`ƒ`).
- **Desarrollo (3000):**
  - la CSP lleva `'unsafe-eval'` y `style-src 'unsafe-inline'`, como se diseñó;
  - el login y el 404 responden;
  - `/api/vida` y el favicon, sin CSP.
- **Producción (3100):** encabezados, recorrido completo con cero violaciones, control negativo, Lighthouse y capturas (ver arriba). El 3100 se cerró al terminar; el 3000 no se tocó.
- **PGlite:**
  - cliente nuevo con el orden y el bloque SQL del README;
  - suites completas, antes y después de `reset_demo()`;
  - orden de la 9a (`30`, `25`, `07` viejo y nuevo, `31`);
  - candado de `24` con la semilla vieja: se detiene y no cambia nada;
  - 15 de 15 fallas intencionales detectadas.
- **Datos que quedaron en el demo:**
  - 2 ventas del recorrido de CSP (folios 238 y 239, una pieza cada una, con tarjeta);
  - el logo de prueba se subió y la marca se restauró al final (Ferretería La Tuerca, `#c2410c`, sin logo).
- **Supabase:** no hay que correr nada. El único cambio en SQL es el candado de `24`, que solo corre al instalar.

## Pendientes

- **Diego:** probar el deploy de vista previa con la CSP antes del merge (login, Vender, logo, Excel).
- Fuera del alcance: página propia sin conexión (service worker) y lector de barras por cámara.
