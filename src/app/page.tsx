import Link from "next/link";
import { findLogo } from "@/components/dashboard/findLogo";

const ENTRIES = [
  { href: "/nurse", icon: "🩺", title: "Nurse view", text: "Your residents and your alert queue" },
  { href: "/patient", icon: "⌚", title: "Patient view", text: "The Kijo Band, as a resident wears it" },
  { href: "/dashboard", icon: "🛡️", title: "Charge view", text: "Whole floor, escalations, Night Report" },
  { href: "/join", icon: "📱", title: "Join as a resident", text: "Scan the QR and become a guest room" },
] as const;

export default function Home() {
  const logoSrc = findLogo();
  return (
    <main className="flex min-h-screen flex-1 flex-col items-center justify-center gap-12 bg-[#070b14] px-8 py-16 text-slate-100">
      <div className="flex flex-col items-center gap-4">
        {logoSrc && (
          // Same treatment as the header: black-on-white source → white glyph on the dark background.
          <span className="relative block h-28 w-28 overflow-hidden" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} alt="" width={112} height={112} className="h-full w-full scale-[1.4] mix-blend-screen invert" />
          </span>
        )}
        <h1 className="text-5xl font-black tracking-[0.3em] text-white">KIJO</h1>
        <p className="text-xl text-slate-400">Caregiver platform</p>
      </div>

      <nav aria-label="Open a view" className="grid w-full max-w-4xl grid-cols-1 gap-5 sm:grid-cols-2">
        {ENTRIES.map((e) => (
          <Link
            key={e.href}
            href={e.href}
            className="group flex items-center gap-5 rounded-2xl border border-slate-700 bg-slate-900/80 p-7 transition hover:border-teal-500 hover:bg-slate-800 focus-visible:border-teal-400 focus-visible:outline-none"
          >
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-teal-500/15 text-3xl" aria-hidden>
              {e.icon}
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-2xl font-semibold text-white group-hover:text-teal-300">{e.title}</span>
              <span className="text-sm text-slate-400">{e.text}</span>
            </span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
