import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/app/lib/env";

/**
 * Señal de vida para Supabase (plan gratis: un proyecto sin actividad en una
 * semana se pausa). Vercel Cron la llama una vez al día (vercel.json).
 *
 * Lee configuracion_negocio por la API con la publishable key, como anon (la
 * misma lectura que hace el login). Sin service_role y sin sesión.
 *
 * Si existe CRON_SECRET, solo responde a quien mande
 * `Authorization: Bearer <CRON_SECRET>`, que Vercel Cron agrega solo.
 */
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401, headers: NO_STORE });
  }

  const supabase = createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.from("configuracion_negocio").select("id").limit(1);

  if (error) {
    console.error("vida:", error.message);
    return NextResponse.json({ ok: false }, { status: 502, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
