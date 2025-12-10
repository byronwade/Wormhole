"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Share2,
  Home,
  Download,
  Terminal,
  Server,
  Shield,
  Gauge,
  HardDrive,
  Settings,
  BookOpen,
  Code2,
  Zap,
  Network,
  Lock,
  Database,
  FileCode,
  Wrench,
  Users,
  ChevronRight,
  Menu,
  X,
  Github,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
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
      { title: "Run Your Own Benchmarks", href: "/docs/performance/run-benchmarks" },
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

function NavLink({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const pathname = usePathname();
  const isActive = pathname === item.href;
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors",
        depth > 0 && "ml-4 text-xs",
        isActive
          ? "bg-wormhole-hunter/10 text-wormhole-hunter-light font-medium"
          : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
      )}
    >
      {Icon && <Icon className="w-4 h-4" />}
      <span>{item.title}</span>
      {item.badge && (
        <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0 border-wormhole-hunter/50 text-wormhole-hunter-light">
          {item.badge}
        </Badge>
      )}
    </Link>
  );
}

function NavSection({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const isInSection = item.items?.some((subItem) => pathname === subItem.href);
  const Icon = item.icon;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {Icon && <Icon className="w-4 h-4" />}
        <span>{item.title}</span>
      </div>
      {item.items && (
        <div className="space-y-1">
          {item.items.map((subItem) => (
            <NavLink key={subItem.href} item={subItem} depth={1} />
          ))}
        </div>
      )}
    </div>
  );
}

function Sidebar({ className }: { className?: string }) {
  return (
    <aside className={cn("w-64 border-r border-zinc-800 bg-zinc-900/50", className)}>
      <ScrollArea className="h-[calc(100vh-4rem)]">
        <div className="p-4 space-y-2">
          {navigation.map((item) => (
            <NavSection key={item.href} item={item} />
          ))}
        </div>
      </ScrollArea>
    </aside>
  );
}

function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="w-5 h-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0 bg-zinc-900 border-zinc-800">
        <div className="p-4 border-b border-zinc-800">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-wormhole-hunter flex items-center justify-center">
              <Share2 className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white">Wormhole Docs</span>
          </Link>
        </div>
        <ScrollArea className="h-[calc(100vh-5rem)]">
          <div className="p-4 space-y-2">
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
      {/* Top Navigation */}
      <nav className="border-b border-zinc-800 sticky top-0 z-50 bg-[#0a0a0a]/95 backdrop-blur-sm">
        <div className="flex items-center justify-between h-16 px-4 md:px-6">
          <div className="flex items-center gap-4">
            <MobileNav />
            <Link href="/" className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-wormhole-hunter flex items-center justify-center">
                <Share2 className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-lg text-white">Wormhole</span>
            </Link>
            <span className="text-zinc-600">/</span>
            <Link href="/docs" className="text-zinc-400 hover:text-white transition-colors">
              Docs
            </Link>
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 text-xs">
              ALPHA
            </Badge>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="https://github.com/byronwade/wormhole"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 hover:text-white transition-colors"
            >
              <Github className="w-5 h-5" />
            </Link>
            <Button size="sm" className="bg-wormhole-hunter hover:bg-wormhole-hunter-dark text-white" asChild>
              <Link href="/#download">
                <Download className="w-4 h-4 mr-2" />
                Download
              </Link>
            </Button>
          </div>
        </div>
      </nav>

      <div className="flex">
        {/* Desktop Sidebar */}
        <Sidebar className="hidden md:block sticky top-16 h-[calc(100vh-4rem)]" />

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 md:py-12">
            {children}
          </div>
        </main>

        {/* Right sidebar for table of contents (optional, can add later) */}
      </div>
    </div>
  );
}
