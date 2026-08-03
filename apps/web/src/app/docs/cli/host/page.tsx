import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsNote,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "wormhole host — CLI Reference",
  description: "Share a local folder with a join code using wormhole host.",
};

export default function HostCommandPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "CLI", href: "/docs/cli" }}
        title="wormhole host"
        description="Share a local folder. Others mount it with the join code."
      />

      <section>
        <h2>Synopsis</h2>
        <DocsCode>{"wormhole host <PATH> [OPTIONS]"}</DocsCode>
      </section>

      <section>
        <h2>Examples</h2>
        <DocsCode>{`# Share a folder
wormhole host ~/renders

# Bind a specific port
wormhole host ~/renders --port 4433

# LAN-only, skip signaling
wormhole host ~/renders --no-signal`}</DocsCode>
      </section>

      <section>
        <h2>Arguments</h2>
        <DocsTable
          headers={["Argument", "Description"]}
          rows={[["PATH", "Folder to share (absolute or relative)"]]}
        />
      </section>

      <section>
        <h2>Common options</h2>
        <DocsTable
          headers={["Option", "Description"]}
          rows={[
            ["--port <PORT>", "Listen port (default: OS-assigned or config)"],
            ["--no-signal", "Skip signal server; direct/LAN only"],
            ["--name <NAME>", "Friendly host name shown to peers"],
            ["--read-only", "Reject write attempts (default in alpha)"],
          ]}
        />
        <DocsNote>
          Full flags: <Link href="/docs/cli/all-commands">all commands</Link>.
        </DocsNote>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/cli/mount">wormhole mount</Link>
          </li>
          <li>
            <Link href="/docs/cli/status">wormhole status</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
