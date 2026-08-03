import type { Metadata } from "next";
import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsLinkGrid,
} from "@/components/docs-ui";

export const metadata: Metadata = {
  title: "wormhole open",
  description: "Validate and inspect a Wormhole project aperture.",
};

export default function OpenCliPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "CLI", href: "/docs/cli" }}
        title="wormhole open"
        description="Load .wormhole/aperture.toml and print the project mesh policy."
      />
      <DocsCode>{`wormhole open
wormhole open ~/job-042`}</DocsCode>
      <section>
        <h2>What it checks</h2>
        <ul>
          <li>Aperture exists (run <code>wormhole init</code> first)</li>
          <li>Roots are non-empty and do not contain <code>..</code></li>
          <li>Playhead prefetch and content-addressed flags</li>
        </ul>
      </section>
      <DocsLinkGrid
        items={[
          {
            href: "/docs/features",
            title: "Revolutionary features",
            description: "Why apertures exist",
          },
          {
            href: "/docs/cli/fetch",
            title: "fetch",
            description: "Byte magnets",
          },
        ]}
      />
      <p className="docs-footer-nav">
        <Link href="/docs/cli">← All CLI commands</Link>
      </p>
    </DocsArticle>
  );
}
