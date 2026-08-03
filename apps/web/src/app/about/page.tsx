import Link from "next/link";
import { SiteShell } from "@/components/site-shell";

export const metadata = {
  title: "About — Wormhole",
  description:
    "Wormhole is open-source peer-to-peer folder mounting for people who work with large files.",
};

export default function AboutPage() {
  return (
    <SiteShell active="about">
      <section className="site-section">
        <div className="site-section__intro" style={{ maxWidth: "40rem" }}>
          <h2>About Wormhole</h2>
          <p>
            File sharing should not mean uploading a copy of your life’s work to a
            stranger’s hard drive and waiting for the progress bar to finish.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gap: "1.75rem",
            maxWidth: "40rem",
            color: "var(--ink-soft)",
            fontSize: "1.0625rem",
            lineHeight: 1.65,
          }}
        >
          <p style={{ margin: 0 }}>
            Wormhole mounts a remote folder as a local drive over a direct
            peer-to-peer connection. You share a code. They connect. The files stay
            on the machines that already own them.
          </p>
          <p style={{ margin: 0 }}>
            It’s built for video editors, game developers, VFX artists, and anyone
            tired of paying rent on storage they already have.
          </p>
          <p style={{ margin: 0 }}>
            The project is open source under the MIT license. Inspect it, fork it,
            improve it.
          </p>
        </div>

        <div className="site-hero__cta" style={{ marginTop: "2.5rem" }}>
          <Link href="/#download" className="site-btn">
            Download
          </Link>
          <a
            href="https://github.com/byronwade/Wormhole"
            className="site-btn site-btn--ghost"
            target="_blank"
            rel="noopener noreferrer"
          >
            View source
          </a>
        </div>
      </section>
    </SiteShell>
  );
}
