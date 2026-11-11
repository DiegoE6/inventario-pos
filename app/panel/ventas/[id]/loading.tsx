import { Bloque, Cargando } from "@/app/components/estado";

/** Esqueleto de el detalle de una venta mientras llega del servidor. */
export default function Loading() {
  return (
    <Cargando etiqueta="Cargando venta…">
      <div className="flex flex-col gap-2">
        <Bloque className="h-4 w-20" />
        <Bloque className="h-8 w-48" />
      </div>
      <Bloque className="h-28 rounded-[var(--radius-card)]" />
      <Bloque className="h-48 rounded-[var(--radius-card)]" />
      <div className="flex gap-2">
        <Bloque className="h-11 w-44 rounded-[var(--radius-control)]" />
        <Bloque className="h-11 w-36 rounded-[var(--radius-control)]" />
      </div>
    </Cargando>
  );
}
