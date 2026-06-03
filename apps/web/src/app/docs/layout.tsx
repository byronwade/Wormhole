"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Share2,
  Download,
  Terminal,
  Server,
  Shield,
  Gauge,
  Settings,
  BookOpen,
  Code2,
  Network,
  Wrench,
  ChevronRight,
  Menu,
  Github,
  Heart,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState } from "react";

interface NavItem {
  title: string;
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
  items?: NavItem[];
  badge?: string;
}

const navigation: NavItem[] = [
  {
    title: "Getting Started",
    href: "/docs",
    icon: BookOpen,
    items: [
      { title: "Introduction", href: "/docs" },
      { title: "Quick Start", href: "/docs/quickstart" },
      { title: "Installation", href: "/docs/installation" },
      { title: "System Requirements", href: "/docs/requirements" },
    ],
  },
  {
    title: "CLI Reference",
    href: "/docs/cli",
    icon: Terminal,
    items: [
      { title: "Overview", href: "/docs/cli" },
      { title: "host", href: "/docs/cli/host" },
      { title: "mount", href: "/docs/cli/mount" },
      { title: "status", href: "/docs/cli/status" },
      { title: "cache", href: "/docs/cli/cache" },
      { title: "config", href: "/docs/cli/config" },
      { title: "peers", href: "/docs/cli/peers" },
      { title: "sync", href: "/docs/cli/sync", badge: "Phase 7" },
      { title: "signal", href: "/docs/cli/signal" },
      { title: "All Commands", href: "/docs/cli/all-commands" },
    ],
  },
  {
    title: "Architecture",
    href: "/docs/architecture",
    icon: Network,
    items: [
      { title: "Overview", href: "/docs/architecture" },
      { title: "FUSE Filesystem", href: "/docs/architecture/fuse" },
      { title: "QUIC Protocol", href: "/docs/architecture/quic" },
      { title: "Wire Protocol", href: "/docs/architecture/protocol" },
      { title: "Caching System", href: "/docs/architecture/caching" },
      { title: "Signal Server", href: "/docs/architecture/signal-server" },
    ],
  },
  {
    title: "Security",
    href: "/docs/security",
    icon: Shield,
    items: [
      { title: "Overview", href: "/docs/security" },
      { title: "Encryption", href: "/docs/security/encryption" },
      { title: "Authentication (PAKE)", href: "/docs/security/pake" },
      { title: "Access Control", href: "/docs/security/access-control" },
      { title: "Threat Model", href: "/docs/security/threat-model" },
      { title: "Audit & Verify", href: "/docs/security/audit" },
    ],
  },
  {
    title: "Performance",
    href: "/docs/performance",
    icon: Gauge,
    items: [
      { title: "Benchmarks", href: "/docs/performance" },
      { title: "Tuning Guide", href: "/docs/performance/tuning" },
      { title: "Cache Optimization", href: "/docs/performance/cache" },
      { title: "Network Optimization", href: "/docs/performance/network" },
      { title: "Run Benchmarks", href: "/docs/performance/run-benchmarks" },
    ],
  },
  {
    title: "Configuration",
    href: "/docs/configuration",
    icon: Settings,
    items: [
      { title: "Config File", href: "/docs/configuration" },
      { title: "Environment Variables", href: "/docs/configuration/env" },
      { title: "Cache Settings", href: "/docs/configuration/cache" },
      { title: "Network Settings", href: "/docs/configuration/network" },
      { title: "Example Configs", href: "/docs/configuration/examples" },
    ],
  },
  {
    title: "Self-Hosting",
    href: "/docs/self-hosting",
    icon: Server,
    items: [
      { title: "Signal Server", href: "/docs/self-hosting" },
      { title: "Docker Deployment", href: "/docs/self-hosting/docker" },
      { title: "Production Setup", href: "/docs/self-hosting/production" },
      { title: "Monitoring", href: "/docs/self-hosting/monitoring" },
    ],
  },
  {
    title: "API Reference",
    href: "/docs/api",
    icon: Code2,
    items: [
      { title: "Wire Protocol", href: "/docs/api" },
      { title: "Message Types", href: "/docs/api/messages" },
      { title: "Error Codes", href: "/docs/api/errors" },
      { title: "Building Clients", href: "/docs/api/building-clients" },
    ],
  },
  {
    title: "Troubleshooting",
    href: "/docs/troubleshooting",
    icon: Wrench,
    items: [
      { title: "Common Issues", href: "/docs/troubleshooting" },
      { title: "FUSE Issues", href: "/docs/troubleshooting/fuse" },
      { title: "Network Issues", href: "/docs/troubleshooting/network" },
      { title: "Performance Issues", href: "/docs/troubleshooting/performance" },
      { title: "Getting Help", href: "/docs/troubleshooting/help" },
    ],
  },
];

