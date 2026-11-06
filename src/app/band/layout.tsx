import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Kijo Band",
  description: "Kijo Band — resident help band",
  // The band page swaps in ?resident=<id> so the installed app opens that resident's band.
  manifest: "/band/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Kijo Band", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0b0f14",
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays allowed (accessibility); buttons use touch-action: manipulation, so a double tap
  // on a button doesn't zoom.
  viewportFit: "cover",
};

export default function BandLayout({ children }: LayoutProps<"/band">) {
  return <div className="flex min-h-dvh flex-1 flex-col bg-bg text-ink">{children}</div>;
}
