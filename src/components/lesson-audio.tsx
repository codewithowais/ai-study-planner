"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, Pause, Play, Square, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * "Listen to this lesson" + read-time, using the browser's built-in
 * speech synthesis (no network, no keys). Lets students study on the go.
 */
export function LessonAudio({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const [supported, setSupported] = useState(false);
  const chunks = useRef<string[]>([]);
  const idx = useRef(0);

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const readMin = Math.max(1, Math.round(words / 200));

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => {
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
    };
  }, []);

  // Stop narration when the topic (text) changes.
  useEffect(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    setState("idle");
  }, [text]);

  function speakFrom(i: number) {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (i >= chunks.current.length) {
      setState("idle");
      return;
    }
    idx.current = i;
    const u = new SpeechSynthesisUtterance(chunks.current[i]);
    u.rate = 1;
    u.onend = () => speakFrom(idx.current + 1);
    u.onerror = () => setState("idle");
    synth.speak(u);
  }

  function play() {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    chunks.current =
      text.match(/[^.!?\n]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
    setState("playing");
    speakFrom(0);
  }

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
        </>
      )}
    </div>
  );
}
