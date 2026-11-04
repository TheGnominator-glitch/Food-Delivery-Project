"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// FR5: the logged-in user, as returned by /api/me
export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  creditBalance: number;
  emailOptIn: boolean;
}

// FR5: for pages that need a login: returns the user, or redirects to /login without a valid session
export function useRequireUser(): CurrentUser | null {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);

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

  return user;
}