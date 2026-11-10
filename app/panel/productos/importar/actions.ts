"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDueno } from "@/app/lib/auth";
import { dbErrorMessage } from "@/app/lib/errors";
import { hoja, xlsxBuffer } from "@/app/lib/excel/escribir";
import { ArchivoInvalido, leerArchivo, MAX_FILAS } from "@/app/lib/excel/leer";
import {
  CAMPOS,
  filaSchema,
  ImportacionInvalida,
  prepararImportacion,
  TITULOS,
  type Valores,
  type Vista,
} from "@/app/lib/importar";
import { createClient } from "@/app/lib/supabase/server";

/**
 * Importar productos. Solo dueño (requireDueno aquí; importar_productos lo
 * vuelve a validar en la BD). Con la sesión del usuario; sin service_role.
 * El archivo se lee y valida en el servidor; al guardar se vuelve a validar
 * cada fila (no se confía en lo que regresa el navegador).
 */

export type VistaResult = { ok: true; vista: Vista } | { ok: false; error: string };

export async function previsualizar(formData: FormData): Promise<VistaResult> {
  await requireDueno();
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) return { ok: false, error: "Elige un archivo." };
  try {
    const vista = await prepararImportacion(await leerArchivo(archivo));
    return { ok: true, vista };
  } catch (e) {
    if (e instanceof ArchivoInvalido || e instanceof ImportacionInvalida) return { ok: false, error: e.message };
    console.error("[importar vista]", e);
    return { ok: false, error: "No se pudo leer el archivo. Intenta de nuevo." };
  }
}

// -----------------------------------------------------------------------------

const texto = z
  .string()
  .max(1000)
  .nullable()
  .transform((s) => s ?? "");

const filaEntrada = z.object({
  fila: z.number().int().min(2).max(1_000_000),
  datos: z.object(Object.fromEntries(CAMPOS.map((c) => [c, texto])) as Record<(typeof CAMPOS)[number], typeof texto>),
});

const guardarSchema = z.object({
  clave: z.uuid(),
  actualizar: z.boolean(),
  filas: z.array(filaEntrada).min(1).max(MAX_FILAS),
});

export type Resumen = {
  creados: number;
  actualizados: number;
  omitidos: number;
  categorias_creadas: string[];
  proveedores_creados: string[];
  repetida: boolean;
};

export type GuardarResult = { ok: true; resumen: Resumen } | { ok: false; error: string };

export async function guardarImportacion(input: z.input<typeof guardarSchema>): Promise<GuardarResult> {
  await requireDueno();
  const parsed = guardarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Los datos no son válidos. Vuelve a cargar el archivo." };

  const filas = [];
  for (const f of parsed.data.filas) {
    const r = filaSchema.safeParse(f.datos);
    if (!r.success) {
      return { ok: false, error: `Fila ${f.fila}: ${r.error.issues[0]?.message ?? "datos no válidos"} Vuelve a cargar el archivo.` };
    }
    filas.push({ fila: f.fila, ...r.data });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("importar_productos", {
    p_clave: parsed.data.clave,
    p_filas: filas,
    p_actualizar_existentes: parsed.data.actualizar,
  });
  if (error) return { ok: false, error: dbErrorMessage(error) };

  revalidatePath("/panel/productos", "layout");
  revalidatePath("/panel");
  return { ok: true, resumen: data as Resumen };
}

// -----------------------------------------------------------------------------

const erroresSchema = z
  .array(
    z.object({
      fila: z.number().int().min(2).max(1_000_000),
      valores: z.object(Object.fromEntries(CAMPOS.map((c) => [c, z.string().max(1000)])) as Record<(typeof CAMPOS)[number], z.ZodString>),
      motivos: z.array(z.string().max(300)).max(20),
    })
  )
  .min(1)
  .max(MAX_FILAS);

/**
 * Las filas con error en un .xlsx con las columnas de la plantilla y el
 * motivo al final, para corregirlas y volver a importar el archivo (la
 * columna del motivo se ignora al importar).
 */
export async function descargarErrores(
  errores: z.input<typeof erroresSchema>
): Promise<{ ok: true; base64: string } | { ok: false; error: string }> {
  await requireDueno();
  const parsed = erroresSchema.safeParse(errores);
  if (!parsed.success) return { ok: false, error: "No se pudo armar el archivo." };

  type F = { valores: Valores; motivos: string[]; fila: number };
  const buf = await xlsxBuffer([
    hoja<F>(
      "Productos",
      [
        ...CAMPOS.map((c) => ({
          titulo: TITULOS[c],
          tipo: "texto" as const,
          ancho: c === "nombre" || c === "descripcion" ? 32 : 16,
          valor: (f: F) => f.valores[c],
        })),
        { titulo: "Motivo del error", tipo: "texto", ancho: 50, valor: (f) => `Fila ${f.fila}: ${f.motivos.join(" ")}` },
      ],
      parsed.data
    ),
  ]);
  return { ok: true, base64: buf.toString("base64") };
}
