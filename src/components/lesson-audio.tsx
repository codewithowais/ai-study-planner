"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, Pause, Play, Square, Clock, Settings2, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import {
  NEURAL_VOICES,
  DEFAULT_NEURAL_VOICE,
  chunkForNeural,
  synthesizeNeural,
} from "@/lib/tts/neural-voice";

/**
 * "Listen to this lesson" — two engines the student can switch between:
 *
 *  • "Built-in" — the browser's own speech synthesis (instant, no download).
 *    How human it sounds depends entirely on the voices the browser exposes;
 *    the Web Speech API has no emotion/tone control, only rate + voice. We
 *    auto-pick the most natural one, hide the novelty/robotic voices, and (when
 *    only flat "compact" voices exist) show how to unlock a better one.
 *
 *  • "Natural (beta)" — a small neural voice that runs locally in the browser
 *    via WebAssembly (see lib/tts/neural-voice). Genuinely lifelike; the first
 *    use downloads a ~60MB model, then it's offline. The lesson text never
 *    leaves the machine.
 *
 * Text is cleaned so citations/symbols/bullets aren't read aloud; both engines
 * honour the reading-speed control (neural via audio playbackRate).
 */

const SPEEDS = [
  { label: "Very slow", rate: 0.75 },
  { label: "Calm", rate: 0.9 },
  { label: "Normal", rate: 1.0 },
  { label: "Fast", rate: 1.2 },
] as const;
const DEFAULT_SPEED = 1; // Calm

// Apple's novelty / legacy "fun" voices (robotic, sung, whispered). They're
// useless for studying and clutter the picker — never auto-pick or list them.
const NOVELTY_VOICES = new Set(
  [
    "Albert", "Bad News", "Bahh", "Bells", "Boing", "Bubbles", "Cellos",
    "Eddy", "Flo", "Fred", "Good News", "Grandma", "Grandpa", "Jester",
    "Junior", "Kathy", "Organ", "Ralph", "Reed", "Rocko", "Sandy", "Shelley",
    "Superstar", "Trinoids", "Whisper", "Wobble", "Zarvox", "Bruce", "Princess",
  ].map((n) => n.toLowerCase()),
);

/** A voice's name without its " (English (United States))" locale suffix. */
function baseName(name: string): string {
  return name.replace(/\s*\(.*\)\s*$/, "").trim();
}
function isNovelty(name: string): boolean {
  return NOVELTY_VOICES.has(baseName(name).toLowerCase());
}

// The genuinely natural / expressive voices, most-preferred first. "Siri",
// "Neural", "Natural", "Enhanced"/"Premium" and the named cloud voices sound
// like a person; the plain compact voices only read words out. Which of these
// exist depends on the browser: Safari exposes macOS Siri/Enhanced voices,
// Edge exposes Microsoft "… Online (Natural)", Chrome exposes "Google …".
const PREFERRED_VOICES = [
  /siri/i, /neural/i, /natural/i, /enhanced/i, /premium/i,
  /\bava\b/i, /\bzoe\b/i, /\bevan\b/i, /\bnathan\b/i, /\bserena\b/i,
  /\bjenny\b/i, /\baria\b/i, /\bguy\b/i, /\bsonia\b/i, /\blibby\b/i,
  /google us english/i, /google uk english female/i,
  /samantha/i, /\bkaren\b/i, /\bmoira\b/i, /\btessa\b/i, /\bdaniel\b/i,
];

/** Rank for sorting the picker — lower is better; unlisted voices sort last. */
function voiceRank(name: string): number {
  for (let i = 0; i < PREFERRED_VOICES.length; i++)
    if (PREFERRED_VOICES[i].test(name)) return i;
  return PREFERRED_VOICES.length;
}

/** Does this browser expose at least one truly natural (non-compact) voice? */
function hasNaturalVoice(voices: SpeechSynthesisVoice[]): boolean {
  return voices.some((v) =>
    /siri|neural|natural|enhanced|premium|google|online/i.test(v.name),
  );
}

function englishVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const en = voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
  const base = en.length ? en : voices;
  const seen = new Set<string>();
  const usable = base
    .filter((v) => !isNovelty(v.name))
    .filter((v) => (seen.has(v.name) ? false : (seen.add(v.name), true)))
    // Best voices first, so the picker opens on something worth hearing.
    .sort(
      (a, b) => voiceRank(a.name) - voiceRank(b.name) || a.name.localeCompare(b.name),
    );
  // Never hand back nothing (e.g. a device where every voice was denylisted).
  return usable.length ? usable : base;
}

function autoPick(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const pool = englishVoices(voices);
  for (const rx of PREFERRED_VOICES) {
    const match = pool.find((v) => rx.test(v.name));
    if (match) return match;
  }
  return pool[0] ?? voices[0] ?? null;
}

/** Make text flow naturally when spoken: drop citations, symbols and bullet
 * markers; expand a few abbreviations so they aren't spelled out. */
function cleanForSpeech(text: string): string {
  return text
    .replace(/\(\s*p\.?\s*\d+[^)]*\)/gi, "") // "(p.12)" citations
    .replace(/\bpp?\.\s*\d+(\s*[-–]\s*\d+)?/gi, "") // "p. 12", "pp.12-14"
    .replace(/\bSec\.\s*(?=\d)/gi, "Section ") // "Sec. 32" (not "Second")
    .replace(/\be\.g\.\s*/gi, "for example, ")
    .replace(/\bi\.e\.\s*/gi, "that is, ")
    .replace(/\betc\.?/gi, "and so on")
    .replace(/\s+[-–—]\s+/g, ", ") // spaced dash → a natural pause, not a run-on
    .replace(/[*_`#>|]/g, "") // markdown noise
    .replace(/^\s*[-•·]\s+/gm, "") // leading bullet markers
    .replace(/\s+([.,;:])/g, "$1") // tidy stray space before punctuation
    .replace(/\s{2,}/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

type PlayState = "idle" | "playing" | "paused" | "preparing";
type Engine = "browser" | "neural";

export function LessonAudio({
  text,
  showListen = true,
}: {
  text: string;
  /** Whether to offer the Listen controls. False for languages we have no
   * suitable voice for (e.g. Roman Urdu) — the read-time still shows. */
  showListen?: boolean;
}) {
  const [state, setState] = useState<PlayState>("idle");
  const [supported, setSupported] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(DEFAULT_SPEED);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState<string>(""); // "" = automatic
  const [platform, setPlatform] = useState<"mac" | "win" | "other">("other");
  const [engine, setEngine] = useState<Engine>("browser");
  const [neuralVoice, setNeuralVoice] = useState<string>(DEFAULT_NEURAL_VOICE);
  const [prep, setPrep] = useState<number | null>(null); // model-download fraction
  const [note, setNote] = useState<string | null>(null); // inline status/error

  const chunks = useRef<string[]>([]);
  const idx = useRef(0);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const rate = useRef<number>(SPEEDS[DEFAULT_SPEED].rate);
  // Neural engine
  const engineRef = useRef<Engine>("browser");
  const neuralVoiceRef = useRef<string>(DEFAULT_NEURAL_VOICE);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const buffers = useRef<(Blob | null)[]>([]);
  const pending = useRef<(Promise<Blob> | null)[]>([]);
  const stopped = useRef(false);

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const readMin = Math.max(1, Math.round(words / 200));
  const naturalAvailable = hasNaturalVoice(voices);

  useEffect(() => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    setSupported(!!synth);
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    setPlatform(/Mac|iP(hone|ad|od)/i.test(ua) ? "mac" : /Win/i.test(ua) ? "win" : "other");

    try {
      const rawSpeed = localStorage.getItem("asp_tts_speed");
      const s = rawSpeed === null ? NaN : Number(rawSpeed);
      if (Number.isInteger(s) && s >= 0 && s < SPEEDS.length) {
        setSpeedIndex(s);
        rate.current = SPEEDS[s].rate;
      }
      const savedVoice = localStorage.getItem("asp_tts_voice");
      if (savedVoice) setVoiceName(savedVoice);
      const savedEngine = localStorage.getItem("asp_tts_engine");
      if (savedEngine === "neural" || savedEngine === "browser") {
        setEngine(savedEngine);
        engineRef.current = savedEngine;
      }
      const savedNeural = localStorage.getItem("asp_tts_neural");
      if (savedNeural) {
        setNeuralVoice(savedNeural);
        neuralVoiceRef.current = savedNeural;
      }
    } catch {
      /* ignore */
    }

    if (!synth) return;
    const loadVoices = () => {
      const v = synth.getVoices();
      if (v.length) setVoices(englishVoices(v));
    };
    loadVoices();
    synth.addEventListener?.("voiceschanged", loadVoices);
    return () => {
      synth.removeEventListener?.("voiceschanged", loadVoices);
      try {
        synth.cancel();
      } catch {
        /* ignore */
      }
    };
  }, []);

  // Resolve the active browser voice whenever the list or saved choice changes.
  useEffect(() => {
    if (!voices.length) return;
    voiceRef.current =
      (voiceName && voices.find((v) => v.name === voiceName)) || autoPick(voices);
  }, [voices, voiceName]);

  // Stop narration when the topic (text) changes.
  useEffect(() => {
    stopped.current = true;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPrep(null);
    setNote(null);
    setState("idle");
  }, [text]);

  // ---- Built-in (Web Speech) engine -------------------------------------
  const speakFrom = useCallback((i: number) => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (i >= chunks.current.length) {
      setState("idle");
      return;
    }
    idx.current = i;
    const u = new SpeechSynthesisUtterance(chunks.current[i]);
    if (voiceRef.current) {
      u.voice = voiceRef.current;
      u.lang = voiceRef.current.lang;
    }
    u.rate = rate.current;
    u.pitch = 1;
    u.volume = 1;
    u.onend = () => {
      window.setTimeout(() => speakFrom(idx.current + 1), 180);
    };
    u.onerror = () => setState("idle");
    synth.speak(u);
  }, []);

  const startBrowser = useCallback(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    chunks.current = cleanForSpeech(text)
      .match(/[^.!?\n]+[.!?]*/g)
      ?.map((s) => s.trim())
      .filter((s) => s.length > 0) ?? [text];
    setState("playing");
    speakFrom(0);
  }, [text, speakFrom]);

  // ---- Natural (neural, in-browser WASM) engine -------------------------
  // Synthesize chunk i if not already buffered. `withProgress` drives the
  // download indicator (only for the chunk the student is waiting on).
  const synthChunk = useCallback(
    async (i: number, withProgress: boolean): Promise<Blob | null> => {
      if (i < 0 || i >= chunks.current.length) return null;
      if (buffers.current[i]) return buffers.current[i];
      // De-dupe in-flight work: if the look-ahead already started this chunk,
      // await THAT instead of kicking off a second (model-reloading) synth.
      if (pending.current[i]) {
        if (withProgress) setPrep(null); // mid-flight; can't report % now
        return pending.current[i];
      }
      const job = synthesizeNeural(
        chunks.current[i],
        neuralVoiceRef.current,
        withProgress ? (f) => setPrep(f) : undefined,
      )
        .then((blob) => {
          buffers.current[i] = blob;
          return blob;
        })
        .finally(() => {
          pending.current[i] = null;
          if (withProgress) setPrep(null);
        });
      pending.current[i] = job;
      return job;
    },
    [],
  );

  const neuralPlayFrom = useCallback(
    async (i: number) => {
      if (stopped.current) return;
      if (i >= chunks.current.length) {
        setState("idle");
        return;
      }
      idx.current = i;
      let blob = buffers.current[i];
      if (!blob) {
        setState("preparing");
        try {
          blob = await synthChunk(i, true);
        } catch {
          setPrep(null);
          setNote("Couldn't start the natural voice — switching to the built-in one.");
          setEngine("browser");
          engineRef.current = "browser";
          try {
            localStorage.setItem("asp_tts_engine", "browser");
          } catch {
            /* ignore */
          }
          startBrowser();
          return;
        }
      }
      if (stopped.current || !blob) return;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.playbackRate = rate.current;
      (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        neuralPlayFrom(idx.current + 1);
      };
      audio.onerror = () => URL.revokeObjectURL(url);
      // Synthesize the next chunk while this one plays (no progress UI).
      void synthChunk(i + 1, false).catch(() => {});
      setState("playing");
      try {
        await audio.play();
      } catch {
        // Autoplay was blocked after the download gap — wait for a tap.
        setState("paused");
        setNote("Voice ready — tap Resume to play.");
      }
    },
    [synthChunk, startBrowser],
  );

  const startNeural = useCallback(() => {
    stopped.current = false;
    setNote(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    chunks.current = chunkForNeural(cleanForSpeech(text));
    buffers.current = new Array(chunks.current.length).fill(null);
    pending.current = new Array(chunks.current.length).fill(null);
    if (!chunks.current.length) return;
    setState("preparing");
    void neuralPlayFrom(0);
  }, [text, neuralPlayFrom]);

  // ---- Shared transport --------------------------------------------------
  const play = useCallback(() => {
    if (engineRef.current === "neural") startNeural();
    else startBrowser();
  }, [startNeural, startBrowser]);

  function pause() {
    if (engineRef.current === "neural") audioRef.current?.pause();
    else window.speechSynthesis?.pause();
    setState("paused");
  }
  function resume() {
    setNote(null);
    if (engineRef.current === "neural") audioRef.current?.play().catch(() => {});
    else window.speechSynthesis?.resume();
    setState("playing");
  }
  function stop() {
    stopped.current = true;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    setPrep(null);
    setNote(null);
    setState("idle");
  }

  // Re-start the current sentence so a new browser speed/voice applies now.
  const restartIfPlaying = useCallback(() => {
    if (state === "idle") return;
    const at = idx.current;
    window.speechSynthesis?.cancel();
    setState("playing");
    speakFrom(at);
  }, [state, speakFrom]);

  function onSpeedChange(value: string) {
    const i = Number(value);
    setSpeedIndex(i);
    rate.current = SPEEDS[i].rate;
    try {
      localStorage.setItem("asp_tts_speed", String(i));
    } catch {
      /* ignore */
    }
    if (engineRef.current === "neural") {
      // Live for the neural engine — no re-synth needed.
      if (audioRef.current) audioRef.current.playbackRate = rate.current;
    } else {
      restartIfPlaying();
    }
  }

  function onVoiceChange(value: string) {
    const name = value === "__auto" ? "" : value;
    setVoiceName(name);
    voiceRef.current = (name && voices.find((v) => v.name === name)) || autoPick(voices);
    try {
      if (name) localStorage.setItem("asp_tts_voice", name);
      else localStorage.removeItem("asp_tts_voice");
    } catch {
      /* ignore */
    }
    if (engineRef.current === "browser") restartIfPlaying();
  }

  function onEngineChange(value: string) {
    const e: Engine = value === "neural" ? "neural" : "browser";
    stop();
    setEngine(e);
    engineRef.current = e;
    setNote(null);
    try {
      localStorage.setItem("asp_tts_engine", e);
    } catch {
      /* ignore */
    }
  }

  function onNeuralVoiceChange(value: string) {
    setNeuralVoice(value);
    neuralVoiceRef.current = value;
    try {
      localStorage.setItem("asp_tts_neural", value);
    } catch {
      /* ignore */
    }
    // Different voice → drop the cached audio and restart from where we are.
    if (engineRef.current === "neural" && state !== "idle") {
      const at = idx.current;
      buffers.current = new Array(chunks.current.length).fill(null);
      pending.current = new Array(chunks.current.length).fill(null);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      stopped.current = false;
      void neuralPlayFrom(at);
    }
  }

  const busy = state === "preparing";

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5" />
        {readMin} min read
      </span>
      {showListen && supported && words > 0 && (
        <>
          <span className="text-border">·</span>
          {state === "idle" && (
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-primary" onClick={play}>
              <Volume2 className="h-4 w-4" />
              Listen
            </Button>
          )}
          {busy && (
            <>
              <span className="inline-flex items-center gap-1.5 px-2 text-primary">
                <Loader2 className="h-4 w-4 animate-spin" />
                {prep !== null ? `Downloading voice… ${Math.round(prep * 100)}%` : "Preparing…"}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={stop} aria-label="Stop">
                <Square className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {state === "playing" && (
            <>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2" onClick={pause}>
                <Pause className="h-4 w-4" />
                Pause
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={stop} aria-label="Stop">
                <Square className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {state === "paused" && (
            <>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-primary" onClick={resume}>
                <Play className="h-4 w-4" />
                Resume
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={stop} aria-label="Stop">
                <Square className="h-3.5 w-3.5" />
              </Button>
            </>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2"
                title="Voice & speed"
                aria-label="Voice and speed settings"
              >
                <Settings2 className="h-3.5 w-3.5" />
                {engine === "neural" ? "Natural" : SPEEDS[speedIndex].label}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[70vh] w-72 overflow-y-auto">
              <DropdownMenuLabel>Voice engine</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={engine} onValueChange={onEngineChange}>
                <DropdownMenuRadioItem value="neural">
                  <Sparkles className="mr-1.5 h-3.5 w-3.5 text-primary" />
                  Natural — lifelike (beta)
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="browser">Built-in — instant</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>

              <DropdownMenuSeparator />
              <DropdownMenuLabel>Reading speed</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={String(speedIndex)} onValueChange={onSpeedChange}>
                {SPEEDS.map((s, i) => (
                  <DropdownMenuRadioItem key={s.label} value={String(i)}>
                    {s.label}
                    <span className="ml-auto text-xs text-muted-foreground">{s.rate}×</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>

              <DropdownMenuSeparator />
              {engine === "neural" ? (
                <>
                  <DropdownMenuLabel>Natural voice</DropdownMenuLabel>
                  <p className="px-2 py-1.5 text-xs leading-snug text-muted-foreground">
                    Runs on your device. The first play downloads a ~60MB voice, then it
                    works offline — your lesson text never leaves your machine.
                  </p>
                  <DropdownMenuRadioGroup value={neuralVoice} onValueChange={onNeuralVoiceChange}>
                    {NEURAL_VOICES.map((v) => (
                      <DropdownMenuRadioItem key={v.id} value={v.id}>
                        {v.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </>
              ) : (
                voices.length > 0 && (
                  <>
                    <DropdownMenuLabel>Built-in voice</DropdownMenuLabel>
                    {!naturalAvailable && (
                      <div className="px-2 py-1.5 text-xs leading-snug text-muted-foreground">
                        <p className="mb-1 font-medium text-foreground">
                          Sounds flat? Try “Natural” above — or unlock a better built-in
                          voice, free:
                        </p>
                        {platform === "mac" ? (
                          <ol className="ml-3.5 list-decimal space-y-1">
                            <li>
                              System Settings › Accessibility › Spoken Content › System
                              Voice › <span className="font-medium">Manage Voices</span>,
                              and download one marked{" "}
                              <span className="font-medium">(Enhanced)</span> or{" "}
                              <span className="font-medium">(Premium)</span> — e.g. Ava,
                              Zoe, or Samantha.
                            </li>
                            <li>
                              Open this page in <span className="font-medium">Safari</span>,
                              then pick that voice here.
                            </li>
                          </ol>
                        ) : platform === "win" ? (
                          <p>
                            Open this page in{" "}
                            <span className="font-medium">Microsoft Edge</span> — its
                            “Online (Natural)” voices sound far more human and will show
                            up here automatically.
                          </p>
                        ) : (
                          <p>
                            Install a “Natural”/“Neural” system voice, or open the app in
                            a Chromium-based browser — better voices then appear here
                            automatically.
                          </p>
                        )}
                      </div>
                    )}
                    <DropdownMenuRadioGroup value={voiceName || "__auto"} onValueChange={onVoiceChange}>
                      <DropdownMenuRadioItem value="__auto">Automatic (best)</DropdownMenuRadioItem>
                      {voices.map((v) => (
                        <DropdownMenuRadioItem key={v.name} value={v.name}>
                          {baseName(v.name)}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {note && <span className="text-xs text-muted-foreground">· {note}</span>}
        </>
      )}
    </div>
  );
}
