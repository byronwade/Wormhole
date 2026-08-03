import Link from "next/link";
import { SiteShell } from "@/components/site-shell";

export const metadata = {
  title: "Pricing — Wormhole",
  description:
    "Wormhole pricing. Free core forever. Pro and Team for power users after launch.",
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
    href: "/#download",
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

        <div className="site-diff" style={{ marginBottom: "2rem" }}>
          {plans.map((plan) => (
            <div key={plan.name}>
              <dt>{plan.name}</dt>
              <dd>
                <span className="site-diff__good">
                  {plan.price}
                  <span
                    style={{
                      fontSize: "0.95rem",
                      fontWeight: 500,
                      color: "var(--ink-soft)",
                      marginLeft: "0.35rem",
                    }}
                  >
                    {plan.period}
                  </span>
                </span>
                <span className="site-diff__vs">{plan.blurb}</span>
                <ul
                  style={{
                    margin: "1rem 0",
                    padding: "0 0 0 1.1rem",
                    color: "var(--ink-soft)",
                    display: "grid",
                    gap: "0.35rem",
                  }}
                >
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
              </dd>
            </div>
          ))}
        </div>

        <p style={{ color: "var(--ink-soft)", margin: 0 }}>
          Need SSO, audit logs, or a self-hosted control plane?{" "}
          <a
            href="https://github.com/byronwade/Wormhole/discussions"
            style={{ color: "var(--ink)" }}
          >
            Talk to us
          </a>
          .
        </p>
      </section>
    </SiteShell>
  );
}
