"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  addToCart,
  cartSummary,
  milliToString,
  parseQtyMilli,
  paymentSummary,
  type CartLine,
  type MetodoPago,
  type PosProduct,
} from "@/app/lib/cart";
import { uuidv4 } from "@/app/lib/uuid";
import { cobrar, type Ticket } from "../actions";
import { CartBar } from "./cart-bar";
import { CartPanel } from "./cart-panel";
import { irAlLogin, refrescarProductos, SinSesionError } from "./fetch-pos";
import { SearchPanel } from "./search-panel";
import { TicketDialog } from "./ticket-dialog";

// -----------------------------------------------------------------------------
// Persistencia: el carrito sobrevive a una recarga accidental. Por usuario,
// para que en una tablet compartida no se mezclen carritos. Si localStorage
// no está disponible (modo privado), simplemente no se guarda.
// -----------------------------------------------------------------------------

type CartState = {
  v: 1;
  /** Clave de idempotencia de ESTA venta: se reusa en cada reintento. */
  clave: string;
  lines: CartLine[];
  metodo: MetodoPago;
  recibido: string;
};

function nuevaVenta(): CartState {
  return { v: 1, clave: uuidv4(), lines: [], metodo: "efectivo", recibido: "" };
}

function load(key: string): CartState | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const s = JSON.parse(raw) as CartState;
    if (s?.v !== 1 || typeof s.clave !== "string" || !Array.isArray(s.lines)) return null;
    return s;
  } catch {
    return null;
  }
}

function save(key: string, state: CartState) {
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Sin espacio o sin permiso: el carrito sigue funcionando en memoria.
  }
}

const finePointer = () => window.matchMedia?.("(pointer: fine)").matches ?? true;

