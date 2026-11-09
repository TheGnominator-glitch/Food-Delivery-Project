"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CART_CHANGED_EVENT } from "@/lib/constants";

// FR16: where the cart link is hidden: logged-out pages, the cart itself, and Account
function isHidden(path: string): boolean {
  return path === "/" || path === "/login" || path === "/cart" || path.startsWith("/account");
}

// FR16: the "Cart (n)" link (placeholder look), shown on every other page while logged in
export function CartLink() {
  const pathname = usePathname();
  const hidden = isHidden(pathname);
  const [count, setCount] = useState<number | null>(null);

  // Reload the count on every page change, and whenever a page announces a cart change
  useEffect(() => {
    if (hidden) return;
    let cancelled = false;
    const load = () => {
      fetch("/api/cart")
        .then(async (res) => {
          const data = res.ok ? await res.json() : null;
          if (!cancelled) setCount(data ? data.itemCount : null); // null: not logged in
        })
        .catch(() => {});
    };
    load();
    window.addEventListener(CART_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(CART_CHANGED_EVENT, load);
    };
  }, [hidden, pathname]);

  if (hidden || count === null) return null;
  return (
    <Link
      href="/cart"
      className="fixed right-4 top-4 z-10 rounded-full bg-leaf px-4 py-2 text-sm font-semibold text-white shadow outline-none focus-visible:ring-4 focus-visible:ring-mango/50"
    >
      Cart ({count})
    </Link>
  );
}
