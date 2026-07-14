import { nanoid } from "nanoid";
import type { Course, CourseProgress, Resource, User } from "@/lib/types";
import { extractFromFile } from "@/lib/ingest/extract";
import { generateOutline, mergeOutlineIntoCourse } from "@/lib/ingest/outline";
import {
  getCourse,
  getProgress,
  saveCourse,
  saveProgress,
  saveResource,
  updateCourse,
} from "@/lib/store/repositories";

export interface CreatedUpload {
  courseId: string;
  resourceId: string;
}

/**
 * Extract text, persist the resource + a pending course, then kick off outline
 * generation in the background. Returns as soon as the course shell exists so
 * the UI can show a processing state and poll for completion.
 */
export async function startUpload(
  user: User,
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<CreatedUpload> {
  const extracted = await extractFromFile(buffer, mimeType, fileName);
  if (extracted.pages.length === 0) {
    throw new Error("No readable text was found in this file.");
  }

  const resourceId = nanoid();
  const resource: Resource = {
    id: resourceId,
    userId: user.id,
    fileName,
    mimeType,
    sizeBytes: buffer.length,
    pageCount: extracted.pageCount,
    uploadedAt: new Date().toISOString(),
    pages: extracted.pages.map((p) => ({ ...p })),
    status: "ready",
  };
  // Tag each page's source file name for later citations.
  const courseId = nanoid();
  await saveResource(resource);

  const course: Course = {
    id: courseId,
    userId: user.id,
    title: fileName.replace(/\.[^.]+$/, ""),
    description: "",
    subjects: [],
    coverage: {
      totalSourceUnits: extracted.pages.length,
      mappedSourceUnits: 0,
      notes: "",
      flaggedGaps: [],
    },
    resourceIds: [resourceId],
    createdAt: new Date().toISOString(),
    ready: false,
  };
  await saveCourse(course);

  // Fire-and-forget: generate the outline, then mark the course ready.
  void buildOutline(course, resource, user).catch(async (err) => {
    await updateCourse(courseId, (c) => ({
      ...c,
      ready: true,
      error: err instanceof Error ? err.message : "Outline generation failed.",
    }));
  });

  return { courseId, resourceId };
}

async function buildOutline(
  course: Course,
  resource: Resource,
  user: User
): Promise<void> {
  const outline = await generateOutline(resource.fileName, resource.pages, {
    provider: user.settings.provider,
    model: user.settings.model,
  });

  // Attach the source file name to every citation.
  for (const s of outline.subjects)
    for (const c of s.chapters)
      for (const t of c.topics)
        for (const src of t.sources) src.file = resource.fileName;

  const updated = await updateCourse(course.id, (c) => ({
    ...c,
    title: outline.title || c.title,
    description: outline.description,
    subjects: outline.subjects,
    coverage: outline.coverage,
    ready: true,
    error: undefined,
  }));

  // Initialize a progress document with every topic set to "not_started".
  if (updated) await initProgress(updated, user.id);
}

/**
 * Add another resource to an existing course. Extracts the new file, then
 * (in the background) generates an outline for it and MERGES it into the
 * course — existing topics keep their IDs so progress is preserved.
 */
export async function addResourceToCourse(
  user: User,
  course: Course,
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ resourceId: string }> {
  const extracted = await extractFromFile(buffer, mimeType, fileName);
  if (extracted.pages.length === 0) {
    throw new Error("No readable text was found in this file.");
  }

  const resourceId = nanoid();
  const resource: Resource = {
    id: resourceId,
    userId: user.id,
    fileName,
    mimeType,
    sizeBytes: buffer.length,
    pageCount: extracted.pageCount,
    uploadedAt: new Date().toISOString(),
    pages: extracted.pages.map((p) => ({ ...p })),
    status: "ready",
  };
  await saveResource(resource);

  await updateCourse(course.id, (c) => ({
    ...c,
    resourceIds: [...c.resourceIds, resourceId],
    ready: false,
    error: undefined,
  }));

  void mergeNewResource(course.id, resource, user).catch(async (err) => {
    await updateCourse(course.id, (c) => ({
      ...c,
      ready: true,
      error: err instanceof Error ? err.message : "Failed to add resource.",
    }));
  });

  return { resourceId };
}

async function mergeNewResource(
  courseId: string,
  resource: Resource,
  user: User
): Promise<void> {
  const outline = await generateOutline(resource.fileName, resource.pages, {
    provider: user.settings.provider,
    model: user.settings.model,
  });
  for (const s of outline.subjects)
    for (const c of s.chapters)
      for (const t of c.topics)
        for (const src of t.sources) src.file = resource.fileName;

  const current = await getCourse(courseId);
  if (!current) return;
  const merged = mergeOutlineIntoCourse(current, outline);

  const updated = await updateCourse(courseId, (c) => ({
    ...c,
    subjects: merged.subjects,
    coverage: merged.coverage,
    ready: true,
    error: undefined,
  }));

  if (updated) await initProgress(updated, user.id);
}

async function initProgress(course: Course, userId: string): Promise<void> {
  const existing = await getProgress(course.id);
  const progress: CourseProgress = existing ?? {
    courseId: course.id,
    userId,
    topics: {},
    updatedAt: new Date().toISOString(),
    mockAttempts: [],
  };

  for (const s of course.subjects)
    for (const c of s.chapters)
      for (const t of c.topics) {
        if (!progress.topics[t.id]) {
          progress.topics[t.id] = {
            topicId: t.id,
            status: "not_started",
            bookmarked: false,
            notes: "",
            scores: [],
          };
        }
      }

  progress.updatedAt = new Date().toISOString();
  await saveProgress(progress);
}
