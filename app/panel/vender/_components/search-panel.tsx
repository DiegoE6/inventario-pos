"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import { LoaderCircle, ScanBarcode, Search, X } from "lucide-react";
import { cantidadEnCarrito, type CartLine, type PosProduct } from "@/app/lib/cart";
import { formatMoney, formatQuantity } from "@/app/lib/format";
import { buscarPorCodigo, buscarProductos, irAlLogin, SinSesionError } from "./fetch-pos";

/**
 * Buscador con foco automático. Busca 150 ms después de dejar de escribir.
 * Enter (lo que manda un lector de barras al final) busca el código exacto y,
 * si existe, lo agrega directo y limpia el campo.
 */
export function SearchPanel({
  inputRef,
  frecuentes,
  lines,
  onAdd,
}: {
  inputRef: Ref<HTMLInputElement>;
  frecuentes: PosProduct[];
  lines: CartLine[];
  onAdd: (p: PosProduct, opts?: { fromScan?: boolean }) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PosProduct[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // Cada búsqueda lleva un número; las respuestas viejas se descartan.
  const reqId = useRef(0);

  function fallo(e: unknown) {
    if (e instanceof SinSesionError) irAlLogin();
    else if (!(e instanceof DOMException && e.name === "AbortError")) {
      setAviso("No se pudo buscar. Revisa tu conexión.");
    }
  }

  // Búsqueda con retardo (150 ms).
  useEffect(() => {
    const texto = q.trim();
    if (!texto) return;
    const id = ++reqId.current;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const productos = await buscarProductos(texto, ctrl.signal);
        if (id === reqId.current) setResults(productos);
      } catch (e) {
        if (id === reqId.current) fallo(e);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  function limpiar() {
    reqId.current++; // descarta búsquedas en curso
    setQ("");
    setResults(null);
    setLoading(false);
  }

  async function onEnter() {
    const codigo = q.trim();
    if (!codigo) return;
    const id = ++reqId.current;
    setLoading(true);
    try {
      const producto = await buscarPorCodigo(codigo);
      if (id !== reqId.current) return;
      if (producto) {
        onAdd(producto, { fromScan: true });
        setAviso(null);
        limpiar();
        return;
      }
      setAviso(`No hay un producto activo con el código "${codigo}".`);
      setResults(await buscarProductos(codigo));
    } catch (e) {
      fallo(e);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }

  const lista = results ?? frecuentes;
  const titulo = results ? null : frecuentes.length ? "Más vendidos" : null;

  return (
    <section aria-label="Buscar productos" className="flex flex-col gap-3">
      <div className="sticky top-0 z-20 -mx-4 bg-background/95 px-4 pb-2 pt-1 backdrop-blur md:-mx-6 md:px-6 lg:static lg:mx-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <label htmlFor="pos-buscar" className="sr-only">
          Buscar por nombre o escanear código
        </label>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
          <input
            ref={inputRef}
            id="pos-buscar"
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            placeholder="Buscar o escanear código"
            value={q}
            maxLength={100}
            onChange={(e) => {
              setQ(e.target.value);
              setAviso(null);
              if (!e.target.value.trim()) {
                reqId.current++;
                setResults(null);
                setLoading(false);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void onEnter();
              } else if (e.key === "Escape" && q) {
                limpiar();
              }
            }}
            className="h-12 w-full rounded-[var(--radius-control)] border border-border-strong bg-surface pl-11 pr-11 text-base text-foreground placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 [&::-webkit-search-cancel-button]:hidden"
          />
          <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center">
            {loading ? (
              <LoaderCircle aria-label="Buscando" className="mr-1.5 size-5 animate-spin text-muted" />
            ) : q ? (
              <button
                type="button"
                aria-label="Borrar búsqueda"
                onClick={limpiar}
                className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-surface-muted"
              >
                <X aria-hidden className="size-4" />
              </button>
            ) : (
              <ScanBarcode aria-hidden className="mr-2 size-5 text-muted" />
            )}
          </span>
        </div>
        {aviso ? (
          <p role="status" className="mt-2 text-sm text-danger">
            {aviso}
          </p>
        ) : null}
      </div>

      {titulo ? <h2 className="text-sm font-medium text-muted">{titulo}</h2> : null}

      {results && results.length === 0 && !loading ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface px-4 py-8 text-center text-base text-muted">
          Ningún producto coincide con “{q.trim()}”.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {lista.map((p) => (
            <li key={p.id}>
              <ResultCard producto={p} enCarrito={cantidadEnCarrito(lines, p.id)} onAdd={onAdd} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ResultCard({
  producto,
  enCarrito,
  onAdd,
}: {
  producto: PosProduct;
  enCarrito: string | null;
  onAdd: (p: PosProduct) => void;
}) {
  const agotado = producto.stock <= 0;
  return (
    <button
      type="button"
      disabled={agotado}
      onClick={() => onAdd(producto)}
      className="flex min-h-[84px] w-full items-start gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3.5 text-left transition-[transform,border-color] duration-150 ease-out hover:border-border-strong motion-safe:active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="line-clamp-2 text-base font-medium leading-snug">{producto.nombre}</span>
        <span className="text-[13px] text-muted">
          <span className="font-mono">{producto.codigo}</span>
          {" · "}
          {agotado ? (
            <span className="font-semibold text-danger">Agotado</span>
          ) : (
            <span className="tabular-nums">Hay {formatQuantity(producto.stock, producto.unidad)}</span>
          )}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-lg font-semibold tabular-nums">{formatMoney(producto.precio)}</span>
        {enCarrito ? (
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
            En carrito: {enCarrito}
          </span>
        ) : null}
      </span>
    </button>
  );
}
