"use client";

import dynamic from "next/dynamic";
import type { PosProduct } from "@/app/lib/cart";

/**
 * El punto de venta solo se renderiza en el cliente: restaura el carrito de
 * localStorage al montar, y así no hay diferencias entre el HTML del servidor
 * y el del navegador (hidratación).
 */
const Pos = dynamic(() => import("./pos").then((m) => m.Pos), {
  ssr: false,
  loading: () => (
    <div aria-busy="true" aria-label="Cargando punto de venta" className="flex flex-col gap-3">
      <div className="h-12 animate-pulse rounded-[var(--radius-control)] bg-surface-muted motion-reduce:animate-none" />
      <div className="h-24 animate-pulse rounded-[var(--radius-card)] bg-surface-muted motion-reduce:animate-none" />
      <div className="h-24 animate-pulse rounded-[var(--radius-card)] bg-surface-muted motion-reduce:animate-none" />
    </div>
  ),
});

export function PosLoader(props: { userId: string; frecuentes: PosProduct[] }) {
  return <Pos {...props} />;
}
