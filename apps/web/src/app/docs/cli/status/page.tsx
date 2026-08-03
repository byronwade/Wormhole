import Link from "next/link";
import { DocsArticle, DocsCode, DocsHeader } from "@/components/docs-ui";

export const metadata = {
  title: "wormhole status — CLI Reference",
  description: "Show active Wormhole hosts, mounts, and connection health.",
};

export default function StatusCommandPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "CLI", href: "/docs/cli" }}
        title="wormhole status"
        description="List active sessions and basic throughput."
      />
      <section>
        <h2>Synopsis</h2>
        <DocsCode>wormhole status [--json]</DocsCode>
      </section>
      <section>
        <h2>Examples</h2>
        <DocsCode>{`wormhole status
wormhole status --json`}</DocsCode>
        <p>
          When the control plane is running (<code>wormhole-ctl serve</code>), status
          can include sessions managed outside the classic CLI. See{" "}
          <Link href="/docs/cli">CLI overview</Link>.
        </p>
      </section>
    </DocsArticle>
  );
}
