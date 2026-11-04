import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { findUserForLogin } from "@/lib/userRepository";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

// NFR4: at most 5 login attempts per IP per hour (separate from signup)
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 60 * 60 * 1000;

// FR3: one message for every failed login, so the form cannot reveal which emails exist
const INVALID = "Invalid email or password";

// Used when the email does not exist, so a failed login takes the same time either way
let dummyHash: string | null = null;
async function getDummyHash(): Promise<string> {
  if (!dummyHash) dummyHash = await bcrypt.hash("dummy-password-for-timing", 10);
  return dummyHash;
}

// FR3: POST /api/login logs a user in
export async function POST(request: NextRequest) {
  try {
    // NFR4: rate limit first, before any other work
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

    // Read the body safely, so malformed JSON gets a 400 instead of crashing the handler
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body is not valid JSON" },
        { status: 400 }
      );
    }

    // The body must be a JSON object (not null, text or an array)
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Request body must be a JSON object" },
        { status: 400 }
      );
    }

    const { email, password } = body;

    // FR3: email and password are both required
    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // NFR3: bcrypt ignores bytes past 72, so longer passwords are rejected rather than half-checked
    if (Buffer.byteLength(password, "utf8") > 72) {
      return NextResponse.json({ error: INVALID }, { status: 401 });
    }

    // FR3, NFR3: compare with the stored hash via bcrypt.compare, never plain text
    const user = await findUserForLogin(email);
    const hashToCheck = user ? user.passwordHash : await getDummyHash();
    const passwordMatches = await bcrypt.compare(password, hashToCheck);

    if (!user || !passwordMatches) {
      return NextResponse.json({ error: INVALID }, { status: 401 });
    }

    // FR5: start a session and send its token to the browser in a cookie
    const token = await createSession(user.id);
    const response = NextResponse.json({ message: "Logged in" }, { status: 200 });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return response;
  } catch (err) {
    // Unexpected errors: full details in the server log, a generic message for the client
    console.error("Login error:", err);
    return NextResponse.json(
      { error: "Something went wrong logging in" },
      { status: 500 }
    );
  }
}