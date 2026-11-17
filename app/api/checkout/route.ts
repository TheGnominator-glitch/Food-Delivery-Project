import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, getSessionUserId } from "@/lib/session";
import { getCheckoutQuote, placeOrder } from "@/lib/checkoutRepository";
import { isLatitude, isLongitude, toStoredPrecision } from "@/lib/geo";

const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });
const COORDINATES = "lat and lng must be valid coordinates, sent together";

// FR18, FR19: GET /api/checkout?lat=&lng= returns the Checkout page's figures for a delivery point
export async function GET(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE)?.value);
    if (!userId) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    // FR28: the delivery point from the map pin
    const params = request.nextUrl.searchParams;
    const lat = params.get("lat") === null ? NaN : Number(params.get("lat"));
    const lng = params.get("lng") === null ? NaN : Number(params.get("lng"));
    if (!isLatitude(lat) || !isLongitude(lng)) {
      return badRequest(COORDINATES);
    }

    return NextResponse.json(await getCheckoutQuote(userId, toStoredPrecision({ lat, lng })), { status: 200 });
  } catch (err) {
    // Unexpected errors: full details in the server log, a generic message for the client
    console.error("Checkout quote error:", err);
    return NextResponse.json({ error: "Something went wrong loading checkout" }, { status: 500 });
  }
}

// FR20, FR23-FR25: POST /api/checkout is Confirm and pay
export async function POST(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE)?.value);
    if (!userId) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    // Read the body safely, so malformed JSON gets a 400 instead of crashing the handler
    let body;
    try {
      body = await request.json();
    } catch {
      return badRequest("Request body is not valid JSON");
    }
    // The body must be a JSON object (not null, text or an array)
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return badRequest("Request body must be a JSON object");
    }

    // FR28: the delivery point from the map pin
    const { lat, lng, expectedTotal } = body;
    if (!isLatitude(lat) || !isLongitude(lng)) {
      return badRequest(COORDINATES);
    }
    // FR18: the total the page showed, so a price change is caught instead of charged
    if (typeof expectedTotal !== "number" || !Number.isFinite(expectedTotal) || expectedTotal < 0) {
      return badRequest("expectedTotal must be the total shown on the page");
    }

    const result = await placeOrder(userId, toStoredPrecision({ lat, lng }), expectedTotal);
    switch (result.outcome) {
      case "active-order":
        return NextResponse.json({ error: "You already have an order in progress" }, { status: 409 });
      case "empty-cart":
        return NextResponse.json({ error: "Your cart is empty" }, { status: 409 });
      case "price-changed":
        return NextResponse.json(
          { error: "Prices changed. Please review your order before paying.", total: result.total },
          { status: 409 }
        );
      case "insufficient-credits":
        // FR20: the page sends the user to Buy Credits
        return NextResponse.json(
          { error: "Not enough credits", total: result.total, creditBalance: result.creditBalance },
          { status: 402 }
        );
      case "placed":
        return NextResponse.json(
          { message: "Order placed", orderId: result.orderId, total: result.total, creditBalance: result.creditBalance },
          { status: 201 }
        );
    }
  } catch (err) {
    // Unexpected errors: full details in the server log, a generic message for the client
    console.error("Checkout error:", err);
    return NextResponse.json({ error: "Something went wrong placing your order" }, { status: 500 });
  }
}
