// Shared domain types for the AI Study Partner.
// All persisted as JSON documents under ./data (see lib/store).

export type TopicStatus =
  | "not_started"
  | "learning"
  | "completed"
  | "weak"
  | "mastered";

export interface SourceRef {
  /** Original file name the fact came from. */
  file: string;
  /** 1-based page number (PDF) or section index. */
  page: number;
  /** Short verbatim snippet from the source, for citation display. */
  snippet: string;
}

export interface Topic {
  id: string;
  title: string;
  /** Ordered subtopics that must all be covered — never silently skipped. */
  subtopics: string[];
  /** One-line description of what the topic covers. */
  summary: string;
  /** Why this matters for the exam. */
  examImportance: string;
  /** Where in the uploaded material this topic is grounded. */
  sources: SourceRef[];
}

export interface Chapter {
  id: string;
  title: string;
  topics: Topic[];
}

export interface Subject {
  id: string;
  title: string;
  chapters: Chapter[];
}

export interface CoverageReport {
  /** Total source pages/sections the outline was built from. */
  totalSourceUnits: number;
  /** Source units explicitly mapped to at least one topic. */
  mappedSourceUnits: number;
  /** Human-readable notes about anything that could not be classified. */
  notes: string;
  /** Titles the model flagged as possibly incomplete for follow-up. */
  flaggedGaps: string[];
}

/** A term/semester a course belongs to, e.g. "Fall" 2025. */
export interface Term {
  id: string;
  userId: string;
  name: string;
  year: number;
  archived: boolean;
  createdAt: string;
}

/**
 * An exam the student is preparing for (e.g. Midterm / Final). Coverage is a
 * set of chapter ids — everything else (pacing, mock scope, readiness) derives
 * from it. Entirely optional: courses without exams behave as before.
 */
export interface CourseExam {
  id: string;
  name: string;
  /** ISO date (YYYY-MM-DD) of the exam. */
  date: string;
  /** Chapters this exam covers. */
  chapterIds: string[];
  /** Mocks mix in ~this share of earlier (pre-coverage) topics (0–0.5). */
  includeEarlierShare?: number;
}

export interface Course {
  id: string;
  userId: string;
  title: string;
  description: string;
  subjects: Subject[];
  coverage: CoverageReport;
  resourceIds: string[];
  /** Term this course belongs to (null/undefined = unassigned). */
  termId?: string | null;
  /** Archived courses are hidden from active views but not deleted. */
  archived?: boolean;
  /** Optional "finish by" date (ISO YYYY-MM-DD) — paces the daily study plan. */
  planTargetDate?: string | null;
  /** Optional exams (midterm/final) that scope pacing, mocks, and readiness. */
  exams?: CourseExam[];
  createdAt: string;
  /** Set false while generation is running, true when outline is ready. */
  ready: boolean;
  /** Populated if outline generation failed, so the UI can show a retry. */
  error?: string;
}

export interface ResourcePage {
  page: number;
  text: string;
}

export interface Resource {
  id: string;
  userId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
  uploadedAt: string;
  /** Extracted, cleaned text per page. Untrusted content — never executed. */
  pages: ResourcePage[];
  /** raw | extracting | ready | error */
  status: "raw" | "extracting" | "ready" | "error";
  error?: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  choices: string[];
  /** Index into choices. */
  correctIndex: number;
  explanation: string;
  source?: SourceRef;
}

export interface QuizAnswer {
  questionId: string;
  selectedIndex: number;
  correct: boolean;
}

export interface QuizAttempt {
  id: string;
  topicId: string;
  questions: QuizQuestion[];
  answers: QuizAnswer[];
  score: number; // 0..100
  takenAt: string;
  /** "topic" for a per-topic quiz, "mock" for a mock exam. */
  kind: "topic" | "mock";
}

export interface TopicProgress {
  topicId: string;
  status: TopicStatus;
  bookmarked: boolean;
  notes: string;
  lastVisited?: string;
  /** Score history for the topic (latest last). */
  scores: number[];
  /** Cached last teaching so revisits/resume are instant. */
  lessonCached?: boolean;
  /** Spaced repetition: when this topic is next due for review (ISO date). */
  nextReviewAt?: string;
  /** Current review interval in days (grows as the topic is re-passed). */
  reviewInterval?: number;
  /** From the last quiz: prompts the student missed (for targeted re-quiz). */
  lastWrongPrompts?: string[];
  /** From the last quiz: the exact missed questions (for "redo wrong answers"). */
  lastWrongQuestions?: QuizQuestion[];
}

export interface CourseProgress {
  courseId: string;
  userId: string;
  topics: Record<string, TopicProgress>;
  /** Topic the user was last on, for "resume learning". */
  lastTopicId?: string;
  updatedAt: string;
  mockAttempts: QuizAttempt[];
}

export interface TutorChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

/** Durable, provider-independent tutor history for one course topic. */
export interface TutorChat {
  userId: string;
  courseId: string;
  topicId: string;
  messages: TutorChatMessage[];
  compactMemory: string;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingProfile {
  goal: string;
  level: "beginner" | "intermediate" | "advanced";
  examDate?: string;
  completed: boolean;
}

export interface UserSettings {
  provider: "claude" | "codex";
  /** Optional model hint passed to the provider. */
  model?: string;
}

/** Lightweight study-activity log powering streaks & the daily goal. */
export interface UserActivity {
  /** Distinct local dates (YYYY-MM-DD) the student studied on. */
  days: string[];
  /** Topics-per-day the student aims to complete (used by the study plan). */
  dailyGoal?: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
  onboarding: OnboardingProfile;
  settings: UserSettings;
  /** Study streak / daily-goal tracking. */
  activity?: UserActivity;
}

export interface Session {
  token: string;
  userId: string;
  expiresAt: string;
}
