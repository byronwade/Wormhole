import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsNote,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "wormhole sync — CLI Reference",
  description: "Bidirectional sync status, conflicts, and manual flush (Phase 7+).",
};

export default function SyncCommandPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "CLI", href: "/docs/cli" }}
        title="wormhole sync"
        description="Inspect and control write-back sync for writable mounts. Phase&nbsp;7+; alpha may be incomplete."
      />

      <DocsNote title="Availability">
        Read-only mounts need no sync. Writable shares must opt in on the host.
      </DocsNote>

      <section>
        <h2>Subcommands</h2>
        <DocsTable
          headers={["Command", "Description"]}
          rows={[
            ["sync status [SHARE]", "Pending files and conflicts"],
            ["sync now [SHARE]", "Force synchronization"],
            ["sync pause / resume", "Pause or resume"],
            ["sync conflicts [SHARE]", "List conflicts"],
            ["sync resolve <ID> <STRATEGY>", "local | remote | both | merge"],
            ["sync reset [SHARE]", "Reset sync state"],
            ["sync log [SHARE]", "Recent sync history"],
          ]}
        />
      </section>

      <section>
        <h2>Examples</h2>
        <DocsCode>{`wormhole sync status
wormhole sync status project-files --pending
wormhole sync now --wait
wormhole sync conflicts shared-media
wormhole sync resolve 1 local
wormhole sync log project-files --limit 10`}</DocsCode>
      </section>

      <section>
        <h2>Mount sync modes</h2>
        <DocsCode>{`# Automatic (default when writable)
wormhole mount WORM-XXXX --allow-write

# Manual — only on 'sync now'
wormhole mount WORM-XXXX --allow-write --sync-mode manual

# Periodic
wormhole mount WORM-XXXX --allow-write --sync-interval 5`}</DocsCode>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/cli/all-commands">All commands</Link>
          </li>
          <li>
            <Link href="/docs/cli/mount">wormhole mount</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
