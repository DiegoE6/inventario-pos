"use client";

import { useActionState } from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Field, Input } from "@/app/components/ui/field";
import { iniciarSesion, type LoginState } from "./actions";

export function LoginForm({ notice, next }: { notice?: string; next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(iniciarSesion, {});
  const error = state.error ?? (state.fieldErrors ? undefined : notice);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {/* El servidor lo vuelve a validar con safeNext. */}
      <input type="hidden" name="next" value={next} />
      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[var(--radius-control)] bg-danger-soft px-3 py-2.5 text-sm text-danger"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      <Field id="email" label="Correo" error={state.fieldErrors?.email}>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={state.email}
          invalid={Boolean(state.fieldErrors?.email)}
          describedBy={state.fieldErrors?.email ? "error" : undefined}
          required
        />
      </Field>

      <Field id="password" label="Contraseña" error={state.fieldErrors?.password}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          invalid={Boolean(state.fieldErrors?.password)}
          describedBy={state.fieldErrors?.password ? "error" : undefined}
          required
        />
      </Field>

      <Button type="submit" size="lg" className="mt-2 w-full" pending={pending} pendingLabel="Entrando…">
        Entrar
      </Button>
    </form>
  );
}
