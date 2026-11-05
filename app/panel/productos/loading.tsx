/** Esqueleto de la lista mientras carga la primera vez. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Cargando productos" className="flex flex-col gap-6">
      <div className="h-8 w-40 animate-pulse rounded-md bg-surface-muted motion-reduce:animate-none" />
      <div className="h-11 animate-pulse rounded-[var(--radius-control)] bg-surface-muted motion-reduce:animate-none" />
      <ul className="flex flex-col gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <li
            key={i}
            className="h-[92px] animate-pulse rounded-[var(--radius-card)] border border-border bg-surface motion-reduce:animate-none"
          />
        ))}
      </ul>
    </div>
  );
}
