import type { Language } from "@/lib/types";
import { MAX_TRANSCRIPT_CHARS, decideUtterance, findWakeWord, normalize, type VoiceDecision } from "@/lib/detection/voice";
import { SPEECH_LANG } from "./speechLang";

/**
 * Kijo's ONE speech recognizer, as a plain state machine (no React; unit-tested with a fake recognizer
 * and a fake clock). Audio stays inside the browser's recognizer; only one sentence (≤ 300 chars) is
 * passed on. Default recognizer everywhere (no on-device mode).
 *
 *   idle ──start──▶ starting ──onstart──▶ listening ──end/error──▶ restarting ──backoff──▶ starting …
 *                                                       └─ 5 failed tries in a minute / refused ──▶ error
 *
 * Modes of the same recognizer:
 * - background: rules in decideUtterance() (emergency / short base word / "Kijo …").
 * - capture:    after "Kijo" alone — the next utterance within 8 s is the request.
 * - talk:       tap and talk — the next utterance, whatever it is. If the recognizer is already listening
 *               it is REUSED (no stop/start, so never two recognizers and no iOS gesture problem);
 *               otherwise it is started synchronously inside the tap. Afterwards it simply carries on in
 *               background mode.
 * While muted (the band is speaking) results are dropped instead of stopping the recognizer: on iOS a
 * restart without a tap is refused, so stopping would kill listening after every spoken reply.
 */

// ── Minimal Web Speech API typings (not in TypeScript's DOM lib) ──
interface ResultLike {
  isFinal: boolean;
  /** number of alternatives (maxAlternatives) */
  length?: number;
  [alt: number]: { transcript: string };
}
export interface RecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<ResultLike>;
}
export interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onresult: ((e: RecognitionEventLike) => void) | null;
  maxAlternatives?: number;
  /** Chrome contextual biasing (experimental): SpeechRecognitionPhrase[] */
  phrases?: unknown;
  start(): void;
  abort(): void;
}
export type RecognitionCtor = new () => RecognitionLike;

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}
const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export type VoiceState = "idle" | "starting" | "listening" | "restarting" | "error";
export type VoiceMode = "background" | "capture" | "talk";
export type VoiceProblem = "unsupported" | "open-in-safari" | "dictation-off" | "mic-blocked";
export type IosContext = "safari" | "standalone" | "other-browser" | null;

export interface VoiceSnapshot {
  state: VoiceState;
  mode: VoiceMode;
  /** "Tap to resume listening" */
  needsTap: boolean;
  problem: VoiceProblem | null;
  engine: string;
  lang: string;
  /** Debug only (empty unless `debug`): on screen, never logged or sent. */
  lastInterim: string;
  lastFinal: string;
  decision: string;
  restarts: number;
  lastError: string;
  /** Debug only: every alternative of the last result, the matched one marked ✓ */
  alternatives: string;
  /** Time from the last recognizer end to the next start (ms) */
  deafGapMs: number;
  /** Phrase biasing: on / off (no API) / unsupported (engine refused it) */
  bias: "on" | "off" | "unsupported";
}

export interface VoiceEvents {
  /** Background trigger (emergency / base word / "Kijo …") */
  onTrigger(text: string): void;
  /** Tap and talk sentence */
  onTalk(text: string): void;
  /** "Kijo" alone */
  onWake(): void;
  onChange(s: VoiceSnapshot): void;
}

// Retrying won't help: permission / Siri & Dictation off / no microphone / language.
const BLOCKING = new Set(["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"]);
export const BACKOFF_MS = [300, 1000, 2000];
export const MAX_FAILS_PER_MIN = 5;
export const HEALTHY_MS = 3000; // a session that started and ran this long (or heard something) was fine
export const START_WATCHDOG_MS = 4000; // no `start` event by then → the engine silently refused
export const TALK_TIMEOUT_MS = 10_000;
export const TALK_SETTLE_MS = 1500; // tap and talk: interim unchanged this long → take it (iOS rarely finalises)
export const WAKE_CAPTURE_MS = 8000;
export const DEDUPE_MS = 5000;
export const MAX_ALTERNATIVES = 5;
/** A healthy end ("end"/"no-speech" after a session that ran this long or heard something) restarts at 0 ms. */
export const MIN_HEALTHY_MS = 500;
/** Interim base word: fire once the interim has held still this long (keeps the ≤ 6-word rule). */
export const INTERIM_BASE_SETTLE_MS = 300;

