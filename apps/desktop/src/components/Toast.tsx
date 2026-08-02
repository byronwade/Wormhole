import { useEffect } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToastMessage {
  id: string;
  text: string;
  tone?: "success" | "info" | "error";
}

interface ToastStackProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

/**
 * Polite toast stack for post-mount and status feedback.
 */
export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-5 left-1/2 z-[60] flex w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 flex-col gap-2"
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
  useEffect(() => {
    const t = window.setTimeout(onDismiss, 4200);
    return () => window.clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className={cn(
        "motion-peer-in flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-md",
        toast.tone === "error"
          ? "border-red-500/30 bg-red-950/80 text-red-100"
          : toast.tone === "info"
            ? "border-zinc-700 bg-zinc-900/90 text-zinc-100"
            : "border-teal-500/30 bg-[#0F0F0F]/95 text-[#FAFAFA]",
      )}
      role="status"
    >
      {toast.tone !== "error" && (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/15 text-teal-400">
          <Check className="h-4 w-4" aria-hidden />
        </span>
      )}
      <p className="min-w-0 flex-1 text-sm font-medium">{toast.text}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
