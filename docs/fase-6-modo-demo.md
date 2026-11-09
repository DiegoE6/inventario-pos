# Fase 6 — Modo demo

## Qué se hizo

### Base de datos
| Script | Contenido |
|---|---|
| `07-semilla.sql` | Tercer usuario, "Cajero de turno". Las ventas de hoy que todavía no llegan a su hora quedan pendientes. `stock_final` pasa a ser el stock al cierre de hoy. Los productos tienen ids fijos. |
| `18-modo-demo.sql` | `privado.usuarios_demo`, triggers de protección, `reset_demo()`, `avanzar_demo()`, `cambiar_password_demo()` y los jobs de `pg_cron`. |
| `19-pruebas-modo-demo.sql` | 10 pruebas en `BEGIN … ROLLBACK`. |

**`07`, la semilla:**
- **Usuarios:** ahora pide tres: `demo@` (dueño), `cajero@` (cajero) y `turno@` ("Cajero de turno").
  - Las ventas de la semilla son del cajero de turno (70%) y del dueño (30%).
  - El cajero demo no tiene ventas: quien entra como cajero ve "Tus ventas de hoy" en $0, y solo sube con lo que él cobra.
- **Ventas de hoy:** las que ya pasaron se cargan directo. Las que faltan van a `privado.demo_ventas_pendientes`, con su hora, productos, cantidades, método de pago y una clave fija.
  - Si se carga de madrugada, todo hoy queda pendiente y "hoy" arranca en $0.
  - Ya no existe el caso especial de "3 ventas antes de abrir".
- **Stock:** `stock_final` es el stock al cierre de hoy. Al cargar, el stock trae lo que falta vender hoy y baja conforme se cobran los pendientes.
  - Se bajó el `stock_final` de ELE-002 (38 → 30), PLO-003 (4 → 3) y TOR-006 (85 → 60). Así siguen en stock bajo desde la mañana aunque ese día se vendan.
- **Ids fijos** (ajuste tras la prueba):
  - **Productos:** el id se deriva del código: es el md5 de `latuerca:producto:<código>`, con la versión 4 y la variante 8 de un UUID, para que pase el `z.uuid()` de la app. Un carrito guardado en el navegador sigue sirviendo después del reinicio nocturno.
  - **Categorías y proveedores:** ya tenían ids fijos. El `truncate … restart identity` reinicia su contador y se insertan siempre en el mismo orden (1 a 6 y 1 a 5), aunque un prospecto haya creado otros.

**`18`, solo para la base del demo:**

| Parte | Qué hace |
|---|---|
| `privado.usuarios_demo` | Id, rol, correo y hash de la contraseña de los tres usuarios demo. `18` los guarda una sola vez: si ya estaban, no los toca. |
| Trigger en `auth.users` | Rechaza (`LT403`) cambios de correo, contraseña, teléfono, `email_change` o `phone_change` de un usuario demo. Compara con `IS DISTINCT FROM` (y `coalesce(…, '')` donde Auth usa `''` o `null`), así que una escritura que deja el mismo valor pasa. |
| Trigger en `auth.mfa_factors` | Nadie le activa MFA a un usuario demo. Si Supabase no deja crearlo, `18` avisa y `reset_demo` borra los factores cada noche. |
| Trigger en `perfiles` | Desde la API nadie cambia `rol` ni `activo` de otro usuario demo. El propio perfil lo sigue cuidando la política de `03`, con su error de siempre. |
| `reset_demo()` | Restaura el correo y la contraseña guardados, borra MFA, borra el historial de `pg_cron` de más de 7 días y llama a `cargar_semilla`. |
| `avanzar_demo()` | Cobra las pendientes cuya hora ya pasó (ver Decisiones). |
| `cambiar_password_demo(correo, contraseña)` | Cambia la contraseña en Auth y en el hash guardado. Pide 16 caracteres o más. |
| `pg_cron` | `reset-demo` a las 09:00 UTC (03:00 en Monterrey) y `ventas-demo` cada minuto. |

