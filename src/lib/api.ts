import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "@/lib/auth";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400, extra?: unknown) {
  return NextResponse.json({ error: message, details: extra }, { status });
}

/** Wrap a route handler with consistent error handling. */
export function handle<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      // Next uses this internal signal to mark cookie-backed routes as dynamic
      // during `next build`; it must not be converted into a 500 response.
      if (
        err &&
        typeof err === "object" &&
        "digest" in err &&
        err.digest === "DYNAMIC_SERVER_USAGE"
      ) {
        throw err;
      }
      if (err instanceof UnauthorizedError) {
        return fail("You must be signed in.", 401);
      }
      if (err instanceof ZodError) {
        return fail("Invalid input.", 422, err.flatten().fieldErrors);
      }
      // req.json() throws SyntaxError on malformed bodies — client error, not 500.
      if (err instanceof SyntaxError) {
        return fail("Request body is not valid JSON.", 400);
      }
      console.error("[api] unhandled error:", err);
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      return fail(message, 500);
    }
  };
}
