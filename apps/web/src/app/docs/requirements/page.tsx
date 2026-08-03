import { DocsArticle, DocsHeader, DocsTable } from "@/components/docs-ui";

export const metadata = {
  title: "Requirements — Wormhole Docs",
  description: "System requirements for running Wormhole hosts and clients.",
};

export default function RequirementsPage() {
  return (
    <DocsArticle>
      <DocsHeader
        title="System requirements"
        description="What you need on host and client machines."
      />

      <section>
        <h2>Supported platforms</h2>
        <DocsTable
          headers={["Platform", "Minimum", "Mount backend"]}
          rows={[
            ["macOS", "10.13+", "macFUSE"],
            ["Linux", "Kernel 4.18+", "FUSE 3"],
            ["Windows", "10+", "WinFSP"],
          ]}
        />
      </section>

      <section>
        <h2>Hardware</h2>
        <ul>
          <li>64-bit CPU (Apple Silicon or Intel/AMD)</li>
          <li>~100&nbsp;MB disk for the app; cache grows with use</li>
          <li>Network: LAN for best results; WAN works with NAT traversal</li>
        </ul>
      </section>

      <section>
        <h2>Permissions</h2>
        <ul>
          <li>Host needs read access to the shared folder</li>
          <li>Client needs permission to load the FUSE/WinFSP driver</li>
          <li>Outbound UDP for QUIC; signal uses WebSocket/HTTPS when enabled</li>
        </ul>
      </section>
    </DocsArticle>
  );
}