- **Permisos:** todo vive en `privado`, con `REVOKE` a `public`, `anon`, `authenticated` y `service_role`. `pg_cron` corre como `postgres`.
- **Permiso para cambios a propósito:** los cambios intencionales a los usuarios demo solo pasan dentro de una transacción con `demo.permitir_cambios = on`. Lo activan `reset_demo()` y `cambiar_password_demo()`; Auth de Supabase nunca lo activa.

**Qué restaura el reinicio nocturno:**
- **Auth:** correo y contraseña de los tres usuarios demo, sin cambios pendientes de correo o teléfono y sin MFA.
- **Configuración del negocio:** nombre, giro, logo, color, teléfono y dirección.
- **Catálogos:** categorías y proveedores (se borran y se recargan).
- **Productos:** se borran y se recargan, con su stock.
- **Ventas, detalle y movimientos:** se borran (los folios vuelven a empezar) y se recargan.
- **Perfiles demo:** nombre, rol y activo.

### Resultado en PGlite
- **Instalación limpia del `01` al `19`:** pasan `08`, `10`, `13`, `15`, `17` y `19`. Volver a correr `18` y `07`, y llamar `reset_demo()`, tampoco rompe nada; después vuelven a pasar `08`, `13`, `15`, `17` y `19`.
- **Como Auth (`supabase_auth_admin`):** iniciar sesión (`last_sign_in_at`) y renovar el token (mismos valores) pasan. Cambiar la contraseña se rechaza. Los usuarios que no son del demo no se ven afectados.
- **`cambiar_password_demo`:** la contraseña nueva funciona y queda guardada.
- **Fallas metidas en `18`; `19` detectó las 12:**

  | Falla | Prueba |
  |---|---|
  | Trigger de Auth sin revisar la contraseña | 2 |
  | `=` en lugar de `IS DISTINCT FROM` (de null a un valor) | 2 |
  | Sin trigger de MFA | 4 |
  | Perfiles: solo bloquea `activo` | 5 |
  | El reinicio no restaura la contraseña | 7 |
  | El reinicio no borra MFA | 7 |
  | `avanzar_demo` sin clave (cobra doble) | 6 |
  | `avanzar_demo` cobra ventas futuras | 6 |
  | `avanzar_demo` deja puesta la sesión del usuario | 6 |
  | `authenticated` con `EXECUTE` en `reset_demo` | 1 |
  | El reinicio no limpia el historial de `pg_cron` | 9 |
  | Una función pública que activa `demo.permitir_cambios` | 10 |
  | `07` con ids de producto al azar (como antes) | 7 |

- **Días completos simulados:** reinicio a las 03:00 y `avanzar_demo` cada minuto, de lunes a domingo.
  - Stock bajo: 7 de la mañana a la noche, todos los días.
  - Sin stock negativo, y el stock cuadra con los movimientos.
  - Se cobran todas las ventas del día, sin omitidas.

  | "vs. semana pasada" | Lun | Mar | Mié | Jue | Vie | Sáb | Dom |
  |---|---|---|---|---|---|---|---|
  | 10:30 | 0% | +5% | 0% | +11% | +28% | 0% | 0% |
  | 14:00 | +9% | +9% | +7% | +6% | +5% | +4% | +3% |
  | 18:00 | +19% | +12% | +7% | +8% | +18% | +7% | +13% |

  Con el job cada 5 minutos, el viernes a las 14:00 salía −29%: una venta de las 13:56 se cobraba a las 14:00. Por eso corre cada minuto.
- **Carga manual a las 16:00** (correr `07` a mano): mete las 7 ventas que ya pasaron y deja 4 pendientes, la primera a las 16:07.

