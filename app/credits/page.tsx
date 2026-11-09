"use client";

import { Suspense, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRequireUser } from "@/hooks/useRequireUser";
import { safeReturnTo } from "@/lib/navigation";
import { COP_PER_CREDIT, CREDIT_PACKAGES, MAX_CREDIT_PURCHASE, MIN_CREDIT_PURCHASE } from "@/lib/constants";

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

// Buy Credits page (placeholder look): FR21. Reading the URL needs a loading boundary in Next.js.
export default function BuyCreditsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <BuyCredits />
    </Suspense>
  );
}

function BuyCredits() {
  // FR5, FR21: requires a logged-in user; the balance comes from the database through /api/me
  const user = useRequireUser();
  const router = useRouter();
  // FR20: the origin to return to after paying, carried on to Card Details
  const returnTo = safeReturnTo(useSearchParams().get("returnTo"));
  const [choice, setChoice] = useState<number | "custom">(CREDIT_PACKAGES[0]);
  const [custom, setCustom] = useState("");

  if (!user) return <Loading />;

  // FR21: a package, or a custom whole number from 1 to 1000
  const amount = choice === "custom" ? Number(custom) : choice;
  const amountValid =
    (choice !== "custom" || custom.trim() !== "") &&
    Number.isInteger(amount) && amount >= MIN_CREDIT_PURCHASE && amount <= MAX_CREDIT_PURCHASE;

  // FR21: "Enter card details" carries the amount forward to the Card Details page
  function enterCardDetails() {
    const query = new URLSearchParams({ amount: String(amount), returnTo });
    router.push(`/credits/card?${query}`);
  }

  return (
    <main className="min-h-dvh px-6 py-12 sm:py-20">
      <div className="mx-auto max-w-md">
        <Link href={returnTo} className="text-sm text-ink/70 underline">
          Back
        </Link>
        <h1 className="mt-6 text-3xl font-bold text-ink">Buy credits</h1>
        <p className="mt-2 text-ink/70">Your balance: {credits(user.creditBalance)}</p>

        {/* FR21: a fixed package or a custom amount */}
        <fieldset className="mt-8">
          <legend className="text-sm font-medium text-ink">How many credits?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {CREDIT_PACKAGES.map((n) => (
              <AmountButton key={n} active={choice === n} onClick={() => setChoice(n)}>
                {n}
              </AmountButton>
            ))}
            <AmountButton active={choice === "custom"} onClick={() => setChoice("custom")}>
              Custom
            </AmountButton>
          </div>
          {choice === "custom" && (
            <label className="mt-3 block">
              <span className="text-sm text-ink/70">
                Credits ({MIN_CREDIT_PURCHASE} to {MAX_CREDIT_PURCHASE})
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={MIN_CREDIT_PURCHASE}
                max={MAX_CREDIT_PURCHASE}
                step={1}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink outline-none focus-visible:ring-4 focus-visible:ring-mango/50"
              />
            </label>
          )}
        </fieldset>

        {/* FR21: packages show their fixed price; a custom amount's price is calculated as it is typed */}
        {amountValid && (
          <p className="mt-6 font-semibold text-ink">
            {credits(amount)} = {cop(amount)}
          </p>
        )}

        <button
          type="button"
          onClick={enterCardDetails}
          disabled={!amountValid}
          className="mt-6 w-full rounded-lg bg-leaf py-3 font-semibold text-white outline-none hover:opacity-90 focus-visible:ring-4 focus-visible:ring-mango/50 disabled:opacity-60"
        >
          Enter card details
        </button>
      </div>
    </main>
  );
}

// FR21: a package or "Custom" toggle
function AmountButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-lg border px-4 py-2 font-medium outline-none focus-visible:ring-4 focus-visible:ring-mango/50 ${
        active ? "border-leaf bg-leaf text-white" : "border-line bg-white text-ink hover:bg-mist"
      }`}
    >
      {children}
    </button>
  );
}
