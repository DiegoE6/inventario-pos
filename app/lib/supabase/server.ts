import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/app/lib/env";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 *
 * Lee la sesión del usuario desde las cookies, así que las consultas pasan
 * por RLS con la identidad de quien está logueado.
 *
 * Se crea uno nuevo por petición; nunca se comparte entre peticiones.
 */
export async function createClient() {
  const cookieStore = await cookies(); // en Next 16 cookies() es asíncrono

  return createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Un Server Component no puede escribir cookies; solo los Server
          // Actions, Route Handlers y el proxy. Se ignora a propósito: en la
          // Fase 2, proxy.ts renovará la sesión y escribirá las cookies.
        }
      },
    },
  });
}
