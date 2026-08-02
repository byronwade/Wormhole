import { Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HomepageProps {
  onOpenShareDialog: () => void;
  onOpenConnectDialog: () => void;
}

/**
 * First-run / empty composition: brand + one job + two CTAs.
 */
export function Homepage({ onOpenShareDialog, onOpenConnectDialog }: HomepageProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden px-8">
      {/* Atmosphere — not flat void */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(124,58,237,0.28), transparent 55%), radial-gradient(ellipse 60% 40% at 80% 80%, rgba(20,184,166,0.08), transparent 50%), #0F0F0F",
        }}
      />

      <div className="relative z-10 flex flex-col items-center max-w-md w-full text-center motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
        <p className="font-mono text-xs tracking-[0.35em] uppercase text-[#7C3AED] mb-4">
          Wormhole
        </p>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-[#FAFAFA] mb-3">
          Mount Any Folder.
        </h1>
        <p className="text-base text-zinc-400 mb-10 leading-relaxed">
          Share a code. Connect. Files appear like a local drive — no upload wait.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Button
            onClick={onOpenShareDialog}
            className="min-h-12 px-8 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-base"
          >
            <Upload className="w-4 h-4 mr-2" aria-hidden />
            Share a folder
          </Button>
          <Button
            onClick={onOpenConnectDialog}
            variant="outline"
            className="min-h-12 px-8 border-zinc-600 hover:border-[#7C3AED]/50 hover:bg-zinc-900/80 text-zinc-100 text-base"
          >
            <Download className="w-4 h-4 mr-2" aria-hidden />
            Enter a code
          </Button>
        </div>

        <p className="mt-8 text-xs text-zinc-600">
          Tip: paste a join code — we auto-mount under ~/Wormhole
        </p>
      </div>
    </div>
  );
}

export default Homepage;
