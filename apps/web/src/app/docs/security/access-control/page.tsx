import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsNote,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "Access Control — Wormhole Docs",
  description: "Who can mount a share, path sanitization, and read-only defaults.",
};

export default function AccessControlPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "Security", href: "/docs/security" }}
        title="Access control"
        description="Join codes gate who connects. Path checks keep shares inside the chosen root."
      />

      <section>
        <h2>Who can connect</h2>
        <ul>
          <li>Anyone with a valid, unexpired join code can attempt a mount.</li>
          <li>PAKE proves knowledge of the code; the code is not sent as a password.</li>
          <li>Hosts can limit concurrent peers via config (<code>max_connections</code>).</li>
        </ul>
        <DocsNote title="Alpha default">
          Shares are read-only unless you explicitly enable writes. Prefer{" "}
          <code>--read-only</code> / <code>writable = false</code> for production
          alpha use.
        </DocsNote>
      </section>

      <section>
        <h2>Share root</h2>
        <p>
          The host picks one folder. Clients only see paths under that root.
          Network-supplied relative paths are sanitized before any filesystem
          access.
        </p>
        <DocsCode>{`# Reject .. and absolute paths; canonicalize; require prefix under root
fn safe_path(root: &Path, relative: &str) -> Option<PathBuf> {
    if relative.contains("..") || relative.starts_with('/') {
        return None;
    }
    let full = root.join(relative).canonicalize().ok()?;
    full.starts_with(root.canonicalize().ok()?).then_some(full)
}`}</DocsCode>
      </section>

      <section>
        <h2>Symlinks</h2>
        <p>
          Directory scanning does not follow symlinks out of the share. Escaping
          the root via symlink targets is rejected by the same containment check.
        </p>
      </section>

      <section>
        <h2>Modes</h2>
        <DocsTable
          headers={["Mode", "Behavior"]}
          rows={[
            ["Read-only (default)", "Rejects write/create/rename/remove from clients"],
            ["Writable (opt-in)", "Allows writes when the host enables them (Phase 7+)"],
            ["LAN / --no-signal", "No public rendezvous; peers need a direct address"],
          ]}
        />
      </section>

      <section>
        <h2>Practical tips</h2>
        <ul>
          <li>Share the smallest folder that still works for collaborators.</li>
          <li>Rotate join codes when a session ends or a code may have leaked.</li>
          <li>
            Self-host the{" "}
            <Link href="/docs/self-hosting">signal server</Link> if you do not want
            a third party to see rendezvous metadata.
          </li>
        </ul>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/security/pake">PAKE</Link>
          </li>
          <li>
            <Link href="/docs/security/threat-model">Threat model</Link>
          </li>
          <li>
            <Link href="/docs/cli/host">wormhole host</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