## Pasos en Supabase
1. **Usuario de turno:** en Authentication → Users → Add user, crear `turno@latuerca.test` con **Auto Confirm User** y una contraseña cualquiera (nadie entra con él).
2. **Activar `pg_cron`:** en Database → Extensions, buscar `pg_cron` y activarlo (o en Integrations → Cron → Enable).
3. **SQL Editor, en orden:**
   1. `07-semilla.sql`. El resumen debe mostrar 40 productos, 7 de stock bajo y una columna `pendientes_hoy`.
   2. `18-modo-demo.sql`. El resumen debe mostrar `usuarios_demo` = 3, los tres triggers en 1 y `pg_cron_activo` = 1. Si sale el aviso de `auth.mfa_factors`, avísame.
   3. `19-pruebas-modo-demo.sql`, y después `08`, `13`, `15` y `17`.
4. **Cambiar las contraseñas a unas largas** (16+ caracteres, por ejemplo de un gestor de contraseñas). Desde el SQL Editor, una por una:
   ```sql
   select privado.cambiar_password_demo('demo@latuerca.test',   '...');
   select privado.cambiar_password_demo('cajero@latuerca.test', '...');
   select privado.cambiar_password_demo('turno@latuerca.test',  '...');
   ```
   - El panel de Supabase ya no puede cambiarlas, porque el trigger también bloquea a Auth.
   - El SQL Editor guarda lo que escribes: al terminar, borra esa consulta.
   - Las de dueño y cajero van en las variables de entorno (ver Pantallas).
5. **Revisar los jobs:**
   ```sql
   select jobname, schedule, active from cron.job;
   -- unos minutos después:
   select j.jobname, d.status, d.return_message, d.start_time
   from cron.job_run_details d join cron.job j using (jobid)
   order by d.start_time desc limit 10;
   ```
   `ventas-demo` debe salir `succeeded` cada minuto. El de `reset-demo` se ve al día siguiente después de las 03:00.

**Para reparar a mano** (por ejemplo, si hay que quitar la protección un momento), en el SQL Editor, dentro de una transacción:
```sql
begin;
select set_config('demo.permitir_cambios', 'on', true);
-- ...cambios...
commit;
```

**Resultado en Supabase:**
- Se creó `turno@` y se activó `pg_cron`.
- `07`: `pendientes_hoy` = 6.
- `18`: `usuarios_demo` = 3, los tres triggers y `pg_cron` en 1, sin aviso de `mfa_factors`.
- `19`, `08`, `13`, `15` y `17` sin errores.
- Se cambiaron las 3 contraseñas con `cambiar_password_demo`.
- `cron.job` tiene `reset-demo` y `ventas-demo` activos, y `ventas-demo` sale `succeeded` cada minuto.

### `demo.permitir_cambios` no se puede usar desde la API
- **PostgREST solo expone `public` y `graphql_public`.** Probado contra la API real:
  - `rpc/set_config` → 404 (`PGRST202`, busca `public.set_config`).
  - Pedir el esquema `pg_catalog` → 406 (`PGRST106`).
- **Ninguna función de esos esquemas** usa `set_config` ni menciona el permiso (prueba 10).
- **Aunque un rol de la API lo pusiera,** no le sirve:
  - `anon` y `authenticated` no tienen permisos sobre `auth.users` ni `auth.mfa_factors`.
  - El trigger de perfiles no depende del permiso (prueba 10).
- **Auth (GoTrue)** se conecta con su propio usuario y nunca lo activa.

### Pantallas
- **Login:** con el demo activo aparecen arriba "Entrar al demo como dueño" (principal) y "Entrar al demo como cajero" (secundario).
  - Abajo, "o entra con tu cuenta" y el formulario de siempre, con "Entrar" en secundario.
  - El botón que se toca muestra "Entrando…".
  - Solo aparecen los roles que tienen correo y contraseña en el entorno.
