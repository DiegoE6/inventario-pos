import { Bloque, Cargando } from "@/app/components/estado";

/** Esqueleto de Inventario mientras llega del servidor. */
export default function Loading() {
  return (
    <Cargando etiqueta="Cargando inventario…">
      <Bloque className="h-8 w-40" />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Bloque key={i} className="h-20 rounded-[var(--radius-card)]" />
        ))}
      </div>
      <Bloque className="h-40 rounded-[var(--radius-card)]" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Bloque key={i} className="h-16 rounded-[var(--radius-control)]" />
        ))}
      </div>
    </Cargando>
  );
}
