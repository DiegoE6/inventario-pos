import { logoSrc } from "@/app/lib/brand";
import { env } from "@/app/lib/env";
import type { Configuracion } from "@/app/lib/types";

/** Iniciales de las dos últimas palabras: "Ferretería La Tuerca" → "LT". */
function initials(nombre: string): string {
  const words = nombre.trim().split(/\s+/).filter((w) => /^\p{L}/u.test(w));
  return words.slice(-2).map((w) => w[0]).join("").toUpperCase() || "•";
}

/**
 * Logo del negocio o, si no hay, sus iniciales sobre el color de marca.
 * `logo_url` es la ruta relativa del bucket `marca` (la BD no acepta otra
 * cosa); aquí se le antepone la URL del proyecto. `src` deja pasar una URL
 * local (blob:) para la vista previa antes de guardar.
 */
export function BrandMark({
  config,
  size = 40,
  src,
}: {
  config: Pick<Configuracion, "nombre" | "logo_url">;
  size?: number;
  src?: string | null;
}) {
  const url = src ?? logoSrc(config.logo_url, env.supabaseUrl);
  if (url) {
    return (
      // Imagen chica ya optimizada al subirla (WEBP de máx. 512 px, docs/fase-8).
      // Alto fijo; el ancho sigue la proporción del logo hasta 3 veces el alto,
      // para que un logo horizontal no quede diminuto dentro de un cuadro.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={config.nombre}
        height={size}
        className="logo-ficha w-auto shrink-0 object-contain object-left"
        style={{ height: size, maxWidth: size * 3 }}
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
