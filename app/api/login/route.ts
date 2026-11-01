import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { findUserForLogin } from "@/lib/userRepository";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 60 * 60 * 1000;

const INVALID = "Invalid email or password";

let dummyHash: string | null = null;
async function getDummyHash(): Promise<string> {
  if (!dummyHash) dummyHash = await bcrypt.hash("dummy-password-for-timing", 10);
  return dummyHash;
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rate = checkRateLimit(`login:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_MS);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSeconds) },
        }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body is not valid JSON" },
        { status: 400 }
      );
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Request body must be a JSON object" },
        { status: 400 }
      );
    }

    const { email, password } = body;

    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // bcrypt only uses the first 72 bytes of a password. Rejecting longer ones means a
    // guess that merely starts with the right 72 bytes can never be accepted.
    if (Buffer.byteLength(password, "utf8") > 72) {
      return NextResponse.json({ error: INVALID }, { status: 401 });
    }

    // FR-3 / NFR-3: compare against the stored hash, never plain text
    const user = await findUserForLogin(email);
    const hashToCheck = user ? user.passwordHash : await getDummyHash();
    const passwordMatches = await bcrypt.compare(password, hashToCheck);

    if (!user || !passwordMatches) {
      return NextResponse.json({ error: INVALID }, { status: 401 });
    }

    // FR-5: start a session and hand the token to the browser in a cookie
    const token = await createSession(user.id);
    const response = NextResponse.json({ message: "Logged in" }, { status: 200 });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return response;
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json(
      { error: "Something went wrong logging in" },
      { status: 500 }
    );
  }
}