/** Phrase biasing per language (Chrome SpeechRecognition.phrases); moderate boosts, MDN warns 9–10 over-match. */
export const BIAS_PHRASES: Record<Language, [string, number][]> = {
  en: [["Kijo", 5], ["help", 3], ["help me", 3], ["water", 3], ["toilet", 3], ["pain", 3]],
  fr: [["Kijo", 5], ["aide", 3], ["aidez-moi", 3], ["au secours", 3], ["eau", 3], ["toilettes", 3], ["douleur", 3], ["j'ai mal", 3]],
  es: [["Kijo", 5], ["ayuda", 3], ["ayúdeme", 3], ["agua", 3], ["baño", 3], ["dolor", 3], ["me duele", 3]],
};
type PhraseCtor = new (phrase: string, boost: number) => unknown;

const clean = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, MAX_TRANSCRIPT_CHARS);

/** Dev only: states, language and error codes. Never the transcript. */
function vlog(msg: string) {
  if (process.env.NODE_ENV === "development") console.debug(`[voice] ${msg}`);
}

interface Session {
  rec: RecognitionLike;
  tag: string;
  lang: Language;
  fromGesture: boolean;
  started: boolean;
  startedAt: number;
  heardSomething: boolean;
  interim: string;
  /** "index:text" of finals already handled (some engines re-deliver them; others restart at index 0) */
  seenFinals: Set<string>;
  /** result indexes already sent from an interim: their final is skipped once */
  firedFromInterim: Set<number>;
  interimAlts: string[];
  interimIdx: number;
  /** normalized text already acted on from an interim; the matching final is skipped */
  consumed: string | null;
  error: string | null;
  watchdog: unknown;
}

/** All alternatives of one result, best first. */
function alternativesOf(r: ResultLike): string[] {
  const n = Math.max(1, Math.min(r.length ?? 1, MAX_ALTERNATIVES));
  const out: string[] = [];
  for (let k = 0; k < n; k++) if (r[k]?.transcript) out.push(r[k].transcript);
  return out.length ? out : [""];
}

/** The first alternative that triggers; emergencies beat everything, then wake word, then base word. */
export function pickAlternative(alts: string[], lang: Language): { index: number; d: VoiceDecision } | null {
  const ds = alts.map((a) => decideUtterance(a, lang));
  const rank = (d: VoiceDecision) =>
    d.action === "send" ? (d.kind === "emergency" ? 0 : d.kind === "wake" ? 1 : 2) : d.action === "ask" ? 3 : 9;
  let best = -1;
  ds.forEach((d, i) => {
    if (rank(d) < 9 && (best < 0 || rank(d) < rank(ds[best]))) best = i;
  });
  return best < 0 ? null : { index: best, d: ds[best] };
}

const markAlts = (alts: string[], hit: number) => alts.map((a, i) => (i === hit ? `${a} ✓` : a)).join(" | ");

export class VoiceEngine {
  private s: VoiceSnapshot;
  private session: Session | null = null;
  private enabled = false;
  private muted = false;
  private lang: Language = "en";
  private everStarted = false;
  private failStep = 0;
  private failTimes: number[] = [];
  private restartTimer: unknown = null;
  private captureTimer: unknown = null;
  private talkTimer: unknown = null;
  private settleTimer: unknown = null;
  private lastFired: { norm: string; at: number } | null = null;
  private endedAt: number | null = null;
  private biasRefused = false;
  private baseSettleTimer: unknown = null;

