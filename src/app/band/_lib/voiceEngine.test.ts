// Run: npx tsx --test src/app/band/_lib/voiceEngine.test.ts
// Headless state-machine tests: fake recognizer + fake clock (no browser, no audio).
import { test } from "node:test";
import assert from "node:assert/strict";
import { VoiceEngine, type Clock, type IosContext, type RecognitionEventLike, type RecognitionLike, type VoiceSnapshot } from "./voiceEngine";

class FakeClock implements Clock {
  t = 0;
  private timers: { at: number; fn: () => void; id: number }[] = [];
  private next = 1;
  now() {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number) {
    const id = this.next++;
    this.timers.push({ at: this.t + ms, fn, id });
    return id;
  }
  clearTimeout(id: unknown) {
    this.timers = this.timers.filter((x) => x.id !== id);
  }
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const due = this.timers[0];
      if (!due || due.at > end) break;
      this.timers.shift();
      this.t = due.at;
      due.fn();
    }
    this.t = end;
  }
}

/** Every recognizer the engine creates; `live` = started and not yet ended/aborted. */
function harness(opts: { ios?: IosContext; throwOnStart?: () => boolean; phraseCtor?: (new (p: string, b: number) => unknown) | null } = {}) {
  const clock = new FakeClock();
  const recs: FakeRec[] = [];
  let maxLive = 0;
  const liveCount = () => recs.filter((r) => r.live).length;

  class FakeRec implements RecognitionLike {
    lang = "";
    continuous = false;
    interimResults = false;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((e: { error: string }) => void) | null = null;
    onresult: ((e: RecognitionEventLike) => void) | null = null;
    startCalls = 0;
    maxAlternatives = 1;
    phrases: unknown = [];
    aborted = false;
    live = false;
    results: { isFinal: boolean; 0: { transcript: string } }[] = [];
    constructor() {
      recs.push(this);
    }
    start() {
      this.startCalls++;
      if (opts.throwOnStart?.()) throw new Error("InvalidStateError");
      this.live = true;
      maxLive = Math.max(maxLive, liveCount());
    }
    abort() {
      this.aborted = true;
      this.live = false;
      this.onend?.();
    }
    // ── test drivers ──
    began() {
      this.onstart?.();
    }
    interim(text: string) {
      this.results = [...this.results.filter((r) => r.isFinal), { isFinal: false, 0: { transcript: text } }];
      this.onresult?.({ resultIndex: this.results.length - 1, results: this.results });
    }
    final(text: string, resultIndex?: number) {
      this.results = [...this.results.filter((r) => r.isFinal), { isFinal: true, 0: { transcript: text } }];
      this.onresult?.({ resultIndex: resultIndex ?? this.results.length - 1, results: this.results });
    }
    error(code: string) {
      this.onerror?.({ error: code });
    }
    end() {
      this.live = false;
      this.onend?.();
    }
  }

  const sent: { trigger: string[]; talk: string[]; wake: number } = { trigger: [], talk: [], wake: 0 };
  let snap: VoiceSnapshot | null = null;
  const engine = new VoiceEngine(
    FakeRec,
    {
      onTrigger: (t) => sent.trigger.push(t),
      onTalk: (t) => sent.talk.push(t),
      onWake: () => sent.wake++,
      onChange: (s) => (snap = s),
    },
    { clock, debug: true, ios: () => opts.ios ?? null, engineName: "fake", phraseCtor: opts.phraseCtor ?? null },
  );
  const last = () => recs[recs.length - 1];
  return { clock, recs, engine, sent, last, snap: () => snap ?? engine.snapshot, maxLive: () => maxLive };
}

test("starts one continuous recognizer with interim results in the band language", () => {
  const h = harness();
  h.engine.setLang("fr");
  h.engine.setEnabled(true);
  assert.equal(h.recs.length, 1);
  assert.equal(h.last().lang, "fr-FR");
  assert.equal(h.last().continuous, true);
  assert.equal(h.last().interimResults, true);
  assert.equal(h.snap().state, "starting");
  h.last().began();
  assert.equal(h.snap().state, "listening");
});

test("background: base word → sent; long chatter / no trigger → ignored (with the reason)", () => {
  const h = harness();
  h.engine.setEnabled(true);
  h.last().began();
  h.last().final("water please");
  assert.deepEqual(h.sent.trigger, ["water please"]);
  assert.equal(h.snap().decision, "base word → sent");
  h.last().final("my grandson brought me some water yesterday afternoon");
  assert.equal(h.snap().decision, "ignored: too long");
  h.last().final("what a lovely day");
  assert.equal(h.snap().decision, "ignored: no trigger");
  h.last().final("Kijo, bring my glasses please");
  assert.equal(h.snap().decision, "wake word → sent");
  h.last().final("I think I fell over by the bed just now");
  assert.equal(h.snap().decision, "emergency → sent");
  assert.deepEqual(h.sent.trigger, ["water please", "bring my glasses please", "I think I fell over by the bed just now"]);
});

