import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

/*
 * Fonts are fetched at BUILD time and served from this origin, so a running
 * instance makes no third-party request at all. That matters here beyond
 * privacy: the landing page claims the instrument works when the network is
 * bad, and a page that silently depends on fonts.gstatic.com does not.
 */
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Red-Team Harness — certification for payment-capable agents",
  description:
    "A defensive certification harness that measures whether an AI agent holding delegated payment authority behaves safely under adversarial conditions. No live-money mode exists.",
};

export const viewport: Viewport = {
  themeColor: "#04060a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
