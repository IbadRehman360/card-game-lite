import type { Metadata, Viewport } from "next";
import { Baloo_2 } from "next/font/google";
import { APP_NAME } from "@/lib/brand";
import { PwaBoot } from "@/components/pwa/pwa-boot";
import "./globals.css";
import "@/components/ui/modal.css";

// Baloo 2: one bold, rounded, friendly face for everything (titles, buttons, names, rules text).
// The CSS still reads it through the old --font-oswald / --font-plex-mono names, so every rule that
// used the condensed display face or the monospace HUD face now gets Baloo without touching them.
const ui = Baloo_2({ variable: "--font-oswald", weight: ["500", "600", "700", "800"], subsets: ["latin"] });
const uiAlt = Baloo_2({ variable: "--font-plex-mono", weight: ["500", "600", "700", "800"], subsets: ["latin"] });

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Baazi: Court Piece, online. Play the computer, friends online, or friends at the same table.",
  applicationName: APP_NAME,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#050403",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${ui.variable} ${uiAlt.variable} antialiased`} suppressHydrationWarning>
      <body className="h-dvh w-screen overflow-hidden">
        {children}
        <PwaBoot />
      </body>
    </html>
  );
}
