import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/app/lib/env";
import { safeNext } from "@/app/lib/safe-next";

/**
 * Proxy (Next 16; antes "middleware"). Dos tareas:
 *
 *   1. Renovar la sesión de Supabase y escribir las cookies nuevas en la
 *      respuesta. Los Server Components no pueden escribir cookies, así que
 *      si esto no pasa aquí, el usuario se desloguea solo.
 *   2. Redirección rápida: sin sesión → /login; con sesión en /login → /panel.
 *
 * Es un chequeo OPTIMISTA: no consulta la base. La verificación real (perfil
 * activo y rol) la hace verifySession() en app/lib/auth.ts, en cada página.
 */
/** Rutas que responden JSON: sin redirección a /login (ver abajo). */
const API_PATHS = ["/panel/vender/productos"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
        // Cache-Control/Expires/Pragma: que ninguna CDN guarde una respuesta
        // con la sesión de alguien.
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Nada entre createServerClient y getClaims: getClaims es lo que refresca
  // el token si está por vencer.
  const { data } = await supabase.auth.getClaims();
  const hasSession = Boolean(data?.claims?.sub);

  const { pathname, searchParams } = request.nextUrl;
  const isLogin = pathname === "/login";
  // Endpoints de datos (fetch desde el cliente): no se redirigen; el propio
  // Route Handler responde 401 y el cliente manda al login.
  const isApi = API_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!hasSession && !isLogin && !isApi) {
    // Recordar a dónde iba, para regresarlo después de entrar.
    const login = new URL("/login", request.url);
    const next = safeNext(pathname + request.nextUrl.search);
    if (next !== "/panel") login.searchParams.set("next", next);
    return redirectWithCookies(login, response);
  }

  // Con sesión, /login manda al panel (o a ?next). Excepción: si viene con
  // ?error (por ejemplo, perfil inactivo), se queda para mostrar el mensaje;
  // si no, se haría un ciclo /panel → /login → /panel.
  if (hasSession && isLogin && !searchParams.has("error")) {
    return redirectWithCookies(new URL(safeNext(searchParams.get("next")), request.url), response);
  }

  // Devolver ESTA respuesta: es la que trae las cookies renovadas.
  return response;
}

/** Redirige conservando las cookies (y encabezados) que dejó setAll. */
function redirectWithCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  ["cache-control", "expires", "pragma"].forEach((h) => {
    const value = from.headers.get(h);
    if (value) redirect.headers.set(h, value);
  });
  return redirect;
}

export const config = {
  matcher: ["/panel/:path*", "/login"],
};
