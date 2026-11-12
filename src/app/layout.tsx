import type { Metadata } from "next";
import { connection } from "next/server";
import { Poppins } from "next/font/google";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { Providers } from "@/components/providers";

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });

const DESCRIPTION = "Google Business Profile reviews for every location, in one place.";

export const metadata: Metadata = {
  // Makes the share-preview image (opengraph-image.png, twitter-image.png) an absolute URL. Unset only in local builds.
  metadataBase: process.env.APP_URL ? new URL(process.env.APP_URL) : undefined,
  title: "Review Dashboard",
  description: DESCRIPTION,
  applicationName: "Review Dashboard",
  openGraph: { title: "Review Dashboard", description: DESCRIPTION, siteName: "Review Dashboard", type: "website" },
  twitter: { card: "summary_large_image", title: "Review Dashboard", description: DESCRIPTION },
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render per request: the CSP nonce (proxy.ts) can only be added to the scripts of a page rendered for that request.
  await connection();
  return (
    <html lang="en" className={poppins.variable}>
      <body suppressHydrationWarning>
        <AppRouterCacheProvider>
          <Providers>{children}</Providers>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
