import { useEffect } from "react";
import { IconCheck, IconClose, IconMount } from "@/components/icons";
import { cn } from "@/lib/utils";

export interface ToastMessage {
  id: string;
  text: string;
  tone?: "success" | "info" | "error";
  action?: {
    label: string;
    onClick: () => void;
  };
  durationMs?: number;
}

interface ToastStackProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-6 left-1/2 z-[60] flex w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 flex-col gap-2.5"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: () => void }) {
  const duration = toast.durationMs ?? (toast.action ? 12_000 : 4_400);

  useEffect(() => {
    const t = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(t);
  }, [onDismiss, duration]);

  return (
    <div
      className={cn(
        "motion-toast-in flex items-center gap-3 rounded-2xl border px-4 py-3.5 shadow-2xl backdrop-blur-xl",
        toast.tone === "error"
          ? "border-red-500/25 bg-red-950/85 text-red-50"
          : toast.tone === "info"
            ? "border-white/10 bg-[#121214]/92 text-zinc-100"
            : "border-teal-500/25 bg-[#0B0B0C]/92 text-[#FAFAFA] shadow-[0_20px_50px_-20px_rgba(20,184,166,0.35)]",
      )}
      role="status"
    >
      {toast.tone !== "error" && (
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full",
            toast.action ? "bg-[#7C3AED]/20 text-[#C4B5FD]" : "bg-teal-500/15 text-teal-300",
          )}
        >
          {toast.action ? (
            <IconMount className="h-4 w-4" />
          ) : (
            <IconCheck className="h-4 w-4" />
          )}
        </span>
      )}
      <p className="min-w-0 flex-1 text-sm font-medium leading-snug tracking-tight">
        {toast.text}
      </p>
      {toast.action && (
        <button
          type="button"
          className="portal-press portal-cta-primary min-h-9 shrink-0 rounded-xl px-3.5 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA]"
          onClick={() => {
            toast.action?.onClick();
            onDismiss();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="portal-press flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]"
        aria-label="Dismiss"
      >
        <IconClose className="h-4 w-4" />
      </button>
    </div>
  );
}
