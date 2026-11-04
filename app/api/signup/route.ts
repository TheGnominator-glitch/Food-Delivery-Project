import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { emailExists, idExists, createUser } from "@/lib/userRepository";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

// NFR5: accepted email and phone formats
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[0-9]{7,15}$/;

// NFR4: at most 5 signup attempts per IP per hour
const SIGNUP_LIMIT = 5;
const SIGNUP_WINDOW_MS = 60 * 60 * 1000;

// Maximum field lengths, taken from the users table columns
const MAX = { id: 20, name: 120, email: 120, address: 255 };

// FR1: POST /api/signup creates an account
export async function POST(request: NextRequest) {
  try {
    // NFR4: rate limit first, before any other work
    const ip = getClientIp(request);
    const rate = checkRateLimit(`signup:${ip}`, SIGNUP_LIMIT, SIGNUP_WINDOW_MS);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many signup attempts. Please try again later." },
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

    const { id, name, email, password, phone, address, emailOptIn } = body;

    // FR1: every field is required
    if (!id || !name || !email || !password || !phone || !address) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    // Reject oversized values here; otherwise Oracle rejects them and the user gets a 500
    if (
      String(id).length > MAX.id ||
      String(name).length > MAX.name ||
      String(email).length > MAX.email ||
      String(address).length > MAX.address
    ) {
      return NextResponse.json(
        { error: "One or more fields are too long" },
        { status: 400 }
      );
    }

    // NFR5: email format
    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // NFR5: phone format
    if (!PHONE_REGEX.test(phone)) {
      return NextResponse.json(
        { error: "Invalid phone number format" },
        { status: 400 }
      );
    }

    // NFR3: at least 8 characters and at most 72 bytes, since bcrypt ignores anything past 72 bytes
    if (
      typeof password !== "string" ||
      password.length < 8 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      return NextResponse.json(
        { error: "Password must be between 8 and 72 characters" },
        { status: 400 }
      );
    }

    // FR34: consent must be an explicit true or false, never guessed from other values
    if (emailOptIn !== undefined && typeof emailOptIn !== "boolean") {
      return NextResponse.json(
        { error: "emailOptIn must be true or false" },
        { status: 400 }
      );
    }

    // FR2: reject an email that already exists; emails are stored lowercase so case cannot create a duplicate
    const normalizedEmail = String(email).toLowerCase();
    if (await emailExists(normalizedEmail)) {
      return NextResponse.json(
        { error: "Email already exists" },
        { status: 409 }
      );
    }

    // FR2: reject a national ID that already exists
    if (await idExists(id)) {
      return NextResponse.json(
        { error: "National ID already exists" },
        { status: 409 }
      );
    }

    // NFR3: store only a bcrypt hash of the password
    const passwordHash = await bcrypt.hash(password, 10);

    // FR1, FR34, FR35: create the account; opting in is optional
    await createUser({
      id,
      name,
      email: normalizedEmail,
      passwordHash,
      phone,
      address,
      emailOptIn: emailOptIn === true,
    });

    // FR5: a successful signup also logs the user in via the session cookie
    const token = await createSession(id);
    const response = NextResponse.json(
      { message: "Account created successfully" },
      { status: 201 }
    );
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return response;
  } catch (err) {
    // Unexpected errors: full details in the server log, a generic message for the client
    console.error("Signup error:", err);
    return NextResponse.json(
      { error: "Something went wrong creating your account" },
      { status: 500 }
    );
  }
}