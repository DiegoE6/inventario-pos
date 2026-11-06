import { Pagination as BasePagination } from "@/app/components/pagination";
import type { ProductosQuery } from "@/app/lib/data";

function href(query: ProductosQuery, pagina: number) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.categoria !== null) params.set("categoria", String(query.categoria));
  if (query.inactivos) params.set("inactivos", "1");
  if (pagina > 1) params.set("pagina", String(pagina));
  const qs = params.toString();
  return qs ? `/panel/productos?${qs}` : "/panel/productos";
}

export function Pagination({ query, paginas }: { query: ProductosQuery; paginas: number }) {
  return <BasePagination pagina={query.pagina} paginas={paginas} href={(n) => href(query, n)} />;
}
