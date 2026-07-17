"use client";

import { useMemo, type ComponentProps, type ReactNode } from "react";
import { wrapServerAction } from "@/hooks/use-async-action";

type ServerFormAction = (formData: FormData) => void | Promise<void>;

type TimedActionFormProps = Omit<ComponentProps<"form">, "action"> & {
  action: ServerFormAction;
  actionLabel: string;
  children: ReactNode;
};

/**
 * Client form wrapper that races the server action against the shared timeout
 * so useFormStatus / OperationalSubmitButton pending state cannot stick forever.
 */
export function TimedActionForm({ action, actionLabel, children, ...props }: TimedActionFormProps) {
  const timedAction = useMemo(
    () => wrapServerAction(action, { label: actionLabel }),
    [action, actionLabel]
  );

  return (
    <form action={timedAction} {...props}>
      {children}
    </form>
  );
}