test("dedupe: a re-delivered final (Android) or the same request in the next session fires once", () => {
  const h = harness();
  h.engine.setEnabled(true);
  h.last().began();
  h.last().final("toilet");
  h.last().onresult?.({ resultIndex: 0, results: h.last().results }); // same final again
  assert.deepEqual(h.sent.trigger, ["toilet"]);
  h.clock.advance(3000);
  h.last().end();
  h.clock.advance(300);
  h.last().began();
  h.last().final("Toilet!"); // within 5 s
  assert.deepEqual(h.sent.trigger, ["toilet"]);
  assert.equal(h.snap().decision, "ignored: duplicate");
  h.clock.advance(6000);
  h.last().final("toilet"); // later: a real new request
  assert.deepEqual(h.sent.trigger, ["toilet", "toilet"]);
});

test("an engine that delivers every utterance at index 0 still gets each one", () => {
  const h = harness();
  h.engine.setEnabled(true);
  h.last().began();
  for (const t of ["what a lovely day", "water"]) h.last().onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: t } }] });
  assert.deepEqual(h.sent.trigger, ["water"]);
});

test("iOS: engine ends without a final → the last interim is used, then listening restarts", () => {
  const h = harness();
  h.engine.setEnabled(true);
  h.last().began();
  h.last().interim("help me");
  h.clock.advance(1000);
  h.last().end();
  assert.deepEqual(h.sent.trigger, ["help me"]);
  assert.equal(h.recs.length, 2, "healthy end → restarted at once (0 ms)");
});

test("healthy sessions restart at 0 ms forever (no halt); deaf gap is measured", () => {
  const h = harness();
  h.engine.setEnabled(true);
  for (let i = 0; i < 20; i++) {
    h.last().began();
    h.clock.advance(3500);
    h.last().end();
    assert.equal(h.recs.length, i + 2, "new recognizer started in the same tick");
    h.clock.advance(40); // engine takes 40 ms to fire `start`
  }
  h.last().began();
  assert.equal(h.snap().needsTap, false);
  assert.equal(h.snap().restarts, 20);
  assert.equal(h.snap().deafGapMs, 40);
});

test("no-speech after a while is healthy (0 ms); network error backs off", () => {
  const h = harness();
  h.engine.setEnabled(true);
  h.last().began();
  h.clock.advance(8000);
  h.last().error("no-speech");
  h.last().end();
  assert.equal(h.recs.length, 2);
  h.last().began();
  h.clock.advance(8000);
  h.last().error("network");
  h.last().end();
  assert.equal(h.recs.length, 2, "real error: not at once");
  h.clock.advance(300);
  assert.equal(h.recs.length, 3);
});

test("failed restarts back off 300 ms → 1 s → 2 s, then after 5 in a minute: Tap to resume listening", () => {
  const h = harness();
  h.engine.setEnabled(true);
  h.last().began();
  h.clock.advance(5000);
  h.last().end(); // healthy → 300 ms
  h.clock.advance(300);
  const delays: number[] = [];
  for (let i = 0; i < 4; i++) {
    h.last().error("network");
    h.last().end(); // started? no — never fired `start`
    const n = h.recs.length;
    let waited = 0;
    while (h.recs.length === n && waited < 5000) {
      h.clock.advance(50);
      waited += 50;
    }
    delays.push(waited);
  }
  assert.deepEqual(delays, [300, 1000, 2000, 2000]);
  h.last().error("network");
  h.last().end(); // 5th failure within a minute
  assert.equal(h.snap().state, "error");
  assert.equal(h.snap().needsTap, true);
  assert.equal(h.snap().lastError, "network");
  h.clock.advance(60_000);
  assert.equal(h.recs.length, 6, "no more automatic tries");
  // The tap
  h.engine.arm();
  assert.equal(h.recs.length, 7);
  assert.equal(h.snap().needsTap, false);
  h.last().began();
  assert.equal(h.snap().state, "listening");
});

