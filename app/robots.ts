import type { MetadataRoute } from "next";

/** Internal tool: ask search engines to index nothing. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
