import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsNote,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "FUSE Troubleshooting — Wormhole Docs",
  description: "Fix macFUSE, WinFSP, and Linux FUSE mount failures.",
};

export default function TroubleshootingFusePage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "Troubleshooting", href: "/docs/troubleshooting" }}
        title="FUSE issues"
        description="Most mount failures are missing drivers, permissions, or a busy mountpoint."
      />

      <section>
        <h2>Quick checks</h2>
        <DocsCode>{`wormhole doctor
# macOS: confirm macFUSE is allowed in System Settings → Privacy & Security
# Linux: ls -l /dev/fuse ; groups | grep fuse
# Windows: confirm WinFSP is installed`}</DocsCode>
      </section>

      <section>
        <h2>Symptoms</h2>
        <DocsTable
          headers={["Symptom", "Likely cause"]}
          rows={[
            ["“FUSE not available”", "Driver missing or not loaded"],
            ["Permission denied on mount", "User not in fuse group / SIP / approval"],
            ["Mount point busy", "Stale mount; unmount first"],
            ["Empty or frozen Finder/Explorer", "getattr storm / network hang"],
          ]}
        />
        <DocsCode>{`wormhole unmount ~/mnt
# Linux stale mount
fusermount3 -u ~/mnt`}</DocsCode>
        <DocsNote>
          Installation: <Link href="/docs/installation">install guide</Link>. Architecture:{" "}
          <Link href="/docs/architecture/fuse">FUSE</Link>.
        </DocsNote>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/cli/mount">wormhole mount</Link>
          </li>
          <li>
            <Link href="/docs/troubleshooting/help">Getting help</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
