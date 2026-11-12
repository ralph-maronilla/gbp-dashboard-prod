import type { Metadata } from "next";
import { connection } from "next/server";
import { Poppins } from "next/font/google";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { Providers } from "@/components/providers";

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Review Dashboard",
  description: "Reviews across all connected locations",
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