test("aborted / no-speech / network: retried; failures spread over > 1 min never halt", () => {
  const h = harness();
  h.engine.setEnabled(true);
  const waitForNewRec = () => {
    const n = h.recs.length;
    for (let i = 0; i < 100 && h.recs.length === n; i++) h.clock.advance(50);
    assert.equal(h.recs.length, n + 1, "restarted");
  };
  const failOnce = (code: string) => {
    h.last().began();
    h.last().error(code);
    h.last().end(); // ended at once without hearing anything: a failure
    waitForNewRec();
  };
  for (const code of ["aborted", "no-speech", "network", "aborted"]) failOnce(code);
  h.last().began();
  h.clock.advance(61_000); // a healthy minute
  const before = h.recs.length;
  h.last().end();
  assert.equal(h.recs.length, before + 1, "healthy → 0 ms");
  for (const code of ["no-speech", "network", "aborted", "aborted"]) failOnce(code);
  assert.equal(h.snap().needsTap, false);
  assert.equal(h.snap().state, "starting");
});

test("start event never comes (watchdog 4 s) → counted as a failure and retried", () => {
  const h = harness();
  h.engine.setEnabled(true); // automatic start, never begins
  h.clock.advance(4000);
  assert.equal(h.recs[0].aborted, true);
  assert.equal(h.snap().state, "restarting");
  h.clock.advance(300);
  assert.equal(h.recs.length, 2);
});

test("tap and talk while listening REUSES the recognizer (no stop/start), then carries on in background", () => {
  const h = harness();
  h.engine.setEnabled(true);
  h.last().began();
  assert.equal(h.engine.talk(), true);
  assert.equal(h.recs.length, 1, "no second recognizer");
  assert.equal(h.snap().mode, "talk");
  h.last().final("could someone close the window"); // no trigger word needed
  assert.deepEqual(h.sent.talk, ["could someone close the window"]);
  assert.equal(h.snap().mode, "background");
  h.last().final("what a lovely day");
  assert.deepEqual(h.sent.talk.length + h.sent.trigger.length, 1, "background rules again");
  assert.equal(h.recs[0].aborted, false);
});

test("tap and talk when not listening starts the recognizer synchronously inside the tap", () => {
  const h = harness();
  h.engine.setEnabled(true);
  h.last().error("network");
  h.last().end(); // now restarting (timer pending)
  const before = h.recs.length;
  h.engine.talk();
  assert.equal(h.recs.length, before + 1);
  assert.equal(h.last().startCalls, 1, "start() called during talk()");
  h.clock.advance(3000);
  assert.equal(h.recs.length, before + 1, "the pending restart was cancelled");
  h.last().began();
  h.last().final("Kijo, my glasses"); // wake word stripped
  assert.deepEqual(h.sent.talk, ["my glasses"]);
});

test("tap and talk, iOS no-final: a settled interim is taken once; its late final is not sent again", () => {
  const h = harness();
  h.engine.setEnabled(true);
  h.last().began();
  h.engine.talk();
  h.last().interim("I need");
  h.clock.advance(500);
  h.last().interim("I need my glasses");
  h.clock.advance(1500);
  assert.deepEqual(h.sent.talk, ["I need my glasses"]);
  h.last().final("I need my glasses");
  assert.deepEqual(h.sent.trigger, []);
  assert.deepEqual(h.sent.talk, ["I need my glasses"]);
});

test("tap and talk: nothing said within 10 s → back to background", () => {
  const h = harness();
  h.engine.setEnabled(true);
  h.last().began();
  h.engine.talk();
  h.clock.advance(10_000);
  assert.equal(h.snap().mode, "background");
  assert.equal(h.snap().decision, "tap-and-talk: nothing heard");
  assert.deepEqual(h.sent.talk, []);
});

test("never two recognizers at once (language change, talk, restarts, re-arm)", () => {
  const h = harness();
  h.engine.setEnabled(true);
  h.last().began();
  h.engine.arm("es"); // language change tap
  assert.equal(h.last().lang, "es-ES");
  assert.equal(h.recs[0].aborted, true);
  h.last().began();
  h.engine.arm(); // same language, already listening → nothing restarts
  assert.equal(h.recs.length, 2);
  h.engine.talk();
  h.last().final("agua");
  h.last().end();
  h.clock.advance(300);
  h.last().began();
  assert.equal(h.maxLive(), 1);
});

test("muted (band speaking): recognizer keeps running, what it hears is dropped", () => {
  const h = harness();
  h.engine.setEnabled(true);
  h.last().began();
  h.engine.setMuted(true);
  h.last().final("help is coming"); // the band hearing itself
  assert.deepEqual(h.sent.trigger, []);
  assert.equal(h.snap().decision, "ignored: band speaking");
  assert.equal(h.recs.length, 1);
  assert.equal(h.recs[0].aborted, false);
  h.last().final("I fell"); // an emergency still gets through
  assert.deepEqual(h.sent.trigger, ["I fell"]);
  h.engine.setMuted(false);
  h.last().final("help");
  assert.deepEqual(h.sent.trigger, ["I fell", "help"]);
});

