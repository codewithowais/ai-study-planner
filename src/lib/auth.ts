import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import type { Session, User } from "@/lib/types";
import {
  createSession,
  createUser,
  deleteSession,
  findSession,
  findUserById,
  getUsers,
} from "@/lib/store/repositories";

export const SESSION_COOKIE = "asp_session";
const SESSION_TTL_DAYS = 30;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** This is a single-user app: an account exists once anyone has registered. */
export async function accountExists(): Promise<boolean> {
  const users = await getUsers();
  return users.length > 0;
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<User> {
  const user: User = {
    id: nanoid(),
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    passwordHash: await hashPassword(input.password),
    createdAt: new Date().toISOString(),
    onboarding: { goal: "", level: "beginner", completed: false },
    settings: { provider: "claude" },
  };
  return createUser(user);
}

export async function startSession(userId: string): Promise<Session> {
  const token = nanoid(48);
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION_TTL_DAYS);
  const session = await createSession({
    token,
    userId,
    expiresAt: expires.toISOString(),
  });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
  return session;
}

export async function endSession(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  cookies().delete(SESSION_COOKIE);
}

/** Returns the logged-in user, or null. Never throws. */
export async function getCurrentUser(): Promise<User | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await findSession(token);
  if (!session) return null;
  return findUserById(session.userId);
}

/** Throws if not authenticated — use in API routes that require a user. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}
