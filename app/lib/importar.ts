import "server-only";
import { z } from "zod";
import { mensajeCelda } from "@/app/lib/excel/formulas";
import { quitarApostrofo } from "@/app/lib/excel/seguro";
import { MAX_FILAS, type Hoja } from "@/app/lib/excel/leer";
import type { Unidad } from "@/app/lib/format";
import { createClient } from "@/app/lib/supabase/server";

/**
 * Importar productos: columnas, validación por fila (mismos criterios que
 * crear_producto, 09) y vista previa contra lo que ya hay en la base.
 * La base vuelve a validar todo al guardar (importar_productos, 26).
 */

// -----------------------------------------------------------------------------
// Columnas
// -----------------------------------------------------------------------------

export const CAMPOS = [
  "codigo",
  "nombre",
  "unidad",
  "costo",
  "precio",
  "stock_inicial",
  "stock_minimo",
  "categoria",
  "proveedor",
  "descripcion",
] as const;
export type Campo = (typeof CAMPOS)[number];

/** Encabezados de la plantilla (y del archivo de errores), en este orden. */
export const TITULOS: Record<Campo, string> = {
  codigo: "Código",
  nombre: "Nombre",
  unidad: "Unidad",
  costo: "Costo",
  precio: "Precio",
  stock_inicial: "Stock inicial",
  stock_minimo: "Stock mínimo",
  categoria: "Categoría",
  proveedor: "Proveedor",
  descripcion: "Descripción",
};

export const OBLIGATORIOS: Campo[] = ["codigo", "nombre", "unidad", "costo", "precio"];

/**
 * Código de la fila de ejemplo de la plantilla. Si alguien olvida borrarla,
 * la importación la ignora (y lo avisa) en lugar de crear el producto.
 */
export const CODIGO_EJEMPLO = "EJEMPLO-001";

/** Otros nombres que se aceptan para cada columna (ya normalizados). */
const ALIAS: Record<string, Campo> = {
  codigo: "codigo",
  clave: "codigo",
  sku: "codigo",
  nombre: "nombre",
  producto: "nombre",
  unidad: "unidad",
  "unidad de medida": "unidad",
  costo: "costo",
  "costo unitario": "costo",
  "precio de compra": "costo",
  precio: "precio",
  "precio de venta": "precio",
  "precio venta": "precio",
  "stock inicial": "stock_inicial",
  stock: "stock_inicial",
  existencia: "stock_inicial",
  existencias: "stock_inicial",
  "inventario inicial": "stock_inicial",
  "stock minimo": "stock_minimo",
  minimo: "stock_minimo",
  categoria: "categoria",
  proveedor: "proveedor",
  descripcion: "descripcion",
};

// -----------------------------------------------------------------------------
// Normalización (misma regla que privado.normalizar_nombre, 26)
// -----------------------------------------------------------------------------

const CON_ACENTO = "áàäâãéèëêíìïîóòöôõúùüûñç";
const SIN_ACENTO = "aaaaaeeeeiiiiooooouuuunc";

/** Minúsculas, sin acentos, sin espacios de más: "  Eléctrico " → "electrico". */
export function normalizarNombre(texto: string): string {
  let s = "";
  for (const ch of texto.trim().toLowerCase()) {
    const i = CON_ACENTO.indexOf(ch);
    s += i === -1 ? ch : SIN_ACENTO[i];
  }
  return s.replace(/\s+/g, " ");
}

/** "Costo (MXN)*" → "costo". */
function normalizarEncabezado(texto: string): string {
  return normalizarNombre(texto.replace(/\(.*?\)/g, "").replace(/[*:.]/g, ""));
}

const espacios = (s: string) => s.trim().replace(/\s+/g, " ");

const UNIDADES: Record<string, Unidad> = {};
for (const [unidad, nombres] of Object.entries({
  pieza: ["pieza", "piezas", "pza", "pzas", "pz", "pzs"],
  caja: ["caja", "cajas", "cja"],
  metro: ["metro", "metros", "m", "mt", "mts"],
  kilo: ["kilo", "kilos", "kg", "kgs", "kilogramo", "kilogramos"],
  litro: ["litro", "litros", "l", "lt", "lts"],
}) as [Unidad, string[]][]) {
  for (const n of nombres) UNIDADES[n] = unidad;
}

// -----------------------------------------------------------------------------
// Validación de una fila (todo llega como texto)
// -----------------------------------------------------------------------------

/**
 * Número sin signo con hasta `dec` decimales, como texto canónico. Acepta
 * "$1,250.00". Si Excel guardó un flotante como 19.989999999999998, se toma
 * 19.99 (diferencia menor a una millonésima).
 */
