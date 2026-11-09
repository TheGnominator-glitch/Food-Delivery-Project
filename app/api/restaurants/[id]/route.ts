import { NextRequest, NextResponse } from "next/server";
import { findRestaurantMenu } from "@/lib/restaurantRepository";

// FR12, FR13: GET /api/restaurants/[id] returns one restaurant's menu, with each item's options
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const restaurantId = Number(id);
    // The id comes from the URL and must be a positive whole number
    if (!Number.isInteger(restaurantId) || restaurantId <= 0) {
      return NextResponse.json({ error: "Restaurant id must be a positive whole number" }, { status: 400 });
    }

    // FR12: load the menu; null means the restaurant does not exist
    const menu = await findRestaurantMenu(restaurantId);
    if (!menu) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    return NextResponse.json({ restaurant: menu }, { status: 200 });
  } catch (err) {
    // Unexpected errors: full details in the server log, a generic message for the client
    console.error("Menu error:", err);
    return NextResponse.json({ error: "Something went wrong loading this menu" }, { status: 500 });
  }
}
