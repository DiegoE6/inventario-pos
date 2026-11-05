# Fase 1 — Base de datos

## Qué se hizo
Scripts SQL en `docs/sql/`, según las secciones 5, 6 y 7 del plan general:

| Script | Contenido |
|---|---|
| `01-esquema.sql` | Esquema `privado`, extensión `pg_trgm`, las 8 tablas en `public` con CHECKs, foreign keys, índices y trigger de `actualizado_en`. |
| `02-perfiles-y-roles.sql` | `rol_actual()`, `es_dueno()`, la guardia interna `privado.usuario_validado()` y el trigger que crea el perfil de cada usuario nuevo. |
| `03-rls-y-permisos.sql` | RLS en todas las tablas, `REVOKE ALL` + `GRANT` mínimos (incluidos los de columna en `productos`) y políticas. |
| `04-funciones-inventario.sql` | `privado.aplicar_movimiento()`, `registrar_movimiento()` y `registrar_ajuste()`. |
| `05-funciones-ventas.sql` | `registrar_venta()` y `cancelar_venta()`. |
| `06-vistas.sql` | `v_stock_bajo`, `v_ventas_por_dia` y la función `mas_vendidos()`. |
| `07-semilla.sql` | `privado.cargar_semilla()` y su ejecución. |
| `08-pruebas.sql` | 14 pruebas dentro de `BEGIN … ROLLBACK`. |

## Cómo aplicarlo (orden exacto)
**Antes, en el panel de Supabase:**
1. Authentication → Sign In / Providers: desactivar **Allow new users to sign up**.
2. Authentication → Users → **Add user**, con **Auto Confirm User**:
   - `demo@latuerca.test` (será el dueño)
   - `cajero@latuerca.test` (será el cajero)

   Si usas otros correos, pásalos a `privado.cargar_semilla('dueno@…', 'cajero@…')` al final de `07` y cámbialos en el paso 0 de `08`.

**Después, en el SQL Editor, un script a la vez y en este orden:**
1. `01-esquema.sql`
2. `02-perfiles-y-roles.sql`
3. `03-rls-y-permisos.sql`
4. `04-funciones-inventario.sql`
5. `05-funciones-ventas.sql`
6. `06-vistas.sql`
7. `07-semilla.sql`: al terminar muestra un resumen con 40 productos, 7 de stock bajo, unas 250 a 300 ventas y 1 cancelada.
8. `08-pruebas.sql`: si termina en **Success**, pasaron todas. Si una falla, el error dice el número de prueba y qué falló. No deja cambios en ningún caso.

Del 02 al 08 se pueden volver a correr. `01` solo crea lo que no existe: si una tabla ya existe, no le agrega columnas ni restricciones. `07` **borra y recarga** todos los datos del negocio (no los usuarios).

## Decisiones

### Seguridad
- **Tablas en `public`, funciones internas en `privado`.** `privado` no está expuesto a la Data API y ningún rol de la API tiene `USAGE` sobre él. Sus funciones (`aplicar_movimiento`, `usuario_validado`, `validar_cantidad`, `cargar_semilla`, el trigger de perfiles y el de `actualizado_en`) tienen además `REVOKE EXECUTE` a `public`, `anon`, `authenticated` y `service_role`.
- **Funciones públicas:** `SECURITY DEFINER`, `search_path = ''` y nombres calificados. Cada una tiene `REVOKE EXECUTE` a `public` y `anon`, y `GRANT` solo a `authenticated`. Dentro validan sesión, perfil activo y rol con `privado.usuario_validado()`. `mas_vendidos()` es `SECURITY INVOKER` (respeta RLS), con `search_path = ''` y sin permiso para `anon`.
- **Permisos de tabla:** primero `REVOKE ALL` a `public`, `anon`, `authenticated` y `service_role`, y después los `GRANT` mínimos. Supabase dejó de dar permisos automáticos a tablas nuevas (cambio del 2026-04-28, obligatorio desde el 2026-10-30), y el `REVOKE` previo cubre también los proyectos con los permisos por defecto anteriores. Sin ese `REVOKE`, un `UPDATE` a nivel tabla dejaría inútil el permiso de columna sobre `stock`.
- **`stock` no se puede editar ni insertar desde la API, tampoco por el dueño** (permiso de columna). Solo lo cambia `privado.aplicar_movimiento()`, que bloquea con `FOR UPDATE`, impide stock negativo y registra stock anterior y nuevo. Las cuatro funciones públicas pasan por ella.
- **`service_role` no tiene permisos de tabla.** Si un proceso de servidor llega a necesitarlo, se le dan solo los permisos necesarios en esa fase.
- **Lectura por rol** (cambio respecto al plan, que decía "autenticados activos" para todo):
  - `ventas` y `venta_detalle`: el dueño ve todo; el cajero, solo sus ventas.
  - `movimientos_inventario`: solo el dueño.
  - `productos`, `categorias` y `proveedores`: cualquier usuario activo.
  - `configuracion_negocio`: también `anon`, solo `SELECT`, porque el login necesita la marca.
