"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Load page: the entry point of the app
export default function LoadPage() {
  const router = useRouter();

  // FR5: ask /api/me for a valid session, then go to Home or to the login page
  useEffect(() => {
    fetch("/api/me")
      .then((res) => router.replace(res.ok ? "/home" : "/login"))
      .catch(() => router.replace("/login"));
  }, [router]);

  return (
    <main className="grid min-h-dvh place-items-center">
      <p className="text-ink/70">Loading…</p>
    </main>
  );
}