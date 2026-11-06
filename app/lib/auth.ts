import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";
import type { Rol, Session } from "@/app/lib/types";

type SessionResult = { session: Session } | { session: null; reason: "no-session" | "inactive" };

/**
 * Lee y valida la sesión una sola vez por petición (cache):
 * - getClaims() valida el JWT (firma y vencimiento). Nunca getSession() en
 *   el servidor: sale de la cookie sin verificar.
 * - Luego lee el perfil con la sesión del usuario (pasa por RLS): sin perfil
 *   o con perfil inactivo, no hay sesión válida.
 */
const readSession = cache(async (): Promise<SessionResult> => {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return { session: null, reason: "no-session" };

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("nombre, rol, activo")
    .eq("id", claims.sub)
    .maybeSingle<{ nombre: string; rol: Rol; activo: boolean }>();

  if (!perfil || !perfil.activo) return { session: null, reason: "inactive" };

  return {
    session: {
      userId: claims.sub,
      email: typeof claims.email === "string" ? claims.email : null,
      nombre: perfil.nombre,
      rol: perfil.rol,
    },
  };
});

/**
 * La verificación real de acceso al panel. TODA página y TODA Server Action
 * del panel la llama (proxy.ts es solo un chequeo optimista).
 */
export async function verifySession(): Promise<Session> {
  const result = await readSession();
  if (!result.session) {
    // proxy.ts deja ver /login?error=... aunque haya sesión, para no ciclar.
    redirect(result.reason === "inactive" ? "/login?error=inactivo" : "/login");
  }
  return result.session;
}

/** Para Route Handlers que responden JSON: null en lugar de redirigir (→ 401). */
export async function getSessionOrNull(): Promise<Session | null> {
  return (await readSession()).session;
}

/** Para páginas solo de dueño: el cajero regresa al inicio con un aviso. */
export async function requireDueno(): Promise<Session> {
  const session = await verifySession();
  if (session.rol !== "dueno") {
    redirect("/panel?aviso=solo-dueno");
  }
  return session;
}
