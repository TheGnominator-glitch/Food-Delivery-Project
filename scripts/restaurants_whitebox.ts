// FR8-FR11: white-box tests for restaurant discovery, one test per basis path of each graph:
// GET /api/restaurants (V(G) = 8), GET /api/categories (V(G) = 2), findRestaurants (V(G) = 6)
// and its row mapper (V(G) = 2). Graph: diagrams/cfg/restaurants_cfg.png
// Paths that need the database to fail are checked by scripts/outage_check.ts; paths made impossible
// by correlated decisions are documented as infeasible.
// Needs the dev server running and the seed loaded. Run: npx tsx scripts/restaurants_whitebox.ts

import "./env";
import { findRestaurants, listCategories } from "../lib/restaurantRepository";

const BASE = "http://localhost:3000";
const WEST = { lat: 4.809243, lng: -75.760298 }; // Nori Sushi Bar's spot

let passed = 0;
let failed = 0;
let noted = 0;

function check(id: string, path: string, ok: boolean, detail = "") {
  ok ? passed++ : failed++;
  const tag = ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`${tag}  ${id.padEnd(8)} ${path}${ok ? "" : `  [${detail}]`}`);
}

// A path that cannot be run from here, with the reason and where it is verified instead
function note(id: string, path: string, reason: string) {
  noted++;
  console.log(`\x1b[33mNOTE\x1b[0m  ${id.padEnd(8)} ${path}  [${reason}]`);
}

// Calls GET /api/restaurants with the given query parameters
async function list(params: Record<string, string | number>) {
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`${BASE}/api/restaurants?${query}`);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, error: data.error ?? "", restaurants: data.restaurants ?? [], radiusKm: data.radiusKm };
}

async function main() {
  const categories = await listCategories();
  const pizzaId = categories.find((c) => c.name === "Pizza")?.id;
  if (!pizzaId) throw new Error("Setup failed: the Pizza category is missing. Is the seed loaded?");

  console.log("\nGET /api/restaurants (V(G) = 8)");
  const base = await list({});
  check("CP-R-01", "all decisions F -> R5: no parameters -> every restaurant, radiusKm null",
    base.status === 200 && base.restaurants.length === 8 && base.radiusKm === null, `${base.status} ${base.radiusKm}`);
  const onlyLat = await list({ lat: 4.8 });
  check("CP-R-02", "D1(T) D2(T) -> R1: lat without lng -> 400",
    onlyLat.status === 400 && onlyLat.error === "lat and lng must be valid coordinates, sent together", `${onlyLat.status}`);
  const located = await list(WEST);
  check("CP-R-03", "D1(T) D2(F) ... D7(T) -> R5: valid location -> radiusKm 5",
    located.status === 200 && located.radiusKm === 5, `${located.status} ${located.radiusKm}`);
  const badCategory = await list({ category: "abc" });
  check("CP-R-04", "D3(T) D4(T) -> R2: category that is not an id -> 400",
    badCategory.status === 400 && badCategory.error === "category must be a category id", `${badCategory.status}`);
  const goodCategory = await list({ category: pizzaId });
  check("CP-R-05", "D3(T) D4(F) ... -> R5: valid category -> 200",
    goodCategory.status === 200 && goodCategory.restaurants.length === 1, `${goodCategory.status}`);
  const longSearch = await list({ search: "a".repeat(101) });
  check("CP-R-06", "D5(T) -> R3: search of 101 characters -> 400",
    longSearch.status === 400 && longSearch.error === "search is too long", `${longSearch.status}`);
  note("CP-R-07", "D6(T) -> R4", "needs the database down: verified by outage_check.ts");
  note("CP-R-08", "D1(F) D7(T)", "infeasible: D7 only repeats D1/D2, so radiusKm is never 5 without a location");

  console.log("\nGET /api/categories (V(G) = 2)");
  const catRes = await fetch(`${BASE}/api/categories`);
  const cats = (await catRes.json()).categories ?? [];
  check("CP-C-01", "D1(F) -> R2: 200 and the 6 categories", catRes.status === 200 && cats.length === 6, `${catRes.status} ${cats.length}`);
  note("CP-C-02", "D1(T) -> R1", "needs the database down: verified by outage_check.ts");

  console.log("\nfindRestaurants(filters) (V(G) = 6)");
  const all = await findRestaurants({ location: null, categoryId: null, search: null });
  const names = all.map((r) => r.name);
  check("CP-F-01", "D1-D5(F): no filters -> all 8, sorted by name",
    all.length === 8 && names.join() === [...names].sort((a, b) => a.localeCompare(b)).join(), names.join(", "));
  const near = await findRestaurants({ location: { ...WEST, radiusKm: 5 }, categoryId: null, search: null });
  const distances = near.map((r) => r.distanceKm ?? -1);
  check("CP-F-02", "D1(T) D4(T) D5(T): location -> within 5 km, nearest first",
    near.length === 3 && distances.every((d, i) => d >= 0 && d <= 5 && (i === 0 || d >= distances[i - 1])),
    distances.join(", "));
  const pizza = await findRestaurants({ location: null, categoryId: pizzaId, search: null });
  check("CP-F-03", "D2(T) D4(T): category -> only that category",
    pizza.length === 1 && pizza[0].category === "Pizza", pizza.map((r) => r.name).join(", "));
  const search = await findRestaurants({ location: null, categoryId: null, search: "sushi" });
  check("CP-F-04", "D3(T) D4(T): search -> only matching names",
    search.length === 1 && search[0].name === "Nori Sushi Bar", search.map((r) => r.name).join(", "));
  note("CP-F-05", "D1-D3(F) D4(T)", "infeasible: WHERE is only built when D1-D3 added a condition");
  note("CP-F-06", "D1(F) D5(T)", "infeasible: D5 repeats D1, so distance sorting needs a location");

  console.log("\nrow mapper (V(G) = 2)");
  check("CP-M-01", "D1(T) -> R1: no distance -> null", all.every((r) => r.distanceKm === null));
  check("CP-M-02", "D1(F) -> R2: a distance -> rounded to 1 decimal",
    near.every((r) => r.distanceKm !== null && Number.isInteger(Math.round(r.distanceKm * 10 * 1e6) / 1e6)),
    distances.join(", "));

  console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total (${noted} verified separately)`);
}

main().catch((err) => {
  console.error("Test run failed:", err);
  process.exit(1);
});
