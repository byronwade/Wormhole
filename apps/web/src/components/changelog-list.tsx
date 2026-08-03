"use client";

import { useEffect, useState } from "react";

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

/** Light cleanup of GitHub release markdown for display. */
function formatBody(body: string): string {
  return body
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .trim();
}

export function ChangelogList() {
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

  if (loading) {
    return <p className="docs-muted">Loading releases…</p>;
  }

  if (error) {
    return (
      <p className="docs-muted">
        {error}{" "}
        <a href="https://github.com/byronwade/Wormhole/releases">Open releases</a>
      </p>
    );
  }

  if (releases.length === 0) {
    return (
      <p className="docs-muted">
        No published releases yet.{" "}
        <a href="https://github.com/byronwade/Wormhole">Follow the repo</a> for
        updates.
      </p>
    );
  }

  return (
    <div className="changelog-list">
      {releases.map((release) => {
        const body = release.body ? formatBody(release.body) : "";
        const truncated = body.length > 1400;
        return (
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
            {body ? (
              <div className="changelog-body">
                {body.slice(0, 1400)}
                {truncated ? "…" : ""}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
