import type { Metadata } from "next";
import { ChartColumn } from "lucide-react";
import { ComingSoon } from "@/app/components/coming-soon";
import { PageHeader } from "@/app/components/page-header";
import { requireDueno } from "@/app/lib/auth";

export const metadata: Metadata = { title: "Reportes" };

export default async function ReportesPage() {
  await requireDueno();
  return (
    <>
      <PageHeader title="Reportes" />
      <ComingSoon
        icon={ChartColumn}
        title="Ventas, costo y ganancia"
        description="Elige un rango de fechas y ve qué se vendió, cuánto ganaste y qué no se mueve. Exporta a Excel."
      />
    </>
  );
}
