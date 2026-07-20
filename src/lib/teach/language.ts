/**
 * Roman Urdu teaching mode, shared across every content generator (lesson,
 * summary, flashcards, quiz, tutor chat) so the whole topic experience can be
 * in one language. English is the default and completely unaffected.
 */

export type ContentLanguage = "en" | "roman-ur";

/**
 * Instruction appended to JSON-output generators (summary, flashcards, quiz).
 * Keeps JSON keys, technical terms and numbers in English so parsing and the
 * various quality gates keep working with ANY provider (Claude, Codex, …).
 * `extra` lets a caller add feature-specific rules (e.g. lessons keep the
 * exact "Exercise N" labels).
 */
export function romanUrduJsonLine(extra = ""): string {
  const base =
    "LANGUAGE — WRITE IN ROMAN URDU: Write every value you output in ROMAN URDU — " +
    "Urdu/Hindi as people naturally speak it, typed in ENGLISH (Latin) letters, NOT the " +
    "Urdu/Arabic script. Use a warm, casual, friendly local-teacher voice (e.g. \"chalo " +
    "isko simple tareeqe se samajhte hain\", \"ghabrao mat, ye asaan hai\"). Keep the JSON " +
    "KEYS in English. Keep technical/subject terms, proper nouns, formulas, symbols and " +
    "numbers as they normally appear — writing a term in English is natural and expected " +
    "when there is no everyday Urdu word for it. Use Latin letters only — no Urdu/Arabic " +
    "script anywhere.";
  return extra ? `${base} ${extra}` : base;
}

/** Instruction for plain-text output (tutor chat replies). */
export const ROMAN_URDU_CHAT_LINE =
  "IMPORTANT — REPLY IN ROMAN URDU: Answer in Roman Urdu — Urdu/Hindi written in ENGLISH " +
  "(Latin) letters, never the Urdu/Arabic script — in a warm, casual, natural teacher " +
  "voice. Keep technical terms, names, numbers and source citations like (FIN623.pdf, " +
  "p.12) exactly as they are. Use Latin letters only.";

/**
 * Cache-file variant suffix for a language. English → "default" (no suffix, so
 * existing caches are untouched); Roman Urdu → "ur" (its own file).
 */
export function languageVariant(language?: ContentLanguage): string {
  return language === "roman-ur" ? "ur" : "default";
}

/**
 * Language value for a generation fingerprint. Returns `undefined` for English
 * so the fingerprint hash is byte-identical to before this feature (no
 * re-billing of the existing English library); Roman Urdu gets a distinct
 * fingerprint (also keying the in-process generation lock correctly).
 */
export function languageFingerprint(
  language?: ContentLanguage
): "roman-ur" | undefined {
  return language === "roman-ur" ? "roman-ur" : undefined;
}
