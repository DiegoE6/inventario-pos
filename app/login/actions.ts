"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { credencialesDemo, demoActivo } from "@/app/lib/demo";
import { safeNext } from "@/app/lib/safe-next";
import { createClient } from "@/app/lib/supabase/server";
import type { FormState } from "@/app/lib/types";

/**
 * Las Server Actions son endpoints públicos: cualquiera puede mandarles un
 * POST. Por eso se valida todo aquí, en el servidor.
 */

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ error: "Escribe un correo válido." })),
  password: z.string().min(1, { error: "Escribe tu contraseña." }).max(200),
});

export type LoginState = FormState & { email?: string };

export async function iniciarSesion(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
  });
  const email = String(formData.get("email") ?? "");

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors, email };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    if (error?.status === 429) {
      return { error: "Demasiados intentos. Espera un momento y vuelve a intentar.", email };
    }
    // Un solo mensaje: no revelar si el correo existe.
    return { error: "Correo o contraseña incorrectos.", email };
  }

  // Credenciales válidas no bastan: el perfil tiene que estar activo.
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("activo")
    .eq("id", data.user.id)
    .maybeSingle<{ activo: boolean }>();

  if (!perfil?.activo) {
    await supabase.auth.signOut({ scope: "local" });
    return {
      error: "Tu cuenta está desactivada. Pide al dueño del negocio que la active.",
      email,
    };
  }

  // Regresa a donde estaba (solo rutas internas de /panel; ver safeNext).
  redirect(safeNext(formData.get("next")));
}

/**
 * Solo cierra la sesión de ESTE dispositivo. El alcance por defecto de
 * Supabase es "global" (cierra todas las sesiones del usuario), y con el
 * usuario demo compartido sacaría a todos los prospectos que estén dentro.
 */
export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}

// -----------------------------------------------------------------------------
// Modo demo
// -----------------------------------------------------------------------------

const demoSchema = z.object({ rol: z.enum(["dueno", "cajero"]) });

export type DemoState = { error?: string };

/**
 * Entra con el usuario demo del rol elegido. Las credenciales viven en
 * variables de entorno de servidor; el navegador solo manda el rol.
 * Sin DEMO_MODE=true responde error aunque alguien mande el POST a mano.
 */
export async function entrarDemo(_prev: DemoState, formData: FormData): Promise<DemoState> {
  const parsed = demoSchema.safeParse({ rol: formData.get("rol") });
  const credenciales = parsed.success && demoActivo() ? credencialesDemo(parsed.data.rol) : null;
  if (!credenciales) return { error: "El demo no está disponible." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(credenciales);

  if (error || !data.user) {
    if (error?.status === 429) {
      return { error: "Demasiados intentos. Espera un momento y vuelve a intentar." };
    }
    console.error("entrarDemo:", error?.message);
    return { error: "No se pudo entrar al demo. Intenta de nuevo." };
  }

  redirect("/panel");
}
