"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  creditBalance: number;
  emailOptIn: boolean;
}

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then(async (res) => {
        if (!res.ok) {
          router.replace("/login");
          return;
        }
        const data = await res.json();
        setUser(data.user);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

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