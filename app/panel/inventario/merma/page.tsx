import type { Metadata } from "next";
import { OperacionPage } from "../_components/operacion-page";

export const metadata: Metadata = { title: "Registrar merma" };

export default function Page({ searchParams }: PageProps<"/panel/inventario/merma">) {
  return <OperacionPage operacion="merma" searchParams={searchParams} />;
}