- **`entrarDemo(rol)`** (Server Action):
  - valida el rol con zod;
  - revisa `DEMO_MODE` otra vez, porque una Server Action es un endpoint público;
  - inicia sesión con `signInWithPassword`, usando las credenciales del entorno y el cliente normal con la publishable key.

  El navegador solo manda el rol. Si algo falla, dice "No se pudo entrar al demo" (o "Demasiados intentos" si es un 429).
- **Banner:** una franja delgada arriba del contenido del panel, "Estás viendo un demo · los datos se reinician cada noche". No se anima ni se cierra.
- **Cerrar sesión solo en este dispositivo** (`scope: "local"`). El alcance por defecto (`global`) sacaría a todos los que estén en el demo.
- **`app/lib/demo.ts`** es `server-only`: lee `DEMO_MODE` y las credenciales, que nunca llegan al navegador.
- **Señal de vida:**
  - `GET /api/vida` lee `configuracion_negocio` con la publishable key, como `anon`, sin sesión y sin `service_role`.
  - `vercel.json` la programa a las 15:00 UTC (09:00 en Monterrey). En el plan Hobby, Vercel la corre una vez al día en algún momento de esa hora.
  - Si existe `CRON_SECRET`, solo responde a `Authorization: Bearer <CRON_SECRET>`, que Vercel Cron manda solo.
  - Se eligió Vercel Cron y no una GitHub Action, porque GitHub desactiva las tareas programadas de un repo que pasa 60 días sin actividad.

### Variables de entorno
| Variable | `.env.local` | Vercel |
|---|---|---|
| `DEMO_MODE` | `true` | `true` |
| `DEMO_DUENO_EMAIL` | `demo@latuerca.test` | igual |
| `DEMO_DUENO_PASSWORD` | la de `cambiar_password_demo` | igual, como **Sensitive** |
| `DEMO_CAJERO_EMAIL` | `cajero@latuerca.test` | igual |
| `DEMO_CAJERO_PASSWORD` | la de `cambiar_password_demo` | igual, como **Sensitive** |
| `CRON_SECRET` | no hace falta | texto aleatorio de 16+ caracteres, como **Sensitive** |

- En Vercel van en **Production** y **Preview**, y después hay que hacer **Redeploy**.
- Vercel Cron solo corre en el deployment de Production.
- Ninguna lleva `NEXT_PUBLIC_`.
- Para una instalación de un cliente real, no se pone ninguna de las de demo, ni se corre `18`.

**Verificado contra Supabase con las variables de `.env.local`:**
- Dueño y cajero inician sesión y renuevan el token con el trigger puesto.
- Cambiar la contraseña con su propio token por la API de Auth se rechaza (Auth responde 500 porque el trigger lo bloquea), y la contraseña original sigue funcionando.

### Prueba en dispositivos (Diego)
- **Login:** los dos botones entran sin contraseña y el banner aparece.
- **Cajero:** empieza en $0.00 y sube solo con lo que cobra ($22.00, 1 venta).
- **Dueño:** ve las ventas automáticas a nombre de "Cajero de turno" (8:43, 9:53 y 11:08), y la comparación sale +2% vs. lunes pasado. El job de ventas funciona.
- **Cerrar sesión** en un navegador no saca al otro: en Chrome siguió dentro, recargando y navegando.
- **Encontrado:** un carrito guardado se rompió con el reinicio. Tenía una rondana del viernes y salió "Este producto ya no existe", porque la semilla creaba los productos con ids nuevos. Se arregló con ids fijos (ver Base de datos).
  - Se volvieron a correr en Supabase `07`, `08`, `13`, `15`, `17` y `19`, todos sin errores.
  - Los carritos guardados antes de ese cambio se rompen una última vez. Los que se guarden después ya sobreviven al reinicio.

### Qué probar
1. **Login:**
   - Entrar como dueño y como cajero desde el celular.
   - Entrar varias veces seguidas.
   - Dejar la pestaña abierta más de una hora y seguir usando la app (renueva el token).
   - Entrar desde otro navegador al mismo tiempo.
