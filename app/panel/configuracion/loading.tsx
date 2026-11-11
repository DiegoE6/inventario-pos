import { Bloque, Cargando } from "@/app/components/estado";

/** Esqueleto de Configuración mientras llega del servidor. */
export default function Loading() {
  return (
    <Cargando etiqueta="Cargando configuración…">
      <Bloque className="h-8 w-44" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Bloque key={i} className="h-16 rounded-[var(--radius-control)]" />
        ))}
      </div>
    </Cargando>
  );
}
