"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDueno } from "@/app/lib/auth";
import { dbErrorMessage } from "@/app/lib/errors";
import { createClient } from "@/app/lib/supabase/server";
import type { FormState } from "@/app/lib/types";
import { field, fieldErrors } from "@/app/lib/validation";

/**
 * Cancelar una venta. Solo dueño: requireDueno aquí y cancelar_venta lo
 * vuelve a validar en la BD (LT403 para el cajero). La función regresa el
 * stock con movimientos de cancelación y guarda quién, cuándo y por qué.
 * Con la sesión del usuario; sin service_role.
 */

const cancelarSchema = z.object({
  venta_id: z.uuid({ error: "Venta no válida." }),
  motivo: z
    .string()
    .trim()
    .min(3, { error: "Escribe el motivo (mínimo 3 letras)." })
    .max(200, { error: "El motivo puede tener hasta 200 caracteres." }),
});

export async function cancelarVenta(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireDueno();
  const parsed = cancelarSchema.safeParse({
    venta_id: field(formData, "venta_id"),
    motivo: field(formData, "motivo"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_venta", {
    p_venta_id: parsed.data.venta_id,
    p_motivo: parsed.data.motivo,
  });
  if (error) return { error: dbErrorMessage(error) };

  revalidatePath("/panel/ventas", "layout");
  return { ok: true, okKey: Date.now() };
}
