import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, getSessionUserId } from "@/lib/session";
import { addCartItem, findMenuItemOptions, getCart } from "@/lib/cartRepository";
import { isId, isIdList, isQuantity } from "@/lib/validation";

const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });

// FR15-FR17: GET /api/cart returns the logged-in user's cart, priced on the server
export async function GET(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE)?.value);
    if (!userId) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    return NextResponse.json(await getCart(userId), { status: 200 });
  } catch (err) {
    // Unexpected errors: full details in the server log, a generic message for the client
    console.error("Cart error:", err);
    return NextResponse.json({ error: "Something went wrong loading your cart" }, { status: 500 });
  }
}

// FR14, FR15: POST /api/cart adds an item, with its quantity and choices, to the cart
export async function POST(request: NextRequest) {
  try {
    // FR16: only a logged-in user has a cart
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

    const { menuItemId, quantity } = body;
    const customizationIds = body.customizationIds === undefined ? [] : body.customizationIds;
    const extraIds = body.extraIds === undefined ? [] : body.extraIds;

    // FR14: a real item, a quantity from 1 to 20, and lists of options without repeats
    if (!isId(menuItemId)) {
      return badRequest("menuItemId must be a menu item id");
    }
    if (!isQuantity(quantity)) {
      return badRequest("quantity must be a whole number from 1 to 20");
    }
    if (!isIdList(customizationIds)) {
      return badRequest("customizationIds must be a list of different option ids");
    }
    if (!isIdList(extraIds)) {
      return badRequest("extraIds must be a list of different option ids");
    }

    // FR13, FR14: every choice must be an option this item actually offers
    const options = await findMenuItemOptions(menuItemId);
    if (!options) {
      return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
    }
    if (!customizationIds.every((id) => options.customizationIds.has(id))) {
      return badRequest("A chosen customization is not offered for this item");
    }
    if (!extraIds.every((id) => options.extraIds.has(id))) {
      return badRequest("A chosen extra is not offered for this item");
    }

    // FR14, FR17: save it; the same choices merge into one line, up to 20
    const result = await addCartItem(userId, menuItemId, quantity, customizationIds, extraIds);
    if (result.outcome === "over-limit") {
      return NextResponse.json(
        { error: "You can have at most 20 of this item in your cart", quantity: result.quantity },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { message: "Added to cart", cartItemId: result.cartItemId, quantity: result.quantity, merged: result.outcome === "merged" },
      { status: 201 }
    );
  } catch (err) {
    // Unexpected errors: full details in the server log, a generic message for the client
    console.error("Add to cart error:", err);
    return NextResponse.json({ error: "Something went wrong updating your cart" }, { status: 500 });
  }
}
