"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import Modal from "./Modal";

/** Large QR → ${NEXT_PUBLIC_APP_URL}/join (falls back to this site's origin if the env var is empty). */
export default function QrModal({ onClose }: { onClose: () => void }) {
  const [qr, setQr] = useState<{ url: string; dataUrl: string } | null>(null);

  useEffect(() => {
    const base = (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/+$/, "");
    const url = `${base}/join`;
    let cancelled = false;
    QRCode.toDataURL(url, { width: 720, margin: 1, errorCorrectionLevel: "M" })
      .then((dataUrl) => !cancelled && setQr({ url, dataUrl }))
      .catch((err) => console.error("QR generation failed:", err));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Modal title="Join the demo" onClose={onClose} wide>
      <div className="flex flex-col items-center gap-4">
        <div className="aspect-square w-full max-w-[520px] rounded-card border border-line bg-white p-4">
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr.dataUrl} alt={`QR code for ${qr.url}`} className="h-full w-full" />
          )}
        </div>
        <p className="text-display font-semibold text-ink">Scan to become a resident</p>
        {qr && <p className="font-mono text-sm text-muted">{qr.url}</p>}
      </div>
    </Modal>
  );
}
