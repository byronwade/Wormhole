import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Wormhole pricing. Free core forever. Pro and Team for power users after launch.",
  alternates: { canonical: "/pricing" },
};

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    blurb: "Individuals and small projects.",
    features: [
      "Unlimited file sizes",
      "End-to-end encryption",
      "Join codes",
      "Community support",
    ],
    cta: "Download",
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
    blurb: "Studios and small teams.",
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
          <h2>Pricing</h2>
          <p>Free core forever. Paid tiers only when you need more horsepower.</p>
        </div>

        <div className="site-pricing">
          {plans.map((plan) => (
            <article key={plan.name} className="site-pricing__plan">
              <h3>{plan.name}</h3>
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
        </p>
      </section>
    </SiteShell>
  );
}
