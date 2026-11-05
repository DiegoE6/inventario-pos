import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClasses } from "@/app/components/ui/button";
import type { ProductosQuery } from "@/app/lib/data";

function href(query: ProductosQuery, pagina: number) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.categoria !== null) params.set("categoria", String(query.categoria));
  if (query.inactivos) params.set("inactivos", "1");
  if (pagina > 1) params.set("pagina", String(pagina));
  const qs = params.toString();
  return qs ? `/panel/productos?${qs}` : "/panel/productos";
}

export function Pagination({ query, paginas }: { query: ProductosQuery; paginas: number }) {
  if (paginas <= 1 && query.pagina <= 1) return null;
  const prev = query.pagina > 1 ? Math.min(query.pagina - 1, paginas) : null;
  const next = query.pagina < paginas ? query.pagina + 1 : null;
  const disabled = "pointer-events-none opacity-40";

  return (
    <nav aria-label="Páginas" className="flex items-center justify-between gap-3">
      <Link
        href={prev ? href(query, prev) : "#"}
        aria-disabled={!prev}
        tabIndex={prev ? undefined : -1}
        className={buttonClasses({ variant: "secondary", className: prev ? "" : disabled })}
      >
        <ChevronLeft aria-hidden className="size-[18px]" />
        Anterior
      </Link>
      <p className="text-sm text-muted tabular-nums">
        Página {Math.min(query.pagina, paginas)} de {paginas}
      </p>
      <Link
        href={next ? href(query, next) : "#"}
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
