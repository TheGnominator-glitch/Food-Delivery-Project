"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRequireUser } from "@/hooks/useRequireUser";

// Home (placeholder): greets the user and links to Restaurants; Orders and Account come later
export default function HomePage() {
  const router = useRouter();
  // FR5: requires a logged-in user
  const user = useRequireUser();
  const [loggingOut, setLoggingOut] = useState(false);

  // FR7: end the session via /api/logout, then return to the Load page (system flow)
  async function logOut() {
    setLoggingOut(true);
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    router.replace("/");
  }

  if (!user) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <p className="text-ink/70">Loading…</p>
      </main>
    );
  }

  const firstName = user.name.split(" ")[0];
  const credits = `${user.creditBalance} ${user.creditBalance === 1 ? "credit" : "credits"}`;

  return (
    <main className="min-h-dvh px-6 py-12 sm:py-20">
      <div className="mx-auto max-w-md">
        <p className="text-2xl font-extrabold tracking-tight text-leaf">foodie</p>
        <h1 className="mt-10 text-3xl font-bold text-ink">Hi, {firstName}</h1>
        <p className="mt-2 text-ink/70">You have {credits}.</p>

        {/* Restaurants button (system flow) */}
        <Link
          href="/restaurants"
          className="mt-8 block rounded-lg bg-leaf px-4 py-3 text-center font-semibold text-white outline-none hover:bg-leaf/90 focus-visible:ring-4 focus-visible:ring-mango/50"
        >
          Restaurants
        </Link>

        {/* FR21: temporary stand-in; the flow puts Buy Credits on the Account page, where it moves once Account exists */}
        <Link
          href="/credits?returnTo=/home"
          className="mt-3 block rounded-lg border border-leaf px-4 py-3 text-center font-semibold text-leaf outline-none hover:bg-mist focus-visible:ring-4 focus-visible:ring-mango/50"
        >
          Buy credits
        </Link>

        {/* FR7: temporary stand-in; the flow puts Log out on the Account page, where it moves once Account exists */}
        <button
          type="button"
          onClick={logOut}
          disabled={loggingOut}
          className="mt-10 rounded-lg border border-line px-4 py-2.5 font-medium text-ink outline-none hover:bg-mist focus-visible:ring-4 focus-visible:ring-mango/50 disabled:opacity-60"
        >
          {loggingOut ? "Logging out…" : "Log out"}
        </button>
      </div>
    </main>
  );
}