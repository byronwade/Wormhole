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
  title: "wormhole fetch",
  description: "Resolve a content magnet locally or from the peer mesh.",
};

export default function FetchCliPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "CLI", href: "/docs/cli" }}
        title="wormhole fetch"
        description="Look up a blake3 / wormhole:magnet chunk in the local store, or pull it from a peer."
      />
      <DocsCode>{`wormhole fetch blake3:<64-hex>
wormhole fetch wormhole:magnet:blake3:<64-hex>
wormhole fetch --check blake3:<64-hex>

# Remote / mesh
wormhole fetch --from 192.168.1.10:4433 blake3:<64-hex>
wormhole fetch --from studio-render   # default port 4433
wormhole peers add 192.168.1.10:4433 --name studio
wormhole fetch blake3:<64-hex>        # tries registered peers`}</DocsCode>
      <DocsNote>
        Missing chunks exit non-zero. With <code>--from</code>, Wormhole opens a
        QUIC stream and requests <code>BulkChunk</code> by hash. Without{" "}
        <code>--from</code>, registered mesh peers (see{" "}
        <Link href="/docs/cli/peers">peers</Link>) are tried after the local
        store. Successful remote fetches are verified and stored locally.
      </DocsNote>
      <DocsLinkGrid
        items={[
          {
            href: "/docs/features",
            title: "Byte magnets",
            description: "How CAS serving works",
          },
          {
            href: "/docs/cli/peers",
            title: "peers",
            description: "Mesh peer registry",
          },
          {
            href: "/docs/architecture/caching",
            title: "Caching",
            description: "Content store layer",
          },
        ]}
      />
      <p className="docs-footer-nav">
        <Link href="/docs/cli">← All CLI commands</Link>
      </p>
    </DocsArticle>
  );
}
