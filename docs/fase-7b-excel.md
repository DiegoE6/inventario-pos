# Fase 7b — Excel: exportar e importar

Exportar a Excel Ventas, Reportes y Productos, e importar productos desde Excel o CSV con vista previa. Todo es solo para el dueño.

## Librería

| Opción | Estado (nov 2026) | Decisión |
|---|---|---|
| `xlsx` de npm (SheetJS) | Se quedó en 0.18.5, con CVE-2023-30533 (prototype pollution al leer) y CVE-2024-22363 (ReDoS). La versión corregida, 0.20.3, solo se instala desde el CDN de SheetJS. | **Descartada:** `npm audit` no ve el CDN, y el build dependería de ese servidor. |
| ExcelJS 4.4.0 | Su última versión estable es de oct 2023; arrastra `archiver`, `unzipper`, `tmp` y `uuid@8`. Tiene 4 CVE de 2026 (prototype pollution, descompresión sin límite, path traversal e inyección de fórmulas en CSV) sin versión corregida. | **Descartada.** |
| **`write-excel-file` 4.1.1 + `read-excel-file` 9.3.14** | Mismo autor, MIT, versiones de 2026 y sin CVE propias. Escribir depende solo de `fflate`. Leer depende de `fflate`, `saxen`, `unzipper-esm` y `worker-f`. | **Elegidas.** |

- **Instalación:** con versión exacta (`--save-exact`).
- **Dependencias nuevas:** 8 paquetes en total. Las dos librerías, `fflate`, `saxen`, `unzipper-esm` (con `graceful-fs` y `node-int64`) y `worker-f`.
- **`npm audit`:** reporta 8 moderadas, las mismas que ya había en main antes de instalar. Vienen de `minimatch` dentro de `@typescript-eslint` y `eslint-config-next`, que son solo de desarrollo. `npm audit --omit=dev` da **0 vulnerabilidades**.
- **CSV:** lo lee un parser propio (`app/lib/excel/csv.ts`), sin otra dependencia.

## Base de datos

| Script | Contenido |
|---|---|
| `26-importar-productos.sql` | `privado.importaciones` (bitácora para la idempotencia), `privado.normalizar_nombre`, `privado.numero_de_fila` y `public.importar_productos(clave, filas, actualizar_existentes)`. |
| `27-pruebas-importar-productos.sql` | 9 pruebas en `BEGIN … ROLLBACK`. |
| `07-semilla.sql` | Borra `privado.importaciones` en cada recarga, solo si la tabla existe. Funciona antes y después de `26`. |

**`importar_productos`:**
- **Acceso:** solo dueño. Es `SECURITY DEFINER` con `search_path` vacío, `anon` no la puede ejecutar y acepta hasta 500 filas.
- **Todo o nada:** es una sola llamada. Un error se reporta como "Fila N: …" con su código (LT422, LT409…).
- **Productos nuevos:** se crean con `crear_producto`, con las mismas reglas que el alta a mano. El stock inicial queda como entrada "Inventario inicial".
- **Códigos que ya existen:** se omiten. Con `actualizar_existentes`, solo cambian precio y costo; sin cambios, cuentan como omitidos.
- **Categorías y proveedores:** se comparan sin importar mayúsculas, acentos ni espacios de más. Los que faltan se crean; si coinciden con uno desactivado, la fila es un error.
- **Idempotente:** la clave se inserta primero. Una llamada repetida, aunque sea simultánea, regresa el mismo resumen marcado como `repetida`. Las importaciones se hacen una a la vez (advisory lock).
- **Sin costos en la respuesta:** regresa un `jsonb` sin costos, así que no entra a la lista de `21`. Si algún día regresara costos, `21` fallaría.

### Resultado en PGlite
- **Suites:** pasan todas, de `08` a `27`, en instalación limpia, después de volver a correr `26` y después del reinicio de la demo.
- **Reinicio nocturno:** borra el producto importado, su categoría, su proveedor y la clave (de 1 a 0). El stock bajo queda en 7.
- **Orden:** el `07` nuevo sin `26` mantiene el reinicio funcionando. Después `26`, y pasan `19`, `27`, `21` y `23`.
- **Fallas a propósito, las 18 detectadas por `27`:**
  - sin validar el rol;
  - sin idempotencia;
  - normalizar sin quitar acentos;
  - normalizar sin juntar espacios;
  - actualizar que también cambia el nombre;
  - actualizar aunque no se pida;
  - aceptar categoría desactivada;
  - aceptar proveedor desactivado;
  - error sin número de fila;
  - sin revisar códigos repetidos en el archivo;
  - tope de 5,000 filas;
  - números negativos;
  - resumen con costos;
  - función `INVOKER`;
  - `anon` con permiso;
  - la bitácora legible por la API;
  - una auxiliar de `privado` abierta;
  - la `07` de main, que no borra la bitácora.

