import type {
  Course,
  CourseProgress,
  Resource,
  Session,
  Term,
  TutorChat,
  User,
} from "@/lib/types";
import {
  deleteJson,
  listJsonIds,
  readJson,
  updateJson,
  writeJson,
} from "@/lib/store/fs-store";

/* ----------------------------- Users ----------------------------- */

const USERS = "users.json";

export async function getUsers(): Promise<User[]> {
  return readJson<User[]>(USERS, []);
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const users = await getUsers();
  const norm = email.trim().toLowerCase();
  return users.find((u) => u.email.toLowerCase() === norm) ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const users = await getUsers();
  return users.find((u) => u.id === id) ?? null;
}

export async function createUser(user: User): Promise<User> {
  await updateJson<User[]>(USERS, [], (users) => [...users, user]);
  return user;
}

export async function updateUser(
  id: string,
  mutate: (u: User) => User
): Promise<User | null> {
  let updated: User | null = null;
  await updateJson<User[]>(USERS, [], (users) =>
    users.map((u) => {
      if (u.id !== id) return u;
      updated = mutate(u);
      return updated;
    })
  );
  return updated;
}

/** Record that the user studied on `dayKey` (idempotent per day). */
export async function recordStudyDay(id: string, dayKey: string): Promise<void> {
  await updateUser(id, (u) => {
    const days = u.activity?.days ?? [];
    if (days.includes(dayKey)) return u;
    return {
      ...u,
      activity: { ...u.activity, days: [...days, dayKey] },
    };
  });
}

/* ---------------------------- Sessions ---------------------------- */

const SESSIONS = "sessions.json";

export async function createSession(session: Session): Promise<Session> {
  await updateJson<Session[]>(SESSIONS, [], (list) => {
    const now = Date.now();
    // Drop expired sessions opportunistically.
    const live = list.filter((s) => new Date(s.expiresAt).getTime() > now);
    return [...live, session];
  });
  return session;
}

export async function findSession(token: string): Promise<Session | null> {
  const list = await readJson<Session[]>(SESSIONS, []);
  const s = list.find((x) => x.token === token);
  if (!s) return null;
  if (new Date(s.expiresAt).getTime() <= Date.now()) return null;
  return s;
}

export async function deleteSession(token: string): Promise<void> {
  await updateJson<Session[]>(SESSIONS, [], (list) =>
    list.filter((s) => s.token !== token)
  );
}

/* ---------------------------- Courses ----------------------------- */

export async function saveCourse(course: Course): Promise<Course> {
  await writeJson<Course>(`courses/${course.id}.json`, course);
  return course;
}

export async function getCourse(id: string): Promise<Course | null> {
  return readJson<Course | null>(`courses/${id}.json`, null);
}

export async function updateCourse(
  id: string,
  mutate: (c: Course) => Course
): Promise<Course | null> {
  const existing = await getCourse(id);
  if (!existing) return null;
  return updateJson<Course>(`courses/${id}.json`, existing, (c) => mutate(c));
}