- **`perfiles`:** cada quien lee el suyo y el dueño lee todos. Solo el dueño edita, y no puede quitarse su propio rol de dueño ni desactivarse. Nadie inserta; lo hace el trigger.
- **Trigger de usuarios nuevos:** crea el perfil como `cajero` e **inactivo**. El rol y `activo` están fijos en la función; la metadata que manda el cliente solo se usa para el nombre.
- **Vistas con `security_invoker = true`:** un cajero solo suma sus propias ventas en `v_ventas_por_dia`.
- **Sin `DELETE` en ninguna tabla.** Los catálogos se desactivan con `activo`. Un usuario con ventas no se puede borrar de Auth (las foreign keys lo impiden); se desactiva.

### Reglas de negocio
- **`registrar_movimiento`:** solo acepta `entrada` y `merma`. `venta` y `cancelacion_venta` son internos, y `ajuste` va por `registrar_ajuste`. La cantidad llega positiva y la función le pone el signo. La merma exige nota. Una entrada con costo actualiza el costo del producto al **último costo de compra**, no a un promedio ponderado.
- **`registrar_ajuste`:** llama a `aplicar_movimiento` directamente, no a `registrar_movimiento`. Si el conteo coincide con el sistema, no registra nada y devuelve `null`.
- **`registrar_venta`:**
  - Suma los productos repetidos y bloquea en orden por id.
  - Toma precio y costo de la BD, aunque el cliente mande un precio (lo prueba la prueba 1).
  - Valida que el producto esté activo, el stock, los decimales (`pieza` y `caja` no los aceptan) y que el pago en efectivo alcance.
  - Devuelve la fila completa de la venta (id, folio, total, cambio) para el ticket.
- **`cancelar_venta`:** solo dueño y con motivo. No se puede cancelar dos veces.
- **Folio:** columna `identity`. Puede tener huecos si una venta falla a la mitad.
- **Códigos de error propios** para que la app muestre mensajes claros:

  | Código | Significado |
  |---|---|
  | `LT401` | Sin sesión o usuario inactivo |
  | `LT403` | Sin permiso por rol |
  | `LT404` | No existe |
  | `LT409` | Stock insuficiente o venta ya cancelada |
  | `LT422` | Datos inválidos |

- **`mas_vendidos(desde, hasta, limite)`** es una función y no la vista `v_mas_vendidos` del plan, porque necesita el rango como parámetro.

### Semilla
- `privado.cargar_semilla()` borra y recarga todo; en la Fase 6, `reset_demo()` solo la llama. Hace upsert de los perfiles demo, porque los usuarios se crean en el panel antes de que exista el trigger.
- El stock final de cada producto está fijado en la semilla; la entrada inicial se calcula hacia atrás (stock final + todo lo vendido), así que todo cuadra. Los productos de la venta cancelada terminan con lo que se regresó de más.
- Ventas de los últimos 30 días y las de hoy hasta la hora actual, con el sábado como día fuerte. Usa `setseed`, así que el mismo día genera los mismos datos.

