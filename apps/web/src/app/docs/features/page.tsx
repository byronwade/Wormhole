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
  title: "Features — Playhead, aperture, byte magnets",
  description:
    "Playhead-first prefetch, project apertures, and BLAKE3 byte magnets—Wormhole’s live project mesh for editors and developers.",
};

export default function FeaturesPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "Docs", href: "/docs" }}
        title="Project mesh features"
        description="Wormhole is not a sync folder. It’s a live project mesh—scrub, open, and pull bytes by hash."
      />

      <section>
        <h2>Playhead-first media</h2>
        <p>
          Timeline scrubbing is a seek, not a sequential read. When the governor
          sees a jump, it prefetches a window around the landing offset—playhead
          chunk first, then ahead and a little behind—so editors can scrub
          before the whole file is local.
        </p>
        <DocsCode>{`# Inspect the prefetch window for a scrub (dev)
wormhole playhead --inode 1 --offset 1310720

# Push a hint to the local mount (NLE IPC)
wormhole playhead --inode 1 --offset 1310720 --apply`}</DocsCode>
        <DocsNote title="Automatic on mounts">
          FUSE and multi-share mounts call this path on large seeks, and also
          drain external playhead IPC hints on read. Sequential reads still use
          classic ahead-of-head prefetch once streaming resumes.
        </DocsNote>
      </section>

      <section>
        <h2>Project aperture</h2>
        <p>
          A project is a <code>.wormhole/aperture.toml</code>: roots, excludes,
          playhead prefetch, and content-addressed hosting. Share the job, not a
          random folder dump.
        </p>
        <DocsCode>{`wormhole init .
# writes .wormhole/config.toml + aperture.toml

wormhole open .
# validates the aperture and prints the mesh policy`}</DocsCode>
      </section>

      <section>
        <h2>Byte magnet + peer mesh</h2>
        <p>
          Chunks are BLAKE3-addressed. Hosts seed a local content store on read
          (and via manifests), then serve <code>BulkChunk</code> by hash. Magnets
          look like:
        </p>
        <DocsCode>{`wormhole:magnet:blake3:<64-hex>

# Local check
wormhole fetch --check blake3:<64-hex>

# Pull from a peer or the registered mesh
wormhole peers add 192.168.1.10:4433 --name studio
wormhole fetch --from 192.168.1.10 blake3:<64-hex>
wormhole fetch blake3:<64-hex>`}</DocsCode>
        <p>
          Same hash means the same bytes—any peer that has already cached a
          chunk can become a source. That’s the mesh.
        </p>
      </section>

      <DocsLinkGrid
        items={[
          {
            href: "/docs/architecture/caching",
            title: "Caching",
            description: "RAM, disk, and content store layers",
          },
          {
            href: "/docs/cli",
            title: "CLI",
            description: "host, mount, open, fetch, playhead, peers",
          },
          {
            href: "/docs/quickstart",
            title: "Quick start",
            description: "First share in minutes",
          },
        ]}
      />

      <p className="docs-footer-nav">
        <Link href="/docs">← Documentation</Link>
      </p>
    </DocsArticle>
  );
}