function NavSection({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const isInSection = item.items?.some((subItem) => pathname === subItem.href);
  const [isOpen, setIsOpen] = useState<boolean>(isInSection ?? true);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-1">
      <CollapsibleTrigger className="flex w-full items-center justify-between py-2 text-sm font-semibold text-zinc-200 hover:text-white transition-colors">
        {item.title}
        <ChevronRight
          className={cn(
            "h-4 w-4 text-zinc-500 transition-transform duration-200",
            isOpen && "rotate-90"
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-0.5 pl-2">
        {item.items?.map((subItem) => {
          const isActive = pathname === subItem.href;
          return (
            <Link
              key={subItem.href}
              href={subItem.href}
              className={cn(
                "block rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-wormhole-hunter/10 text-wormhole-hunter-light font-medium"
                  : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-200"
              )}
            >
              {subItem.title}
              {subItem.badge && (
                <Badge
                  variant="outline"
                  className="ml-2 text-[10px] px-1.5 py-0 border-wormhole-hunter/50 text-wormhole-hunter-light"
                >
                  {subItem.badge}
                </Badge>
              )}
            </Link>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}

function Sidebar({ className, onLinkClick }: { className?: string; onLinkClick?: () => void }) {
  return (
    <aside className={cn("w-64 shrink-0", className)}>
      <div className="sticky top-20">
        <ScrollArea className="h-[calc(100vh-5rem)] py-6 pr-6">
          <div className="space-y-4">
            {navigation.map((item) => (
              <NavSection key={item.href} item={item} />
            ))}
          </div>
        </ScrollArea>
      </div>
    </aside>
  );
}

function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden text-zinc-400 hover:text-white">
          <Menu className="w-5 h-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 p-0 bg-[#0a0a0a] border-zinc-800/50">
        <div className="p-6 border-b border-zinc-800/50">
          <Link href="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-wormhole-hunter-light to-wormhole-hunter flex items-center justify-center">
              <Share2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-white">Wormhole</span>
              <span className="text-zinc-500 ml-2">Docs</span>
            </div>
          </Link>
        </div>
        <ScrollArea className="h-[calc(100vh-5rem)] p-6">
          <div className="space-y-4">
            {navigation.map((item) => (
              <NavSection key={item.href} item={item} />
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Top Navigation - Clean, minimal */}
      <nav className="sticky top-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-zinc-800/50">
        <div className="max-w-7xl mx-auto flex items-center justify-between h-16 px-6">
          <div className="flex items-center gap-6">
            <MobileNav />
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative">
                <div className="absolute inset-0 bg-wormhole-hunter/30 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-wormhole-hunter-light to-wormhole-hunter flex items-center justify-center">
                  <Share2 className="w-4 h-4 text-white" />
                </div>
              </div>
              <span className="font-bold text-lg text-white">Wormhole</span>
            </Link>
            <div className="hidden sm:flex items-center gap-1 text-sm">
              <span className="text-zinc-600">/</span>
              <Link href="/docs" className="text-zinc-400 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-zinc-800/50">
                Docs
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Search placeholder */}
            <button className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-500 bg-zinc-900/50 hover:bg-zinc-800/50 rounded-lg border border-zinc-800/50 transition-colors">
              <Search className="w-4 h-4" />
              <span>Search...</span>
              <kbd className="hidden lg:inline-flex h-5 items-center gap-1 rounded border border-zinc-700 bg-zinc-800 px-1.5 font-mono text-[10px] text-zinc-400">
                <span className="text-xs">⌘</span>K
              </kbd>
            </button>

            <a
              href="https://github.com/sponsors/byronwade"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex w-9 h-9 items-center justify-center rounded-lg text-pink-400 hover:text-pink-300 hover:bg-pink-500/10 transition-colors"
              aria-label="Sponsor"
            >
              <Heart className="w-4 h-4" />
            </a>
            <a
              href="https://github.com/byronwade/wormhole"
              target="_blank"
              rel="noopener noreferrer"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-colors"
              aria-label="GitHub"
            >
              <Github className="w-4 h-4" />
            </a>
            <Button
              size="sm"
              className="h-9 px-4 bg-wormhole-hunter hover:bg-wormhole-hunter-dark text-white shadow-lg shadow-wormhole-hunter/20"
              asChild
            >
              <Link href="/#download">
                <Download className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Download</span>
              </Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Main container */}
      <div className="max-w-7xl mx-auto flex gap-10 py-8 px-6">
        {/* Desktop Sidebar */}
        <Sidebar className="hidden lg:block" />

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          <div className="prose prose-invert max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-3xl prose-h2:text-2xl prose-h2:mt-10 prose-h2:border-b prose-h2:border-zinc-800/50 prose-h2:pb-2 prose-h3:text-lg prose-p:text-zinc-400 prose-p:leading-relaxed prose-a:text-wormhole-hunter-light prose-a:no-underline hover:prose-a:underline prose-strong:text-white prose-code:text-wormhole-hunter-light prose-code:bg-zinc-800/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-800/50">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
