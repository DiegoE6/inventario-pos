import type { Metadata } from "next";
import { OperacionPage } from "../_components/operacion-page";

export const metadata: Metadata = { title: "Registrar entrada" };

export default function Page({ searchParams }: PageProps<"/panel/inventario/entrada">) {
  return <OperacionPage operacion="entrada" searchParams={searchParams} />;
}
