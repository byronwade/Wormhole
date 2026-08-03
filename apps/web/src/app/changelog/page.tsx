import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { ChangelogList } from "@/components/changelog-list";

export const metadata: Metadata = {
  title: "Changelog",
  description: "Wormhole release notes from GitHub. Newest first.",
  alternates: { canonical: "/changelog" },
};

export default function ChangelogPage() {
  return (
    <SiteShell active="changelog">
      <section className="site-section">
        <div className="site-section__intro">
          <h2>Changelog</h2>
          <p>Release notes from GitHub. Newest first.</p>
        </div>
        <ChangelogList />
      </section>
    </SiteShell>
  );
}