2. **Cerrar sesión en un navegador:** el otro sigue dentro.
3. **Banner:** sale en todas las pantallas del panel y no tapa nada en 360 px.
4. **Cajero:** "Tus ventas de hoy" empieza en $0 y sube solo con lo que él cobra.
5. **Dueño:** las ventas de hoy suben solas durante el día, a nombre de "Cajero de turno".
6. **Al día siguiente:**
   - lo que se rompió quedó como nuevo;
   - `reset-demo` sale `succeeded` en `cron.job_run_details`;
   - en Vercel → Crons, `/api/vida` respondió 200.

## Decisiones
- **Ventas de hoy:** el plan del día se guarda al cargar la semilla y se cobra a su hora. No se vuelve a generar cada hora.
  - Generar de nuevo dependería del catálogo: si un prospecto renombra o desactiva productos, los tickets cambiarían y la comparación con la semana pasada se movería.
- **Las cobra `registrar_venta`, la misma función del punto de venta.** `avanzar_demo` fija la sesión del usuario de cada venta con `request.jwt.claims`, solo dentro de su transacción.
  - Se aplican todas las reglas: `FOR UPDATE`, stock nunca negativo, copia de nombre, precio y costo, y movimientos con stock anterior y nuevo. El stock solo cambia por las funciones, como pide `CLAUDE.md`.
  - La clave fija de cada pendiente evita cobrar doble aunque el job corra dos veces.
  - Si ya no se puede cobrar (alguien vendió lo último o desactivó el producto), la venta queda como "omitida" con el motivo y se sigue con las demás.
  - En efectivo se paga lo de la semilla; si el precio subió y ya no alcanza, se redondea hacia arriba a $50.
  - Las ventas salen con la hora en que corre el job (a lo más un minuto tarde), no con la hora planeada.
- **Por qué hay un permiso explícito en lugar de distinguir quién escribe:**
  - Auth escribe como `supabase_auth_admin`, tanto por la API como desde el panel de Supabase.
  - Con un permiso explícito en la transacción, la regla es la misma en PGlite y en Supabase, y se puede probar en las dos. Bloquea también el panel; para eso está `cambiar_password_demo`.
- **Trigger de perfiles:** usa `current_setting('role')`, que es el rol de la petición de PostgREST y no cambia dentro de funciones `SECURITY DEFINER`. La semilla y las reparaciones desde el SQL Editor no se bloquean.
- **`18` guarda los usuarios una sola vez:** volver a correrlo nunca guarda una contraseña que alguien haya cambiado.

## Pendientes
- **Fase 8:**
  - Si se crean usuarios desde Configuración, en el demo hay que bloquearlo o borrarlos en el reinicio. Sus perfiles no se restauran.
  - Los logos subidos a Storage tendrían que borrarse en el reinicio.
  - **Folios con huecos** cuando un cobro falla. En la prueba salieron 231, 232, 233 y 235: el 234 se lo llevó un cobro rechazado, porque `identity` no regresa el número cuando la transacción falla. Decidir si importa para un cliente real.
- **Fase 9:** fijar Node 22 (ver `fase-5-inicio.md`).
- **Pruebas que faltan por tiempo:**
  - Dejar la sesión abierta más de una hora y seguir usando la app (renovación del token en el navegador; contra la API ya se probó).
  - Revisar mañana que `reset-demo` salió `succeeded` en `cron.job_run_details` y que todo quedó como nuevo.
- **Riesgos aceptados:**
  - **Límite de intentos de login:** Supabase limita los inicios de sesión por IP, y todos los del demo salen de los servidores de Vercel. Si se llega al límite, se sube en Authentication → Rate Limits.
  - **Datos compartidos:** dos prospectos al mismo tiempo ven las ventas del otro.
  - **Cerrar sesión global desde la API:** alguien podría llamar `signOut` global directo a la API. Eso solo obliga a los demás a volver a tocar "Entrar al demo" cuando venza su token, en menos de una hora.
