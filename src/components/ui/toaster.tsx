"use client";

import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

const ICON = {
  default: <CheckCircle2 className="h-5 w-5 text-success" />,
  success: <CheckCircle2 className="h-5 w-5 text-success" />,
  warning: <AlertTriangle className="h-5 w-5 text-warning" />,
  destructive: <XCircle className="h-5 w-5 text-destructive" />,
} as const;

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const icon = ICON[(variant as keyof typeof ICON) ?? "default"] ?? <Info className="h-5 w-5" />;
        return (
          <Toast key={id} variant={variant} {...props}>
            <span className="mt-0.5 shrink-0">{icon}</span>
            <div className="grid flex-1 gap-0.5">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
