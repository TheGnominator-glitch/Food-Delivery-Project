import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId, SESSION_COOKIE } from "@/lib/session";
import { findUserById } from "@/lib/userRepository";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const userId = await getSessionUserId(token);
    if (!userId) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const user = await findUserById(userId);
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    return NextResponse.json({ user }, { status: 200 });
  } catch (err) {
    console.error("Session check error:", err);
    return NextResponse.json(
      { error: "Something went wrong checking your session" },
      { status: 500 }
    );
  }
}