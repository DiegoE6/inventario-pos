// Página temporal de la Fase 0. Se reemplaza en la Fase 2 (login y panel).
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">
        LT
      </span>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Ferretería La Tuerca
      </h1>
      <p className="max-w-sm text-balance text-muted">
        Inventario y punto de venta. Muy pronto aquí.
      </p>
    </main>
  );
}
