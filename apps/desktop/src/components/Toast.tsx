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
      className="fixed bottom-5 left-1/2 z-[60] flex w-[min(26rem,calc(100%-2rem))] -translate-x-1/2 flex-col gap-2"
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
        "motion-toast-in flex items-center gap-3 rounded-xl border px-3.5 py-3 shadow-lg",
        toast.tone === "error"
          ? "border-red-500/25 bg-red-950/90 text-red-50"
          : toast.tone === "info"
            ? "border-white/10 bg-[#18181b] text-zinc-100"
            : "border-white/10 bg-[#18181b] text-[#FAFAFA]",
      )}
      role="status"
    >
      {toast.tone !== "error" && (
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            toast.action ? "bg-[#7C3AED]/15 text-[#C4B5FD]" : "bg-teal-500/15 text-teal-300",
          )}
        >
          {toast.action ? (
            <IconMount className="h-4 w-4" />
          ) : (
            <IconCheck className="h-4 w-4" />
          )}
        </span>
      )}
      <p className="min-w-0 flex-1 text-sm leading-snug text-zinc-100">{toast.text}</p>
      {toast.action && (
        <button
          type="button"
          className="portal-press portal-cta-primary min-h-8 shrink-0 rounded-lg px-3 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]"
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
