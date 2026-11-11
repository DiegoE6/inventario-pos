import { Bloque, Cargando } from "@/app/components/estado";

/**
 * Esqueleto genérico del panel. Lo heredan todas las pantallas sin esqueleto
 * propio (Inicio, Más…) y, al abrir una sección directo, se ve un instante
 * antes que el de la sección; por eso no nombra ninguna pantalla.
 */
export default function Loading() {
  return (
    <Cargando etiqueta="Cargando…">
      <div className="flex flex-col gap-2">
        <Bloque className="h-8 w-48" />
        <Bloque className="h-5 w-40" />
      </div>
      <Bloque className="h-72 rounded-[var(--radius-card)]" />
    </Cargando>
  );
}
