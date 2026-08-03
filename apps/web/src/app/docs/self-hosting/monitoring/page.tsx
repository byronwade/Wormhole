import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "Signal Monitoring — Wormhole Docs",
  description: "Health checks and Prometheus metrics for the signal server.",
};

export default function SelfHostingMonitoringPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "Self-hosting", href: "/docs/self-hosting" }}
        title="Monitoring"
        description="Health endpoint plus optional Prometheus metrics."
      />

      <section>
        <h2>Health</h2>
        <DocsCode>{`curl http://localhost:8080/health
# {"status":"healthy","version":"0.1.0","uptime_secs":3600}`}</DocsCode>
      </section>

      <section>
        <h2>Metrics</h2>
        <DocsCode>{`wormhole signal --metrics --metrics-port 9090
curl http://localhost:9090/metrics`}</DocsCode>
        <DocsTable
          headers={["Metric", "Meaning"]}
          rows={[
            ["wormhole_signal_active_rooms", "Open rendezvous rooms"],
            ["wormhole_signal_connections_total", "Connections since start"],
            ["wormhole_signal_connections_active", "Current sockets"],
            ["wormhole_signal_codes_registered_total", "Codes registered"],
          ]}
        />
      </section>

      <section>
        <h2>Alerts to consider</h2>
        <ul>
          <li>Health check failing</li>
          <li>Active connections near <code>max-connections</code></li>
          <li>Sustained rate-limit rejections (abuse or misconfig)</li>
        </ul>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/self-hosting/production">Production</Link>
          </li>
          <li>
            <Link href="/docs/cli/signal">wormhole signal</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