function decimal(raw: string, dec: number, enteros: number): string | null {
  const s = raw.trim().replace(/[$\s]/g, "").replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [int, frac = ""] = s.split(".");
  let out = s;
  if (frac.length > dec) {
    const n = Number(s);
    const r = Math.round(n * 10 ** dec) / 10 ** dec;
    if (Math.abs(n - r) > 1e-6) return null;
    out = r.toFixed(dec);
  }
  if (int.replace(/^0+(?=\d)/, "").length > enteros) return null;
  return out;
}

const dinero = (etiqueta: string) =>
  z.string().transform((s, ctx) => {
    if (s.trim() === "") {
      ctx.addIssue({ code: "custom", message: `Falta ${etiqueta}.` });
      return z.NEVER;
    }
    const v = decimal(s, 2, 10);
    if (v === null) {
      ctx.addIssue({ code: "custom", message: `${capital(etiqueta)} debe ser un número de 0 en adelante, con hasta 2 decimales.` });
      return z.NEVER;
    }
    return v;
  });

const cantidad = (etiqueta: string) =>
  z.string().transform((s, ctx) => {
    if (s.trim() === "") return "0";
    const v = decimal(s, 3, 9);
    if (v === null) {
      ctx.addIssue({ code: "custom", message: `${capital(etiqueta)} debe ser un número de 0 en adelante, con hasta 3 decimales.` });
      return z.NEVER;
    }
    return v;
  });

const textoOpcional = (etiqueta: string, max: number) =>
  z
    .string()
    .transform(espacios)
    .pipe(z.string().max(max, { error: `${capital(etiqueta)} puede tener hasta ${max} caracteres.` }))
    .transform((s) => s || null);

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const filaSchema = z
  .object({
    codigo: z
      .string()
      .trim()
      .min(1, { error: "Falta el código." })
      .max(50, { error: "El código puede tener hasta 50 caracteres." }),
    nombre: z
      .string()
      .transform(espacios)
      .pipe(
        z
          .string()
          .min(1, { error: "Falta el nombre." })
          .max(150, { error: "El nombre puede tener hasta 150 caracteres." })
      ),
    unidad: z.string().transform((s, ctx) => {
      const u = UNIDADES[normalizarNombre(s)];
      if (!u) {
        ctx.addIssue({
          code: "custom",
          message: s.trim()
            ? `Unidad "${s.trim()}" no válida: usa pieza, caja, metro, kilo o litro.`
            : "Falta la unidad.",
        });
        return z.NEVER;
      }
      return u;
    }),
    costo: dinero("el costo"),
    precio: dinero("el precio"),
    stock_inicial: cantidad("el stock inicial"),
    stock_minimo: cantidad("el stock mínimo"),
    categoria: textoOpcional("la categoría", 60),
    proveedor: textoOpcional("el proveedor", 120),
    descripcion: z
      .string()
      .trim()
      .max(500, { error: "La descripción puede tener hasta 500 caracteres." })
      .transform((s) => s || null),
  })
  .superRefine((f, ctx) => {
    if (f.unidad === "pieza" || f.unidad === "caja") {
      for (const campo of ["stock_inicial", "stock_minimo"] as const) {
        if (!/^\d+(\.0*)?$/.test(f[campo])) {
          ctx.addIssue({
            code: "custom",
            path: [campo],
            message: `Los productos por ${f.unidad} no aceptan decimales (${TITULOS[campo].toLowerCase()}).`,
          });
        }
      }
    }
  });

export type FilaValida = z.output<typeof filaSchema>;
export type Valores = Record<Campo, string>;

// -----------------------------------------------------------------------------
// Vista previa
// -----------------------------------------------------------------------------

export type Cambio = { antes: string; despues: string };

export type FilaNueva = { fila: number; datos: FilaValida; avisos: string[] };
export type FilaExistente = {
  fila: number;
  datos: FilaValida;
  nombreActual: string;
  precio: Cambio | null;
  costo: Cambio | null;
};
export type FilaError = { fila: number; valores: Valores; motivos: string[] };

export type Vista = {
  totalFilas: number;
  nuevas: FilaNueva[];
  existentes: FilaExistente[];
  errores: FilaError[];
  categoriasNuevas: string[];
  proveedoresNuevos: string[];
  columnasIgnoradas: string[];
  /** Avisos del archivo completo (por ejemplo, la fila de ejemplo ignorada). */
  avisos: string[];
};

export class ImportacionInvalida extends Error {}

const cents = (v: string | number) => Math.round(Number(v) * 100);

