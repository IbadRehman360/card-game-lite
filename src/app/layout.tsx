import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Oswald } from "next/font/google";
import { APP_NAME } from "@/lib/brand";
import { PwaBoot } from "@/components/pwa/pwa-boot";
import "./globals.css";
import "@/components/ui/modal.css";

// Oswald: condensed, upright display type for the title, buttons and names.
const oswald = Oswald({ variable: "--font-oswald", weight: ["500", "600", "700"], subsets: ["latin"] });
// IBM Plex Mono: small HUD labels, key hints and codes.
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", weight: ["400", "500", "600"], subsets: ["latin"] });

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
    <html lang="en" className={`${oswald.variable} ${plexMono.variable} antialiased`} suppressHydrationWarning>
      <body className="h-dvh w-screen overflow-hidden">
        {children}
        <PwaBoot />
      </body>
    </html>
  );
}
