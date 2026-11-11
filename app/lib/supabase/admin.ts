import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/app/lib/env";

/**
 * Cliente con la SECRET key de Supabase (salta RLS). Es el ÚNICO lugar que
 * lee SUPABASE_SECRET_KEY, y solo lo usa la acción crearUsuario
 * (app/panel/configuracion/usuarios/actions.ts) para dar de alta un usuario
 * en Auth: eso no se puede hacer con la sesión del dueño.
 *
 * Por qué es indispensable: crear un usuario con contraseña sin que él
 * confirme su correo solo existe en la API de administración de Auth, que
 * pide la secret key. Todo lo demás (activarlo, darle rol) se hace después
 * con la sesión del dueño y pasa por RLS y actualizar_usuario().
 *
 * - `server-only`: si algún componente del cliente lo importara, el build falla.
 * - Sin prefijo NEXT_PUBLIC_: Next nunca la mete al bundle del navegador.
 * - Opcional: sin la variable (y siempre en el demo) no se crean usuarios.
 */

export function adminDisponible(): boolean {
  return Boolean(process.env.SUPABASE_SECRET_KEY);
}

export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Falta SUPABASE_SECRET_KEY (solo servidor).");
  return createClient(env.supabaseUrl, key, {
    // Sin sesión guardada ni refresco: es un cliente de un solo uso, por petición.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