## Pasos en Supabase
Orden: **`07` → `26` → `19` → `27` → `21` → `23` → `08`, `10`, `13`, `15`, `17`, `25`**.

### Resultado (Diego, 10 nov 2026)
- **`07`:** la función coincide por md5. La semilla se recargó con 40 productos, 7 en stock bajo y la bitácora en 0.
- **`26`:** `bitacora`, `security_definer`, `sin_anon` y `normaliza` en true. Las 3 funciones coinciden por md5.
- **`27`:** completo, las 9 pruebas.
- **`reset_demo`:** borra un producto importado junto con su categoría, su proveedor y la bitácora.
- **`21`:** sigue sin funciones nuevas que regresen costos.

### Dos llamadas en paralelo con la misma clave (Supabase, dos sesiones del dueño)
- **Misma clave, 30 filas:** una llamada crea 30 y la otra regresa el mismo resumen con `repetida: true`, en 352 ms.
  - En la base quedan exactamente 30 productos, 30 entradas y una sola categoría.
- **Claves distintas, mismo código nuevo, al mismo tiempo:** una lo crea y la otra lo omite porque ya existe. No hay error ni duplicado.

## Exportar (solo dueño)
Son Route Handlers (GET) con `requireDueno` y la sesión del usuario. Responden con `Cache-Control: no-store`, `nosniff` y `attachment`. Si entra el cajero, lo regresa a Inicio con el aviso "solo dueño".

| Ruta | Contenido |
|---|---|
| `/panel/ventas/exportar` | Los mismos filtros de la lista (sin fechas, los últimos 7 días). Hoja "Ventas": folio, fecha y hora, atendió, método, estado, total, recibido, cambio, productos, y cancelada el, canceló y motivo. Hoja "Productos vendidos" con los renglones. Sin costos. Hasta 366 días y 20,000 ventas, en páginas de 1,000. |
| `/panel/reportes/exportar` | El rango elegido. Hojas: Resumen (negocio, rango, fecha en que se generó, ventas, costo, ganancia, margen, número de ventas, ticket promedio y canceladas), Por día/semana/mes, Por categoría, Por método de pago, Más vendidos (100, con costo y ganancia) y Sin movimiento (200). Sale de las funciones de `24` y `mas_vendidos`. |
| `/panel/productos/exportar` | La búsqueda y los filtros de la lista: código, nombre, categoría, proveedor, unidad, costo, precio, margen, stock, mínimo, valor a costo, activo y descripción. El costo sale de `costos_productos` en tandas de 500. El valor a costo se calcula en centavos enteros. |

**Formato:**
- **Números:** números de verdad. Dinero con `"$"#,##0.00`, margen como `0.0%`.
- **Fechas:** fechas reales de Excel en hora de Monterrey. Excel no tiene zona horaria, así que se escribe la hora de pared de Monterrey.
- **Encabezados:** en español, en negritas y fijos, con ancho por columna.

**Inyección de fórmulas:** todo texto que empiece con `=`, `+`, `-`, `@`, tabulador o retorno (también después de espacios) sale con un apóstrofo al inicio, por ejemplo `'=HYPERLINK(...)`.
- La librería ya escribe el texto como texto, pero el apóstrofo evita que se vuelva fórmula si alguien edita la celda o guarda el archivo como CSV.
- Al importar, ese apóstrofo se quita.

## Importar (solo dueño), en `/panel/productos/importar`
1. **Plantilla descargable.** Hoja "Productos" con los encabezados y una fila de ejemplo. Hoja "Instrucciones" con qué va en cada columna y las categorías y proveedores activos.
2. **Subir el archivo:** Server Action con `requireDueno`. El archivo se lee en el servidor y el tipo se decide por su contenido, no por el nombre:
   - **Límites:** 1 MB por archivo (el límite de Server Actions subió a 2 MB en `next.config.ts`) y 500 productos.
   - **Excel (.xlsx):** antes de leerlo se revisa el zip. Se descomprime cada parte con `zlib` y `maxOutputLength`: máximo 20 MB descomprimido y 100 partes. Se le pasa siempre un Buffer, porque un string sería una ruta del disco para la librería. Los números se leen como el texto exacto que guardó Excel.
   - **CSV:** UTF-8 (con o sin BOM) o Windows-1252, y separador coma, punto y coma o tabulador.
