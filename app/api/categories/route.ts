import { NextResponse } from "next/server";
import { listCategories } from "@/lib/restaurantRepository";

// FR10: GET /api/categories lists the categories for the filter buttons
export async function GET() {
  try {
    const categories = await listCategories();
    return NextResponse.json({ categories }, { status: 200 });
  } catch (err) {
    // Unexpected errors: full details in the server log, a generic message for the client
    console.error("Categories error:", err);
    return NextResponse.json({ error: "Something went wrong loading categories" }, { status: 500 });
  }
}