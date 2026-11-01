import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { emailExists, idExists, createUser } from "@/lib/userRepository";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[0-9]{7,15}$/;

const SIGNUP_LIMIT = 5;
const SIGNUP_WINDOW_MS = 60 * 60 * 1000;

const MAX = { id: 20, name: 120, email: 120, address: 255 };

export async function POST(request: NextRequest) {
  try {
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

    const { id, name, email, password, phone, address, emailOptIn } = body;

    if (!id || !name || !email || !password || !phone || !address) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

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

    // NFR-5: format validation
    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    if (!PHONE_REGEX.test(phone)) {
      return NextResponse.json(
        { error: "Invalid phone number format" },
        { status: 400 }
      );
    }

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

    if (emailOptIn !== undefined && typeof emailOptIn !== "boolean") {
      return NextResponse.json(
        { error: "emailOptIn must be true or false" },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).toLowerCase();
    if (await emailExists(normalizedEmail)) {
      return NextResponse.json(
        { error: "Email already exists" },
        { status: 409 }
      );
    }

    if (await idExists(id)) {
      return NextResponse.json(
        { error: "National ID already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await createUser({
      id,
      name,
      email: normalizedEmail,
      passwordHash,
      phone,
      address,
      emailOptIn: emailOptIn === true,
    });

    const token = await createSession(id);
    const response = NextResponse.json(
      { message: "Account created successfully" },
      { status: 201 }
    );
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return response;
  } catch (err) {
    console.error("Signup error:", err);
    return NextResponse.json(
      { error: "Something went wrong creating your account" },
      { status: 500 }
    );
  }
}