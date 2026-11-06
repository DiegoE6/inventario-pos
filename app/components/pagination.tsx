import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClasses } from "@/app/components/ui/button";

/** Anterior / Siguiente con "Página N de M". `href(n)` arma el enlace de la página n. */
export function Pagination({
  pagina,
  paginas,
  href,
}: {
  pagina: number;
  paginas: number;
  href: (n: number) => string;
}) {
  if (paginas <= 1 && pagina <= 1) return null;
  const prev = pagina > 1 ? Math.min(pagina - 1, paginas) : null;
  const next = pagina < paginas ? pagina + 1 : null;
  const disabled = "pointer-events-none opacity-40";

  return (
    <nav aria-label="Páginas" className="flex items-center justify-between gap-3">
      <Link
        href={prev ? href(prev) : "#"}
        aria-disabled={!prev}
        tabIndex={prev ? undefined : -1}
        className={buttonClasses({ variant: "secondary", className: prev ? "" : disabled })}
      >
        <ChevronLeft aria-hidden className="size-[18px]" />
        Anterior
      </Link>
      <p className="text-sm text-muted tabular-nums">
        Página {Math.min(pagina, paginas)} de {paginas}
      </p>
      <Link
        href={next ? href(next) : "#"}
        aria-disabled={!next}
        tabIndex={next ? undefined : -1}
        className={buttonClasses({ variant: "secondary", className: next ? "" : disabled })}
      >
        Siguiente
        <ChevronRight aria-hidden className="size-[18px]" />
      </Link>
    </nav>
  );
}