  constructor(
    private Ctor: RecognitionCtor | null,
    private ev: VoiceEvents,
    private opts: { clock?: Clock; debug?: boolean; ios?: () => IosContext; engineName?: string; phraseCtor?: PhraseCtor | null } = {},
  ) {
    this.s = {
      state: "idle",
      mode: "background",
      needsTap: false,
      problem: Ctor ? null : "unsupported",
      engine: opts.engineName ?? (Ctor ? "SpeechRecognition" : "none"),
      lang: SPEECH_LANG.en,
      lastInterim: "",
      lastFinal: "",
      decision: "",
      restarts: 0,
      lastError: "",
      alternatives: "",
      deafGapMs: 0,
      bias: "off",
    };
  }

  private get clock() {
    return this.opts.clock ?? realClock;
  }
  private ios(): IosContext {
    return this.opts.ios?.() ?? null;
  }

  /** Send the current snapshot to onChange (e.g. right after creating the engine). */
  publish() {
    this.ev.onChange(this.s);
  }

  get snapshot(): VoiceSnapshot {
    return this.s;
  }

  private set(patch: Partial<VoiceSnapshot>) {
    if (!this.opts.debug) {
      delete patch.lastInterim;
      delete patch.lastFinal;
      delete patch.alternatives;
    }
    const next = { ...this.s, ...patch };
    if ((Object.keys(patch) as (keyof VoiceSnapshot)[]).every((k) => next[k] === this.s[k])) return;
    this.s = next;
    this.ev.onChange(next);
  }

  private clear(t: unknown) {
    if (t != null) this.clock.clearTimeout(t);
    return null;
  }

