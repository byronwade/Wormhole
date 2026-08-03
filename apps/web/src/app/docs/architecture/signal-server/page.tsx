import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsNote,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "Signal Server — Wormhole Docs",
  description: "Rendezvous only: rooms, join codes, and NAT helpers — not the data path.",
};

export default function SignalServerArchitecturePage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "Architecture", href: "/docs/architecture" }}
        title="Signal server"
        description="WebSocket rendezvous so peers can find each other. File bytes never go through it."
      />

      <section>
        <h2>Role</h2>
        <ol>
          <li>Host creates a room and registers a join code.</li>
          <li>Client joins with that code.</li>
          <li>Peers exchange connection candidates (addresses / hole-punch hints).</li>
          <li>Peers open a direct QUIC session; signal drops out of the data path.</li>
        </ol>
        <DocsNote>
          LAN testing can skip signaling with <code>--no-signal</code> and a direct{" "}
          <code>host:port</code>.
        </DocsNote>
      </section>

      <section>
        <h2>What the server sees</h2>
        <DocsTable
          headers={["Sees", "Does not see"]}
          rows={[
            ["Join codes / room IDs", "File contents"],
            ["Peer IPs and ports", "Directory trees or filenames"],
            ["Connection timing", "Encryption keys / PAKE secrets"],
          ]}
        />
      </section>

      <section>
        <h2>Implementation</h2>
        <p>
          Crate: <code>teleport-signal</code>. Rooms are short-lived; idle rooms
          expire. Optional SQLite persistence for restarts.
        </p>
        <DocsCode>{`cargo build -p teleport-signal
wormhole signal --port 8080

# Or Docker — see self-hosting
docker run -p 8080:8080 wormhole/signal:latest`}</DocsCode>
      </section>

      <section>
        <h2>NAT traversal</h2>
        <ul>
          <li>Direct connect when both sides are reachable</li>
          <li>STUN for reflexive addresses</li>
          <li>UDP hole punching when both are behind NAT</li>
        </ul>
        <p>
          STUN servers are configurable under{" "}
          <Link href="/docs/configuration/network">[network]</Link>.
        </p>
      </section>

      <section>
        <h2>Self-host</h2>
        <p>
          Run your own signal for privacy and policy control. Guides:{" "}
          <Link href="/docs/self-hosting">self-hosting</Link>,{" "}
          <Link href="/docs/cli/signal">wormhole signal</Link>.
        </p>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/security/threat-model">Threat model</Link>
          </li>
          <li>
            <Link href="/docs/architecture/quic">QUIC</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