export async function listCourses(userId: string): Promise<Course[]> {
  const ids = await listJsonIds("courses");
  const courses = await Promise.all(ids.map((id) => getCourse(id)));
  return courses
    .filter((c): c is Course => c !== null && c.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteCourse(id: string): Promise<void> {
  await deleteJson(`courses/${id}.json`);
  await deleteJson(`progress/${id}.json`);
}

/* ----------------------------- Terms ------------------------------ */

const TERMS = "terms.json";

export async function getTerms(userId: string): Promise<Term[]> {
  const all = await readJson<Term[]>(TERMS, []);
  return all
    .filter((t) => t.userId === userId)
    .sort((a, b) => b.year - a.year || a.name.localeCompare(b.name));
}

export async function createTerm(term: Term): Promise<Term> {
  await updateJson<Term[]>(TERMS, [], (list) => [...list, term]);
  return term;
}

export async function updateTerm(
  id: string,
  userId: string,
  mutate: (t: Term) => Term
): Promise<Term | null> {
  let updated: Term | null = null;
  await updateJson<Term[]>(TERMS, [], (list) =>
    list.map((t) => {
      if (t.id !== id || t.userId !== userId) return t;
      updated = mutate(t);
      return updated;
    })
  );
  return updated;
}

export async function deleteTerm(id: string, userId: string): Promise<void> {
  await updateJson<Term[]>(TERMS, [], (list) =>
    list.filter((t) => !(t.id === id && t.userId === userId))
  );
  // Unassign (don't delete) any courses that were in this term.
  const courses = await listCourses(userId);
  for (const c of courses) {
    if (c.termId === id) {
      await updateCourse(c.id, (course) => ({ ...course, termId: null }));
    }
  }
}

export interface CourseWithTerm {
  course: Course;
  term: Term | null;
  active: boolean;
}

/** All courses with their resolved term and active flag (not archived, and
 * their term not archived). */
export async function listCoursesWithTerms(
  userId: string
): Promise<CourseWithTerm[]> {
  const [courses, terms] = await Promise.all([
    listCourses(userId),
    getTerms(userId),
  ]);
  const byId = new Map(terms.map((t) => [t.id, t]));
  return courses.map((course) => {
    const term = course.termId ? byId.get(course.termId) ?? null : null;
    const active = !course.archived && !(term?.archived ?? false);
    return { course, term, active };
  });
}

/** Only the courses that should appear in active views. */
export async function listActiveCourses(userId: string): Promise<Course[]> {
  const withTerms = await listCoursesWithTerms(userId);
  return withTerms.filter((x) => x.active).map((x) => x.course);
}

/* --------------------------- Resources ---------------------------- */

export async function saveResource(resource: Resource): Promise<Resource> {
  await writeJson<Resource>(`resources/${resource.id}.json`, resource);
  return resource;
}

export async function getResource(id: string): Promise<Resource | null> {
  return readJson<Resource | null>(`resources/${id}.json`, null);
}

/* --------------------------- Progress ----------------------------- */

export async function getProgress(
  courseId: string
): Promise<CourseProgress | null> {
  return readJson<CourseProgress | null>(`progress/${courseId}.json`, null);
}

export async function saveProgress(
  progress: CourseProgress
): Promise<CourseProgress> {
  await writeJson<CourseProgress>(
    `progress/${progress.courseId}.json`,
    progress
  );
  return progress;
}

export async function updateProgress(
  courseId: string,
  fallback: CourseProgress,
  mutate: (p: CourseProgress) => CourseProgress
): Promise<CourseProgress> {
  return updateJson<CourseProgress>(
    `progress/${courseId}.json`,
    fallback,
    (p) => mutate(p)
  );
}

/* ---------------------------- Lessons ----------------------------- */
// Cached generated lessons so revisits/resume are instant.

// `variant` discriminates the cache file by depth AND language, e.g.
// "default", "simpler", "deeper", "ur" (Roman Urdu), "simpler_ur". Kept as a
// plain string so new combinations don't need a type change here.
export async function getLesson<T>(
  courseId: string,
  topicId: string,
  variant: string = "default"
): Promise<T | null> {
  const suffix = variant === "default" ? "" : `_${variant}`;
  return readJson<T | null>(`lessons/${courseId}_${topicId}${suffix}.json`, null);
}

export async function saveLesson<T>(
  courseId: string,
  topicId: string,
  lesson: T,
  variant: string = "default"
): Promise<void> {
  const suffix = variant === "default" ? "" : `_${variant}`;
  await writeJson<T>(`lessons/${courseId}_${topicId}${suffix}.json`, lesson);
}

export async function getSummary<T>(
  courseId: string,
  topicId: string
): Promise<T | null> {
  return readJson<T | null>(`summaries/${courseId}_${topicId}.json`, null);
}

export async function saveSummary<T>(
  courseId: string,
  topicId: string,
  summary: T
): Promise<void> {
  await writeJson<T>(`summaries/${courseId}_${topicId}.json`, summary);
}

export async function getFlashcards<T>(
  courseId: string,
  topicId: string
): Promise<T | null> {
  return readJson<T | null>(`flashcards/${courseId}_${topicId}.json`, null);
}

export async function getPlanCoach<T>(
  courseId: string,
  examId: string
): Promise<T | null> {
  return readJson<T | null>(`plan-coach/${courseId}_${examId}.json`, null);
}

// A per-topic quiz "set" (full questions incl. answers) cached so re-opening a
// topic's quiz doesn't re-spend tokens; "Retake" regenerates it. Separate from
// the per-attempt pending store (quizzes/{attemptId}.json), which is transient.
export async function getQuizSet<T>(
  courseId: string,
  topicId: string
): Promise<T | null> {
  return readJson<T | null>(`quiz-sets/${courseId}_${topicId}.json`, null);
}

export async function saveQuizSet<T>(
  courseId: string,
  topicId: string,
  quiz: T
): Promise<void> {
  await writeJson<T>(`quiz-sets/${courseId}_${topicId}.json`, quiz);
}

export async function savePlanCoach<T>(
  courseId: string,
  examId: string,
  note: T
): Promise<void> {
  await writeJson<T>(`plan-coach/${courseId}_${examId}.json`, note);
}

export async function saveFlashcards<T>(
  courseId: string,
  topicId: string,
  cards: T
): Promise<void> {
  await writeJson<T>(`flashcards/${courseId}_${topicId}.json`, cards);
}

/* -------------------------- Tutor chats --------------------------- */

export async function getTutorChat(
  courseId: string,
  topicId: string
): Promise<TutorChat | null> {
  return readJson<TutorChat | null>(`chats/${courseId}_${topicId}.json`, null);
}

export async function saveTutorChat(chat: TutorChat): Promise<void> {
  await writeJson<TutorChat>(`chats/${chat.courseId}_${chat.topicId}.json`, chat);
}

/**
 * Atomic read-modify-write for a tutor chat (per-file lock via updateJson).
 * Concurrent senders each see the truly-latest stored chat inside `mutate`,
 * so merges are additive with no lost-update window.
 */
export async function updateTutorChat(
  courseId: string,
  topicId: string,
  mutate: (current: TutorChat | null) => TutorChat
): Promise<TutorChat> {
  return (await updateJson<TutorChat | null>(
    `chats/${courseId}_${topicId}.json`,
    null,
    (current) => mutate(current)
  )) as TutorChat;
}

/* ------------------------- Pending quizzes ------------------------ */
// Full quizzes (with answers) live server-side until graded.

export async function savePendingQuiz<T>(id: string, quiz: T): Promise<void> {
  await writeJson<T>(`quizzes/${id}.json`, quiz);
}

export async function getPendingQuiz<T>(id: string): Promise<T | null> {
  return readJson<T | null>(`quizzes/${id}.json`, null);
}

export async function deletePendingQuiz(id: string): Promise<void> {
  await deleteJson(`quizzes/${id}.json`);
}
