import type { Metadata } from "next";
import { PageHeader } from "@/app/components/page-header";
import { requireDueno } from "@/app/lib/auth";
import { logoSrc } from "@/app/lib/brand";
import { getConfiguracion } from "@/app/lib/data";
import { demoActivo } from "@/app/lib/demo";
import { env } from "@/app/lib/env";
import { AvisoDemo, NegocioForm } from "./_components/negocio-form";

export const metadata: Metadata = { title: "Negocio y marca" };

export default async function NegocioPage() {
  await requireDueno();
  const config = await getConfiguracion();

  return (
    <>
      <PageHeader
        title="Negocio y marca"
        description="El nombre, el color y el logo cambian todo el sistema: el panel, el login y el ticket."
        back={{ href: "/panel/configuracion", label: "Configuración" }}
      />
      {demoActivo() ? <AvisoDemo /> : null}
      <NegocioForm config={config} logoActual={logoSrc(config.logo_url, env.supabaseUrl)} />
    </>
  );
}
