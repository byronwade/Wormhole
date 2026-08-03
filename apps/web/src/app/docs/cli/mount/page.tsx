import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsNote,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "wormhole mount — CLI Reference",
  description: "Mount a remote Wormhole share as a local drive.",
};

export default function MountCommandPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "CLI", href: "/docs/cli" }}
        title="wormhole mount"
        description="Mount a remote folder using a join code or host:port."
      />

      <section>
        <h2>Synopsis</h2>
        <DocsCode>{"wormhole mount <CODE|HOST:PORT> [MOUNTPOINT] [OPTIONS]"}</DocsCode>
      </section>

      <section>
        <h2>Examples</h2>
        <DocsCode>{`# Mount with a join code
wormhole mount 7KJM-XBCD-QRST

# Explicit mount point
wormhole mount 7KJM-XBCD-QRST ~/mnt/renders

# Direct host (no signal)
wormhole mount 192.168.1.20:4433 ~/mnt/share`}</DocsCode>
      </section>

      <section>
        <h2>Arguments</h2>
        <DocsTable
          headers={["Argument", "Description"]}
          rows={[
            ["CODE | HOST:PORT", "Join code or direct address"],
            ["MOUNTPOINT", "Optional local path (platform default if omitted)"],
          ]}
        />
      </section>

      <section>
        <h2>Common options</h2>
        <DocsTable
          headers={["Option", "Description"]}
          rows={[
            ["--read-only", "Force read-only mount"],
            ["--data-plane-only", "Skip FUSE; useful in CI/headless"],
            ["--cache-dir <PATH>", "Override disk cache location"],
          ]}
        />
        <DocsNote title="FUSE required">
          Real mounts need macFUSE, WinFSP, or FUSE&nbsp;3. See{" "}
          <Link href="/docs/installation">installation</Link>.
        </DocsNote>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/cli/host">wormhole host</Link>
          </li>
          <li>
            <Link href="/docs/troubleshooting/fuse">FUSE troubleshooting</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
