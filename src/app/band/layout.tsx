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
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function BandLayout({ children }: LayoutProps<"/band">) {
  return <div className="flex min-h-dvh flex-1 flex-col bg-black text-white">{children}</div>;
}
