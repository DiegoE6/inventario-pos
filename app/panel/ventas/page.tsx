import type { Metadata } from "next";
import { Receipt } from "lucide-react";
import { ComingSoon } from "@/app/components/coming-soon";
import { PageHeader } from "@/app/components/page-header";
import { verifySession } from "@/app/lib/auth";

export const metadata: Metadata = { title: "Ventas" };

export default async function VentasPage() {
  await verifySession();
  return (
    <>
      <PageHeader title="Ventas" />
      <ComingSoon
        icon={Receipt}
        title="Historial de ventas"
        description="Consulta cada venta con su folio, reimprime el ticket y, si eres el dueño, cancela con motivo."
      />
    </>
  );
}
