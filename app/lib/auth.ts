import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";
import type { Rol, Session } from "@/app/lib/types";

/**
 * La verificación real de acceso al panel. TODA página y TODA Server Action
 * del panel la llama (proxy.ts es solo un chequeo optimista).
 *
 * - getClaims() valida el JWT (firma y vencimiento). Nunca getSession() en
 *   el servidor: sale de la cookie sin verificar.
 * - Luego lee el perfil con la sesión del usuario (pasa por RLS): sin perfil
 *   o con perfil inactivo, no entra.
 *
 * cache(): una sola verificación por render aunque la llamen layout y página.
 */
export const verifySession = cache(async (): Promise<Session> => {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) {
    redirect("/login");
  }

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("nombre, rol, activo")
    .eq("id", claims.sub)
    .maybeSingle<{ nombre: string; rol: Rol; activo: boolean }>();

  if (!perfil || !perfil.activo) {
    // proxy.ts deja ver /login?error=... aunque haya sesión, para no ciclar.
    redirect("/login?error=inactivo");
  }

  return {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    nombre: perfil.nombre,
    rol: perfil.rol,
  };
});

/** Para páginas solo de dueño: el cajero regresa al inicio con un aviso. */
export async function requireDueno(): Promise<Session> {
  const session = await verifySession();
  if (session.rol !== "dueno") {
    redirect("/panel?aviso=solo-dueno");
  }
  return session;
}
