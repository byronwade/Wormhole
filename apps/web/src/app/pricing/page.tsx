import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pricing — Free core for creatives & developers",
  description:
    "Wormhole pricing for editors, game teams, and studios. Free core forever. Pro $8 and Team $15 after launch—no cloud storage rent.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Wormhole Pricing",
    description:
      "Free core forever. Paid tiers only when you need more horsepower—not for storing files you already own.",
    url: `${SITE_URL}/pricing`,
  },
};

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    blurb: "Editors, indies, and solo engineers.",
    features: [
      "Unlimited file sizes",
      "Live folder mounts",
      "End-to-end encryption",
      "Join codes",
      "Community support",
    ],
    cta: "Download free",
    href: "/download",
    primary: true,
  },
  {
    name: "Pro",
    price: "$8",
    period: "/month",
    blurb: "Freelancers and power users.",
    features: [
      "Everything in Free",
      "More simultaneous connections",
      "Persistent join codes",
      "Priority support",
    ],
    cta: "Coming after launch",
    href: "https://github.com/byronwade/Wormhole/discussions",
    primary: false,
  },
  {
    name: "Team",
    price: "$15",
    period: "/user/mo",
    blurb: "Studios and small game teams.",
    features: [
      "Everything in Pro",
      "Team management",
      "Usage analytics",
      "Policy controls",
    ],
    cta: "Coming after launch",
    href: "https://github.com/byronwade/Wormhole/discussions",
    primary: false,
  },
];

export default function PricingPage() {
  return (
    <SiteShell active="pricing">
      <section className="site-section">
        <div className="site-section__intro">
          <h1 className="site-for-index__title">Pricing that doesn’t rent your files</h1>
          <p>
            Cloud tools charge for copies. Wormhole’s free core mounts what you
            already have. Paid tiers are horsepower—not storage tax.
          </p>
        </div>

        <div className="site-pricing">
          {plans.map((plan) => (
            <article key={plan.name} className="site-pricing__plan">
              <h2>{plan.name}</h2>
              <p className="site-pricing__price">
                <span>{plan.price}</span>
                <span className="site-pricing__period">{plan.period}</span>
              </p>
              <p className="site-pricing__blurb">{plan.blurb}</p>
              <ul>
                {plan.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {plan.primary ? (
                <Link href={plan.href} className="site-btn site-btn--small">
                  {plan.cta}
                </Link>
              ) : (
                <a
                  href={plan.href}
                  className="site-btn site-btn--small site-btn--ghost"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {plan.cta}
                </a>
              )}
            </article>
          ))}
        </div>

        <p className="docs-muted" style={{ marginTop: "2rem", marginBottom: 0 }}>
          Need SSO, audit logs, or a self-hosted control plane?{" "}
          <a href="https://github.com/byronwade/Wormhole/discussions">Talk to us</a>.
          Typical studio stack (Dropbox + Frame.io) runs $500–2,000/year—Wormhole
          core is $0.
        </p>
      </section>
    </SiteShell>
  );
}
