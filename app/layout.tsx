import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { siteConfig } from "@/lib/site";
import { SmoothScroll } from "@/components/providers/SmoothScroll";
import { MagneticCursor } from "@/components/providers/MagneticCursor";
import { MotionProvider } from "@/components/providers/MotionProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["200", "300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s — ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: [
    "finance platform",
    "financial intelligence",
    "invoice management",
    "GST TDS automation",
    "payment approvals",
    "bank reconciliation",
    "corporate finance",
  ],
  authors: [{ name: siteConfig.name }],
  openGraph: {
    type: "website",
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    siteName: siteConfig.name,
  },
  twitter: { card: "summary_large_image", title: siteConfig.name, description: siteConfig.description },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#F8F8F6",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full print:bg-white">
        <div className="ambient print:hidden" aria-hidden />
        <div className="grain-fixed print:hidden" aria-hidden />
        <MotionProvider>
          <MagneticCursor />
          <SmoothScroll>{children}</SmoothScroll>
        </MotionProvider>
      </body>
    </html>
  );
}
