import type { Metadata } from "next";
import { OperacionPage } from "../_components/operacion-page";

export const metadata: Metadata = { title: "Conteo físico" };

export default function Page({ searchParams }: PageProps<"/panel/inventario/conteo">) {
  return <OperacionPage operacion="conteo" searchParams={searchParams} />;
}
