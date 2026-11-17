"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRequireUser } from "@/hooks/useRequireUser";
import { DeliveryMap } from "@/components/DeliveryMap";
import { CART_CHANGED_EVENT, DEFAULT_DELIVERY_POINT } from "@/lib/constants";
import type { Point } from "@/lib/geo";

// FR18, FR19: the Checkout page's figures, as returned by /api/checkout
interface Line {
  cartItemId: number;
  name: string;
  restaurantName: string;
  quantity: number;
  lineTotal: number;
  customizations: { id: number; name: string }[];
  extras: { id: number; name: string; price: number }[];
}
interface Quote {
  items: Line[];
  pickups: { id: number; name: string }[];
  subtotal: number;
  deliveryCost: number;
  estimateMinutes: number;
  total: number;
  creditBalance: number;
  deliveryAddress: string;
  hasActiveOrder: boolean;
}

// Prices are in credits: "1 credit", "2 credits"
const credits = (n: number) => `${n} ${n === 1 ? "credit" : "credits"}`;

// Checkout page (placeholder look): FR18-FR20, FR23
export default function CheckoutPage() {
  // FR5: requires a logged-in user
  const user = useRequireUser();
  const router = useRouter();
  const [point, setPoint] = useState<Point | null>(null);
  const [located, setLocated] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [reload, setReload] = useState(0);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");

  // FR28: the pin starts at the browser's location, or at the city center if there is none
  useEffect(() => {
    const fallback = () => {
      setLocated(false);
      setPoint(DEFAULT_DELIVERY_POINT);
    };
    if (!("geolocation" in navigator)) {
      setTimeout(fallback, 0);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      fallback,
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // FR18, FR19: recalculate on load and whenever the pin moves; outdated requests are cancelled
  useEffect(() => {
    if (!point) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ lat: String(point.lat), lng: String(point.lng) });
    fetch(`/api/checkout?${query}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error);
        setQuote(data);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError("Could not load checkout. Try again.");
      });
    return () => controller.abort();
  }, [point, reload]);

  // FR20, FR23: Confirm and pay
  async function confirmAndPay() {
    if (!point || !quote) return;
    setPaying(true);
    setError("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: point.lat, lng: point.lng, expectedTotal: quote.total }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 201) {
        // FR23: back to Home (system flow); the cart link refreshes its count
        window.dispatchEvent(new Event(CART_CHANGED_EVENT));
        router.replace("/home");
        return;
      }
      if (res.status === 402) {
        // FR20: not enough credits; Buy Credits returns here afterwards, with the cart intact
        router.push(`/credits?${new URLSearchParams({ returnTo: "/checkout" })}`);
        return;
      }
      setError(data.error ?? "Your order could not be placed");
      setReload((n) => n + 1); // show the current figures (e.g. after a price change)
    } catch {
      setError("Your order could not be placed. Try again.");
    }
    setPaying(false);
  }

  if (!user || !point || (!quote && !error)) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <p className="text-ink/70">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh px-6 py-12 sm:py-20">
      <div className="mx-auto max-w-md">
        <Link href="/cart" className="text-sm text-ink/70 underline">
          Back to cart
        </Link>
        <h1 className="mt-6 text-3xl font-bold text-ink">Checkout</h1>

        {error && (
          <p role="alert" className="mt-4 text-danger">
            {error}
          </p>
        )}

        {/* One active order at a time */}
        {quote?.hasActiveOrder && (
          <p className="mt-6 text-ink/70">
            You already have an order in progress. You can order again once it is delivered.{" "}
            <Link href="/home" className="underline">
              Back to home
            </Link>
          </p>
        )}

        {quote && !quote.hasActiveOrder && quote.items.length === 0 && (
          <p className="mt-6 text-ink/70">
            Your cart is empty.{" "}
            <Link href="/restaurants" className="underline">
              Find something to eat
            </Link>
          </p>
        )}

        {quote && !quote.hasActiveOrder && quote.items.length > 0 && (
          <>
            {/* FR28: the delivery point */}
            <section className="mt-6">
              <h2 className="text-lg font-semibold text-ink">Delivery point</h2>
              <p className="mt-1 text-sm text-ink/70">
                {located
                  ? "Drag the pin, or tap the map, to set exactly where to deliver."
                  : "We could not get your location. Move the pin to where we should deliver."}
              </p>
              <div className="mt-3">
                <DeliveryMap point={point} onChange={setPoint} />
              </div>
              <p className="mt-2 text-sm text-ink/70">Address: {quote.deliveryAddress}</p>
            </section>

            {/* FR15, FR23: every item, from every restaurant */}
            <ul className="mt-8 divide-y divide-mist border-y border-mist">
              {quote.items.map((line) => (
                <li key={line.cartItemId} className="py-3">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-ink">
                      {line.quantity} × {line.name}
                      <span className="block text-sm text-ink/70">{line.restaurantName}</span>
                    </span>
                    <span className="shrink-0 text-ink">{credits(line.lineTotal)}</span>
                  </div>
                  {(line.customizations.length > 0 || line.extras.length > 0) && (
                    <p className="text-sm text-ink/70">
                      {[...line.customizations.map((c) => c.name), ...line.extras.map((e) => e.name)].join(", ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>

            {/* FR18, FR19: subtotal, delivery, estimate, total and balance */}
            <dl className="mt-6 space-y-2 text-ink">
              <Row label="Subtotal" value={credits(quote.subtotal)} />
              <Row label="Delivery" value={credits(quote.deliveryCost)} />
              <Row label="Estimated delivery" value={`about ${quote.estimateMinutes} min`} />
              <Row label="Total" value={credits(quote.total)} strong />
              <Row label="Your balance" value={credits(quote.creditBalance)} />
            </dl>
            {quote.pickups.length > 1 && (
              <p className="mt-2 text-sm text-ink/70">
                One driver picks up from {quote.pickups.map((p) => p.name).join(", then ")}.
              </p>
            )}

            <button
              type="button"
              onClick={confirmAndPay}
              disabled={paying}
              className="mt-8 w-full rounded-lg bg-leaf py-3 font-semibold text-white outline-none hover:opacity-90 focus-visible:ring-4 focus-visible:ring-mango/50 disabled:opacity-60"
            >
              {paying ? "Placing order…" : `Confirm and pay ${credits(quote.total)}`}
            </button>
          </>
        )}
      </div>
    </main>
  );
}

// FR18: one line of the totals
function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "text-lg font-semibold" : ""}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
