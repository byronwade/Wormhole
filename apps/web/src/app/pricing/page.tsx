import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Share2,
  Check,
  ArrowRight,
  Zap,
  Users,
  Building2,
  Heart,
  Github,
} from "lucide-react";

export const metadata = {
  title: "Pricing - Wormhole",
  description: "Wormhole pricing plans. Free during alpha, with Pro and Team plans coming soon for advanced features.",
};

const plans = [
  {
    name: "Free",
    description: "For individuals and small projects",
    price: "$0",
    period: "forever",
    badge: "Current",
    badgeColor: "bg-wormhole-hunter/20 text-wormhole-hunter-light border-wormhole-hunter/40",
    features: [
      "Unlimited file sharing",
      "End-to-end encryption",
      "Cross-platform support",
      "Join codes",
      "Community support",
      "Open source",
    ],
    cta: "Download Now",
    ctaHref: "/#download",
    highlight: false,
  },
  {
    name: "Pro",
    description: "For power users and freelancers",
    price: "$8",
    period: "/month",
    badge: "Coming Soon",
    badgeColor: "bg-amber-500/20 text-amber-400 border-amber-500/40",
    features: [
      "Everything in Free",
      "Priority connections",
      "Advanced caching",
      "Transfer analytics",
      "Priority support",
      "Custom join codes",
    ],
    cta: "Join Waitlist",
    ctaHref: "https://github.com/byronwade/wormhole/discussions",
    highlight: true,
  },
  {
    name: "Team",
    description: "For studios and organizations",
    price: "$15",
    period: "/user/month",
    badge: "Coming Soon",
    badgeColor: "bg-amber-500/20 text-amber-400 border-amber-500/40",
    features: [
      "Everything in Pro",
      "Team management",
      "Access controls",
      "Audit logs",
      "Self-hosted option",
      "Dedicated support",
    ],
    cta: "Contact Us",
    ctaHref: "https://github.com/byronwade/wormhole/discussions",
    highlight: false,
  },
];

export default function PricingPage() {
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
          <Badge className="mb-6 bg-wormhole-hunter/20 text-wormhole-hunter-light border-wormhole-hunter/40">
            Simple Pricing
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 tracking-tight">
            Free while in alpha
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            Wormhole is currently free for everyone during our alpha phase.
            Pro features are coming soon for those who need more.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={`bg-zinc-900/50 border-zinc-800 relative ${
                  plan.highlight ? "ring-2 ring-wormhole-hunter" : ""
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-wormhole-hunter text-white border-0">
                      Most Popular
                    </Badge>
                  </div>
                )}
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between mb-2">
                    <CardTitle className="text-xl text-white">{plan.name}</CardTitle>
                    <Badge className={plan.badgeColor}>{plan.badge}</Badge>
                  </div>
                  <p className="text-sm text-zinc-400">{plan.description}</p>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-white">{plan.price}</span>
                    <span className="text-zinc-400">{plan.period}</span>
                  </div>
                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-wormhole-hunter-light flex-shrink-0" />
                        <span className="text-zinc-300">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className={`w-full ${
                      plan.highlight
                        ? "bg-wormhole-hunter hover:bg-wormhole-hunter-dark"
                        : "bg-zinc-800 hover:bg-zinc-700"
                    }`}
                    asChild
                  >
                    <Link href={plan.ctaHref}>
                      {plan.cta}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-6 border-t border-zinc-800">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-8 text-center">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            <div className="p-6 rounded-lg bg-zinc-900/50 border border-zinc-800">
              <h3 className="text-white font-medium mb-2">Will Free always be free?</h3>
              <p className="text-zinc-400 text-sm">
                Yes. Core file sharing functionality will always be free. We believe
                essential tools shouldn&apos;t be locked behind paywalls. Pro features
                will offer advanced capabilities for power users.
              </p>
            </div>
            <div className="p-6 rounded-lg bg-zinc-900/50 border border-zinc-800">
              <h3 className="text-white font-medium mb-2">What happens after alpha?</h3>
              <p className="text-zinc-400 text-sm">
                When we launch out of alpha, the Free tier will remain free. Pro and
                Team plans will become available with the features listed above.
                Early adopters may receive special perks.
              </p>
            </div>
            <div className="p-6 rounded-lg bg-zinc-900/50 border border-zinc-800">
              <h3 className="text-white font-medium mb-2">Can I self-host Wormhole?</h3>
              <p className="text-zinc-400 text-sm">
                Absolutely. Wormhole is open source under the MIT license. You can
                run your own signal server and have complete control over your
                infrastructure. See our self-hosting docs for details.
              </p>
            </div>
            <div className="p-6 rounded-lg bg-zinc-900/50 border border-zinc-800">
              <h3 className="text-white font-medium mb-2">How can I support the project?</h3>
              <p className="text-zinc-400 text-sm">
                You can sponsor the project on GitHub, contribute code, report bugs,
                or simply spread the word. Every bit helps us keep Wormhole free
                and make it better for everyone.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Sponsor CTA */}
      <section className="py-16 px-6 border-t border-zinc-800 bg-zinc-900/30">
        <div className="max-w-4xl mx-auto text-center">
          <Heart className="w-12 h-12 text-pink-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-4">Support Open Source</h2>
          <p className="text-zinc-400 mb-8 max-w-xl mx-auto">
            Wormhole is built by a small team in our spare time. Your sponsorship
            helps us dedicate more time to development and keep the project alive.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button size="lg" className="bg-pink-500 hover:bg-pink-600 text-white" asChild>
              <a href="https://github.com/sponsors/byronwade" target="_blank" rel="noopener noreferrer">
                <Heart className="w-4 h-4 mr-2" />
                Become a Sponsor
              </a>
            </Button>
            <Button size="lg" variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" asChild>
              <a href="https://github.com/byronwade/wormhole" target="_blank" rel="noopener noreferrer">
                <Github className="w-4 h-4 mr-2" />
                Star on GitHub
              </a>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