/** Hoja leída → vista previa. Lanza ImportacionInvalida si el archivo completo no sirve. */
export async function prepararImportacion(hoja: Hoja): Promise<Vista> {
  const [encabezado = [], ...resto] = hoja;

  // 1. Columnas.
  const indice = new Map<Campo, number>();
  const columnasIgnoradas: string[] = [];
  encabezado.forEach((titulo, i) => {
    const t = titulo.trim();
    if (!t) return;
    const campo = ALIAS[normalizarEncabezado(t)];
    if (!campo) columnasIgnoradas.push(t);
    else if (indice.has(campo)) {
      throw new ImportacionInvalida(`La columna "${TITULOS[campo]}" aparece dos veces.`);
    } else indice.set(campo, i);
  });
  const faltan = OBLIGATORIOS.filter((c) => !indice.has(c));
  if (faltan.length > 0) {
    throw new ImportacionInvalida(
      `${faltan.length === 1 ? "Falta la columna" : "Faltan las columnas"}: ${faltan.map((c) => TITULOS[c]).join(", ")}. La primera fila debe tener los encabezados de la plantilla.`
    );
  }

  // Celdas con fórmula que se leyeron vacías, por fila (solo columnas que se usan).
  const campoDeColumna = new Map([...indice].map(([campo, col]) => [col, campo]));
  const sinResultado = new Map<number, { campo: Campo; mensaje: string }[]>();
  for (const c of hoja.sinResultado ?? []) {
    const campo = campoDeColumna.get(c.columna);
    if (!campo || c.fila < 2) continue;
    const lista = sinResultado.get(c.fila) ?? [];
    lista.push({ campo, mensaje: mensajeCelda(c, TITULOS[campo]) });
    sinResultado.set(c.fila, lista);
  }

  // 2. Filas con datos (las vacías no cuentan). La fila 1 es el encabezado.
  // Una fila cuyas celdas son fórmulas sin resultado se lee vacía, pero sí
  // tiene datos: se queda para avisarlo.
  const filas = resto
    .map((celdas, i) => ({ fila: i + 2, celdas }))
    .filter((f) => f.celdas.some((c) => c.trim() !== "") || sinResultado.has(f.fila));
  if (filas.length === 0) throw new ImportacionInvalida("El archivo no tiene productos debajo del encabezado.");
  if (filas.length > MAX_FILAS) {
    throw new ImportacionInvalida(`El archivo tiene ${filas.length} productos; el máximo es ${MAX_FILAS} por archivo.`);
  }

  // 3. Validar cada fila.
  const validas: { fila: number; datos: FilaValida }[] = [];
  const errores: FilaError[] = [];
  const primeraDelCodigo = new Map<string, number>();
  const avisos: string[] = [];
  for (const { fila, celdas } of filas) {
    if (indice.has("codigo") && quitarApostrofo(celdas[indice.get("codigo")!] ?? "").trim() === CODIGO_EJEMPLO) {
      avisos.push(`Se ignoró la fila de ejemplo (fila ${fila}).`);
      continue;
    }
    const valores = Object.fromEntries(
      CAMPOS.map((c) => [c, indice.has(c) ? quitarApostrofo(celdas[indice.get(c)!] ?? "") : ""])
    ) as Valores;
    const r = filaSchema.safeParse(valores);
    // Si una columna tiene fórmula sin resultado, su aviso reemplaza al de zod
    // ("Falta el precio" confundiría: en Excel sí se ve un precio).
    const formulas = sinResultado.get(fila) ?? [];
    const conFormula = new Set<string>(formulas.map((f) => f.campo));
    const motivos = [
      ...formulas.map((f) => f.mensaje),
      ...(r.success ? [] : [...new Set(r.error.issues.filter((i) => !conFormula.has(String(i.path[0]))).map((i) => i.message))]),
    ];
    const codigo = valores.codigo.trim();
    if (codigo) {
      const previa = primeraDelCodigo.get(codigo);
      if (previa !== undefined) motivos.push(`El código "${codigo}" ya está en la fila ${previa}.`);
      else primeraDelCodigo.set(codigo, fila);
    }
    if (r.success && motivos.length === 0) validas.push({ fila, datos: r.data });
    else errores.push({ fila, valores, motivos });
  }

  // 4. Lo que ya hay en la base (con la sesión del usuario; costos con su función de dueño).
  const supabase = await createClient();
  const codigos = validas.map((v) => v.datos.codigo);
  const existentes = new Map<string, { id: string; nombre: string; precio: number }>();
  for (let i = 0; i < codigos.length; i += 150) {
    const { data, error } = await supabase
      .from("productos")
      .select("id, codigo, nombre, precio")
      .in("codigo", codigos.slice(i, i + 150));
    if (error) throw new Error(`[importar productos] ${error.message}`);
    for (const p of data ?? []) existentes.set(p.codigo, { id: p.id, nombre: p.nombre, precio: Number(p.precio) });
  }
  const costos = new Map<string, number>();
  const ids = [...existentes.values()].map((p) => p.id);
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await supabase.rpc("costos_productos", { p_ids: ids.slice(i, i + 500) });
    if (error) throw new Error(`[importar costos] ${error.message}`);
    for (const c of (data ?? []) as { id: string; costo: number | string }[]) costos.set(c.id, Number(c.costo));
  }
  const [{ data: cats, error: e1 }, { data: provs, error: e2 }] = await Promise.all([
    supabase.from("categorias").select("id, nombre, activo").order("id"),
    supabase.from("proveedores").select("id, nombre, activo").order("id"),
  ]);
  if (e1 || e2) throw new Error(`[importar catálogos] ${(e1 ?? e2)?.message}`);

  // Igual que la base: si hay varias que coinciden, la activa más antigua.
  const indexar = (lista: { id: number; nombre: string; activo: boolean }[]) => {
    const m = new Map<string, { nombre: string; activo: boolean }>();
    for (const x of [...lista].sort((a, b) => Number(b.activo) - Number(a.activo) || a.id - b.id)) {
      const k = normalizarNombre(x.nombre);
      if (!m.has(k)) m.set(k, { nombre: x.nombre, activo: x.activo });
    }
    return m;
  };
  const catIdx = indexar(cats ?? []);
  const provIdx = indexar(provs ?? []);
  const categoriasNuevas = new Map<string, string>();
  const proveedoresNuevos = new Map<string, string>();

  // 5. Clasificar.
  const nuevas: FilaNueva[] = [];
  const existentesVista: FilaExistente[] = [];
  for (const { fila, datos } of validas) {
    const actual = existentes.get(datos.codigo);
    if (actual) {
      const costoActual = costos.get(actual.id);
      existentesVista.push({
        fila,
        datos,
        nombreActual: actual.nombre,
        precio:
          cents(actual.precio) !== cents(datos.precio)
            ? { antes: actual.precio.toFixed(2), despues: datos.precio }
            : null,
        costo:
          costoActual !== undefined && cents(costoActual) !== cents(datos.costo)
            ? { antes: costoActual.toFixed(2), despues: datos.costo }
            : null,
      });
      continue;
    }

    const motivos: string[] = [];
    for (const [campo, idx, nuevosMap, tipo] of [
      ["categoria", catIdx, categoriasNuevas, "categoría"],
      ["proveedor", provIdx, proveedoresNuevos, "proveedor"],
    ] as const) {
      const valor = datos[campo];
      if (!valor) continue;
      const k = normalizarNombre(valor);
      const hay = idx.get(k);
      // Se muestra (y se manda) con el nombre que la base va a usar: el
      // existente, o como venía la primera vez que apareció en el archivo.
      datos[campo] = hay?.nombre ?? nuevosMap.get(k) ?? valor;
      if (hay && !hay.activo) {
        motivos.push(
          tipo === "categoría"
            ? `La categoría "${hay.nombre}" está desactivada.`
            : `El proveedor "${hay.nombre}" está desactivado.`
        );
      } else if (!hay && !nuevosMap.has(k)) nuevosMap.set(k, valor);
    }
    if (motivos.length > 0) {
      errores.push({ fila, valores: valoresDe(datos), motivos });
      continue;
    }

    const avisos: string[] = [];
    if (cents(datos.precio) === 0) avisos.push("Precio en $0");
    else if (cents(datos.precio) < cents(datos.costo)) avisos.push("Se vende con pérdida (precio menor que el costo)");
    nuevas.push({ fila, datos, avisos });
  }

  // Si una categoría nueva solo la pedían filas que acabaron con error, no se crea.
  const usadas = (campo: "categoria" | "proveedor") =>
    new Set(nuevas.map((n) => n.datos[campo]).filter(Boolean).map((v) => normalizarNombre(v!)));
  const catUsadas = usadas("categoria");
  const provUsadas = usadas("proveedor");

  errores.sort((a, b) => a.fila - b.fila);
  return {
    totalFilas: filas.length,
    nuevas,
    existentes: existentesVista,
    errores,
    categoriasNuevas: [...categoriasNuevas].filter(([k]) => catUsadas.has(k)).map(([, v]) => v),
    proveedoresNuevos: [...proveedoresNuevos].filter(([k]) => provUsadas.has(k)).map(([, v]) => v),
    columnasIgnoradas,
    avisos,
  };
}

function valoresDe(d: FilaValida): Valores {
  return {
    codigo: d.codigo,
    nombre: d.nombre,
    unidad: d.unidad,
    costo: d.costo,
    precio: d.precio,
    stock_inicial: d.stock_inicial,
    stock_minimo: d.stock_minimo,
    categoria: d.categoria ?? "",
    proveedor: d.proveedor ?? "",
    descripcion: d.descripcion ?? "",
  };
}
