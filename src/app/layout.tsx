import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Jost } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { MotionProvider } from "@/components/MotionProvider";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { RouteTransition } from "@/components/shell/RouteTransition";
import { SITE } from "@/config/site";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

/** Geometric grotesque — the display face, chosen to rhyme with the wordmark. */
const jost = Jost({ variable: "--font-jost", subsets: ["latin"], weight: ["300", "400", "500"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — ${SITE.positioning}`,
    template: `%s — ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.positioning}`,
    description: SITE.description,
    url: SITE.url,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} — ${SITE.positioning}`,
    description: SITE.description,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#080A08",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${jost.variable}`}>
      <body className="flex min-h-dvh flex-col bg-void text-ink antialiased">
        <a href="#main" className="skip-link">
          SKIP TO CONTENT
        </a>
        <Providers>
          <MotionProvider>
            <SiteHeader />
            <main id="main" className="flex flex-1 flex-col">
              <RouteTransition>{children}</RouteTransition>
            </main>
            <SiteFooter />
          </MotionProvider>
        </Providers>
      </body>
    </html>
  );
}
