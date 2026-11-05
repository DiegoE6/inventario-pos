/**
 * Variables de entorno públicas de Supabase, validadas.
 *
 * Next.js reemplaza `process.env.NEXT_PUBLIC_...` por su valor en tiempo de
 * build, pero SOLO cuando la propiedad está escrita literal. Un acceso
 * dinámico como `process.env[name]` no se reemplaza y en el navegador da
 * `undefined`. Por eso cada variable se lee de forma explícita y la
 * validación viene después.
 *
 * Ambas son públicas por diseño (la publishable key está pensada para el
 * navegador). Lo que protege los datos es RLS, no esconder estas llaves.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. ` +
        "Cópiala de .env.example a .env.local (o configúrala en Vercel) y reinicia el servidor."
    );
  }
  return value;
}

export const env = {
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl),
  supabasePublishableKey: required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    supabasePublishableKey
  ),
};
