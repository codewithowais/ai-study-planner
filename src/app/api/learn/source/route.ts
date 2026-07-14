import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/api";
import { getCourse, getResource } from "@/lib/store/repositories";

const schema = z.object({
  courseId: z.string(),
  page: z.number().int(),
  file: z.string().optional(),
});

// Returns the extracted text of a cited source page so the student can
// verify the AI against their own material in one tap.
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { courseId, page, file } = schema.parse(await req.json());

  const course = await getCourse(courseId);
  if (!course || course.userId !== user.id) return fail("Course not found.", 404);

  for (const rid of course.resourceIds) {
    const resource = await getResource(rid);
    if (!resource) continue;
    if (file && resource.fileName !== file) continue;
    const p = resource.pages.find((x) => x.page === page);
    if (p) {
      return ok({ page, file: resource.fileName, text: p.text });
    }
  }
  return fail("That source page could not be found.", 404);
});
