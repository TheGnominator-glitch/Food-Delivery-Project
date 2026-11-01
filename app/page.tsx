"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoadPage() {
  const router = useRouter();

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