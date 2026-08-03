import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "QUIC — Wormhole Docs",
  description: "Why Wormhole uses QUIC for multiplexed encrypted file transfer.",
};

export default function QuicArchitecturePage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "Architecture", href: "/docs/architecture" }}
        title="QUIC transport"
        description="Encrypted, multiplexed UDP streams via quinn + rustls. Built for many parallel chunk reads without head-of-line blocking."
      />

      <section>
        <h2>Why QUIC</h2>
        <ul>
          <li>TLS&nbsp;1.3 built in — no separate TLS stack on TCP</li>
          <li>Multiple independent streams (metadata + many chunk fetches)</li>
          <li>Lower handshake latency; optional 0-RTT resumption</li>
          <li>Connection migration when a client IP changes</li>
        </ul>
      </section>

      <section>
        <h2>vs TCP</h2>
        <DocsTable
          headers={["Concern", "TCP + TLS", "QUIC"]}
          rows={[
            ["Handshake", "TCP + TLS RTTs", "Combined 1-RTT (0-RTT resume)"],
            ["Multiplexing", "HOL blocking on one socket", "Independent streams"],
            ["Encryption", "Optional / layered", "Mandatory"],
            ["NAT / mobile", "Breaks on IP change", "Connection migration"],
          ]}
        />
      </section>

      <section>
        <h2>Wormhole usage</h2>
        <p>
          Host listens with quinn. Clients open bidirectional streams for
          request/response pairs (lookup, readdir, read chunk). Parallel reads use
          additional streams up to <code>network.max_streams</code>.
        </p>
        <DocsCode>{`// Bidirectional stream for one request/response
let (mut send, mut recv) = connection.open_bi().await?;
send_message(&mut send, &request).await?;
let response = recv_message(&mut recv).await?;`}</DocsCode>
      </section>

      <section>
        <h2>Congestion and timeouts</h2>
        <p>
          Quinn’s congestion control adapts to LAN and WAN. Tune connect/request
          timeouts and keepalive under{" "}
          <Link href="/docs/configuration/network">[network]</Link>.
        </p>
        <DocsCode>{`[network]
connect_timeout_secs = 10
request_timeout_secs = 30
keepalive_secs = 15
max_streams = 100
enable_0rtt = false`}</DocsCode>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          Transport encryption is always on. Authentication for join-code shares is
          layered with{" "}
          <Link href="/docs/security/pake">PAKE</Link>. Details:{" "}
          <Link href="/docs/security/encryption">encryption</Link>.
        </p>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/architecture/protocol">Wire protocol</Link>
          </li>
          <li>
            <Link href="/docs/performance/network">Network performance</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
