import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsNote,
} from "@/components/docs-ui";

export const metadata = {
  title: "Getting Help — Wormhole Docs",
  description: "What to include when reporting Wormhole issues.",
};

export default function TroubleshootingHelpPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "Troubleshooting", href: "/docs/troubleshooting" }}
        title="Getting help"
        description="Run doctor, capture logs, and open an issue with reproduction steps."
      />

      <section>
        <h2>Before you ask</h2>
        <DocsCode>{`wormhole doctor
wormhole status --detailed
wormhole --version`}</DocsCode>
        <ul>
          <li>
            <Link href="/docs/troubleshooting/fuse">FUSE issues</Link>
          </li>
          <li>
            <Link href="/docs/troubleshooting/network">Network issues</Link>
          </li>
          <li>
            <Link href="/docs/troubleshooting/performance">Performance</Link>
          </li>
        </ul>
      </section>

      <section>
        <h2>Useful logs</h2>
        <DocsCode>{`WORMHOLE_LOG_LEVEL=debug wormhole mount CODE ~/mnt 2>&1 | tee wormhole.log
# or
RUST_LOG=wormhole=debug,quinn=info wormhole host ~/share`}</DocsCode>
        <DocsNote tone="warn">
          Redact join codes and internal IPs you do not want public before posting.
        </DocsNote>
      </section>

      <section>
        <h2>What to include</h2>
        <ul>
          <li>OS + FUSE/WinFSP version</li>
          <li>Wormhole version / commit</li>
          <li>Exact commands</li>
          <li>Expected vs actual behavior</li>
          <li>Sanitized logs and <code>doctor</code> output</li>
        </ul>
        <p>
          GitHub issues:{" "}
          <a
            href="https://github.com/byronwade/wormhole/issues"
            target="_blank"
            rel="noopener noreferrer"
          >
            byronwade/wormhole
          </a>
          .
        </p>
      </section>
    </DocsArticle>
  );
}
