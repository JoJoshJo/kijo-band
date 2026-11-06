import { CaretRight, QrCode, ShieldCheck, Stethoscope, Watch } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { findLogo } from "@/components/dashboard/findLogo";
import ThemeToggle from "@/components/theme/ThemeToggle";
import { nurseHref } from "@/components/dashboard/nurseHref";
import { MAIN_NURSE_ID } from "@/lib/demoConfig";

const ENTRIES = [
  { href: nurseHref(MAIN_NURSE_ID), icon: Stethoscope, title: "Nurse view", text: "Your residents and your alert queue" },
  { href: "/patient", icon: Watch, title: "Resident view", text: "The Kijo Band, as a resident wears it" },
  { href: "/dashboard", icon: ShieldCheck, title: "Charge view", text: "The whole floor, escalations and the night report" },
  { href: "/join", icon: QrCode, title: "Join as a resident", text: "Scan the QR code and use your phone as a band" },
] as const;

export default function Home() {
  const logoSrc = findLogo();
  return (
    <main className="relative flex min-h-screen flex-1 flex-col items-center justify-center gap-12 bg-bg px-4 py-16 text-ink sm:px-8">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="flex flex-col items-center gap-4">
        {logoSrc && (
          // Same treatment as the header: black-on-white source → white glyph on the dark background.
          <span className="relative block h-24 w-24 overflow-hidden" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} alt="" width={96} height={96} className="h-full w-full scale-[1.4] kj-logo" />
          </span>
        )}
        <h1 className="text-display font-semibold tracking-[0.4em] text-ink">KIJO</h1>
        <p className="text-base text-muted">Night-shift alerts for care homes</p>
      </div>

      <nav aria-label="Open a view" className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        {ENTRIES.map((e) => (
          <Link
            key={e.href}
            href={e.href}
            className="group flex items-center gap-4 rounded-card border border-line bg-surface p-6 transition-colors hover:border-line-2 hover:bg-surface-2"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-btn border border-line-2 bg-surface-2 text-ink" aria-hidden>
              <e.icon size={24} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-xl font-semibold text-ink">{e.title}</span>
              <span className="text-sm text-muted">{e.text}</span>
            </span>
            <CaretRight size={20} className="text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        ))}
      </nav>
    </main>
  );
}
