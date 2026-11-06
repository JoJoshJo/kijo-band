import type { NextRequest } from "next/server";
import { isResidentId } from "@/app/api/alert/validate";

// GET /band/manifest.webmanifest[?resident=<id>] — web app manifest for the Kijo Band home-screen app.
// Per resident, so "Add to Home Screen" opens straight into that resident's band (and each resident's
// install is a separate app id). The band page points its <link rel="manifest"> here with its resident.
export function GET(request: NextRequest) {
  const r = request.nextUrl.searchParams.get("resident");
  const start = r && isResidentId(r) ? `/band?resident=${encodeURIComponent(r)}` : "/band";
  return Response.json(
    {
      id: start,
      name: "Kijo Band",
      short_name: "Kijo Band",
      description: "Kijo Band — resident help band",
      start_url: start,
      scope: "/band",
      display: "standalone",
      orientation: "portrait",
      background_color: "#000000",
      theme_color: "#000000",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" } },
  );
}
