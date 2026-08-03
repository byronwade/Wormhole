import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsNote,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "All Commands — Wormhole Docs",
  description: "Cheat sheet of Wormhole CLI commands and global flags.",
};

export default function AllCommandsPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "CLI", href: "/docs/cli" }}
        title="All commands"
        description="Quick reference. Prefer the per-command pages for examples."
      />

      <section>
        <h2>Core</h2>
        <DocsTable
          headers={["Command", "Purpose"]}
          rows={[
            [
              <Link key="h" href="/docs/cli/host">
                wormhole host
              </Link>,
              "Share a folder; print join code",
            ],
            [
              <Link key="m" href="/docs/cli/mount">
                wormhole mount
              </Link>,
              "Mount by code or host:port",
            ],
            [
              <Link key="s" href="/docs/cli/status">
                wormhole status
              </Link>,
              "List shares/mounts",
            ],
            ["wormhole unmount", "Unmount one or all mounts"],
          ]}
        />
      </section>

      <section>
        <h2>host / mount (common flags)</h2>
        <DocsCode>{`wormhole host <PATH> [--port PORT] [--no-signal] [--name NAME] [--read-only]
wormhole mount <CODE|HOST:PORT> [MOUNTPOINT] [--read-only] [--cache-dir PATH]`}</DocsCode>
      </section>

      <section>
        <h2>Cache, config, peers</h2>
        <DocsTable
          headers={["Command", "Purpose"]}
          rows={[
            [
              <Link key="c" href="/docs/cli/cache">
                wormhole cache
              </Link>,
              "stats / clear / path",
            ],
            [
              <Link key="cfg" href="/docs/cli/config">
                wormhole config
              </Link>,
              "show / get / set / edit",
            ],
            [
              <Link key="p" href="/docs/cli/peers">
                wormhole peers
              </Link>,
              "list / trust / block",
            ],
          ]}
        />
      </section>

      <section>
        <h2>Sync (Phase 7+)</h2>
        <DocsCode>{`wormhole sync status|now|pause|resume|conflicts|resolve|reset|log`}</DocsCode>
        <p>
          Details: <Link href="/docs/cli/sync">wormhole sync</Link>.
        </p>
      </section>

      <section>
        <h2>Signal</h2>
        <DocsCode>{`wormhole signal [--port 8080] [--db PATH] [--rate-limit] [--metrics]`}</DocsCode>
        <p>
          Details: <Link href="/docs/cli/signal">wormhole signal</Link>.
        </p>
      </section>

      <section>
        <h2>Utilities</h2>
        <DocsCode>{`wormhole ping <TARGET>
wormhole bench <TARGET> [--test all|read|latency|metadata] [--format json]
wormhole doctor
wormhole logs`}</DocsCode>
      </section>

      <section>
        <h2>Global options</h2>
        <DocsTable
          headers={["Flag", "Description"]}
          rows={[
            ["-v / -vv / -vvv", "Verbosity"],
            ["-q, --quiet", "Errors only"],
            ["--format text|json|yaml", "Output format"],
            ["--config <PATH>", "Config file override"],
            ["--no-color", "Disable ANSI color"],
            ["-h / -V", "Help / version"],
          ]}
        />
        <DocsNote>
          Not every flag is implemented in every alpha build — check{" "}
          <code>wormhole &lt;cmd&gt; --help</code>.
        </DocsNote>
      </section>
    </DocsArticle>
  );
}