3. **Validación con zod por fila,** con los criterios de `crear_producto`:
   - código de 1 a 50 caracteres y nombre de 1 a 150;
   - unidad, aceptando sinónimos como pza, m, kg, L y plurales;
   - costo y precio ≥ 0 con 2 decimales como máximo (acepta "$1,250.00"; un flotante de Excel como 0.30000000000000004 se toma como 0.30);
   - cantidades ≥ 0 con 3 decimales como máximo, y enteras en pieza y caja;
   - descripción de 500 caracteres como máximo;
   - un código repetido dentro del archivo es error.
   - Los encabezados se reconocen sin importar mayúsculas ni acentos, y aceptan alias ("Costo (MXN)", "Precio de venta", "Existencias"…). Las columnas que no se conocen se avisan y se ignoran.
4. **Vista previa:**
   - Cuántos son nuevos, cuántos ya existen, cuántos tienen error y cuántas filas trae el archivo.
   - Las filas con error, con su número de fila de Excel y su motivo. "Descargar filas con error" genera un .xlsx con las columnas de la plantilla y el motivo al final, para corregir y volver a importar; los códigos que ya entraron se omiten.
   - Los productos que ya existen, con el antes y el después: "Flexómetro 5 m: precio $115.00 → $120.00". Una casilla permite actualizar solo precio y costo.
   - Las categorías y los proveedores que se van a crear. En la lista de nuevos, cada categoría se muestra con el nombre que va a quedar.
   - Los productos nuevos, con avisos de precio en $0 o de venta con pérdida.
5. **Guardar:**
   - Si hay filas con error, pide confirmar "Entiendo que las filas con error no se importan".
   - La Server Action vuelve a validar cada fila con zod y llama a `importar_productos` con la clave de esa vista previa.
   - El botón se deshabilita mientras guarda y, además, la clave evita que un doble clic importe dos veces.

## Cómo se probó
- **Piezas puras (Node):**
  - CSV: comas, punto y coma, comillas, saltos de línea, tabulador, BOM y Windows-1252.
  - Protección contra fórmulas, en ida y vuelta.
  - Revisión del zip:
    - una bomba de 200 MB comprimida en 199 KB se rechaza;
    - otra que declara un tamaño falso también se rechaza;
    - 101 partes se rechazan;
    - algo que no es zip se rechaza;
    - un .xlsx real se acepta.
- **De punta a punta como dueño (Chrome a 360 px, contra Supabase).** Un archivo con 8 filas con datos y una vacía:
  - **Vista previa:**
    - 4 nuevos, 1 existente con "precio $115.00 → $120.00" y 3 errores en las filas 6, 7 y 8 de Excel, con su motivo;
    - la columna desconocida avisada;
    - "plomeria " encontró Plomería, y "Proveedor Prueba 7B" con otra escritura no se duplicó;
    - el aviso de venta con pérdida.
  - **Archivo de errores:** las columnas de la plantilla y el motivo, con 3 filas.
  - **Guardar:**
    - no deja guardar sin confirmar;
    - el resultado fue "4 productos nuevos, 1 actualizado".
  - **En la base:**
    - 30.5 m con su entrada "Inventario inicial";
    - "$1,250.00" quedó como 1250;
    - el código de barras numérico, como texto exacto;
    - 0.1 + 0.2 quedó como 0.30;
    - HER-004 solo cambió de precio;
    - una sola categoría nueva.
  - **Plantilla:** los encabezados, el ejemplo con números y las categorías en las instrucciones.
  - **Productos:** costo, precio y stock como números; valor a costo 30.5 × 12.5 = 381.25; el nombre `=HYPERLINK(...)` sale como `'=HYPERLINK(...)`.
  - **Ventas:**
    - la fecha es una fecha real en hora de Monterrey (14:57, igual que en la base);
    - el total es un número;
    - trae la hoja de productos vendidos;
    - el nombre del archivo lleva el rango.
  - **Reportes:**
    - 6 hojas;
    - las ventas del resumen cuadran con `reporte_resumen` ($22,059);
    - un rango de más de 366 días da 400 con mensaje.
