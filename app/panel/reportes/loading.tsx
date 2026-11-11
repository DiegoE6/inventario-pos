import { Bloque, Cargando } from "@/app/components/estado";

/** Esqueleto de Reportes mientras llega del servidor. */
export default function Loading() {
  return (
    <Cargando etiqueta="Cargando reportes…">
      <div className="flex items-end justify-between gap-3">
        <Bloque className="h-8 w-36" />
        <Bloque className="h-11 w-40 rounded-[var(--radius-control)]" />
      </div>
      <Bloque className="h-40 rounded-[var(--radius-card)]" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Bloque key={i} className="h-24 rounded-[var(--radius-card)]" />
        ))}
      </div>
      <Bloque className="h-64 rounded-[var(--radius-card)]" />
    </Cargando>
  );
}
