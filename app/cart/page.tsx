"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRequireUser } from "@/hooks/useRequireUser";
import { MIN_ITEM_QUANTITY, MAX_ITEM_QUANTITY, CART_CHANGED_EVENT } from "@/lib/constants";

// FR16: one line of the cart, as returned by /api/cart
interface CartLine {
  id: number;
  name: string;
  restaurantName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  customizations: { id: number; name: string }[];
  extras: { id: number; name: string; price: number }[];
}

// FR16: the whole cart
interface Cart {
  items: CartLine[];
  subtotal: number;
  itemCount: number;
}

// Prices are in credits: "1 credit", "2 credits"
const credits = (n: number) => `${n} ${n === 1 ? "credit" : "credits"}`;

// FR17: the cart comes from the database, so it is the same after closing the browser
async function fetchCart(): Promise<Cart> {
  const res = await fetch("/api/cart");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error);
  return data;
}

// FR15: lines grouped by restaurant (the API already sorts them by restaurant)
function groupByRestaurant(items: CartLine[]) {
  const groups: { restaurant: string; lines: CartLine[] }[] = [];
  for (const line of items) {
    const last = groups[groups.length - 1];
    if (last && last.restaurant === line.restaurantName) last.lines.push(line);
    else groups.push({ restaurant: line.restaurantName, lines: [line] });
  }
  return groups;
}

// Cart page (placeholder look): FR15-FR17
export default function CartPage() {
  // FR5: requires a logged-in user
  const user = useRequireUser();
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    fetchCart()
      .then(setCart)
      .catch(() => setError("Could not load your cart. Try again."));
  }, []);

  // FR16: change or remove a line, then reload the cart so prices come from the server
  async function change(lineId: number, request: RequestInit) {
    setBusyId(lineId);
    setError("");
    try {
      const res = await fetch(`/api/cart/${lineId}`, request);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not update your cart");
      }
      setCart(await fetchCart());
      window.dispatchEvent(new Event(CART_CHANGED_EVENT));
    } catch {
      setError("Could not update your cart. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  const setQuantity = (lineId: number, quantity: number) =>
    change(lineId, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });
  const remove = (lineId: number) => change(lineId, { method: "DELETE" });

  if (!user || (!cart && !error)) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <p className="text-ink/70">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh px-6 py-12 sm:py-20">
      <div className="mx-auto max-w-md">
        <Link href="/restaurants" className="text-sm text-ink/70 underline">
          Back to restaurants
        </Link>
        <h1 className="mt-6 text-3xl font-bold text-ink">Your cart</h1>

        {error && (
          <p role="alert" className="mt-4 text-danger">
            {error}
          </p>
        )}

        {/* FR16: an empty cart */}
        {cart && cart.items.length === 0 && (
          <p className="mt-6 text-ink/70">
            Your cart is empty.{" "}
            <Link href="/restaurants" className="underline">
              Find something to eat
            </Link>
          </p>
        )}

        {/* FR15, FR16: every line, grouped by restaurant, with its choices and price */}
        {cart &&
          groupByRestaurant(cart.items).map((group) => (
            <section key={group.restaurant} className="mt-8">
              <h2 className="text-lg font-semibold text-ink">{group.restaurant}</h2>
              <ul className="mt-2 divide-y divide-mist border-y border-mist">
                {group.lines.map((line) => (
                  <li key={line.id} className="py-4">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="font-semibold text-ink">{line.name}</span>
                      <span className="shrink-0 text-ink">{credits(line.lineTotal)}</span>
                    </div>
                    {(line.customizations.length > 0 || line.extras.length > 0) && (
                      <p className="mt-1 text-sm text-ink/70">
                        {[
                          ...line.customizations.map((c) => c.name),
                          ...line.extras.map((e) => `${e.name} (+${credits(e.price)})`),
                        ].join(", ")}
                      </p>
                    )}
                    <div className="mt-3 flex items-center gap-3">
                      {/* FR16: quantity from 1 to 20 */}
                      <QuantityButton
                        label={`Decrease quantity of ${line.name}`}
                        disabled={busyId !== null || line.quantity <= MIN_ITEM_QUANTITY}
                        onClick={() => setQuantity(line.id, line.quantity - 1)}
                      >
                        −
                      </QuantityButton>
                      <span className="w-6 text-center tabular-nums text-ink">{line.quantity}</span>
                      <QuantityButton
                        label={`Increase quantity of ${line.name}`}
                        disabled={busyId !== null || line.quantity >= MAX_ITEM_QUANTITY}
                        onClick={() => setQuantity(line.id, line.quantity + 1)}
                      >
                        +
                      </QuantityButton>
                      <span className="text-sm text-ink/70">{credits(line.unitPrice)} each</span>
                      {/* FR16: remove the line */}
                      <button
                        type="button"
                        onClick={() => remove(line.id)}
                        disabled={busyId !== null}
                        className="ml-auto text-sm text-danger underline disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}

        {/* FR16: the subtotal updates after every change */}
        {cart && cart.items.length > 0 && (
          <p className="mt-8 flex justify-between text-lg font-semibold text-ink">
            <span>Subtotal</span>
            <span>{credits(cart.subtotal)}</span>
          </p>
        )}
      </div>
    </main>
  );
}

// A + or - button for a line's quantity
function QuantityButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="size-9 rounded-lg border border-line bg-white text-lg text-ink outline-none hover:bg-white/70 focus-visible:ring-4 focus-visible:ring-mango/50 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
