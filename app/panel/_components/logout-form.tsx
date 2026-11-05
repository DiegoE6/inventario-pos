import { LogOut } from "lucide-react";
import { SubmitButton } from "@/app/components/ui/submit-button";
import { cerrarSesion } from "@/app/login/actions";

/** Cerrar sesión con POST (Server Action), no con un enlace GET. */
export function LogoutForm({ className = "" }: { className?: string }) {
  return (
    <form action={cerrarSesion}>
      <SubmitButton
        variant="ghost"
        className={`w-full justify-start ${className}`}
        icon={<LogOut aria-hidden className="size-5" />}
        pendingLabel="Saliendo…"
      >
        Cerrar sesión
      </SubmitButton>
    </form>
  );
}
