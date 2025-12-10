import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Share2,
  Github,
  Heart,
  ArrowRight,
  Users,
  Zap,
  Shield,
  Globe,
  Code2,
  MessageSquare,
} from "lucide-react";

export const metadata = {
  title: "About - Wormhole",
  description: "Learn about Wormhole, the open-source peer-to-peer file sharing tool. Our mission, values, and the team behind the project.",
};

export default function AboutPage() {
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
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 tracking-tight">
            File sharing should be
            <br />
            <span className="bg-gradient-to-r from-wormhole-hunter-light to-wormhole-hunter bg-clip-text text-transparent">
              instant and free
            </span>
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            Wormhole is an open-source project built to give creative professionals
            a faster, simpler, and more private way to share files.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="py-16 px-6 border-t border-zinc-800">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-8">Our Mission</h2>
          <div className="prose prose-invert max-w-none">
            <p className="text-lg text-zinc-400 leading-relaxed mb-6">
              We believe that sharing files between computers shouldn&apos;t require uploading
              to someone else&apos;s server, waiting hours for transfers, or paying monthly fees
              for cloud storage you don&apos;t need.
            </p>
            <p className="text-lg text-zinc-400 leading-relaxed mb-6">
              Wormhole was created for video editors sharing dailies, game developers
              collaborating on builds, VFX artists working with massive project files,
              and anyone who needs to share large files without the cloud getting in the way.
            </p>
            <p className="text-lg text-zinc-400 leading-relaxed">
              Your files go directly from your computer to theirs. No middleman.
              No upload. No waiting.
            </p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 px-6 border-t border-zinc-800">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-8">Our Values</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-6">
                <Zap className="w-8 h-8 text-wormhole-hunter-light mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Speed First</h3>
                <p className="text-zinc-400">
                  Access files in seconds, not hours. We optimize for the real-world
                  workflows of creative professionals.
                </p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-6">
                <Shield className="w-8 h-8 text-wormhole-hunter-light mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Privacy by Design</h3>
                <p className="text-zinc-400">
                  Your files never touch our servers. End-to-end encryption ensures
                  only you and your collaborators can access shared content.
                </p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-6">
                <Code2 className="w-8 h-8 text-wormhole-hunter-light mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Open Source</h3>
                <p className="text-zinc-400">
                  Wormhole is MIT licensed. You can audit the code, self-host,
                  or contribute to make it better for everyone.
                </p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-6">
                <Globe className="w-8 h-8 text-wormhole-hunter-light mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Free Forever</h3>
                <p className="text-zinc-400">
                  Core functionality will always be free. We believe essential tools
                  shouldn&apos;t be locked behind paywalls.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Technology */}
      <section className="py-16 px-6 border-t border-zinc-800">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-8">Built with Modern Tech</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-zinc-900/50 border border-zinc-800">
              <p className="font-mono text-sm text-wormhole-hunter-light mb-1">Language</p>
              <p className="text-white font-medium">Rust</p>
              <p className="text-xs text-zinc-500">Memory-safe, blazing fast</p>
            </div>
            <div className="p-4 rounded-lg bg-zinc-900/50 border border-zinc-800">
              <p className="font-mono text-sm text-wormhole-hunter-light mb-1">Transport</p>
              <p className="text-white font-medium">QUIC</p>
              <p className="text-xs text-zinc-500">Modern UDP-based protocol</p>
            </div>
            <div className="p-4 rounded-lg bg-zinc-900/50 border border-zinc-800">
              <p className="font-mono text-sm text-wormhole-hunter-light mb-1">Filesystem</p>
              <p className="text-white font-medium">FUSE</p>
              <p className="text-xs text-zinc-500">Native OS integration</p>
            </div>
            <div className="p-4 rounded-lg bg-zinc-900/50 border border-zinc-800">
              <p className="font-mono text-sm text-wormhole-hunter-light mb-1">Encryption</p>
              <p className="text-white font-medium">TLS 1.3</p>
              <p className="text-xs text-zinc-500">Industry-standard security</p>
            </div>
            <div className="p-4 rounded-lg bg-zinc-900/50 border border-zinc-800">
              <p className="font-mono text-sm text-wormhole-hunter-light mb-1">Auth</p>
              <p className="text-white font-medium">SPAKE2</p>
              <p className="text-xs text-zinc-500">Password-authenticated key exchange</p>
            </div>
            <div className="p-4 rounded-lg bg-zinc-900/50 border border-zinc-800">
              <p className="font-mono text-sm text-wormhole-hunter-light mb-1">Desktop</p>
              <p className="text-white font-medium">Tauri</p>
              <p className="text-xs text-zinc-500">Lightweight native apps</p>
            </div>
          </div>
        </div>
      </section>

      {/* Get Involved */}
      <section className="py-16 px-6 border-t border-zinc-800">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Get Involved</h2>
          <p className="text-zinc-400 mb-8 max-w-xl mx-auto">
            Wormhole is built in the open. Contributions, feedback, and support from
            the community are what make this project possible.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button size="lg" className="bg-wormhole-hunter hover:bg-wormhole-hunter-dark" asChild>
              <a href="https://github.com/byronwade/wormhole" target="_blank" rel="noopener noreferrer">
                <Github className="w-4 h-4 mr-2" />
                Star on GitHub
              </a>
            </Button>
            <Button size="lg" variant="outline" className="border-pink-500/30 text-pink-400 hover:bg-pink-500/10" asChild>
              <a href="https://github.com/sponsors/byronwade" target="_blank" rel="noopener noreferrer">
                <Heart className="w-4 h-4 mr-2" />
                Sponsor
              </a>
            </Button>
            <Button size="lg" variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" asChild>
              <a href="https://github.com/byronwade/wormhole/discussions" target="_blank" rel="noopener noreferrer">
                <MessageSquare className="w-4 h-4 mr-2" />
                Discussions
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-16 px-6 border-t border-zinc-800 bg-zinc-900/30">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Ready to try Wormhole?</h2>
          <p className="text-zinc-400 mb-8">
            Download now and share your first folder in under a minute.
          </p>
          <Button size="lg" className="bg-wormhole-hunter hover:bg-wormhole-hunter-dark" asChild>
            <Link href="/#download">
              Download Wormhole
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
