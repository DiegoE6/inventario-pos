"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoaderCircle, Search, X } from "lucide-react";
import { Select } from "@/app/components/ui/field";

type Filters = { q: string; categoria: string; inactivos: boolean };

/**
 * Búsqueda y filtros en la URL (?q=&categoria=&inactivos=1). Cualquier cambio
 * regresa a la página 1. La búsqueda espera 300 ms después de dejar de
 * escribir. Sin JavaScript también funciona: es un <form method="get">.
 */
export function ProductFilters({
  current,
  categorias,
  showInactivosToggle,
}: {
  current: Filters;
  categorias: { id: number; nombre: string }[];
  showInactivosToggle: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(current.q);
  const lastSent = useRef(current.q);

  function navigate(next: Partial<Filters>) {
    const merged = { ...current, q: q.trim(), ...next };
    const params = new URLSearchParams();
    if (merged.q) params.set("q", merged.q);
    if (merged.categoria) params.set("categoria", merged.categoria);
    if (merged.inactivos) params.set("inactivos", "1");
    // Sin "pagina": cualquier cambio de filtro vuelve a la página 1.
    lastSent.current = merged.q;
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  // Búsqueda con retardo de 300 ms.
  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed === lastSent.current) return;
    const t = setTimeout(() => navigate({ q: trimmed }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <form
      method="get"
      action={pathname}
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        navigate({ q: q.trim() });
      }}
      className="flex flex-col gap-3 sm:flex-row sm:items-center"
    >
      <div className="relative flex-1">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted" />
        <label htmlFor="q" className="sr-only">
          Buscar por nombre o código
        </label>
        <input
          id="q"
          name="q"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Buscar por nombre o código"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={100}
          className="h-11 w-full rounded-[var(--radius-control)] border border-border-strong bg-surface pl-10 pr-10 text-base text-foreground placeholder:text-muted/70 transition-[border-color,box-shadow] duration-150 ease-out focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 [&::-webkit-search-cancel-button]:hidden"
        />
        <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center">
          {pending ? (
            <LoaderCircle aria-label="Buscando" className="mr-1 size-[18px] animate-spin text-muted" />
          ) : q ? (
            <button
              type="button"
              aria-label="Borrar búsqueda"
              onClick={() => {
                setQ("");
                navigate({ q: "" });
              }}
              className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface-muted"
            >
              <X aria-hidden className="size-4" />
            </button>
          ) : null}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 sm:w-52 sm:flex-none">
          <label htmlFor="categoria" className="sr-only">
            Categoría
          </label>
          <Select
            id="categoria"
            value={current.categoria}
            onChange={(e) => navigate({ categoria: e.target.value })}
          >
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
        </div>

        {showInactivosToggle ? (
          <div className="flex h-11 shrink-0 items-center gap-2">
            <input
              id="inactivos"
              type="checkbox"
              name="inactivos"
              value="1"
              checked={current.inactivos}
              onChange={(e) => navigate({ inactivos: e.target.checked })}
              className="size-5 rounded accent-[var(--color-primary)]"
            />
            <label htmlFor="inactivos" className="flex h-11 cursor-pointer items-center text-sm text-muted">
              Inactivos
            </label>
          </div>
        ) : null}
      </div>
    </form>
  );
}
