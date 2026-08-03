import Link from "next/link";
import {
  DocsArticle,
  DocsHeader,
  DocsNote,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "Threat Model — Wormhole Docs",
  description: "Assets, attackers, and mitigations for Wormhole peer shares.",
};

export default function ThreatModelPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "Security", href: "/docs/security" }}
        title="Threat model"
        description="What we protect, who we assume as adversaries, and where the boundaries are."
      />

      <section>
        <h2>Assets</h2>
        <ul>
          <li>File content on the share</li>
          <li>Metadata (names, sizes, tree shape)</li>
          <li>Credentials (join codes, derived keys)</li>
          <li>Network privacy (IPs, connection patterns)</li>
          <li>Host and client machine integrity</li>
        </ul>
      </section>

      <section>
        <h2>Threat actors</h2>
        <DocsTable
          headers={["Actor", "Capability", "Motivation"]}
          rows={[
            ["Passive observer", "Intercept traffic", "Surveillance"],
            ["Active MITM", "Intercept and modify", "Theft, impersonation"],
            ["Malicious peer", "Connect as client/host", "Exfiltration, abuse"],
            ["Signal operator", "See rendezvous metadata", "Privacy / logging"],
            ["Local user", "Access cache/config", "Unauthorized local access"],
          ]}
        />
      </section>

      <section>
        <h2>Defenses (current)</h2>
        <ul>
          <li>
            Passive eavesdropping → TLS&nbsp;1.3 over QUIC (
            <Link href="/docs/security/encryption">encryption</Link>).
          </li>
          <li>
            Unauthorized connect → SPAKE2 join codes (
            <Link href="/docs/security/pake">PAKE</Link>).
          </li>
          <li>
            Path escape → <code>safe_path</code> + no symlink follow (
            <Link href="/docs/security/access-control">access control</Link>).
          </li>
          <li>
            Signal compromise → no file bytes on the signal path; only discovery
            metadata.
          </li>
        </ul>
        <DocsNote title="Known gap (alpha)">
          Default self-signed TLS without TOFU/pinning is weaker against active
          MITM on untrusted networks. Prefer LAN or pinned/custom certs for
          sensitive material; TOFU improvements are planned.
        </DocsNote>
      </section>

      <section>
        <h2>Out of scope</h2>
        <ul>
          <li>Compromised host or client OS (malware with local privileges).</li>
          <li>Physical access to unlocked machines or decrypted disks.</li>
          <li>Social engineering that leaks a live join code.</li>
          <li>
            Traffic analysis of packet sizes/timing by a network observer.
          </li>
        </ul>
      </section>

      <section>
        <h2>Signal server boundary</h2>
        <p>
          The signal server helps peers find each other. It should never see file
          content. It may see join-code registrations, peer endpoints, and
          connection timing. Self-host if that metadata must stay in-house.
        </p>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/security/encryption">Encryption</Link>
          </li>
          <li>
            <Link href="/docs/security/audit">Audit</Link>
          </li>
          <li>
            <Link href="/docs/self-hosting">Self-hosting</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
