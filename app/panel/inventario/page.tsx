import type { Metadata } from "next";
import { Warehouse } from "lucide-react";
import { ComingSoon } from "@/app/components/coming-soon";
import { PageHeader } from "@/app/components/page-header";
import { verifySession } from "@/app/lib/auth";

export const metadata: Metadata = { title: "Inventario" };

export default async function InventarioPage() {
  await verifySession();
  return (
    <>
      <PageHeader title="Inventario" />
      <ComingSoon
        icon={Warehouse}
        title="Entradas, mermas y conteos"
        description="Registra compras a proveedores, lo que se rompe o se pierde, y ajusta el stock con un conteo físico."
      />
    </>
  );
}
