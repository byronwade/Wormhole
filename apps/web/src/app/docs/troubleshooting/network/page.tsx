import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsNote,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "Network Troubleshooting — Wormhole Docs",
  description: "Debug join codes, NAT, firewalls, and signal connectivity.",
};

export default function TroubleshootingNetworkPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "Troubleshooting", href: "/docs/troubleshooting" }}
        title="Network issues"
        description="Separate discovery (signal) from data (QUIC). Failures often sit in only one plane."
      />

      <section>
        <h2>Diagnose</h2>
        <DocsCode>{`wormhole doctor
wormhole ping WORM-XXXX
wormhole ping 192.168.1.20:4433

# LAN bypass of signal
wormhole host ~/share --no-signal --port 4433
wormhole mount 192.168.1.20:4433 ~/mnt`}</DocsCode>
      </section>

      <section>
        <h2>Firewall ports</h2>
        <p>
          Same idea as LocalSend’s port table: discovery and data are separate. Allow these
          on the local network (and WAN if you share beyond Wi‑Fi).
        </p>
        <DocsTable
          headers={["Traffic", "Protocol", "Port", "Purpose"]}
          rows={[
            ["Incoming", "UDP", "4433", "QUIC data plane (mount / transfer)"],
            ["Incoming", "UDP", "41234", "LAN Nearby discovery (multicast + broadcast)"],
            ["Outgoing", "UDP/TCP", "Any", "Reach peers + optional signal WebSocket"],
          ]}
        />
        <DocsNote>
          Also disable <strong>AP isolation / client isolation</strong> on the router (common on
          guest Wi‑Fi). Isolated clients cannot see each other even if the firewall is open.
        </DocsNote>
      </section>

      <section>
        <h2>Common failures</h2>
        <DocsTable
          headers={["Symptom", "Try"]}
          rows={[
            ["Invalid / expired code", "Regenerate; check clock skew"],
            ["Lookup works, QUIC fails", "UDP firewall / CGNAT; try LAN"],
            ["Nearby list empty", "Open UDP 41234; disable AP isolation; same subnet"],
            ["PAKE failed", "Retype code; ensure same signal"],
            ["Timeout behind corporate NAT", "Self-host signal; open UDP"],
          ]}
        />
        <DocsNote>
          Signal never carries file data. If discovery works but transfers fail, focus on
          UDP/QUIC between peers. See{" "}
          <Link href="/docs/architecture/signal-server">signal architecture</Link>.
        </DocsNote>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/configuration/network">Network config</Link>
          </li>
          <li>
            <Link href="/docs/self-hosting">Self-hosting</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
