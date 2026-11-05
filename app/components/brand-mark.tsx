import type { Configuracion } from "@/app/lib/types";

/** Iniciales de las dos últimas palabras: "Ferretería La Tuerca" → "LT". */
function initials(nombre: string): string {
  const words = nombre.trim().split(/\s+/).filter((w) => /^\p{L}/u.test(w));
  return words.slice(-2).map((w) => w[0]).join("").toUpperCase() || "•";
}

/** Logo del negocio o, si no hay, sus iniciales sobre el color de marca. */
export function BrandMark({
  config,
  size = 40,
}: {
  config: Pick<Configuracion, "nombre" | "logo_url">;
  size?: number;
}) {
  if (config.logo_url && /^https:\/\//.test(config.logo_url)) {
    return (
      // El logo viene de la configuración del negocio (URL externa, Fase 8).
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={config.logo_url}
        alt={config.nombre}
        width={size}
        height={size}
        className="shrink-0 rounded-[10px] object-contain"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-[10px] bg-primary font-semibold text-on-primary"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials(config.nombre)}
    </span>
  );
}
