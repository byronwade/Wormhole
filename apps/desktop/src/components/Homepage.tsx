import { Upload, Download, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HomepageProps {
  onOpenShareDialog: () => void;
  onOpenConnectDialog: () => void;
}

export function Homepage({ onOpenShareDialog, onOpenConnectDialog }: HomepageProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-zinc-950 px-8">
      {/* Icon */}
      <div className="w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6">
        <FolderOpen className="w-10 h-10 text-zinc-600" />
      </div>

      {/* Title */}
      <h1 className="text-xl font-medium text-white mb-2">
        No active shares
      </h1>

      {/* Subtitle */}
      <p className="text-sm text-zinc-500 text-center max-w-xs mb-8">
        Share a folder to let others access your files, or connect with a code to browse someone else's.
      </p>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button
          onClick={onOpenShareDialog}
          className="bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          <Upload className="w-4 h-4 mr-2" />
          Share Folder
        </Button>
        <Button
          onClick={onOpenConnectDialog}
          variant="outline"
          className="border-zinc-700 hover:border-zinc-600 hover:bg-zinc-900 text-zinc-300"
        >
          <Download className="w-4 h-4 mr-2" />
          Connect
        </Button>
      </div>
    </div>
  );
}

export default Homepage;
