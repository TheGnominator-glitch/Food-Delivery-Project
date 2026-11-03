"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRequireUser } from "@/hooks/useRequireUser";

interface Restaurant {
  id: number;
  name: string;
  categoryId: number;
  category: string;
  distanceKm: number | null;
}

interface Category {
  id: number;
  name: string;
}

type LocationState =
  | { status: "asking" }
  | { status: "granted"; lat: number; lng: number }
  | { status: "denied" };

export default function RestaurantsPage() {
  const user = useRequireUser();
  const [location, setLocation] = useState<LocationState>({ status: "asking" });
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [restaurants, setRestaurants] = useState<Restaurant[] | null>(null);
  const [radiusKm, setRadiusKm] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setLocation({ status: "denied" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation({ status: "granted", lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setLocation({ status: "denied" }),
      { timeout: 10000 }
    );
  }, []);

  useEffect(() => {
    fetch("/api/categories")
      .then((res) => res.json())
      .then((data) => setCategories(data.categories ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (location.status === "asking") return;

    const params = new URLSearchParams();
    if (location.status === "granted") {
      params.set("lat", String(location.lat));
      params.set("lng", String(location.lng));
    }
    if (categoryId !== null) params.set("category", String(categoryId));
    if (search.trim()) params.set("search", search.trim());

    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/restaurants?${params}`, { signal: controller.signal })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          setRestaurants(data.restaurants);
          setRadiusKm(data.radiusKm);
          setError("");
        })
        .catch((err) => {
          if (err.name !== "AbortError") setError("Could not load restaurants. Try again.");
        });
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [location, categoryId, search]);

  if (!user) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <p className="text-ink/70">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh px-6 py-12 sm:py-20">
      <div className="mx-auto max-w-md">
        <Link href="/home" className="text-sm text-ink/70 underline">
          Back to home
        </Link>
        <h1 className="mt-6 text-3xl font-bold text-ink">Restaurants</h1>

        {location.status === "granted" && radiusKm !== null && (
          <p className="mt-3 text-ink/70">Showing restaurants within {radiusKm} km of you.</p>
        )}
        {location.status === "denied" && (
          <p className="mt-3 text-ink/70">
            Showing all restaurants. Allow location access in your browser to see only the ones near you.
          </p>
        )}

        <label className="mt-6 block">
          <span className="block text-sm font-medium text-ink">Search by name</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={100}
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink outline-none focus-visible:border-leaf focus-visible:ring-4 focus-visible:ring-mango/50"
          />
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          <FilterButton active={categoryId === null} onClick={() => setCategoryId(null)}>
            All
          </FilterButton>
          {categories.map((c) => (
            <FilterButton
              key={c.id}
              active={categoryId === c.id}
              onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
            >
              {c.name}
            </FilterButton>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-6 text-danger">
            {error}
          </p>
        )}

        {location.status === "asking" || restaurants === null ? (
          <p className="mt-6 text-ink/70">Loading…</p>
        ) : restaurants.length === 0 ? (
          <p className="mt-6 text-ink/70">No restaurants match. Try another category or clear the search.</p>
        ) : (
          <ul className="mt-6 divide-y divide-mist border-y border-mist">
            {restaurants.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/restaurants/${r.id}`}
                  className="block py-4 outline-none hover:bg-mist focus-visible:ring-4 focus-visible:ring-mango/50"
                >
                  <span className="block font-semibold text-ink">{r.name}</span>
                  <span className="block text-sm text-ink/70">
                    {r.category}
                    {r.distanceKm !== null && `, ${r.distanceKm} km away`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm outline-none focus-visible:ring-4 focus-visible:ring-mango/50 ${
        active ? "border-leaf bg-leaf text-white" : "border-line text-ink hover:bg-mist"
      }`}
    >
      {children}
    </button>
  );
}