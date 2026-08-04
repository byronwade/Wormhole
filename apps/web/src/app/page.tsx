import type { Metadata } from "next";
import { HomePage } from "@/components/home-page";
import { JsonLd } from "@/components/json-ld";
import {
  DEFAULT_DESCRIPTION,
  SEO_KEYWORDS,
  SITE_NAME,
  SITE_URL,
  TAGLINE,
} from "@/lib/site";

export const metadata: Metadata = {
  title: {
    absolute: `${SITE_NAME} — ${TAGLINE}`,
  },
  description: DEFAULT_DESCRIPTION,
  keywords: [...SEO_KEYWORDS],
  alternates: { canonical: "/" },
  openGraph: {
    title: `${SITE_NAME} — Mount remote folders as a local drive`,
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${TAGLINE}`,
    description: DEFAULT_DESCRIPTION,
  },
};

const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "macOS, Windows, Linux",
  description: DEFAULT_DESCRIPTION,
  url: SITE_URL,
  downloadUrl: `${SITE_URL}/download`,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  featureList: [
    "Peer-to-peer folder mounting",
    "Join-code sharing",
    "Playhead-first media prefetch",
    "End-to-end encrypted QUIC",
    "Open source MIT",
  ],
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Is Wormhole a Dropbox alternative for large media?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "For editors and game teams moving tens of gigabytes, Wormhole mounts a live folder over P2P instead of parking files on a cloud drive.",
      },
    },
    {
      "@type": "Question",
      name: "How is Wormhole different from Syncthing?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Syncthing syncs copies. Wormhole mounts the remote path as a drive with join codes—seconds to connect, one live library.",
      },
    },
    {
      "@type": "Question",
      name: "How is Wormhole different from LocalSend?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "LocalSend pushes files across the LAN. Wormhole mounts the whole folder as a live drive so you can scrub and edit without copying first—with the same zero-config Nearby discovery feel.",
      },
    },
    {
      "@type": "Question",
      name: "Can video editors scrub before media is fully local?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Playhead-first prefetch lands the scrub chunk first so DaVinci and Premiere can keep moving while bytes fill in.",
      },
    },
    {
      "@type": "Question",
      name: "Is Wormhole free?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Core sharing stays free forever. Pro and Team tiers are planned for power features after launch.",
      },
    },
  ],
};

export default function Page() {
  return (
    <>
      <JsonLd data={softwareJsonLd} />
      <JsonLd data={faqJsonLd} />
      <HomePage />
    </>
  );
}
