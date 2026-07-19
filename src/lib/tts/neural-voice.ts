"use client";

/**
 * Optional "natural voice" for lessons: a small neural (Piper / VITS) speech
 * model that runs entirely IN THE BROWSER via WebAssembly
 * (@diffusionstudio/vits-web).
 *
 * Privacy: the lesson TEXT never leaves the machine — synthesis is fully local.
 * The only network use is a ONE-TIME download of the public voice model (from
 * HuggingFace) and the ONNX runtime (from a CDN); both are then cached (OPFS +
 * the browser HTTP cache) and reused offline. The library is imported lazily so
 * its several MB of WASM never touch the main bundle or server rendering.
 *
 * Trade-off vs. the built-in browser voice: far more natural, but the first use
 * downloads ~60MB and synthesis runs on the CPU (a second or two per chunk), so
 * we synthesize a chunk ahead while the current one plays.
 */

export type NeuralVoiceOption = { id: string; label: string };

// Curated shortlist of natural English voices (medium quality, ~60MB each).
export const NEURAL_VOICES: NeuralVoiceOption[] = [
  { id: "en_US-amy-medium", label: "Amy — warm US female" },
  { id: "en_US-hfc_female-medium", label: "Clara — clear US female" },
  { id: "en_US-lessac-medium", label: "Lessac — calm US" },
  { id: "en_US-ryan-medium", label: "Ryan — US male" },
  { id: "en_GB-jenny_dioco-medium", label: "Jenny — UK female" },
  { id: "en_GB-alan-medium", label: "Alan — UK male" },
];
export const DEFAULT_NEURAL_VOICE = "en_US-amy-medium";

export function neuralVoiceLabel(id: string): string {
  return NEURAL_VOICES.find((v) => v.id === id)?.label ?? id;
}

type VitsModule = typeof import("@diffusionstudio/vits-web");
let modPromise: Promise<VitsModule> | null = null;
function lib(): Promise<VitsModule> {
  if (!modPromise) modPromise = import("@diffusionstudio/vits-web");
  return modPromise;
}

/** True once the given voice model is cached locally (no download needed). */
export async function isNeuralVoiceStored(voiceId: string): Promise<boolean> {
  try {
    const { stored } = await lib();
    return (await stored()).includes(voiceId as never);
  } catch {
    return false;
  }
}

/**
 * Synthesize one chunk of text to a WAV blob. Downloads + caches the model on
 * first use, reporting download progress (0..1) via onProgress while it does.
 */
export async function synthesizeNeural(
  text: string,
  voiceId: string,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  const { predict } = await lib();
  return predict({ text, voiceId: voiceId as never }, (p) => {
    if (p && p.total > 0) onProgress?.(Math.min(1, p.loaded / p.total));
  });
}

/**
 * Split text into chunks so playback starts quickly yet stays smooth. Each
 * `predict()` call reloads the model, so we keep the FIRST chunk small (fast
 * first audio) and make later chunks larger (fewer reloads → fewer gaps),
 * grouping whole sentences.
 */
export function chunkForNeural(
  text: string,
  firstTarget = 140,
  restTarget = 480,
): string[] {
  const sentences =
    text.match(/[^.!?\n]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  const chunks: string[] = [];
  let buf = "";
  for (const s of sentences) {
    const target = chunks.length === 0 ? firstTarget : restTarget;
    if (buf && buf.length + s.length + 1 > target) {
      chunks.push(buf);
      buf = s;
    } else {
      buf = buf ? `${buf} ${s}` : s;
    }
  }
  if (buf) chunks.push(buf);
  return chunks.length ? chunks : text.trim() ? [text.trim()] : [];
}
