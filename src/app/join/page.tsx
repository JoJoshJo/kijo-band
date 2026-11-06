import type { Metadata, Viewport } from "next";
import Image from "next/image";
import JoinForm from "./JoinForm";

export const metadata: Metadata = {
  title: "Join Kijo",
  description: "Scan to become a resident — try Kijo Band on your phone",
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// /join — QR guest flow (spec section 8): judges and audience become guest residents on their own phones.
export default function JoinPage() {
  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center bg-black px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] text-white">
      <div className="overflow-hidden rounded-[22%] bg-white">
        <Image src="/icons/icon-192.png" alt="Kijo" width={88} height={88} priority />
      </div>
      <h1 className="mt-5 text-center text-3xl font-semibold">You&apos;re a resident now</h1>
      <p className="mt-2 max-w-sm text-center text-lg text-slate-400">
        Your phone becomes a Kijo Band. Press help, shake it, or say “help” — a nurse is alerted in seconds.
      </p>
      <JoinForm />
    </main>
  );
}
