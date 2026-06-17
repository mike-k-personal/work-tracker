import type { Metadata, Viewport } from "next";
import {
  Bricolage_Grotesque,
  Hanken_Grotesk,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import SWRegister from "@/components/SWRegister";

// "Precision instrument" type system: a characterful display grotesque, a
// refined body grotesque, and a technical mono for all numerics / timers.
const display = Bricolage_Grotesque({
  variable: "--font-display-src",
  subsets: ["latin"],
  display: "swap",
});

const sans = Hanken_Grotesk({
  variable: "--font-sans-src",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono-src",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: "Work Tracker",
  title: {
    default: "Work Tracker",
    template: "%s · Work Tracker",
  },
  description:
    "Personal day-planner, focus timer and Pomodoro tracker. Plan your day, run focused work sessions, and review your productivity.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Tracker",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#060910",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-bg text-text">
        <SWRegister />
        <Nav />
        {/* Offset for: the desktop sidebar (md+), the mobile bottom tab bar, and
            the iOS safe area at top (Dynamic Island / status bar) on mobile.
            `relative z-10` keeps content above the ambient background glow. */}
        <div className="relative z-10 flex min-h-dvh flex-col md:pl-60">
          <main className="flex flex-1 flex-col pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+4.5rem)] md:pt-0 md:pb-0">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
