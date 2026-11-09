"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ShoppingCart, Store } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Notice } from "@/app/components/notice";
import type { RolDemo } from "@/app/lib/demo";
import { entrarDemo, type DemoState } from "./actions";

const OPCIONES: Record<RolDemo, { label: string; variant: "primary" | "secondary"; Icon: typeof Store }> = {
  dueno: { label: "Entrar al demo como dueño", variant: "primary", Icon: Store },
  cajero: { label: "Entrar al demo como cajero", variant: "secondary", Icon: ShoppingCart },
};

/** Los botones del demo. El navegador solo manda el rol; las credenciales están en el servidor. */
export function DemoButtons({ roles }: { roles: RolDemo[] }) {
  const [state, action] = useActionState<DemoState, FormData>(entrarDemo, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {roles.map((rol) => (
        <DemoButton key={rol} rol={rol} />
      ))}
    </form>
  );
}

function DemoButton({ rol }: { rol: RolDemo }) {
  // Cuál botón mandó el formulario: solo ese muestra "Entrando…".
  const { pending, data } = useFormStatus();
  const { label, variant, Icon } = OPCIONES[rol];
  return (
    <Button
      type="submit"
      name="rol"
      value={rol}
      size="lg"
      variant={variant}
      className="w-full"
      disabled={pending}
      pending={pending && data?.get("rol") === rol}
      pendingLabel="Entrando…"
      icon={<Icon aria-hidden className="size-5" />}
    >
      {label}
    </Button>
  );
}