test('"Kijo" alone → onWake, the next utterance within 8 s (after "Yes?") is the request', () => {
  const h = harness();
  h.engine.setEnabled(true);
  h.last().began();
  h.last().final("Kijo");
  assert.equal(h.sent.wake, 1);
  assert.equal(h.snap().mode, "capture");
  h.engine.setMuted(true); // "Yes?"
  h.clock.advance(1000);
  h.engine.setMuted(false); // 8 s start now
  h.clock.advance(7000);
  h.last().final("could you open the curtains");
  assert.deepEqual(h.sent.trigger, ["could you open the curtains"]);
  assert.equal(h.snap().mode, "background");
  // And the window closes after 8 s of silence
  h.last().final("Kijo");
  h.clock.advance(8000);
  assert.equal(h.snap().mode, "background");
  h.last().final("open the curtains");
  assert.deepEqual(h.sent.trigger, ["could you open the curtains"]);
});

test("blocked: mic denied on the first tap → problem; iOS Safari → dictation-off", () => {
  for (const [ios, want] of [[null, "mic-blocked"], ["safari", "dictation-off"]] as const) {
    const h = harness({ ios });
    h.engine.arm();
    h.last().error("not-allowed");
    h.last().end();
    assert.equal(h.snap().state, "error");
    assert.equal(h.snap().problem, want);
    h.clock.advance(60_000);
    assert.equal(h.recs.length, 1);
  }
});

test("iOS: automatic restart refused after it worked → Tap to resume listening (at once)", () => {
  const h = harness({ ios: "safari" });
  h.engine.arm();
  h.last().began();
  h.clock.advance(5000);
  h.last().end();
  h.clock.advance(300); // automatic restart, no gesture
  h.last().error("not-allowed");
  h.last().end();
  assert.equal(h.snap().needsTap, true);
  assert.equal(h.snap().problem, null);
});

test("iOS home-screen app: a tap start that never begins → open in Safari", () => {
  const h = harness({ ios: "standalone" });
  h.engine.arm();
  h.clock.advance(4000);
  assert.equal(h.snap().problem, "open-in-safari");
  h.clock.advance(60_000);
  assert.equal(h.recs.length, 1);
});

test("start() throws on an automatic restart → backoff, not a crash", () => {
  let throwIt = false;
  const h = harness({ throwOnStart: () => throwIt });
  h.engine.setEnabled(true);
  h.last().began();
  h.clock.advance(5000);
  throwIt = true;
  h.last().end();
  h.clock.advance(300);
  assert.equal(h.snap().state, "restarting");
  throwIt = false;
  h.clock.advance(1000);
  h.last().began();
  assert.equal(h.snap().state, "listening");
});

test("disabled → recognizer aborted, idle, nothing restarts", () => {
  const h = harness();
  h.engine.setEnabled(true);
  h.last().began();
  h.engine.setEnabled(false);
  assert.equal(h.recs[0].aborted, true);
  assert.equal(h.snap().state, "idle");
  h.clock.advance(60_000);
  assert.equal(h.recs.length, 1);
});

test("no speech recognition at all → unsupported, talk() returns false", () => {
  const e = new VoiceEngine(null, { onTrigger() {}, onTalk() {}, onWake() {}, onChange() {} });
  assert.equal(e.snapshot.problem, "unsupported");
  assert.equal(e.talk(), false);
});

test("transcripts stay out of the snapshot unless debug is on", () => {
  const recs: RecognitionLike[] = [];
  const e = new VoiceEngine(
    class {
      lang = "";
      continuous = false;
      interimResults = false;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror = null;
      onresult: ((e: RecognitionEventLike) => void) | null = null;
      constructor() {
        recs.push(this as unknown as RecognitionLike);
      }
      start() {}
      abort() {}
    },
    { onTrigger() {}, onTalk() {}, onWake() {}, onChange() {} },
    { clock: new FakeClock() },
  );
  e.setEnabled(true);
  recs[0].onstart?.();
  recs[0].onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "water" } }] });
  assert.equal(e.snapshot.lastFinal, "");
  assert.equal(e.snapshot.decision, "base word → sent");
});

// ── Listening accuracy ──

/** Emit one result with several alternatives (best first) at `index`. */
function emit(r: RecognitionLike, index: number, alts: string[], isFinal: boolean) {
  const result = Object.assign(Object.fromEntries(alts.map((t, k) => [k, { transcript: t }])), { isFinal, length: alts.length });
  const results = Object.assign([] as unknown[], { [index]: result, length: index + 1 }) as unknown as RecognitionEventLike["results"];
  r.onresult?.({ resultIndex: index, results });
}

