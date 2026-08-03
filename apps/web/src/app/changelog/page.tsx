"use client";

import { useEffect, useState } from "react";
import { SiteShell } from "@/components/site-shell";

interface Release {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  prerelease: boolean;
  draft: boolean;
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function ChangelogPage() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("https://api.github.com/repos/byronwade/Wormhole/releases?per_page=20")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch releases");
        return res.json();
      })
      .then((data: Release[]) => {
        setReleases(data.filter((r) => !r.draft));
      })
      .catch(() => {
        setError("Unable to load releases. Check GitHub directly.");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <SiteShell active="changelog">
      <section className="site-section">
        <div className="site-section__intro">
          <h2>Changelog</h2>
          <p>Release notes from GitHub. Newest first.</p>
        </div>

        {loading && <p className="docs-muted">Loading releases…</p>}
        {error && (
          <p className="docs-muted">
            {error}{" "}
            <a href="https://github.com/byronwade/Wormhole/releases">Open releases</a>
          </p>
        )}

        <div className="changelog-list">
          {releases.map((release) => (
            <article key={release.id} className="changelog-item">
              <header>
                <h3>
                  <a href={release.html_url} target="_blank" rel="noopener noreferrer">
                    {release.name || release.tag_name}
                  </a>
                </h3>
                <p>
                  <time dateTime={release.published_at}>
                    {formatDate(release.published_at)}
                  </time>
                  {release.prerelease ? " · pre-release" : ""}
                  {" · "}
                  <span className="font-mono">{release.tag_name}</span>
                </p>
              </header>
              {release.body ? (
                <pre className="changelog-body">{release.body.slice(0, 1200)}</pre>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </SiteShell>
  );
}
