/**
 * Content Security Policy con nonce por petición (la arma proxy.ts).
 *
 * - Scripts: solo los que traen el nonce de esta petición. Next lo pone solo
 *   en los suyos (lee el nonce del encabezado CSP de la petición) y
 *   'strict-dynamic' deja que esos scripts carguen los chunks que necesiten.
 *   'unsafe-eval' solo en desarrollo: React lo usa para reconstruir las pilas
 *   de error del servidor; en producción ni React ni Next usan eval.
 * - Estilos: hojas propias y <style> con nonce. La única concesión es
 *   style-src-attr 'unsafe-inline': el atributo style de <html> lleva los
 *   colores de la marca (brandStyle) y React escribe style={…} como atributo.
 *   Un atributo style no ejecuta código.
 *   En desarrollo Next inyecta <style> sin nonce (recarga en caliente y su
 *   indicador), así que ahí style-src lleva 'unsafe-inline' en lugar del nonce
 *   (con un nonce presente, el navegador ignoraría 'unsafe-inline').
 * - Supabase: imágenes (logo en Storage) y conexiones https/wss al proyecto.
 *   El origen sale de la variable de entorno, no se escribe aquí.
 */
export function buildCsp(nonce: string, supabaseUrl: string, isDev: boolean): string {
  // https://… y wss://… (o http/ws si fuera un Supabase local).
  const https = new URL(supabaseUrl).origin;
  const wss = https.replace(/^http/, "ws");

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' data: blob: ${https}`,
    "font-src 'self'",
    `connect-src 'self' ${https} ${wss}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  return directives.join("; ");
}

/** 128 bits aleatorios en base64, nuevos en cada petición. */
export function newNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}
