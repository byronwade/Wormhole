import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Construction, ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Docker - Wormhole Docs",
  description: "Documentation for Docker in Wormhole.",
};

export default function DockerPage() {
  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/docs/self-hosting" className="hover:text-foreground">Self Hosting</Link>
        <span>/</span>
        <span className="text-muted-foreground">Docker</span>
      </div>

      {/* Header */}
      <div className="space-y-4">
        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40">
          Coming Soon
        </Badge>
        <h1 className="text-4xl font-bold text-foreground tracking-tight">
          Docker
        </h1>
        <p className="text-xl text-muted-foreground">
          This documentation page is currently being written.
        </p>
      </div>

      {/* Coming Soon Card */}
      <Card className="bg-card/50 border-border">
        <CardContent className="p-8 text-center">
          <Construction className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Under Construction</h2>
          <p className="text-muted-foreground max-w-md mx-auto mb-6">
            We&apos;re working on comprehensive documentation for this feature. 
            Check back soon or contribute to our docs on GitHub.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/docs/self-hosting"
              className="inline-flex items-center gap-2 text-sm text-wormhole-hunter-light hover:underline"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Self Hosting
            </Link>
            <a
              href="https://github.com/byronwade/wormhole/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Request this doc
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
