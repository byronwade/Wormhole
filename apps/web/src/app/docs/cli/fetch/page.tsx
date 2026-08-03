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
  description: "Resolve a content magnet against the local BLAKE3 store.",
};

export default function FetchCliPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "CLI", href: "/docs/cli" }}
        title="wormhole fetch"
        description="Look up a blake3 / wormhole:magnet chunk in the local content store."
      />
      <DocsCode>{`wormhole fetch blake3:<64-hex>
wormhole fetch wormhole:magnet:blake3:<64-hex>
wormhole fetch --check blake3:<64-hex>`}</DocsCode>
      <DocsNote>
        Missing chunks exit non-zero so scripts can detect absence. Remote{" "}
        <code>--from</code> fetch is reserved for the mesh path.
      </DocsNote>
      <DocsLinkGrid
        items={[
          {
            href: "/docs/features",
            title: "Byte magnets",
            description: "How CAS serving works",
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