  // ── Inputs ──

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.stop();
    else if (this.s.state === "idle") this.start(false);
  }

  setDebug(on: boolean) {
    this.opts = { ...this.opts, debug: on };
  }

  setLang(lang: Language) {
    if (lang === this.lang) return;
    this.lang = lang;
    this.set({ lang: SPEECH_LANG[lang] });
    if (this.session) this.restartNow(false); // needs the new language
  }

  /** While the band is speaking: keep the recognizer, drop what it hears. */
  setMuted(m: boolean) {
    if (m === this.muted) return;
    this.muted = m;
    if (this.session) this.session.interim = "";
    // "Kijo" → "Yes?" is spoken: the 8 s to say the request start once the band has finished talking.
    if (!m && this.s.mode === "capture") this.armCapture();
  }

  /** Start / resume listening now. Call it inside a tap (iOS); optional new language. */
  arm(lang?: Language) {
    if (!this.Ctor) return this.set({ problem: "unsupported" });
    this.enabled = true;
    this.failStep = 0;
    this.failTimes = [];
    this.set({ needsTap: false, problem: null });
    if (lang && lang !== this.lang) {
      this.lang = lang;
      this.set({ lang: SPEECH_LANG[lang] });
    }
    const sess = this.session;
    if (sess && sess.lang === this.lang && (sess.started || sess.fromGesture)) return; // already fine
    this.restartNow(true);
  }

  /** Tap and talk (call inside the tap). False when this browser has no speech recognition. */
  talk(): boolean {
    if (!this.Ctor) return false;
    if (this.s.mode === "talk") return true;
    this.endCapture();
    this.set({ mode: "talk", needsTap: false, problem: null, decision: "tap-and-talk: listening" });
    this.talkTimer = this.clear(this.talkTimer);
    this.talkTimer = this.clock.setTimeout(() => this.talkTimeout(), TALK_TIMEOUT_MS);
    const sess = this.session;
    if (sess?.started && sess.lang === this.lang) {
      sess.interim = ""; // reuse the running recognizer: nothing to stop, nothing to start
      vlog("talk: reusing the running recognizer");
    } else {
      this.failStep = 0;
      this.failTimes = [];
      this.restartNow(true); // synchronously inside the tap
    }
    return true;
  }

  stop() {
    this.restartTimer = this.clear(this.restartTimer);
    this.talkTimer = this.clear(this.talkTimer);
    this.settleTimer = this.clear(this.settleTimer);
    this.baseSettleTimer = this.clear(this.baseSettleTimer);
    this.endCapture();
    this.kill();
    this.set({ state: "idle", mode: "background" });
  }

  destroy() {
    this.enabled = false;
    this.stop();
  }

  // ── Recognizer lifecycle ──

  /** Drop the current recognizer: handlers detached first, so its late events can't touch anything. */
  private kill() {
    const sess = this.session;
    this.session = null;
    if (!sess) return;
    this.clear(sess.watchdog);
    const r = sess.rec;
    r.onstart = r.onresult = r.onerror = r.onend = null;
    try {
      r.abort();
    } catch {
      // already stopped
    }
  }

  private restartNow(fromGesture: boolean) {
    this.restartTimer = this.clear(this.restartTimer);
    this.kill();
    this.start(fromGesture);
  }

  private start(fromGesture: boolean) {
    if (!this.Ctor || this.session) return;
    if (!this.enabled && this.s.mode !== "talk") return;
    const tag = SPEECH_LANG[this.lang];
    const rec = new this.Ctor();
    rec.lang = tag;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = MAX_ALTERNATIVES;
    this.setBias(rec);
    const sess: Session = {
      rec,
      tag,
      lang: this.lang,
      fromGesture,
      started: false,
      startedAt: this.clock.now(),
      heardSomething: false,
      interim: "",
      seenFinals: new Set(),
      firedFromInterim: new Set(),
      interimAlts: [],
      interimIdx: -1,
      consumed: null,
      error: null,
      watchdog: null,
    };
    this.session = sess;
    const live = () => this.session === sess;

    sess.watchdog = this.clock.setTimeout(() => {
      if (!live() || sess.started) return;
      vlog(`no start event after ${START_WATCHDOG_MS} ms`);
      this.kill();
      this.ended(sess, "no-start");
    }, START_WATCHDOG_MS);

    rec.onstart = () => {
      if (!live()) return;
      sess.started = true;
      sess.startedAt = this.clock.now();
      this.everStarted = true;
      this.clear(sess.watchdog);
      const gap = this.endedAt == null ? this.s.deafGapMs : Math.round(this.clock.now() - this.endedAt);
      this.endedAt = null;
      this.set({ state: "listening", needsTap: false, problem: null, deafGapMs: gap });
    };
    rec.onresult = (e) => {
      if (!live()) return;
      sess.heardSomething = true;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const alts = alternativesOf(r);
        if (!r.isFinal) {
          interim += alts[0] + " ";
          sess.interimAlts = alts;
          sess.interimIdx = i;
          continue;
        }
        const key = `${i}:${normalize(alts[0])}`;
        if (sess.seenFinals.has(key)) continue; // Android re-delivers earlier finals
        sess.seenFinals.add(key);
        sess.interim = "";
        sess.interimAlts = [];
        this.baseSettleTimer = this.clear(this.baseSettleTimer);
        if (sess.firedFromInterim.delete(i)) {
          this.set({ lastFinal: alts[0], decision: `${this.s.decision} (final skipped: sent from interim)` });
          continue;
        }
        this.heard(sess, alts, "final");
        if (!live()) return;
      }
      if (interim.trim()) this.interim(sess, clean(interim));
    };
    rec.onerror = (e) => {
      if (!live()) return;
      sess.error = e.error;
      if (e.error === "phrases-not-supported") {
        this.biasRefused = true; // restart without biasing, not counted as a failure
        this.set({ bias: "unsupported" });
      }
      this.set({ lastError: e.error });
      if (e.error !== "no-speech" && e.error !== "aborted") vlog(`error: ${e.error}`);
    };
    rec.onend = () => {
      if (!live()) return;
      this.clear(sess.watchdog);
      // Ended without a final result (seen on iOS Safari): the last interim counts.
      this.baseSettleTimer = this.clear(this.baseSettleTimer);
      if (sess.interim && !sess.firedFromInterim.has(sess.interimIdx)) {
        const alts = sess.interimAlts.length ? sess.interimAlts : [sess.interim];
        sess.interim = "";
        this.heard(sess, alts, "interim");
      }
      if (!live()) return;
      this.session = null;
      this.ended(sess, sess.error ?? "end");
    };

    this.set({ state: "starting", lang: tag });
    try {
      rec.start();
      vlog(`start lang=${tag} ${fromGesture ? "(tap)" : "(auto)"}`);
    } catch (err) {
      vlog(`start threw ${err instanceof Error ? err.name : String(err)}`);
      this.kill();
      this.ended(sess, "start-threw");
    }
  }

  /** The recognizer is gone (end, error, watchdog, throw): restart with backoff, or stop for a tap. */
  private ended(sess: Session, reason: string) {
    this.settleTimer = this.clear(this.settleTimer);
    const now = this.clock.now();
    if (this.s.mode === "talk" && reason !== "end" && reason !== "no-speech") this.endTalk(`tap-and-talk: ${reason}`);
    if (!this.enabled && this.s.mode !== "talk") return this.set({ state: "idle", mode: "background" });

    if (BLOCKING.has(reason)) {
      // An AUTOMATIC restart refused after listening worked before (iOS: no gesture) → a tap re-arms it.
      if (!sess.fromGesture && this.everStarted && reason !== "language-not-supported" && reason !== "audio-capture")
        return this.halt(reason);
      return this.fail(this.classify(reason), reason);
    }
    // A start made inside a tap that throws or never starts won't be fixed by automatic retries.
    if (sess.fromGesture && (reason === "start-threw" || reason === "no-start")) return this.halt(reason);
    // Healthy = it listened and simply ended ("end" / "no-speech", or biasing refused): restart at 0 ms.
    // Real errors (network, aborted by the engine, never started…) back off.
    const quietEnd = reason === "end" || reason === "no-speech";
    const healthy =
      reason === "phrases-not-supported" || // biasing now off: just start again
      (sess.started && quietEnd && (sess.heardSomething || now - sess.startedAt >= MIN_HEALTHY_MS));
    let delay = 0;
    this.endedAt = now;
    if (healthy) {
      this.failStep = 0;
      this.set({ state: "restarting", restarts: this.s.restarts + 1 });
      vlog(`restart now (${reason})`);
      return this.start(false);
    } else {
      this.failTimes = this.failTimes.filter((t) => now - t < 60_000);
      this.failTimes.push(now);
      if (this.failTimes.length >= MAX_FAILS_PER_MIN) return this.halt(reason);
      delay = BACKOFF_MS[Math.min(this.failStep, BACKOFF_MS.length - 1)];
      this.failStep++;
    }
    this.set({ state: "restarting", restarts: this.s.restarts + 1 });
    vlog(`restart in ${delay} ms (${reason}${healthy ? "" : ", failed"})`);
    this.restartTimer = this.clock.setTimeout(() => {
      this.restartTimer = null;
      this.start(false);
    }, delay);
  }

  /** Contextual biasing where the browser has it (Chrome SpeechRecognition.phrases); skipped silently otherwise. */
  private setBias(rec: RecognitionLike) {
    const Phrase =
      this.opts.phraseCtor !== undefined
        ? this.opts.phraseCtor
        : ((globalThis as unknown as { SpeechRecognitionPhrase?: PhraseCtor }).SpeechRecognitionPhrase ?? null);
    if (this.biasRefused || !Phrase || !("phrases" in rec)) {
      if (!this.biasRefused) this.set({ bias: "off" });
      return;
    }
    try {
      rec.phrases = BIAS_PHRASES[this.lang].map(([p, boost]) => new Phrase(p, boost));
      this.set({ bias: "on" });
    } catch {
      this.set({ bias: "off" });
    }
  }

  /** Stop retrying; one tap ("Tap to resume listening") starts again. */
  private halt(reason: string) {
    const ios = this.ios();
    if (ios === "standalone" || ios === "other-browser") return this.fail("open-in-safari", reason);
    vlog(`halted (${reason}) → needs a tap`);
    this.endTalk();
    this.set({ state: "error", needsTap: true });
  }

  private fail(problem: VoiceProblem, reason: string) {
    vlog(`halted (${reason}) → ${problem}`);
    this.endTalk();
    this.set({ state: "error", problem, needsTap: false });
  }

  private classify(reason: string): VoiceProblem {
    const ios = this.ios();
    if (ios === "standalone" || ios === "other-browser") return "open-in-safari";
    if (reason === "language-not-supported") return "unsupported";
    if (ios === "safari" && (reason === "not-allowed" || reason === "service-not-allowed")) return "dictation-off";
    return "mic-blocked";
  }

  // ── What was heard ──

  private interim(sess: Session, text: string) {
    sess.interim = text;
    this.set({ lastInterim: text });
    if (this.s.mode !== "talk") return this.interimTrigger(sess);
    // Tap and talk: an interim that stops changing is the sentence (iOS may never mark it final).
    this.settleTimer = this.clear(this.settleTimer);
    this.settleTimer = this.clock.setTimeout(() => {
      this.settleTimer = null;
      if (this.session !== sess || !sess.interim || this.s.mode !== "talk") return;
      const t = sess.interim;
      sess.interim = "";
      this.heard(sess, [t], "interim");
    }, TALK_SETTLE_MS);
  }

  /**
   * One utterance (all its alternatives, best first). Talk / capture take the best alternative as the
   * sentence; background picks the first alternative that triggers (emergency first).
   */
  private heard(sess: Session, rawAlts: string[], source: "final" | "interim") {
    const alts = rawAlts.map(clean).filter(Boolean);
    if (!alts.length) return;
    const text = alts[0];
    const norm = normalize(text);
    if (source === "final") this.set({ lastFinal: text });
    if (sess.consumed && alts.some((a) => { const n = normalize(a); return n === sess.consumed || n.startsWith(sess.consumed!); })) {
      sess.consumed = null; // the final of an interim we already acted on
      return;
    }
    if (source === "interim") sess.consumed = norm;
    if (this.s.mode === "talk") {
      this.settleTimer = this.clear(this.settleTimer);
      this.set({ alternatives: markAlts(alts, 0) });
      const cmd = findWakeWord(text)?.command ?? text; // "Kijo, water" → "water"
      if (!cmd) return; // just "Kijo": keep listening for the request
      this.endTalk();
      return this.fire(cmd, "tap-and-talk → sent", (t) => this.ev.onTalk(t));
    }
    const pick = pickAlternative(alts, sess.lang);
    this.set({ alternatives: markAlts(alts, pick?.index ?? -1) });
    if (this.muted) {
      // The band's own speech never contains an emergency phrase, so one heard now is the resident.
      if (pick?.d.action === "send" && pick.d.kind === "emergency") return this.fire(pick.d.text, "emergency → sent", (t) => this.ev.onTrigger(t));
      return this.set({ decision: "ignored: band speaking" });
    }
    if (this.s.mode === "capture") {
      const cmd = findWakeWord(text)?.command ?? text; // "Kijo" said again → wait for the rest
      if (!cmd) return;
      this.endCapture();
      return this.fire(cmd, "wake word → sent", (t) => this.ev.onTrigger(t));
    }
    const d = pick?.d ?? decideUtterance(text, sess.lang);
    const alt = pick && pick.index > 0 ? ` (alternative ${pick.index + 1})` : "";
    if (d.action === "send") return this.fire(d.text, `${d.kind === "base" ? "base word" : d.kind === "wake" ? "wake word" : "emergency"} → sent${alt}`, (t) => this.ev.onTrigger(t));
    if (d.action === "ask") {
      this.set({ mode: "capture", decision: "wake word → Yes?" });
      this.armCapture();
      return this.ev.onWake();
    }
    this.set({ decision: d.reason === "too-long" ? "ignored: too long" : "ignored: no trigger" });
  }

  /**
   * Background interim: an emergency phrase fires at once; a short base word fires once the interim has
   * held still for INTERIM_BASE_SETTLE_MS (so "water in this glass is too cold" isn't sent at "water").
   * "Kijo …" waits for the final. The final of a result sent from its interim is skipped.
   */
  private interimTrigger(sess: Session) {
    const i = sess.interimIdx;
    if (this.s.mode !== "background" || sess.firedFromInterim.has(i)) return;
    const alts = sess.interimAlts.map(clean).filter(Boolean);
    const pick = pickAlternative(alts, sess.lang);
    if (!pick || pick.d.action !== "send" || pick.d.kind === "wake") return;
    if (findWakeWord(alts[0])) return; // "Kijo …" → wait for the final
    if (this.muted && pick.d.kind !== "emergency") return;
    const send = () => {
      if (this.session !== sess || sess.firedFromInterim.has(i)) return;
      if (pick.d.action !== "send") return;
      sess.firedFromInterim.add(i);
      sess.interim = "";
      this.set({ alternatives: markAlts(alts, pick.index), lastInterim: alts[0] });
      this.fire(pick.d.text, `${pick.d.kind === "emergency" ? "emergency" : "base word"} → sent (interim)`, (t) => this.ev.onTrigger(t));
    };
    this.baseSettleTimer = this.clear(this.baseSettleTimer);
    if (pick.d.kind === "emergency") return send();
    this.baseSettleTimer = this.clock.setTimeout(() => {
      this.baseSettleTimer = null;
      // still the same interim, still a short base word?
      const now = pickAlternative(sess.interimAlts.map(clean).filter(Boolean), sess.lang);
      if (sess.interimIdx === i && now?.d.action === "send" && now.d.kind === "base") send();
    }, INTERIM_BASE_SETTLE_MS);
  }

  /** Same utterance can't fire twice (engines re-deliver results; interim + final). */
  private fire(text: string, decision: string, send: (t: string) => void) {
    const norm = normalize(text);
    const now = this.clock.now();
    if (this.lastFired && this.lastFired.norm === norm && now - this.lastFired.at < DEDUPE_MS)
      return this.set({ decision: "ignored: duplicate" });
    this.lastFired = { norm, at: now };
    this.set({ decision });
    vlog(decision);
    send(text);
  }

  // ── Talk / capture windows ──

  private talkTimeout() {
    this.talkTimer = null;
    const sess = this.session;
    if (sess?.interim) {
      const t = sess.interim;
      sess.interim = "";
      this.heard(sess, [t], "interim");
    }
    if (this.s.mode === "talk") this.endTalk("tap-and-talk: nothing heard");
  }

  /** Back to background mode on the same recognizer (or stop it if background listening is off). */
  private endTalk(decision?: string) {
    this.talkTimer = this.clear(this.talkTimer);
    this.settleTimer = this.clear(this.settleTimer);
    if (this.s.mode !== "talk") return;
    this.set({ mode: "background", ...(decision ? { decision } : {}) });
    if (!this.enabled) this.stop();
  }

  private armCapture() {
    this.captureTimer = this.clear(this.captureTimer);
    this.captureTimer = this.clock.setTimeout(() => {
      this.captureTimer = null;
      if (this.s.mode === "capture") this.set({ mode: "background", decision: "wake word: no request in 8 s" });
    }, WAKE_CAPTURE_MS);
  }

  private endCapture() {
    this.captureTimer = this.clear(this.captureTimer);
    if (this.s.mode === "capture") this.set({ mode: "background" });
  }
}
