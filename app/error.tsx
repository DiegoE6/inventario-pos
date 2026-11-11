"use client";

import { ErrorDeSeccion } from "@/app/components/error-seccion";

/** Error fuera del panel (por ejemplo, el login). El layout raíz sigue en pie. */
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <ErrorDeSeccion error={error} retry={retry} seccion="esta página" inicio={{ href: "/", label: "Ir al inicio" }} />
    </main>
  );
}
