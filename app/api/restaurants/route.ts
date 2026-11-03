import { NextRequest, NextResponse } from "next/server";
import { findRestaurants } from "@/lib/restaurantRepository";

const NEARBY_RADIUS_KM = 5;
const MAX_SEARCH_LENGTH = 100;

const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

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

    const categoryParam = params.get("category");
    let categoryId: number | null = null;
    if (categoryParam) {
      categoryId = Number(categoryParam);
      if (!Number.isInteger(categoryId) || categoryId <= 0) {
        return badRequest("category must be a category id");
      }
    }

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
    console.error("Restaurants error:", err);
    return NextResponse.json({ error: "Something went wrong loading restaurants" }, { status: 500 });
  }
}