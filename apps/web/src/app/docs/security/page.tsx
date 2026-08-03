import Link from "next/link";
import { DocsArticle, DocsHeader, DocsLinkGrid, DocsNote } from "@/components/docs-ui";

export const metadata = {
  title: "Security — Wormhole Docs",
  description:
    "Encryption, PAKE join codes, access control, and the Wormhole threat model.",
};

export default function SecurityPage() {
  return (
    <DocsArticle>
      <DocsHeader
        title="Security"
        description="Files stay on the machines that already have them. Connections are end-to-end encrypted; the signal server only helps peers find each other."
      />

      <section>
        <h2>At a glance</h2>
        <ul>
          <li>Transport: QUIC with TLS&nbsp;1.3</li>
          <li>Join codes: PAKE (SPAKE2) — session key never sent in the clear</li>
          <li>Data path: peer-to-peer by default; no file content on our servers</li>
          <li>Open source: audit the code yourself</li>
        </ul>
        <DocsNote title="Alpha caveat">
          Treat alpha builds as evolving. Prefer LAN or trusted networks for sensitive
          material until you’ve reviewed the current threat model.
        </DocsNote>
      </section>

      <section>
        <h2>Deep dives</h2>
        <DocsLinkGrid
          items={[
            {
              title: "Encryption",
              description: "QUIC, TLS 1.3, and what is encrypted where.",
              href: "/docs/security/encryption",
            },
            {
              title: "PAKE",
              description: "How join codes become session keys.",
              href: "/docs/security/pake",
            },
            {
              title: "Access control",
              description: "Who can mount, and what they can read.",
              href: "/docs/security/access-control",
            },
            {
              title: "Threat model",
              description: "What we defend against — and what we don’t.",
              href: "/docs/security/threat-model",
            },
            {
              title: "Audit",
              description: "How to verify builds and review the code.",
              href: "/docs/security/audit",
            },
          ]}
        />
      </section>

      <section>
        <h2>Related</h2>
        <ul>
          <li>
            <Link href="/docs/architecture">Architecture</Link>
          </li>
          <li>
            <Link href="/docs/self-hosting">Self-hosting the signal server</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