- **Cajero:**
  - Las 4 descargas lo regresan a Inicio con el aviso "solo dueño", sin archivo.
  - `/panel/productos/importar` también.
  - No ve los botones de Importar ni de Exportar.
- **Paralelo con la misma clave:** ver arriba.
- **Limpieza:** HER-004 regresó a $115 con otra importación. Los productos `PRUEBA-7B-…` y `75012345678901` y las categorías y proveedores de prueba se quedan hasta el reinicio de las 3:00.
- **Revisiones:** `tsc`, `eslint` y `next build` limpios. Sin errores en consola y sin scroll horizontal a 360 px.

### Prueba de Diego (10 nov 2026, navegador como dueño)
- **Importar 2 archivos .xlsx con 14 filas difíciles:**
  - espacios de más;
  - mayúsculas y acentos en categoría y proveedor;
  - "$1,250.00";
  - código numérico de 13 dígitos;
  - fórmula con resultado guardado;
  - celdas inlineStr;
  - fila vacía;
  - columna desconocida.

  Se crearon 6, se actualizó 1 (HER-004: solo precio y costo, el stock no cambió) y hubo 6 errores, cada uno con su fila y un mensaje claro. Verificado en Supabase.
- **Exportar Productos y volver a importarlo:** 81 existentes, sin cambios. El apóstrofo se quita bien.
- **CSV en Windows-1252 con ";" y comillas:** se lee bien.
- **Exportaciones:**
  - los textos con =, +, -, @ salen con apóstrofo;
  - las fechas salen en hora de Monterrey (los folios 161 y 230 coinciden con la base);
  - Reportes suma $22,059 en métodos y en el resumen;
  - las tres descargas llevan `no-store`.

### Ajustes después de la prueba
- **Botón de importar:** dice lo mismo que el texto de arriba, con singulares.
  - "Importar 6 productos" o "Importar 1 producto";
  - "Importar 6 y actualizar 1";
  - "Actualizar 1 producto" si no hay nuevos.
- **Folio en Excel:** formato `000000`, igual que el ticket (000230), en Ventas y en Productos vendidos. Sigue siendo número.
- **Fila de ejemplo de la plantilla:** la importación ignora la fila cuyo código sea exactamente `CODIGO_EJEMPLO` ("EJEMPLO-001"), y la vista previa avisa "Se ignoró la fila de ejemplo (fila N)". La plantilla y la importación usan la misma constante (`app/lib/importar.ts`), y la hoja de instrucciones también lo dice.
- **Verificado en Chrome a 360 px:**
  - la plantilla descargada, sin borrar el ejemplo y con un producto nuevo y HER-004 con otro precio, dio 1 nuevo, 1 existente y 0 errores, con el aviso de la fila 2 y sin crear "Truper";
  - el botón dijo "Importar 1 producto", luego "Importar 1 y actualizar 1" con la casilla, y "Actualizar 1 producto" con solo un existente;
  - sin nada que hacer, el botón se deshabilita;
  - en el .xlsx de Ventas, el folio (A2 = 161) es un número con el estilo `000000`, en las dos hojas. No se guardó nada.
- **Revisiones:** `tsc`, `eslint` y `next build` limpios.

## Decisiones
- **Sin `service_role`.** Todo usa la sesión del usuario. Los costos solo salen de `costos_productos`, `mas_vendidos` y las funciones de `24`.
- **Validar dos veces.** Se valida en la app (zod, para la vista previa y para guardar) y otra vez en la base. La app nunca confía en las filas que regresa el navegador.
- **El código no se normaliza.** "abc" y "ABC" son productos distintos, como en el alta a mano. Las categorías y los proveedores sí se normalizan.
- **Primera escritura.** Una categoría o proveedor nuevo se crea con la primera escritura que aparece en el archivo, sin espacios de más.
- **Fórmulas en la base.** Un nombre que empieza con "=" se guarda tal cual; la protección está al exportar.

## Pendientes
- **Fórmulas sin resultado guardado.** Una celda con fórmula sin resultado guardado (archivos que no salen de Excel) se lee vacía y da "Falta el nombre" o "Falta el precio". Se podría avisar: "la celda tiene una fórmula sin resultado".
- **"Sin movimiento" (Reportes)** incluye productos que se dieron de alta dentro del rango del reporte.
- **Excel de escritorio:** probar que el apóstrofo no se vea como problema y que las fechas abran con el formato `dd/mm/yyyy hh:mm`.
