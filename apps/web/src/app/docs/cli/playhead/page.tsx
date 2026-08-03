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
  description: "Inspect and apply playhead-first prefetch chunk windows.",
};

export default function PlayheadCliPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "CLI", href: "/docs/cli" }}
        title="wormhole playhead"
        description="Dev helper: print the chunk window for a scrub offset, optionally apply it to the mount."
      />
      <DocsCode>{`wormhole playhead --inode 1 --offset 1310720
wormhole playhead --inode 1 --offset 0 --ahead 5 --behind 2

# Send hint to the local mount (NLE / external apps)
wormhole playhead --inode 1 --offset 1310720 --apply`}</DocsCode>
      <DocsNote>
        Mounts apply scrub seeks automatically. Use <code>--apply</code> to push
        a hint over the playhead IPC socket (or file drop) so an external editor
        can arm prefetch without waiting for the next FUSE read. Without a mount
        listening, the CLI still prints chunk indices and may warn.
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