test("asks for 5 alternatives", () => {
  const h = harness();
  h.engine.setEnabled(true);
  assert.equal((h.last() as unknown as { maxAlternatives: number }).maxAlternatives, 5);
});

test("final: a lower alternative that triggers is used ('hello' heard, 'help' 2nd) and shown in debug", () => {
  const h = harness();
  h.engine.setEnabled(true);
  h.last().began();
  emit(h.last(), 0, ["hello", "help", "yelp"], true);
  assert.deepEqual(h.sent.trigger, ["help"]);
  assert.equal(h.snap().decision, "base word → sent (alternative 2)");
  assert.equal(h.snap().alternatives, "hello | help ✓ | yelp");
});

test("an emergency in any alternative beats a base word", () => {
  const h = harness();
  h.engine.setEnabled(true);
  h.last().began();
  emit(h.last(), 0, ["help", "I fell"], true);
  assert.deepEqual(h.sent.trigger, ["I fell"]);
});

test("interim emergency fires at once; its final does not fire again", () => {
  const h = harness();
  h.engine.setEnabled(true);
  h.last().began();
  emit(h.last(), 0, ["I fell"], false);
  assert.deepEqual(h.sent.trigger, ["I fell"]);
  assert.equal(h.snap().decision, "emergency → sent (interim)");
  emit(h.last(), 0, ["I fell down"], true);
  assert.deepEqual(h.sent.trigger, ["I fell"]);
});

test("interim base word fires after 300 ms still; final skipped; next utterance at index 0 still works", () => {
  const h = harness();
  h.engine.setEnabled(true);
  h.last().began();
  emit(h.last(), 0, ["help"], false);
  h.clock.advance(299);
  assert.deepEqual(h.sent.trigger, []);
  h.clock.advance(1);
  assert.deepEqual(h.sent.trigger, ["help"]);
  emit(h.last(), 0, ["help"], true);
  assert.deepEqual(h.sent.trigger, ["help"]);
  h.clock.advance(6000);
  emit(h.last(), 0, ["water"], true); // Android: the next utterance restarts at index 0
  assert.deepEqual(h.sent.trigger, ["help", "water"]);
});

test("interim 'water…' that grows into long chatter is not sent", () => {
  const h = harness();
  h.engine.setEnabled(true);
  h.last().began();
  emit(h.last(), 0, ["water"], false);
  h.clock.advance(150);
  emit(h.last(), 0, ["water in this glass"], false);
  h.clock.advance(150);
  emit(h.last(), 0, ["water in this glass is too cold today"], false);
  h.clock.advance(1000);
  emit(h.last(), 0, ["water in this glass is too cold today"], true);
  assert.deepEqual(h.sent.trigger, []);
  assert.equal(h.snap().decision, "ignored: too long");
});

test("'Kijo …' interim waits for the final", () => {
  const h = harness();
  h.engine.setEnabled(true);
  h.last().began();
  emit(h.last(), 0, ["Kijo water"], false);
  h.clock.advance(1000);
  assert.deepEqual(h.sent.trigger, []);
  emit(h.last(), 0, ["Kijo water please"], true);
  assert.deepEqual(h.sent.trigger, ["water please"]);
});

test("phrase biasing: set where supported (per language), skipped silently otherwise", () => {
  const made: [string, number][] = [];
  const Phrase = class {
    constructor(p: string, b: number) {
      made.push([p, b]);
    }
  };
  const h = harness({ phraseCtor: Phrase });
  h.engine.setLang("fr");
  h.engine.setEnabled(true);
  assert.equal((h.last() as unknown as { phrases: unknown[] }).phrases.length, made.length);
  assert.ok(made.some(([p]) => p === "Kijo") && made.some(([p]) => p === "au secours"));
  assert.equal(h.snap().bias, "on");
  const none = harness();
  none.engine.setEnabled(true);
  assert.equal(none.snap().bias, "off");
});

test("engine refuses phrases → restart at once without them, not counted as a failure", () => {
  const h = harness({ phraseCtor: class {} as unknown as new (p: string, b: number) => unknown });
  h.engine.setEnabled(true);
  h.last().began();
  h.last().error("phrases-not-supported");
  h.last().end();
  assert.equal(h.recs.length, 2, "restarted at once");
  assert.deepEqual((h.last() as unknown as { phrases: unknown[] }).phrases, [], "no phrases this time");
  assert.equal(h.snap().bias, "unsupported");
});
