import type { Metadata } from "next";
import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsLinkGrid,
  DocsNote,
} from "@/components/docs-ui";

export const metadata: Metadata = {
  title: "wormhole playhead",
  description: "Inspect playhead-first prefetch chunk windows.",
};

export default function PlayheadCliPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "CLI", href: "/docs/cli" }}
        title="wormhole playhead"
        description="Dev helper: print the chunk window for a scrub offset."
      />
      <DocsCode>{`wormhole playhead --inode 1 --offset 1310720
wormhole playhead --inode 1 --offset 0 --ahead 5 --behind 2`}</DocsCode>
      <DocsNote>
        Mounts apply this automatically on large seeks. You do not need the CLI
        for normal editing—use it to verify governor behavior.
      </DocsNote>
      <DocsLinkGrid
        items={[
          {
            href: "/docs/features",
            title: "Playhead-first",
            description: "Feature overview",
          },
          {
            href: "/docs/architecture/caching",
            title: "Caching",
            description: "Prefetch + cache layers",
          },
        ]}
      />
      <p className="docs-footer-nav">
        <Link href="/docs/cli">← All CLI commands</Link>
      </p>
    </DocsArticle>
  );
}
