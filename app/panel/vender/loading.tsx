import { Bloque, Cargando } from "@/app/components/estado";

/** Esqueleto de Vender mientras llega del servidor. */
export default function Loading() {
  return (
    <Cargando etiqueta="Cargando punto de venta…">
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        <div className="flex flex-col gap-3">
          <Bloque className="h-12 rounded-[var(--radius-control)]" />
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Bloque key={i} className="h-[76px] rounded-[var(--radius-card)]" />
            ))}
          </div>
        </div>
        <Bloque className="hidden h-96 rounded-[var(--radius-card)] lg:block" />
      </div>
    </Cargando>
  );
}
