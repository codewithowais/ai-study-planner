"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, Pause, Play, Square, Clock, Settings2 } from "lucide-react";
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

/**
 * "Listen to this lesson" — the browser's built-in speech synthesis (no
 * network, no keys), tuned to sound like a calm, patient tutor rather than a
 * robot: a natural voice is auto-selected, the pace is gentle, short pauses
 * separate sentences, and text is cleaned so citations/symbols/bullets aren't
 * read aloud. Students can pick their own voice and reading speed (remembered).
 */

const SPEEDS = [
  { label: "Very slow", rate: 0.75 },
  { label: "Calm", rate: 0.9 },
  { label: "Normal", rate: 1.0 },
  { label: "Fast", rate: 1.2 },
] as const;
const DEFAULT_SPEED = 1; // Calm

// Higher-quality voices, most-preferred first, for the automatic pick.
const VOICE_PATTERNS = [
  /natural/i,
  /neural/i,
  /enhanced/i,
  /premium/i,
  /\bava\b/i,
  /\bjenny\b/i,
  /\baria\b/i,
  /\bsonia\b/i,
  /\blibby\b/i,
  /samantha/i,
  /google us english/i,
  /google uk english female/i,
  /\bserena\b/i,
  /\bkaren\b/i,
  /\bmoira\b/i,
  /\bdaniel\b/i,
];

function englishVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const en = voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
  const pool = en.length ? en : voices;
  // De-dupe by name, keep stable order.
  const seen = new Set<string>();
  return pool.filter((v) => (seen.has(v.name) ? false : (seen.add(v.name), true)));
}

function autoPick(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const pool = englishVoices(voices);
  for (const rx of VOICE_PATTERNS) {
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
    .replace(/[*_`#>|]/g, "") // markdown noise
    .replace(/^\s*[-•·]\s+/gm, "") // leading bullet markers
    .replace(/\s+([.,;:])/g, "$1") // tidy stray space before punctuation
    .replace(/\s{2,}/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function LessonAudio({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const [supported, setSupported] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(DEFAULT_SPEED);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState<string>(""); // "" = automatic
  const chunks = useRef<string[]>([]);
  const idx = useRef(0);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const rate = useRef<number>(SPEEDS[DEFAULT_SPEED].rate);

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const readMin = Math.max(1, Math.round(words / 200));

  useEffect(() => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    setSupported(!!synth);
    if (!synth) return;

    try {
      const rawSpeed = localStorage.getItem("asp_tts_speed");
      const s = rawSpeed === null ? NaN : Number(rawSpeed);
      if (Number.isInteger(s) && s >= 0 && s < SPEEDS.length) {
        setSpeedIndex(s);
        rate.current = SPEEDS[s].rate;
      }
      const savedVoice = localStorage.getItem("asp_tts_voice");
      if (savedVoice) setVoiceName(savedVoice);
    } catch {
      /* ignore */
    }

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

  // Resolve the active voice whenever the list or the saved choice changes.
  useEffect(() => {
    if (!voices.length) return;
    voiceRef.current =
      (voiceName && voices.find((v) => v.name === voiceName)) || autoPick(voices);
  }, [voices, voiceName]);

  // Stop narration when the topic (text) changes.
  useEffect(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    setState("idle");
  }, [text]);

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
      window.setTimeout(() => speakFrom(idx.current + 1), 140);
    };
    u.onerror = () => setState("idle");
    synth.speak(u);
  }, []);

  const play = useCallback(() => {
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

  function pause() {
    window.speechSynthesis?.pause();
    setState("paused");
  }
  function resume() {
    window.speechSynthesis?.resume();
    setState("playing");
  }
  function stop() {
    window.speechSynthesis?.cancel();
    setState("idle");
  }

  // Re-start the current sentence so a new speed/voice applies immediately.
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
    restartIfPlaying();
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
    restartIfPlaying();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5" />
        {readMin} min read
      </span>
      {supported && words > 0 && (
        <>
          <span className="text-border">·</span>
          {state === "idle" && (
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-primary" onClick={play}>
              <Volume2 className="h-4 w-4" />
              Listen
            </Button>
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
                {SPEEDS[speedIndex].label}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[60vh] w-56 overflow-y-auto">
              <DropdownMenuLabel>Reading speed</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={String(speedIndex)} onValueChange={onSpeedChange}>
                {SPEEDS.map((s, i) => (
                  <DropdownMenuRadioItem key={s.label} value={String(i)}>
                    {s.label}
                    <span className="ml-auto text-xs text-muted-foreground">{s.rate}×</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              {voices.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Voice</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={voiceName || "__auto"} onValueChange={onVoiceChange}>
                    <DropdownMenuRadioItem value="__auto">Automatic (best)</DropdownMenuRadioItem>
                    {voices.map((v) => (
                      <DropdownMenuRadioItem key={v.name} value={v.name}>
                        {v.name.replace(/\s*\(.*\)$/, "")}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  );
}