export function Pos({ userId, frecuentes }: { userId: string; frecuentes: PosProduct[] }) {
  const storageKey = `pos:carrito:${userId}`;
  // Los más vendidos se fijan al cargar la página: no cambian de orden mientras
  // se vende (el orden se actualiza al recargar). Su stock sí se refresca
  // después de cada cobro (ver onCobrar).
  const [frecuentesFijos, setFrecuentesFijos] = useState(frecuentes);
  const [cart, setCart] = useState<CartState>(() => load(storageKey) ?? nuevaVenta());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cobrando, startCobro] = useTransition();
  const enviando = useRef(false); // bloquea el doble toque antes del re-render
  const searchRef = useRef<HTMLInputElement>(null);

  // Guardar en cada cambio.
  useEffect(() => save(storageKey, cart), [storageKey, cart]);

  // Al montar: refrescar precio, stock y estado de lo que venía guardado.
  const refrescado = useRef(false);
  useEffect(() => {
    if (refrescado.current) return;
    refrescado.current = true;
    const ids = cart.lines.map((l) => l.producto.id);
    if (ids.length === 0) return;
    refrescarProductos(ids)
      .then((productos) => {
        const porId = new Map(productos.map((p) => [p.id, p]));
        setCart((c) => ({
          ...c,
          lines: c.lines.map((l) => {
            const p = porId.get(l.producto.id);
            // Con datos frescos se borra el problema guardado: si el producto se
            // reactivó o ya hay stock, lineIssue() lo vuelve a evaluar.
            return p
              ? { ...l, producto: p, problema: undefined }
              : { ...l, producto: { ...l.producto, activo: false }, problema: "Este producto ya no existe" };
          }),
        }));
      })
      .catch((e) => {
        if (e instanceof SinSesionError) irAlLogin();
      });
  }, [cart.lines]);

  // Hoja del carrito abierta en celular: sin scroll del fondo; Escape la cierra.
  useEffect(() => {
    // Desde 1024px no hay hoja: el carrito es una columna.
    if (!sheetOpen || window.matchMedia("(min-width: 1024px)").matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheetOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [sheetOpen]);

  const summary = useMemo(() => cartSummary(cart.lines), [cart.lines]);
  const payment = paymentSummary(cart.metodo, cart.recibido, summary.totalCents);

  const update = useCallback((fn: (c: CartState) => CartState) => {
    setError(null);
    setCart(fn);
  }, []);

  const onAdd = useCallback(
    (producto: PosProduct, opts?: { fromScan?: boolean }) => {
      update((c) => ({ ...c, lines: addToCart(c.lines, producto) }));
      // Con lector o mouse, el foco se queda en el buscador. En pantallas
      // táctiles no, para que el teclado no tape los resultados.
      if (opts?.fromScan || finePointer()) searchRef.current?.focus();
    },
    [update]
  );

  function onCobrar() {
    if (enviando.current || !summary.valid || !payment.valid) return;
    enviando.current = true;
    setError(null);

    const input = {
      clave: cart.clave,
      metodo: cart.metodo,
      recibido: cart.metodo === "efectivo" ? cart.recibido : undefined,
      items: cart.lines.map((l) => ({
        producto_id: l.producto.id,
        cantidad: milliToString(parseQtyMilli(l.cantidad, l.producto.unidad) ?? 0),
      })),
    };

    startCobro(async () => {
      try {
        const res = await cobrar(input);
        if (res.ok) {
          setTicket(res.ticket);
          setSheetOpen(false);
          // La venta ya está en la BD: carrito limpio y clave nueva YA, para
          // que una recarga no muestre lo que ya se cobró.
          setCart(nuevaVenta());
          // Stock actual de lo vendido para las tarjetas de más vendidos (mismo
          // orden; sin pedir la página completa). No bloquea el ticket.
          refrescarProductos(input.items.map((i) => i.producto_id))
            .then((productos) => {
              const porId = new Map(productos.map((p) => [p.id, p]));
              setFrecuentesFijos((lista) => lista.map((p) => porId.get(p.id) ?? p));
            })
            .catch((e) => {
              if (e instanceof SinSesionError) irAlLogin();
            });
          return;
        }
        setError(res.error);
        const porId = new Map((res.productos ?? []).map((p) => [p.id, p]));
        setCart((c) => ({
          ...c,
          lines: c.lines.map((l) => ({
            ...l,
            producto: porId.get(l.producto.id) ?? l.producto,
            problema: res.problemas?.[l.producto.id],
          })),
        }));
        setSheetOpen(true);
      } catch {
        // Red caída o respuesta perdida: el carrito y la clave se conservan.
        // Reintentar con la misma clave nunca cobra doble.
        setError(
          "No se pudo confirmar el cobro. Revisa tu conexión y toca Cobrar otra vez: no se cobrará doble."
        );
      } finally {
        enviando.current = false;
      }
    });
  }

  return (
    <div className="flex flex-col gap-6 pb-24 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:pb-0">
      <SearchPanel inputRef={searchRef} frecuentes={frecuentesFijos} lines={cart.lines} onAdd={onAdd} />

      <CartPanel
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        lines={cart.lines}
        onQty={(id, cantidad) =>
          update((c) => ({
            ...c,
            lines: c.lines.map((l) => (l.producto.id === id ? { ...l, cantidad, problema: undefined } : l)),
          }))
        }
        onRemove={(id) => update((c) => ({ ...c, lines: c.lines.filter((l) => l.producto.id !== id) }))}
        onClear={() => update((c) => ({ ...c, lines: [], recibido: "" }))}
        metodo={cart.metodo}
        onMetodo={(metodo) => update((c) => ({ ...c, metodo }))}
        recibido={cart.recibido}
        onRecibido={(recibido) => update((c) => ({ ...c, recibido }))}
        totalCents={summary.totalCents}
        cartValid={summary.valid}
        payment={payment}
        error={error}
        cobrando={cobrando}
        onCobrar={onCobrar}
      />

      <CartBar count={summary.count} totalCents={summary.totalCents} onOpen={() => setSheetOpen(true)} />

      <TicketDialog
        ticket={ticket}
        onNueva={() => {
          setTicket(null);
          searchRef.current?.focus();
        }}
      />
    </div>
  );
}
