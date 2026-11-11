"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDueno } from "@/app/lib/auth";
import { isHexColor } from "@/app/lib/brand";
import { demoActivo } from "@/app/lib/demo";
import { dbErrorMessage } from "@/app/lib/errors";
import { LogoInvalido, procesarLogo, rutaLogo } from "@/app/lib/logo";
import { createClient } from "@/app/lib/supabase/server";
import type { FormState } from "@/app/lib/types";
import { field, fieldErrors, optionalText } from "@/app/lib/validation";

/**
 * Datos y marca del negocio. Solo dueño (requireDueno aquí; RLS y los CHECK
 * de docs/sql/28 en la BD). Todo con la sesión del usuario: el logo se sube
 * por la API de Storage con su token, y las políticas del bucket `marca`
 * vuelven a revisar que sea dueño. Nada de service_role.
 */

const negocioSchema = z.object({
  nombre: z
    .string()
    .transform((s) => s.replace(/\s+/g, " ").trim())
    .pipe(
      z
        .string()
        .min(1, { error: "El nombre es obligatorio." })
        .max(100, { error: "El nombre: máximo 100 caracteres." })
    ),
  giro: optionalText(60),
  telefono: optionalText(30),
  direccion: optionalText(200),
  color_primario: z
    .string()
    .trim()
    .refine(isHexColor, { error: "Elige un color válido (#RRGGBB)." })
    .transform((s) => s.toLowerCase()),
});

/** La marca se ve en todo el sistema (y en el login): se revalida todo. */
function revalidarMarca() {
  revalidatePath("/", "layout");
}

export async function guardarNegocio(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireDueno();
  const parsed = negocioSchema.safeParse({
    nombre: field(formData, "nombre"),
    giro: field(formData, "giro"),
    telefono: field(formData, "telefono"),
    direccion: field(formData, "direccion"),
    color_primario: field(formData, "color_primario"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("configuracion_negocio")
    .update(parsed.data)
    .eq("id", 1)
    .select("id")
    .maybeSingle();
  if (error) return { error: dbErrorMessage(error) };
  // RLS: si no es dueño, el update no toca ninguna fila (sin error).
  if (!data) return { error: "No tienes permiso para hacer esto." };

  revalidarMarca();
  return { ok: true, message: "Guardado.", okKey: Date.now() };
}

export async function subirLogo(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireDueno();
  const archivo = formData.get("logo");
  if (!(archivo instanceof File) || archivo.size === 0) return { fieldErrors: { logo: "Elige una imagen." } };

  let webp: Buffer;
  try {
    webp = await procesarLogo(Buffer.from(await archivo.arrayBuffer()));
  } catch (e) {
    if (e instanceof LogoInvalido) return { fieldErrors: { logo: e.message } };
    console.error("[logo]", e);
    return { error: "No se pudo procesar la imagen. Intenta de nuevo." };
  }

  const supabase = await createClient();
  // Siempre por la API de Storage (nunca SQL sobre storage.objects): ruta fija
  // y upsert, así hay un solo logo. Solo se sube lo que regresó sharp.
  const { error: errorSubida } = await supabase.storage.from("marca").upload("logo", webp, {
    upsert: true,
    contentType: "image/webp",
    cacheControl: "3600",
  });
  if (errorSubida) {
    console.error("[logo] subida", errorSubida);
    return { error: "No se pudo subir el logo. Intenta de nuevo." };
  }

  // ?v= cambia en cada subida: el navegador y la CDN piden la imagen nueva.
  const { data, error } = await supabase
    .from("configuracion_negocio")
    .update({ logo_url: rutaLogo(Date.now()) })
    .eq("id", 1)
    .select("id")
    .maybeSingle();
  if (error) return { error: dbErrorMessage(error) };
  if (!data) return { error: "No tienes permiso para hacer esto." };

  revalidarMarca();
  return { ok: true, message: "Logo actualizado.", okKey: Date.now() };
}

/**
 * Quita el logo de la marca (vuelven las iniciales). El archivo se queda en
 * el bucket: no hay política de borrado, y la siguiente subida lo reemplaza.
 */
export async function quitarLogo(): Promise<FormState> {
  await requireDueno();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("configuracion_negocio")
    .update({ logo_url: null })
    .eq("id", 1)
    .select("id")
    .maybeSingle();
  if (error) return { error: dbErrorMessage(error) };
  if (!data) return { error: "No tienes permiso para hacer esto." };

  revalidarMarca();
  return { ok: true, message: "Logo quitado.", okKey: Date.now() };
}

/** Botón del demo: regresa nombre, color, logo y datos a los de la semilla. */
export async function restaurarMarcaDemo(): Promise<FormState> {
  await requireDueno();
  if (!demoActivo()) return { error: "Esto solo existe en el demo." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("restaurar_marca_demo");
  if (error) return { error: dbErrorMessage(error) };

  revalidarMarca();
  return { ok: true, message: "Marca del demo restaurada.", okKey: Date.now() };
}
