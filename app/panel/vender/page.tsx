import type { Metadata } from "next";
import { ShoppingCart } from "lucide-react";
import { ComingSoon } from "@/app/components/coming-soon";
import { PageHeader } from "@/app/components/page-header";
import { verifySession } from "@/app/lib/auth";

export const metadata: Metadata = { title: "Vender" };

export default async function VenderPage() {
  await verifySession();
  return (
    <>
      <PageHeader title="Vender" />
      <ComingSoon
        icon={ShoppingCart}
        title="Punto de venta"
        description="Busca o escanea productos, cobra en efectivo, tarjeta o transferencia e imprime el ticket."
      />
    </>
  );
}
