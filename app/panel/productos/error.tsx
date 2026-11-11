"use client";

import { ErrorDeSeccion } from "@/app/components/error-seccion";

/** Error al cargar Productos: mensaje en español y Reintentar (Next 16: `retry`). */
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorDeSeccion error={error} retry={retry} seccion="los productos" />;
}
