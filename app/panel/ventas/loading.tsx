import { Bloque, Cargando } from "@/app/components/estado";

/** Esqueleto de Ventas mientras llega del servidor. */
export default function Loading() {
  return (
    <Cargando etiqueta="Cargando ventas…">
      <div className="flex items-end justify-between gap-3">
        <Bloque className="h-8 w-32" />
        <Bloque className="h-11 w-40 rounded-[var(--radius-control)]" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Bloque key={i} className="h-11 rounded-[var(--radius-control)]" />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Bloque key={i} className="h-14 rounded-[var(--radius-control)]" />
        ))}
      </div>
    </Cargando>
  );
}
