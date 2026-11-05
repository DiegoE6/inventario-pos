import "server-only";

/**
 * Módulo único de errores de la base → mensajes para el usuario.
 *
 * Las funciones SQL lanzan códigos propios (ver docs/sql/02):
 *   LT401 sin sesión o usuario inactivo
 *   LT403 sin permiso por rol
 *   LT404 no existe
 *   LT409 conflicto (stock insuficiente, código repetido, venta ya cancelada)
 *   LT422 datos inválidos
 * Su `message` ya viene en español y pensado para el usuario, así que se usa
 * tal cual. Los errores de Postgres/PostgREST se traducen aquí.
 */

type DbError = { code?: string; message?: string } | null | undefined;

const LT_FALLBACK: Record<string, string> = {
  LT401: "Tu sesión terminó o tu usuario no está activo. Vuelve a entrar.",
  LT403: "No tienes permiso para hacer esto.",
  LT404: "No se encontró lo que buscas.",
  LT409: "Hay un conflicto con los datos actuales. Revisa e intenta de nuevo.",
  LT422: "Revisa los datos capturados.",
};

export type DbErrorKind = "auth" | "forbidden" | "not_found" | "conflict" | "invalid" | "unknown";

export function errorKind(error: DbError): DbErrorKind {
  switch (error?.code) {
    case "LT401":
      return "auth";
    case "LT403":
    case "42501":
      return "forbidden";
    case "LT404":
    case "PGRST116":
      return "not_found";
    case "LT409":
    case "23505":
      return "conflict";
    case "LT422":
    case "23514":
    case "22P02":
      return "invalid";
    default:
      return "unknown";
  }
}

/**
 * Mensaje para mostrar. `duplicate` personaliza el texto del 23505 (único
 * repetido) según la tabla: "Ya existe un producto con ese código."
 */
export function dbErrorMessage(error: DbError, opts: { duplicate?: string } = {}): string {
  const code = error?.code ?? "";

  if (code.startsWith("LT")) {
    return error?.message?.trim() || LT_FALLBACK[code] || LT_FALLBACK.LT422;
  }

  switch (code) {
    case "23505":
      return opts.duplicate ?? "Ya existe un registro con esos datos.";
    case "42501":
      return LT_FALLBACK.LT403;
    case "23514":
    case "22P02":
      return LT_FALLBACK.LT422;
    case "PGRST116":
      return LT_FALLBACK.LT404;
  }

  // Desconocido: al log del servidor, mensaje genérico al usuario.
  console.error("[db]", error);
  return "Algo salió mal. Intenta de nuevo.";
}
