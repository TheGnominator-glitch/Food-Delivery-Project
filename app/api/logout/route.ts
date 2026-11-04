import { NextRequest, NextResponse } from "next/server";
import { endSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

// FR7: POST /api/logout ends the session (POST only, so a link or page prefetch cannot log anyone out)
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    await endSession(token);

    // Tell the browser to drop the cookie
    const response = NextResponse.json({ message: "Logged out" }, { status: 200 });
    response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
    return response;
  } catch (err) {
    // Unexpected errors: full details in the server log, a generic message for the client
    console.error("Logout error:", err);
    return NextResponse.json(
      { error: "Something went wrong logging out" },
      { status: 500 }
    );
  }
}