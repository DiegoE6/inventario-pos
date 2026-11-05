import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/app/lib/env";

/**
 * Cliente de Supabase para Client Components ("use client").
 *
 * Usa la publishable key y la sesión que @supabase/ssr guarda en cookies,
 * así el navegador y el servidor ven al mismo usuario. Todo lo que haga
 * este cliente pasa por RLS.
 *
 * createBrowserClient reutiliza una sola instancia en el navegador, así que
 * se puede llamar en cada componente sin crear conexiones de más.
 */
export function createClient() {
  return createBrowserClient(env.supabaseUrl, env.supabasePublishableKey);
}
