import crypto from "crypto";
import { insertSession, findSessionUserId, deleteSession } from "./sessionRepository";

// FR5: cookie name and session lifetime (7 days)
export const SESSION_COOKIE = "foodie_session";
export const SESSION_DAYS = 7;

// Only the SHA-256 hash of a token is stored, so a leaked sessions table cannot be used to log in
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
// FR5: create a random 64-character token via crypto.randomBytes and store its hash
export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  await insertSession(hashToken(token), userId, SESSION_DAYS);
  return token;
}

// FR5: the logged-in user id for a token, or null if missing, unknown or expired
export async function getSessionUserId(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  return findSessionUserId(hashToken(token));
}

// FR7: end a session immediately
export async function endSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await deleteSession(hashToken(token));
}

// FR5: cookie hidden from page scripts (httpOnly), HTTPS-only in production, expires with the session
export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};