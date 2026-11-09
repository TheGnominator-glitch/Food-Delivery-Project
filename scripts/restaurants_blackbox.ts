// FR8-FR11: black-box tests for restaurant discovery (GET /api/restaurants), using the five techniques.
// About half of roughly 28 candidate cases. State transitions of the location request happen in the
// browser, so they are covered by the manual checklist in the module documentation.
// Needs the dev server running and the seed loaded. Run: npx tsx scripts/restaurants_blackbox.ts

// Makes this file a module, so its names do not clash with the other scripts
export {};

const BASE = "http://localhost:3000";

// Test locations taken from the seed spots
const WEST = { lat: 4.809243, lng: -75.760298 }; // Nori Sushi Bar
// Due north of Cafe La Ceiba (4.855729, -75.637267), the most isolated restaurant
const CEIBA_AT_4_99_KM = { lat: 4.900605, lng: -75.637267 };
const CEIBA_AT_5_01_KM = { lat: 4.900785, lng: -75.637267 };

let passed = 0;
let failed = 0;

function check(id: string, description: string, ok: boolean, detail = "") {
  ok ? passed++ : failed++;
  const tag = ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`${tag}  ${id.padEnd(15)} ${description}${ok ? "" : `  [${detail}]`}`);
}

interface Restaurant {
  name: string;
  distanceKm: number | null;
}

async function list(params: Record<string, string | number>) {
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`${BASE}/api/restaurants?${query}`);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, restaurants: (data.restaurants ?? []) as Restaurant[] };
}

const names = (rs: Restaurant[]) => rs.map((r) => r.name).join(", ");

async function main() {
  const catRes = await fetch(`${BASE}/api/categories`);
  const categories = ((await catRes.json()).categories ?? []) as { id: number; name: string }[];
  const categoryId = (name: string) => categories.find((c) => c.name === name)?.id ?? -1;

  // ---- 1. Equivalence partitioning ----
  console.log("\n1. Equivalence partitioning (FR8-FR11)");
  const west = await list(WEST);
  check("EP-R-1 / DT-R-3", "location given -> only nearby restaurants, nearest first",
    names(west.restaurants) === "Nori Sushi Bar, La Parrilla de la 30, Horno Matecaña", names(west.restaurants));
  const all = await list({});
  check("EP-R-2 / DT-R-1", "no location (denied) -> all 8, alphabetical, no distances",
    all.restaurants.length === 8 && all.restaurants[0]?.name === "Arepas Doña Rosa" &&
      all.restaurants.every((r) => r.distanceKm === null), names(all.restaurants));
  const pizza = await list({ category: categoryId("Pizza") });
  check("EP-R-3 / DT-R-2", "a category, no location -> that category across the city",
    names(pizza.restaurants) === "Horno Matecaña", names(pizza.restaurants));
  const pollo = await list({ search: "pollo" });
  check("EP-R-4", "search by part of a name, any case", names(pollo.restaurants) === "El Pollo Cafetero", names(pollo.restaurants));
  const badCategory = await list({ category: "abc" });
  check("EP-R-5", "a category that is not an id -> 400", badCategory.status === 400, `${badCategory.status}`);
  const onlyLat = await list({ lat: WEST.lat });
  check("EP-R-6", "latitude without longitude -> 400", onlyLat.status === 400, `${onlyLat.status}`);
  const westTipica = await list({ ...WEST, category: categoryId("Comida típica") });
  check("EP-R-7", "a category with no nearby restaurants -> empty list, not an error",
    westTipica.status === 200 && westTipica.restaurants.length === 0, `${westTipica.status} ${names(westTipica.restaurants)}`);

  // ---- 2. Boundary value analysis ----
  console.log("\n2. Boundary value analysis (FR9, FR11)");
  const inside = await list(CEIBA_AT_4_99_KM);
  check("BV-R-1", "restaurant 4.99 km away -> listed",
    inside.restaurants.some((r) => r.name === "Café La Ceiba"), names(inside.restaurants));
  const outside = await list(CEIBA_AT_5_01_KM);
  check("BV-R-2", "restaurant 5.01 km away -> not listed",
    !outside.restaurants.some((r) => r.name === "Café La Ceiba"), names(outside.restaurants));
  const search100 = await list({ search: "a".repeat(100) });
  check("BV-R-3", "search of 100 characters -> accepted", search100.status === 200, `${search100.status}`);
  const search101 = await list({ search: "a".repeat(101) });
  check("BV-R-4", "search of 101 characters -> 400", search101.status === 400, `${search101.status}`);

  // ---- 3. Decision table: location x category ----
  //   DT-R-1: no location, no category  -> all restaurants          (EP-R-2)
  //   DT-R-2: no location, category     -> that category, citywide  (EP-R-3)
  //   DT-R-3: location, no category     -> nearby restaurants       (EP-R-1)
  //   DT-R-4: location and category     -> nearby in that category
  console.log("\n3. Decision table (FR9, FR10)");
  const westBurgers = await list({ ...WEST, category: categoryId("Hamburguesas") });
  check("DT-R-4", "location + Hamburguesas -> only the nearby burger place",
    names(westBurgers.restaurants) === "La Parrilla de la 30", names(westBurgers.restaurants));

  // ---- 4. State transition: the location request lives in the browser (manual checklist) ----

  // ---- 5. Error guessing ----
  console.log("\n5. Error guessing (FR11)");
  const wildcard = await list({ search: "%" });
  check("EG-R-1", "search for % matches nothing (no wildcards)", wildcard.status === 200 && wildcard.restaurants.length === 0,
    names(wildcard.restaurants));
  const injection = await list({ search: "' OR '1'='1" });
  check("EG-R-2", "SQL text as a search -> no matches, no error",
    injection.status === 200 && injection.restaurants.length === 0, `${injection.status} ${names(injection.restaurants)}`);

  console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
}

main().catch((err) => {
  console.error("Test run failed:", err);
  process.exit(1);
});
