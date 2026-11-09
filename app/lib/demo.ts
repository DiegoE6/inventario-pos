import "server-only";

/**
 * Modo demo. Todo se activa con DEMO_MODE=true; sin esa variable (instalación
 * para un cliente real) no hay botones de demo, ni banner, y la acción de
 * entrar al demo responde error.
 *
 * Las credenciales son variables SOLO de servidor (sin NEXT_PUBLIC_): este
 * módulo es `server-only`, así que no puede terminar en el bundle del
 * navegador.
 */

export type RolDemo = "dueno" | "cajero";

export function demoActivo(): boolean {
  return process.env.DEMO_MODE === "true";
}

/** Correo y contraseña del usuario demo, o null si falta alguno. */
export function credencialesDemo(rol: RolDemo): { email: string; password: string } | null {
  const email = rol === "dueno" ? process.env.DEMO_DUENO_EMAIL : process.env.DEMO_CAJERO_EMAIL;
  const password = rol === "dueno" ? process.env.DEMO_DUENO_PASSWORD : process.env.DEMO_CAJERO_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}

/** Roles con botón en el login: solo los que tienen credenciales. */
export function rolesDemoDisponibles(): RolDemo[] {
  if (!demoActivo()) return [];
  return (["dueno", "cajero"] as const).filter((rol) => credencialesDemo(rol) !== null);
}
