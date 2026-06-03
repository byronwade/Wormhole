import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Construction, ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Messages - Wormhole Docs",
  description: "Documentation for Messages in Wormhole.",
};

export default function MessagesPage() {
  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/docs/api" className="hover:text-white">Api</Link>
        <span>/</span>
        <span className="text-zinc-400">Messages</span>
      </div>

      {/* Header */}
      <div className="space-y-4">
        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40">
          Coming Soon
        </Badge>
        <h1 className="text-4xl font-bold text-white tracking-tight">
          Messages
        </h1>
        <p className="text-xl text-zinc-400">
          This documentation page is currently being written.
        </p>
      </div>

      {/* Coming Soon Card */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardContent className="p-8 text-center">
          <Construction className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Under Construction</h2>
          <p className="text-zinc-400 max-w-md mx-auto mb-6">
            We&apos;re working on comprehensive documentation for this feature. 
            Check back soon or contribute to our docs on GitHub.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/docs/api"
              className="inline-flex items-center gap-2 text-sm text-wormhole-hunter-light hover:underline"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Api
            </Link>
            <a
              href="https://github.com/byronwade/wormhole/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
            >
              Request this doc
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
