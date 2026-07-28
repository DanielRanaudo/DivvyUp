import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthProvider";
import { SITE_URL } from "@/lib/config";
import DemoBanner from "@/components/DemoBanner";
import SiteFooter from "@/components/SiteFooter";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const title = "DivvyUp — Payment Planning for Roommates";
const description =
  "Split expenses with your roommates, effortlessly. Manage rent, utilities, and shared costs.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title,
  description,
  applicationName: "DivvyUp",
  appleWebApp: { capable: true, title: "DivvyUp", statusBarStyle: "default" },
  openGraph: {
    type: "website",
    siteName: "DivvyUp",
    title,
    description,
    url: "/",
  },
  twitter: { card: "summary", title, description },
  // A shared-finance app has nothing to gain from being indexed, and group
  // pages are behind auth anyway.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f5f5f7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      {/*
        Extensions like Grammarly stamp attributes onto <body> before React
        hydrates, which reads as a mismatch. This suppresses that for the body
        tag alone; it does not extend to anything rendered inside it.
      */}
      <body suppressHydrationWarning>
        <DemoBanner />
        <AuthProvider>{children}</AuthProvider>
        <SiteFooter />
      </body>
    </html>
  );
}
