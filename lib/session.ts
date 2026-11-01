import crypto from "crypto";
import { insertSession, findSessionUserId, deleteSession } from "./sessionRepository";

export const SESSION_COOKIE = "foodie_session";
export const SESSION_DAYS = 7;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  await insertSession(hashToken(token), userId, SESSION_DAYS);
  return token;
}

export async function getSessionUserId(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  return findSessionUserId(hashToken(token));
}

export async function endSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await deleteSession(hashToken(token));
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};