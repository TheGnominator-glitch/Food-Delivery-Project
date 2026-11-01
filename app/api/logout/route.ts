import { NextRequest, NextResponse } from "next/server";
import { endSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    await endSession(token);

    const response = NextResponse.json({ message: "Logged out" }, { status: 200 });
    response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
    return response;
  } catch (err) {
    console.error("Logout error:", err);
    return NextResponse.json(
      { error: "Something went wrong logging out" },
      { status: 500 }
    );
  }
}