import { requireUser } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/api";
import { startUpload } from "@/lib/ingest/process";
import { UnsupportedFileError } from "@/lib/ingest/extract";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = handle(async (req: Request) => {
  const user = await requireUser();

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return fail("No file was uploaded.", 400);
  }
  if (file.size === 0) return fail("The uploaded file is empty.", 400);
  if (file.size > MAX_BYTES) {
    return fail("File is too large. Maximum size is 25 MB.", 413);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await startUpload(user, buffer, file.name, file.type);
    return ok(result, { status: 201 });
  } catch (err) {
    if (err instanceof UnsupportedFileError) return fail(err.message, 415);
    throw err;
  }
});
