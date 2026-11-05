import { z } from "zod";
import { UNIDADES_ENTERAS } from "@/app/lib/types";
import type { Unidad } from "@/app/lib/format";

/**
 * Validación de formularios en el servidor (zod). Los montos y cantidades se
 * validan y se mandan a la BD como TEXTO ("12.50"), nunca como float.
 */

const MONEY_RE = /^\d{1,10}(\.\d{1,2})?$/;
const QTY_RE = /^\d{1,9}(\.\d{1,3})?$/;

/** "1,250.5" → "1250.5"; valida hasta 2 decimales. */
export const money = (label: string) =>
  z
    .string()
    .trim()
    .transform((s) => s.replace(/,/g, ""))
    .pipe(
      z
        .string()
        .min(1, { error: `Escribe ${label}.` })
        .regex(MONEY_RE, { error: `Usa un monto como 12.50 para ${label}.` })
    );

/** Cantidad con hasta 3 decimales; vacío = "0". */
export const quantity = (label: string) =>
  z
    .string()
    .trim()
    .transform((s) => s.replace(/,/g, "") || "0")
    .pipe(z.string().regex(QTY_RE, { error: `Usa un número como 10 o 2.5 para ${label}.` }));

/** Id de catálogo opcional: "" → null. */
export const optionalId = z
  .string()
  .trim()
  .transform((s, ctx) => {
    if (s === "") return null;
    if (!/^\d{1,9}$/.test(s)) {
      ctx.addIssue({ code: "custom", message: "Opción no válida." });
      return z.NEVER;
    }
    return Number(s);
  });

export const requiredId = z
  .string()
  .trim()
  .regex(/^\d{1,9}$/, { error: "Registro no válido." })
  .transform(Number);

/** Texto opcional: "" → null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Máximo ${max} caracteres.` })
    .transform((s) => s || null);

export const requiredText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, { error: `${label} es obligatorio.` })
    .max(max, { error: `${label}: máximo ${max} caracteres.` });

/** true si la cantidad tiene decimales y la unidad no los acepta. */
export function decimalNotAllowed(value: string, unidad: Unidad): boolean {
  return UNIDADES_ENTERAS.includes(unidad) && !/^\d+(\.0*)?$/.test(value);
}

/** Lee un campo de FormData como string (los ausentes → ""). */
export function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

/** Primer error de zod por campo → { campo: mensaje }. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
