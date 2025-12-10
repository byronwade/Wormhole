import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = "https://wormhole.byronwade.com";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/j/", // Join code pages (dynamic, not for indexing)
          "/api/", // API routes
          "/_next/", // Next.js internals
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
