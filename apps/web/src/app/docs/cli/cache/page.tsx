import Link from "next/link";
import { DocsArticle, DocsCode, DocsHeader, DocsTable } from "@/components/docs-ui";

export const metadata = {
  title: "wormhole cache — CLI Reference",
  description: "Inspect and clear the Wormhole disk cache.",
};

export default function CacheCommandPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "CLI", href: "/docs/cli" }}
        title="wormhole cache"
        description="Inspect or clear locally cached chunks."
      />
      <section>
        <h2>Subcommands</h2>
        <DocsTable
          headers={["Command", "Description"]}
          rows={[
            ["cache stats", "Show size and hit metrics"],
            ["cache clear", "Delete cached chunks"],
          ]}
        />
      </section>
      <section>
        <h2>Examples</h2>
        <DocsCode>{`wormhole cache stats
wormhole cache clear`}</DocsCode>
        <p>
          Cache location defaults under your platform data/cache dir. Tuning notes:{" "}
          <Link href="/docs/performance/cache">performance → cache</Link>.
        </p>
      </section>
    </DocsArticle>
  );
}
