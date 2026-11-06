"use client";

import { SpeakerHigh, SpeakerSlash, Warning } from "@phosphor-icons/react";
import type { useAlarmSounds } from "./useAlarmSounds";

/** Header sound button + a pulsing warning while muted with unacknowledged P1 alarms. */
export default function SoundToggle({ sound }: { sound: ReturnType<typeof useAlarmSounds> }) {
  const label = sound.muted ? "Muted" : sound.ready ? "Sound on" : "Enable sound";
  return (
    <>
      {sound.muted && sound.critical > 0 && (
        <span
          role="status"
          className="kijo-pulse inline-flex h-9 items-center gap-1.5 rounded-full border border-alarm/60 bg-alarm/15 px-3 text-sm font-medium text-ink"
        >
          <Warning size={16} weight="bold" className="text-alarm" aria-hidden />
          Muted · {sound.critical} critical alarm{sound.critical === 1 ? "" : "s"}
        </span>
      )}
      <button
        type="button"
        onClick={sound.toggleMute}
        aria-pressed={sound.muted}
        title={sound.ready ? (sound.muted ? "Unmute alarm sounds" : "Mute alarm sounds") : "Turn on alarm sounds (the browser needs one click first)"}
        className={`inline-flex h-9 items-center gap-1.5 rounded-btn border px-3 text-sm font-medium transition-colors hover:bg-surface-2 ${
          sound.muted ? "border-line-2 text-muted" : "border-line-2 text-ink"
        }`}
      >
        {sound.muted ? <SpeakerSlash size={18} aria-hidden /> : <SpeakerHigh size={18} aria-hidden />}
        <span className="hidden sm:inline">{label}</span>
      </button>
    </>
  );
}
