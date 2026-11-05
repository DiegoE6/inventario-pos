import type { Metadata } from "next";
import Link from "next/link";
import { House, Package } from "lucide-react";
import { ComingSoon } from "@/app/components/coming-soon";
import { Notice } from "@/app/components/notice";
import { PageHeader } from "@/app/components/page-header";
import { buttonClasses } from "@/app/components/ui/button";
import { verifySession } from "@/app/lib/auth";

export const metadata: Metadata = { title: "Inicio" };

const AVISOS: Record<string, string> = {
  "solo-dueno": "Esa sección es solo para el dueño del negocio.",
};

export default async function InicioPage({ searchParams }: PageProps<"/panel">) {
  const [session, sp] = await Promise.all([verifySession(), searchParams]);
  const aviso = typeof sp.aviso === "string" ? AVISOS[sp.aviso] : undefined;
  const nombre = session.nombre.split(" ")[0];

  return (
    <>
      <PageHeader title={nombre ? `Hola, ${nombre}` : "Inicio"} />
      {aviso ? <Notice tone="danger">{aviso}</Notice> : null}
      <ComingSoon
        icon={House}
        title="Tu negocio de un vistazo"
        description="Ventas y ganancia de hoy, lo más vendido y lo que se está acabando."
      />
      <Link href="/panel/productos" className={buttonClasses({ variant: "secondary", className: "self-start" })}>
        <Package aria-hidden className="size-[18px]" />
        Ver productos
      </Link>
    </>
  );
}
