import { Bloque, Cargando } from "@/app/components/estado";

/** Esqueleto de el detalle de un producto mientras llega del servidor. */
export default function Loading() {
  return (
    <Cargando etiqueta="Cargando producto…">
      <div className="flex flex-col gap-2">
        <Bloque className="h-4 w-24" />
        <Bloque className="h-8 w-56" />
      </div>
      <Bloque className="h-28 rounded-[var(--radius-card)]" />
      <Bloque className="h-80 rounded-[var(--radius-card)]" />
    </Cargando>
  );
}
