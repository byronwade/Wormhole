"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Share2,
  Github,
  ArrowRight,
  Tag,
  GitCommit,
  Calendar,
  ExternalLink,
} from "lucide-react";
import { useEffect, useState } from "react";

const GITHUB_OWNER = "byronwade";
const GITHUB_REPO = "wormhole";

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

export default function ChangelogPage() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchReleases() {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=20`
        );
        if (!res.ok) throw new Error("Failed to fetch releases");
        const data = await res.json();
        setReleases(data.filter((r: Release) => !r.draft));
      } catch (err) {
        setError("Unable to load releases. Please check GitHub directly.");
      } finally {
        setLoading(false);
      }
    }
    fetchReleases();
  }, []);

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function parseMarkdown(text: string) {
    // Simple markdown parsing for release notes
    return text
      .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold text-white mt-4 mb-2">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold text-white mt-6 mb-3">$1</h2>')
      .replace(/^\* (.+)$/gm, '<li class="text-zinc-400 ml-4">$1</li>')
      .replace(/^- (.+)$/gm, '<li class="text-zinc-400 ml-4">$1</li>')
      .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-zinc-800 rounded text-wormhole-hunter-light text-sm">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-white font-medium">$1</strong>')
      .replace(/\n\n/g, '</p><p class="text-zinc-400 mb-3">')
      .replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul class="list-disc space-y-1 mb-4">$&</ul>');
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <nav className="border-b border-zinc-800 sticky top-0 z-50 bg-[#0a0a0a]/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-wormhole-hunter flex items-center justify-center">
              <Share2 className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg text-white">Wormhole</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/docs" className="text-sm text-zinc-400 hover:text-white transition-colors">
              Docs
            </Link>
            <Button size="sm" className="bg-wormhole-hunter hover:bg-wormhole-hunter-dark" asChild>
              <Link href="/#download">Download</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-16 px-6 border-b border-zinc-800">
        <div className="max-w-4xl mx-auto">
          <Badge className="mb-4 bg-wormhole-hunter/20 text-wormhole-hunter-light border-wormhole-hunter/40">
            Changelog
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            What&apos;s New
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl">
            All the latest updates, improvements, and fixes to Wormhole.
            Follow our progress as we build towards v1.0.
          </p>
          <div className="flex items-center gap-4 mt-6">
            <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" asChild>
              <a href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`} target="_blank" rel="noopener noreferrer">
                <Github className="w-4 h-4 mr-2" />
                View on GitHub
                <ExternalLink className="w-3 h-3 ml-2" />
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Releases */}
      <section className="py-12 px-6">
        <div className="max-w-4xl mx-auto">
          {loading && (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-wormhole-hunter border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-zinc-400">Loading releases...</p>
            </div>
          )}

          {error && (
            <div className="text-center py-12">
              <p className="text-zinc-400 mb-4">{error}</p>
              <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" asChild>
                <a href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`} target="_blank" rel="noopener noreferrer">
                  View Releases on GitHub
                  <ExternalLink className="w-3 h-3 ml-2" />
                </a>
              </Button>
            </div>
          )}

          {!loading && !error && releases.length === 0 && (
            <div className="text-center py-12">
              <Tag className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <p className="text-zinc-400 mb-2">No releases yet</p>
              <p className="text-zinc-500 text-sm">Check back soon for updates!</p>
            </div>
          )}

          {!loading && !error && releases.length > 0 && (
            <div className="space-y-12">
              {releases.map((release, index) => (
                <article key={release.id} className="relative">
                  {/* Timeline connector */}
                  {index < releases.length - 1 && (
                    <div className="absolute left-[11px] top-12 bottom-0 w-px bg-zinc-800" />
                  )}

                  <div className="flex gap-6">
                    {/* Timeline dot */}
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-wormhole-hunter" />
                    </div>

                    <div className="flex-1 pb-12">
                      {/* Header */}
                      <div className="flex flex-wrap items-center gap-3 mb-4">
                        <h2 className="text-2xl font-bold text-white">
                          {release.name || release.tag_name}
                        </h2>
                        <Badge className={release.prerelease
                          ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                          : "bg-wormhole-hunter/20 text-wormhole-hunter-light border-wormhole-hunter/40"
                        }>
                          {release.prerelease ? "Pre-release" : "Stable"}
                        </Badge>
                      </div>

                      {/* Meta */}
                      <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-500 mb-6">
                        <div className="flex items-center gap-1.5">
                          <Tag className="w-4 h-4" />
                          <span className="font-mono">{release.tag_name}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(release.published_at)}</span>
                        </div>
                        <a
                          href={release.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-wormhole-hunter-light hover:underline"
                        >
                          <Github className="w-4 h-4" />
                          <span>View release</span>
                        </a>
                      </div>

                      {/* Body */}
                      {release.body ? (
                        <div
                          className="prose prose-invert prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: parseMarkdown(release.body) }}
                        />
                      ) : (
                        <p className="text-zinc-500 italic">No release notes provided.</p>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Subscribe CTA */}
      <section className="py-16 px-6 border-t border-zinc-800 bg-zinc-900/30">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Stay Updated</h2>
          <p className="text-zinc-400 mb-8 max-w-xl mx-auto">
            Watch the repository on GitHub to get notified of new releases,
            or follow the project&apos;s progress on our discussions board.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button size="lg" className="bg-wormhole-hunter hover:bg-wormhole-hunter-dark" asChild>
              <a href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`} target="_blank" rel="noopener noreferrer">
                <Github className="w-4 h-4 mr-2" />
                Watch on GitHub
              </a>
            </Button>
            <Button size="lg" variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" asChild>
              <Link href="/#download">
                Download Latest
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
