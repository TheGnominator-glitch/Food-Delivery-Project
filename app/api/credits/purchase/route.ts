import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, getSessionUserId } from "@/lib/session";
import { purchaseCredits } from "@/lib/creditRepository";
import { cardDigits, hasSixteenDigits, isExpired, isSecurityCode, parseExpiry, passesLuhn } from "@/lib/card";
import { MAX_CREDIT_PURCHASE, MIN_CREDIT_PURCHASE } from "@/lib/constants";

const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });

// FR21, FR22, FR25: POST /api/credits/purchase buys credits with a simulated card payment
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

    const { amount, cardNumber, expiry, securityCode } = body;

    // FR21: a package or a custom amount, both whole credits from 1 to 1000
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount < MIN_CREDIT_PURCHASE || amount > MAX_CREDIT_PURCHASE) {
      return badRequest("amount must be a whole number of credits from 1 to 1000");
    }

    // FR22: all three card fields are required
    if (typeof cardNumber !== "string" || typeof expiry !== "string" || typeof securityCode !== "string") {
      return badRequest("Card number, expiry and security code are required");
    }

    // FR22: 16 digits with a valid checksum, a current expiry, and a 3-digit security code
    const digits = cardDigits(cardNumber);
    if (!hasSixteenDigits(digits)) {
      return badRequest("Card number must be 16 digits");
    }
    if (!passesLuhn(digits)) {
      return badRequest("Card number is not valid");
    }
    const parsedExpiry = parseExpiry(expiry);
    if (!parsedExpiry) {
      return badRequest("Expiry must be a month and year as MM/YY");
    }
    if (isExpired(parsedExpiry)) {
      return badRequest("Card has expired");
    }
    if (!isSecurityCode(securityCode)) {
      return badRequest("Security code must be 3 digits");
    }

    // FR21, FR25: the card details go no further than this point; only the amount is saved
    const creditBalance = await purchaseCredits(userId, amount);
    return NextResponse.json({ message: "Credits added", amount, creditBalance }, { status: 201 });
  } catch (err) {
    // Unexpected errors: full details in the server log, a generic message for the client
    console.error("Credit purchase error:", err);
    return NextResponse.json({ error: "Something went wrong buying credits" }, { status: 500 });
  }
}
