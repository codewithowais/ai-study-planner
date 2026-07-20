import type { ContentLanguage } from "@/lib/teach/language";

export type { ContentLanguage };

/**
 * The reader's chosen teaching language, persisted in localStorage so it is
 * shared across the lesson, summary, flashcards, quiz and tutor — one setting
 * for the whole topic experience. English is the default.
 */
export const LESSON_LANG_KEY = "asp:lessonLang";

export function readLessonLanguage(): ContentLanguage {
  if (typeof window === "undefined") return "en";
  return window.localStorage.getItem(LESSON_LANG_KEY) === "roman-ur"
    ? "roman-ur"
    : "en";
}

export function writeLessonLanguage(language: ContentLanguage): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LESSON_LANG_KEY, language);
  }
}
