import { nanoid } from "nanoid";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, ok } from "@/lib/api";
import { createTerm, getTerms } from "@/lib/store/repositories";
import type { Term } from "@/lib/types";

const currentYear = 2026;

const schema = z.object({
  name: z.string().trim().min(1, "Term name is required").max(40),
  year: z.number().int().min(1990).max(2100),
});

export const GET = handle(async () => {
  const user = await requireUser();
  const terms = await getTerms(user.id);
  return ok({ terms });
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const body = schema.parse(await req.json());
  const term: Term = {
    id: nanoid(),
    userId: user.id,
    name: body.name,
    year: body.year || currentYear,
    archived: false,
    createdAt: new Date().toISOString(),
  };
  await createTerm(term);
  return ok({ term }, { status: 201 });
});
