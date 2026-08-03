import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "Protocol Messages — Wormhole Docs",
  description: "High-level Wormhole request and response message catalog.",
};

export default function ApiMessagesPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "API", href: "/docs/api" }}
        title="Messages"
        description="Summary of host/client messages. Canonical definitions live in teleport-core."
      />

      <section>
        <h2>Metadata</h2>
        <DocsTable
          headers={["Request", "Response"]}
          rows={[
            ["GetAttr { inode }", "Attr(FileAttr)"],
            ["Lookup { parent, name }", "Entry(DirEntry)"],
            ["ReadDir { inode, offset }", "DirEntries([...])"],
          ]}
        />
      </section>

      <section>
        <h2>Data</h2>
        <DocsTable
          headers={["Request", "Response"]}
          rows={[
            ["ReadChunk { inode, offset, size }", "Data(bytes)"],
            ["WriteChunk { … } (Phase 7+)", "Ok / Error"],
          ]}
        />
        <p>Typical <code>size</code> is 128&nbsp;KB (<code>CHUNK_SIZE</code>).</p>
      </section>

      <section>
        <h2>Control</h2>
        <DocsCode>{`Hello { version, capabilities } → Welcome { version, share_name, root_inode, … }
Ping { timestamp } → Pong { timestamp, server_time }`}</DocsCode>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/architecture/protocol">Full protocol docs</Link>
          </li>
          <li>
            <Link href="/docs/api/errors">Errors</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
