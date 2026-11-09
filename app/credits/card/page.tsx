"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRequireUser } from "@/hooks/useRequireUser";
import { safeReturnTo } from "@/lib/navigation";
import { COP_PER_CREDIT, MAX_CREDIT_PURCHASE, MIN_CREDIT_PURCHASE, TEST_CARD_NUMBER } from "@/lib/constants";

// Prices are in credits: "1 credit", "2 credits"
const credits = (n: number) => `${n} ${n === 1 ? "credit" : "credits"}`;

// FR21: the price in pesos, e.g. "25.000 COP"
const cop = (n: number) => `${(n * COP_PER_CREDIT).toLocaleString("es-CO")} COP`;

function Loading() {
  return (
    <main className="grid min-h-dvh place-items-center">
      <p className="text-ink/70">Loading…</p>
    </main>
  );
}

// Card Details page (placeholder look): FR21, FR22. Reading the URL needs a loading boundary in Next.js.
export default function CardDetailsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <CardDetails />
    </Suspense>
  );
}

function CardDetails() {
  // FR5: requires a logged-in user
  const user = useRequireUser();
  const router = useRouter();
  const params = useSearchParams();
  // FR20: the origin to return to after paying
  const returnTo = safeReturnTo(params.get("returnTo"));
  // FR21: the amount carried forward from Buy Credits (the server checks it again)
  const amount = Number(params.get("amount"));
  const amountValid = Number.isInteger(amount) && amount >= MIN_CREDIT_PURCHASE && amount <= MAX_CREDIT_PURCHASE;
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");

  if (!user) return <Loading />;

  const changeAmount = `/credits?${new URLSearchParams({ returnTo })}`;

  // A missing or invalid amount (e.g. a hand-edited link) goes back to choosing one
  if (!amountValid) {
    return (
      <main className="min-h-dvh px-6 py-12 sm:py-20">
        <div className="mx-auto max-w-md">
          <p className="text-ink/70">Choose how many credits to buy first.</p>
          <Link href={changeAmount} className="mt-4 inline-block font-semibold text-leaf underline">
            Buy credits
          </Link>
        </div>
      </main>
    );
  }

  // FR21, FR22, FR25: "Confirm purchase" adds the credits, logs the transaction, and returns to the origin
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPaying(true);
    setError("");
    try {
      const res = await fetch("/api/credits/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          cardNumber: form.get("cardNumber"),
          expiry: form.get("expiry"),
          securityCode: form.get("securityCode"),
        }),
      });
      if (res.ok) {
        router.replace(returnTo); // replace, so Back does not return to a used card form
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "The payment did not go through");
    } catch {
      setError("The payment did not go through. Try again.");
    }
    setPaying(false);
  }

  return (
    <main className="min-h-dvh px-6 py-12 sm:py-20">
      <div className="mx-auto max-w-md">
        <Link href={changeAmount} className="text-sm text-ink/70 underline">
          Change amount
        </Link>
        <h1 className="mt-6 text-3xl font-bold text-ink">Card details</h1>
        {/* FR21: the amount being purchased */}
        <p className="mt-2 font-semibold text-ink">
          {credits(amount)} for {cop(amount)}
        </p>

        {/* FR22: the simulated card; its details are checked, never stored */}
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <CardField label="Card number" name="cardNumber" placeholder={TEST_CARD_NUMBER} autoComplete="cc-number" />
          <div className="flex gap-4">
            <CardField label="Expiry" name="expiry" placeholder="MM/YY" autoComplete="cc-exp" />
            <CardField label="Security code" name="securityCode" placeholder="123" autoComplete="cc-csc" />
          </div>

          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={paying}
            className="w-full rounded-lg bg-leaf py-3 font-semibold text-white outline-none hover:opacity-90 focus-visible:ring-4 focus-visible:ring-mango/50 disabled:opacity-60"
          >
            {paying ? "Paying…" : `Confirm purchase: ${cop(amount)}`}
          </button>
        </form>
      </div>
    </main>
  );
}

// FR22: a labeled card input
function CardField({ label, name, placeholder, autoComplete }: { label: string; name: string; placeholder: string; autoComplete: string }) {
  return (
    <label className="block flex-1">
      <span className="text-sm text-ink/70">{label}</span>
      <input
        name={name}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode="numeric"
        className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink outline-none focus-visible:ring-4 focus-visible:ring-mango/50"
      />
    </label>
  );
}
