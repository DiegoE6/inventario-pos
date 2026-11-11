import { Bloque, Cargando } from "@/app/components/estado";

/** Esqueleto de la lista mientras carga la primera vez. */
export default function Loading() {
  return (
    <Cargando etiqueta="Cargando productos…">
      <Bloque className="h-8 w-40" />
      <Bloque className="h-11 rounded-[var(--radius-control)]" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Bloque key={i} className="h-[92px] rounded-[var(--radius-card)]" />
        ))}
      </div>
    </Cargando>
  );
}