## Verificación
Probado localmente con PGlite (Postgres 17), en un entorno que imita a Supabase: roles `anon`, `authenticated`, `service_role` y `supabase_auth_admin`, `auth.users` y `auth.uid()`, y los permisos por defecto antiguos de Supabase (todo para todos) como peor caso.
- Los 8 scripts corren sin error, y del 02 al 07 también la segunda vez.
- **Semilla:** 40 productos, 7 con stock bajo, unas 290 ventas y 1 cancelada.
  - El stock de cada producto es igual a la suma de sus movimientos.
  - La cadena de stock anterior y nuevo no se rompe.
  - El total de cada venta es igual a la suma de su detalle y los folios van en orden cronológico.
- **Permisos:** ninguna foreign key sin índice. `anon` solo tiene `SELECT` sobre `configuracion_negocio`. Ninguna función de `privado` es ejecutable por `anon` ni `authenticated`.
- **`08`:** pasa y no deja cambios.
- **Trigger:** un usuario creado por un rol no superusuario, con `"rol":"dueno"` en la metadata, recibe perfil `cajero` inactivo.
- **Las pruebas sí detectan fallas.** Se metieron cuatro a propósito y `08` reportó cada una con su número:
  - `UPDATE(stock)` a `authenticated` → prueba 6
  - `EXECUTE` de `registrar_venta` a `anon` → prueba 13
  - Política de ventas abierta → prueba 7
  - `cancelar_venta` sin validar el rol → prueba 4

**Resultado en Supabase (2026-11-05):**
- Los 8 scripts se corrieron en orden en el SQL Editor y todos terminaron en **Success**.
- `02` creó el trigger en `auth.users` sin error, así que el usuario `postgres` de Supabase sí puede crearlo.
- `07`: 40 productos. En `perfiles`, `demo@latuerca.test` quedó como `dueno` y `cajero@latuerca.test` como `cajero`, ambos activos.
- `08`: terminó sin errores; pasaron las 14 pruebas.

**Lo que sigue sin probarse:**
- Que el trigger se dispare al crear un usuario en el proyecto real. Se creó bien y funciona en local; se confirma al crear el próximo usuario (Fase 8).
- Ventas simultáneas reales. PGlite tiene una sola conexión y `08` corre en una sola sesión. El orden de bloqueo por id está aplicado, pero sin prueba de concurrencia.

## Pendientes

### Fase 2
- **Función `crear_producto`:** que cree el producto y registre su stock inicial como movimiento de `entrada` en una sola transacción. Solo dueño, con `SECURITY DEFINER`, `search_path = ''` y los mismos `REVOKE`/`GRANT`. Hoy hay que hacerlo en dos pasos (insert + `registrar_movimiento`), y si el segundo falla queda un producto con stock 0.
- En Supabase → Authentication → URL Configuration: Site URL de Vercel y `http://localhost:3000` en Redirect URLs.
- Traducir en la app los códigos `LT401`–`LT422` a mensajes en español.
- La pantalla de login debe mostrar "tu cuenta está desactivada" cuando el perfil existe pero `activo = false`.

### Fases siguientes
- **Fase 6:** si `reset_demo()` corre de madrugada, el día de hoy queda sin ventas hasta que alguien venda. Decidir si se generan ventas "de hoy" con horas futuras, o si se acepta empezar en cero.
- **Fase 8:** RLS no puede ocultar columnas, así que el cajero puede leer `productos.costo` desde la API. Si importa, se resuelve con una vista sin costo para el cajero.
- **Fase 8:** crear usuarios desde Configuración necesita la Admin API (`service_role`, solo en servidor). El trigger ya les crea el perfil como cajero inactivo.
- **Opcional:** costo promedio ponderado en lugar del último costo de compra.
