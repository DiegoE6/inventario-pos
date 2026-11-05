"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/app/components/ui/button";

/** Botón de envío que se pone en "pending" mientras el formulario padre se envía. */
export function SubmitButton(props: Omit<ComponentProps<typeof Button>, "type" | "pending">) {
  const { pending } = useFormStatus();
  return <Button type="submit" pending={pending} {...props} />;
}
