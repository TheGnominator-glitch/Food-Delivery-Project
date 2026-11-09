import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, getSessionUserId } from "@/lib/session";
import { removeCartItem, updateCartItemQuantity } from "@/lib/cartRepository";
import { isId, isQuantity } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });
// Another user's line answers the same as a missing one, so the API never reveals it exists
const notFound = () => NextResponse.json({ error: "Cart item not found" }, { status: 404 });

// FR16: PATCH /api/cart/[id] changes a line's quantity (1 to 20)
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE)?.value);
    if (!userId) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    // The id comes from the URL and must be a positive whole number
    const cartItemId = Number((await params).id);
    if (!isId(cartItemId)) {
      return badRequest("Cart item id must be a positive whole number");
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

    // FR16: the new quantity, from 1 to 20 (removing a line is DELETE)
    if (!isQuantity(body.quantity)) {
      return badRequest("quantity must be a whole number from 1 to 20");
    }

    if (!(await updateCartItemQuantity(userId, cartItemId, body.quantity))) {
      return notFound();
    }
    return NextResponse.json({ cartItemId, quantity: body.quantity }, { status: 200 });
  } catch (err) {
    // Unexpected errors: full details in the server log, a generic message for the client
    console.error("Cart update error:", err);
    return NextResponse.json({ error: "Something went wrong updating your cart" }, { status: 500 });
  }
}

// FR16: DELETE /api/cart/[id] removes a line and its choices
export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE)?.value);
    if (!userId) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    // The id comes from the URL and must be a positive whole number
    const cartItemId = Number((await params).id);
    if (!isId(cartItemId)) {
      return badRequest("Cart item id must be a positive whole number");
    }

    if (!(await removeCartItem(userId, cartItemId))) {
      return notFound();
    }
    return NextResponse.json({ message: "Removed from cart" }, { status: 200 });
  } catch (err) {
    // Unexpected errors: full details in the server log, a generic message for the client
    console.error("Cart remove error:", err);
    return NextResponse.json({ error: "Something went wrong updating your cart" }, { status: 500 });
  }
}
