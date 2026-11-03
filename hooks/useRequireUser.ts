"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  creditBalance: number;
  emailOptIn: boolean;
}

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