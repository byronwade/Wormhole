import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NicheMarketingPage } from "@/components/niche-page";
import { NICHES, nicheBySlug, SITE_URL, type NicheSlug } from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return NICHES.map((n) => ({ slug: n.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const niche = nicheBySlug(slug);
  if (!niche) return {};

  return {
    title: niche.metaTitle,
    description: niche.metaDescription,
    keywords: [...niche.keywords],
    alternates: { canonical: `/for/${niche.slug}` },
    openGraph: {
      title: niche.metaTitle,
      description: niche.metaDescription,
      url: `${SITE_URL}/for/${niche.slug}`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: niche.metaTitle,
      description: niche.metaDescription,
    },
  };
}

export default async function ForNichePage({ params }: Props) {
  const { slug } = await params;
  const niche = nicheBySlug(slug as NicheSlug);
  if (!niche) notFound();
  return <NicheMarketingPage niche={niche} />;
}
