"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRequireUser } from "@/hooks/useRequireUser";
import { MIN_ITEM_QUANTITY, MAX_ITEM_QUANTITY, CART_CHANGED_EVENT } from "@/lib/constants";

// FR13: a free customization
interface Option {
  id: number;
  name: string;
}

// FR13: a paid extra, with its price for this item
interface Extra {
  id: number;
  name: string;
  price: number;
}

// FR12, FR13: a menu item and its options
interface MenuItem {
  id: number;
  name: string;
  price: number;
  description: string | null;
  customizations: Option[];
  extras: Extra[];
}

// FR12: a restaurant and its menu
interface Menu {
  id: number;
  name: string;
  category: string;
  items: MenuItem[];
}

// Prices are in credits: "1 credit", "2 credits"
const credits = (n: number) => `${n} ${n === 1 ? "credit" : "credits"}`;

// Restaurant Menu page (placeholder look): FR12-FR14
export default function MenuPage() {
  // FR5: requires a logged-in user
  const user = useRequireUser();
  const { id } = useParams<{ id: string }>();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // FR12, FR13: load the restaurant and its menu from /api/restaurants/[id]
  useEffect(() => {
    fetch(`/api/restaurants/${id}`)
      .then(async (res) => {
        if (res.status === 404 || res.status === 400) {
          setNotFound(true);
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setMenu(data.restaurant);
      })
      .catch(() => setError("Could not load this menu. Try again."));
  }, [id]);

  if (!user || (!menu && !notFound && !error)) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <p className="text-ink/70">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh px-6 py-12 sm:py-20">
      <div className="mx-auto max-w-md">
        <Link href="/restaurants" className="text-sm text-ink/70 underline">
          Back to restaurants
        </Link>

        {/* FR12: a restaurant that does not exist */}
        {notFound && <p className="mt-6 text-ink/70">This restaurant does not exist.</p>}
        {error && (
          <p role="alert" className="mt-6 text-danger">
            {error}
          </p>
        )}

        {menu && (
          <>
            <h1 className="mt-6 text-3xl font-bold text-ink">{menu.name}</h1>
            <p className="mt-1 text-ink/70">{menu.category}</p>

            {/* FR12: every item with its price and description; tapping one opens its options */}
            <ul className="mt-6 divide-y divide-mist border-y border-mist">
              {menu.items.map((item) => (
                <li key={item.id} className="py-4">
                  <button
                    type="button"
                    aria-expanded={selectedId === item.id}
                    onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}
                    className="flex w-full items-baseline justify-between gap-4 text-left outline-none focus-visible:ring-4 focus-visible:ring-mango/50"
                  >
                    <span>
                      <span className="block font-semibold text-ink">{item.name}</span>
                      {item.description && (
                        <span className="block text-sm text-ink/70">{item.description}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-ink">{credits(item.price)}</span>
                  </button>
                  {/* FR14: one item open at a time; the key resets its choices when another opens */}
                  {selectedId === item.id && <ItemOptions key={item.id} item={item} />}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}

// FR14: choose the quantity, customizations and extras for one item
function ItemOptions({ item }: { item: MenuItem }) {
  const [quantity, setQuantity] = useState(MIN_ITEM_QUANTITY);
  const [customizationIds, setCustomizationIds] = useState<number[]>([]);
  const [extraIds, setExtraIds] = useState<number[]>([]);

  const toggle = (list: number[], value: number) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  // FR13, FR14: the price of the chosen extras, for this item
  const extrasTotal = item.extras
    .filter((e) => extraIds.includes(e.id))
    .reduce((sum, e) => sum + e.price, 0);
  // FR14: running total, shown for information only; the server recalculates every price itself
  const total = (item.price + extrasTotal) * quantity;
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  // FR14, FR15: add the item with its quantity and choices; the user stays on the menu
  async function addToCart() {
    setAdding(true);
    setStatus(null);
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menuItemId: item.id, quantity, customizationIds, extraIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus({ ok: true, text: "Added to cart" });
        window.dispatchEvent(new Event(CART_CHANGED_EVENT)); // FR16: the cart link updates its count
      } else {
        setStatus({ ok: false, text: data.error ?? "Could not add to cart" });
      }
    } catch {
      setStatus({ ok: false, text: "Could not add to cart. Try again." });
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="mt-4 space-y-4 rounded-lg bg-mist p-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-ink">Quantity</span>
        {/* FR14: quantity from 1 to 20 (limits from lib/constants.ts) */}
        <StepButton
          label="Decrease quantity"
          disabled={quantity <= MIN_ITEM_QUANTITY}
          onClick={() => setQuantity((q) => q - 1)}
        >
          −
        </StepButton>
        <span className="w-6 text-center tabular-nums text-ink" aria-live="polite">
          {quantity}
        </span>
        <StepButton
          label="Increase quantity"
          disabled={quantity >= MAX_ITEM_QUANTITY}
          onClick={() => setQuantity((q) => q + 1)}
        >
          +
        </StepButton>
      </div>

      {/* FR13, FR14: free customizations */}
      {item.customizations.length > 0 && (
        <fieldset>
          <legend className="text-sm font-medium text-ink">Customize</legend>
          {item.customizations.map((c) => (
            <label key={c.id} className="mt-2 flex items-center gap-3">
              <input
                type="checkbox"
                checked={customizationIds.includes(c.id)}
                onChange={() => setCustomizationIds((ids) => toggle(ids, c.id))}
                className="size-4 accent-leaf"
              />
              <span className="text-ink">{c.name}</span>
            </label>
          ))}
        </fieldset>
      )}

      {/* FR13, FR14: paid extras, with their price for this item */}
      {item.extras.length > 0 && (
        <fieldset>
          <legend className="text-sm font-medium text-ink">Extras</legend>
          {item.extras.map((e) => (
            <label key={e.id} className="mt-2 flex items-center gap-3">
              <input
                type="checkbox"
                checked={extraIds.includes(e.id)}
                onChange={() => setExtraIds((ids) => toggle(ids, e.id))}
                className="size-4 accent-leaf"
              />
              <span className="text-ink">{e.name}</span>
              <span className="ml-auto text-sm text-ink/70">+{credits(e.price)}</span>
            </label>
          ))}
        </fieldset>
      )}

      {/* FR14: the running total */}
      <p className="font-semibold text-ink">Total: {credits(total)}</p>

      {/* FR14: add to the cart; a message confirms it or explains the problem */}
      <button
        type="button"
        onClick={addToCart}
        disabled={adding}
        className="w-full rounded-lg bg-leaf py-3 font-semibold text-white outline-none hover:opacity-90 focus-visible:ring-4 focus-visible:ring-mango/50 disabled:opacity-60"
      >
        {adding ? "Adding…" : "Add to cart"}
      </button>
      {status && (
        <p role="status" className={status.ok ? "text-sm text-leaf" : "text-sm text-danger"}>
          {status.text}
        </p>
      )}
    </div>
  );
}

// A + or - button for the quantity
function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="size-9 rounded-lg border border-line bg-white text-lg text-ink outline-none hover:bg-white/70 focus-visible:ring-4 focus-visible:ring-mango/50 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
