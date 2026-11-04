import { NextRequest, NextResponse } from "next/server";
import { findRestaurants } from "@/lib/restaurantRepository";

// FR9: restaurants within 5 km count as nearby
const NEARBY_RADIUS_KM = 5;
// FR11: longest search text accepted
const MAX_SEARCH_LENGTH = 100;

const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });

// FR8-FR11: GET /api/restaurants?lat=&lng=&category=&search=
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    // FR8, FR9: with valid lat and lng, only nearby restaurants; without them (location denied), all of them
    const latParam = params.get("lat");
    const lngParam = params.get("lng");
    let location = null;
    if (latParam !== null || lngParam !== null) {
      const lat = Number(latParam);
      const lng = Number(lngParam);
      if (
        !latParam || !lngParam ||
        !Number.isFinite(lat) || !Number.isFinite(lng) ||
        Math.abs(lat) > 90 || Math.abs(lng) > 180
      ) {
        return badRequest("lat and lng must be valid coordinates, sent together");
      }
      location = { lat, lng, radiusKm: NEARBY_RADIUS_KM };
    }

    // FR10: an optional category id
    const categoryParam = params.get("category");
    let categoryId: number | null = null;
    if (categoryParam) {
      categoryId = Number(categoryParam);
      if (!Number.isInteger(categoryId) || categoryId <= 0) {
        return badRequest("category must be a category id");
      }
    }

    // FR11: an optional name search
    const search = params.get("search")?.trim() || null;
    if (search && search.length > MAX_SEARCH_LENGTH) {
      return badRequest("search is too long");
    }

    const restaurants = await findRestaurants({ location, categoryId, search });
    return NextResponse.json(
      { restaurants, radiusKm: location ? NEARBY_RADIUS_KM : null },
      { status: 200 }
    );
  } catch (err) {
    // Unexpected errors: full details in the server log, a generic message for the client
    console.error("Restaurants error:", err);
    return NextResponse.json({ error: "Something went wrong loading restaurants" }, { status: 500 });
  }
}