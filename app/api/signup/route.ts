import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { emailExists, createUser } from "@/lib/userRepository";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[0-9]{7,15}$/;

const SIGNUP_LIMIT = 5;
const SIGNUP_WINDOW_MS = 60 * 60 * 1000;

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

    const body = await request.json();
    const { id, name, email, password, phone, address, whatsappOptIn } = body;

    // Basic presence check
    if (!id || !name || !email || !password || !phone || !address) {
      return NextResponse.json(
        { error: "All fields are required" },
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

    const alreadyExists = await emailExists(email);
    if (alreadyExists) {
      return NextResponse.json(
        { error: "Email already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await createUser({
      id,
      name,
      email,
      passwordHash,
      phone,
      address,
      whatsappOptIn: Boolean(whatsappOptIn),
    });

    return NextResponse.json(
      { message: "Account created successfully" },
      { status: 201 }
    );
  } catch (err) {
    console.error("Signup error:", err);
    return NextResponse.json(
      { error: "Something went wrong creating your account" },
      { status: 500 }
    );
  }
}