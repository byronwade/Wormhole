import { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
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
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
