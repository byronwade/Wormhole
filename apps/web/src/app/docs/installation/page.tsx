import Link from "next/link";
import { DocsArticle, DocsCode, DocsHeader, DocsNote } from "@/components/docs-ui";

export const metadata = {
  title: "Installation — Wormhole Docs",
  description: "Install Wormhole on macOS, Windows, or Linux.",
};

export default function InstallationPage() {
  return (
    <DocsArticle>
      <DocsHeader
        title="Installation"
        description="Desktop app for most people. CLI or source when you need headless or custom builds."
      />

      <section>
        <h2>Desktop app</h2>
        <p>
          Recommended. Includes tray, GUI, and the daemon. Pick your platform:
        </p>
        <ul>
          <li>
            <Link href="/download/macos">macOS</Link> — DMG + macFUSE
          </li>
          <li>
            <Link href="/download/windows">Windows</Link> — installer + WinFSP
          </li>
          <li>
            <Link href="/download/linux">Linux</Link> — AppImage / .deb / .rpm + FUSE&nbsp;3
          </li>
        </ul>
      </section>

      <section>
        <h2>CLI only</h2>
        <p>Useful on servers and in automation:</p>
        <DocsCode>{`cargo install --git https://github.com/byronwade/Wormhole teleport-daemon
wormhole --help`}</DocsCode>
        <DocsNote title="FUSE still required">
          Mounts need a FUSE provider on the client machine even for CLI-only installs.
        </DocsNote>
      </section>

      <section>
        <h2>From source</h2>
        <DocsCode>{`git clone https://github.com/byronwade/Wormhole.git
cd Wormhole
cargo build --release -p teleport-daemon
./target/release/wormhole doctor`}</DocsCode>
      </section>

      <section>
        <h2>Verify</h2>
        <DocsCode>{`wormhole --version
wormhole doctor`}</DocsCode>
        <p>
          Then jump to the <Link href="/docs/quickstart">quick start</Link>.
        </p>
      </section>
    </DocsArticle>
  );
}
