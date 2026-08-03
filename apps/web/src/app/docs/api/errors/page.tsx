import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "Errors — Wormhole Docs",
  description: "CLI exit codes and protocol / application error categories.",
};

export default function ApiErrorsPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "API", href: "/docs/api" }}
        title="Errors"
        description="Stable-ish exit codes for scripts; protocol errors map toward errno on FUSE."
      />

      <section>
        <h2>CLI exit codes</h2>
        <DocsTable
          headers={["Code", "Meaning"]}
          rows={[
            ["0", "Success"],
            ["1", "General error"],
            ["2", "Usage error"],
            ["3", "Connection error"],
            ["4", "Authentication error"],
            ["5", "Permission denied"],
            ["6", "FUSE error"],
            ["10", "Timeout"],
          ]}
        />
      </section>

      <section>
        <h2>Application categories</h2>
        <DocsCode>{`# Connection
E1001 Connection refused
E1002 Connection timeout
E1003 Connection reset
E1004 TLS handshake failed
E1005 PAKE failed (bad join code)

# Mount
E2001 Mount point busy
E2002 Mount point missing
E2003 FUSE unavailable
E2004 Mount permission denied`}</DocsCode>
      </section>

      <section>
        <h2>Protocol ErrorCode → errno</h2>
        <DocsTable
          headers={["ErrorCode", "Typical errno"]}
          rows={[
            ["NotFound", "ENOENT"],
            ["PermissionDenied", "EACCES"],
            ["ReadOnly", "EROFS"],
            ["IoError", "EIO"],
            ["InvalidArgument", "EINVAL"],
          ]}
        />
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/troubleshooting/help">Getting help</Link>
          </li>
          <li>
            <Link href="/docs/architecture/protocol">Protocol</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
