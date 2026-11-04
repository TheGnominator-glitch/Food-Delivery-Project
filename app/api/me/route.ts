import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId, SESSION_COOKIE } from "@/lib/session";
import { findUserById } from "@/lib/userRepository";

// FR5: GET /api/me answers "who is logged in?" (the Load page check); 401 without a valid session
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const userId = await getSessionUserId(token);
    if (!userId) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    // The profile never includes the password hash
    const user = await findUserById(userId);
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    return NextResponse.json({ user }, { status: 200 });
  } catch (err) {
    // Unexpected errors: full details in the server log, a generic message for the client
    console.error("Session check error:", err);
    return NextResponse.json(
      { error: "Something went wrong checking your session" },
      { status: 500 }
    );
  }
}