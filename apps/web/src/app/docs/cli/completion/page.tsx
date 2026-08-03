import type { Metadata } from "next";
import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsLinkGrid,
} from "@/components/docs-ui";

export const metadata: Metadata = {
  title: "wormhole completion",
  description: "Generate shell completions for Wormhole.",
};

export default function CompletionPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumbs={[
          { href: "/docs", label: "Docs" },
          { href: "/docs/cli", label: "CLI" },
          { label: "completion" },
        ]}
        title="wormhole completion"
        lead="Tab-complete host, mount, and the rest of the CLI."
      />

      <DocsCode>{`# bash
wormhole completion bash > /etc/bash_completion.d/wormhole

# zsh
wormhole completion zsh > "\${fpath[1]}/_wormhole"

# fish
wormhole completion fish > ~/.config/fish/completions/wormhole.fish`}</DocsCode>

      <DocsLinkGrid
        items={[
          { href: "/docs/cli", title: "CLI index", desc: "All commands" },
          { href: "/docs/installation", title: "Installation", desc: "Get the binary" },
          { href: "/docs/quickstart", title: "Quickstart", desc: "First share" },
        ]}
      />

      <p className="docs-footer-nav">
        <Link href="/docs/cli">← All CLI commands</Link>
      </p>
    </DocsArticle>
  );
}
