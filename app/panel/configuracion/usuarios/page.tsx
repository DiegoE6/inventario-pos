import type { Metadata } from "next";
import { Notice } from "@/app/components/notice";
import { PageHeader } from "@/app/components/page-header";
import { requireDueno } from "@/app/lib/auth";
import { demoActivo } from "@/app/lib/demo";
import { dbErrorMessage } from "@/app/lib/errors";
import { adminDisponible } from "@/app/lib/supabase/admin";
import { createClient } from "@/app/lib/supabase/server";
import { NuevoUsuario } from "./_components/nuevo-usuario";
import { UsuarioRow, type Usuario } from "./_components/usuario-row";

export const metadata: Metadata = { title: "Usuarios" };

export default async function UsuariosPage() {
  const session = await requireDueno();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("usuarios");
  const usuarios = (data ?? []) as Usuario[];

  const demo = demoActivo();
  // En el demo nunca se crea nada (ni se mira si hay secret key).
  const motivoSinAlta = demo
    ? "En el demo no se pueden crear usuarios. En tu sistema, aquí das de alta a tus cajeros."
    : adminDisponible()
      ? null
      : "Para crear usuarios falta configurar SUPABASE_SECRET_KEY en el servidor (Vercel).";

  const activos = usuarios.filter((u) => u.activo);
  const inactivos = usuarios.filter((u) => !u.activo);

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="El dueño puede todo. El cajero vende y consulta productos, sin costos, reportes ni configuración."
        back={{ href: "/panel/configuracion", label: "Configuración" }}
      />

      <NuevoUsuario motivoSinAlta={motivoSinAlta} />

      {error ? <Notice tone="danger">{dbErrorMessage(error)}</Notice> : null}

      <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
        {activos.map((u) => (
          <UsuarioRow key={u.id} usuario={u} esYo={u.id === session.userId} />
        ))}
      </ul>

      {inactivos.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-muted">Desactivados</h2>
          <p className="-mt-1 text-sm text-muted">No pueden entrar. Si tenían la sesión abierta, se cierra en su siguiente clic.</p>
          <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
            {inactivos.map((u) => (
              <UsuarioRow key={u.id} usuario={u} esYo={u.id === session.userId} />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
