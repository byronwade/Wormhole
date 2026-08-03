import Link from "next/link";

export const metadata = {
  title: "Quick Start — Wormhole Docs",
  description:
    "Host a folder and mount it on another machine in a few minutes.",
};

export default function QuickStartPage() {
  return (
    <article className="docs-article">
      <header className="docs-home__intro">
        <h1>Quick Start</h1>
        <p>
          Share a folder with a code, mount it on another computer, and work with
          it like a local drive.
        </p>
      </header>

      <section>
        <h2>1. Install</h2>
        <p>
          Grab a build for your OS from the{" "}
          <Link href="/#download">download page</Link>, or see{" "}
          <Link href="/docs/installation">installation</Link> for package details.
        </p>
        <ul>
          <li>macOS needs macFUSE</li>
          <li>Linux needs FUSE 3</li>
          <li>Windows needs WinFSP</li>
        </ul>
      </section>

      <section>
        <h2>2. Host a folder</h2>
        <p>On the machine that has the files:</p>
        <pre className="docs-code" tabIndex={0}>
          <code>{`$ wormhole host ~/renders
Join code: 7KJM-XBCD-QRST`}</code>
        </pre>
      </section>

      <section>
        <h2>3. Mount with the code</h2>
        <p>On the machine that needs access:</p>
        <pre className="docs-code" tabIndex={0}>
          <code>{`$ wormhole mount 7KJM-XBCD-QRST
Mounted at /Volumes/wormhole/renders`}</code>
        </pre>
        <p>Open the mount in Finder, Explorer, or any app. No full download first.</p>
      </section>

      <section>
        <h2>4. When you’re done</h2>
        <pre className="docs-code" tabIndex={0}>
          <code>{`$ wormhole unmount
# or stop the host:
$ wormhole stop`}</code>
        </pre>
      </section>

      <section>
        <h2>Next</h2>
        <ul>
          <li>
            <Link href="/docs/cli">CLI reference</Link>
          </li>
          <li>
            <Link href="/docs/security">Security overview</Link>
          </li>
          <li>
            <Link href="/docs/troubleshooting">Troubleshooting</Link>
          </li>
        </ul>
      </section>
    </article>
  );
}
