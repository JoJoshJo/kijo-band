import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Kijo Band",
  description: "Kijo Band — resident help band",
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
