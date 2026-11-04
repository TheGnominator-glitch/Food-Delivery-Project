// FR8-FR11: tests GET /api/restaurants and GET /api/categories against the seed data
// Needs the dev server running and the seed loaded. Run: npx tsx scripts/restaurants_test.ts
const BASE = "http://localhost:3000";

// Two test locations taken from the seed spots: the west and center clusters
const WEST = { lat: 4.809243, lng: -75.760298 }; 
const CENTER = { lat: 4.81513, lng: -75.693644 }; 

let passed = 0;
let failed = 0;

function check(id: string, description: string, ok: boolean, detail = "") {
  ok ? passed++ : failed++;
  const tag = ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`${tag}  ${id.padEnd(5)} ${description}${ok ? "" : `  [${detail}]`}`);
}

interface Restaurant {
  name: string;
  distanceKm: number | null;
}

// Calls the restaurant list with the given query parameters
async function list(params: Record<string, string | number>) {
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`${BASE}/api/restaurants?${query}`);
  const data = await res.json();
  return { status: res.status, restaurants: (data.restaurants ?? []) as Restaurant[] };
}

const names = (rs: Restaurant[]) => rs.map((r) => r.name).join(", ");

async function main() {
  // FR10: the six seed categories
  const catRes = await fetch(`${BASE}/api/categories`);
  const categories = ((await catRes.json()).categories ?? []) as { id: number; name: string }[];
  check("R-1", "categories endpoint lists the 6 seed categories", categories.length === 6, `${categories.length}`);
  const categoryId = (name: string) => categories.find((c) => c.name === name)?.id ?? -1;

  // FR9: only restaurants within 5 km, nearest first, with correct distances
  const west = await list(WEST);
  check("R-2", "from the west cluster: its 3 restaurants, nearest first",
    names(west.restaurants) === "Nori Sushi Bar, La Parrilla de la 30, Horno Matecaña", names(west.restaurants));
  check("R-3", "distances are right (0.6 km and 1.9 km)",
    west.restaurants[1]?.distanceKm === 0.6 && west.restaurants[2]?.distanceKm === 1.9,
    west.restaurants.map((r) => r.distanceKm).join(", "));

  const center = await list(CENTER);
  check("R-4", "from the center cluster: its 3 restaurants, nearest first",
    names(center.restaurants) === "Fonda El Otún, Doble Smash, El Pollo Cafetero", names(center.restaurants));

  // FR10: one category at a time; an empty result is not an error
  const westBurgers = await list({ ...WEST, category: categoryId("Hamburguesas") });
  check("R-5", "west + Hamburguesas: only the nearby burger place",
    names(westBurgers.restaurants) === "La Parrilla de la 30", names(westBurgers.restaurants));
  const westTipica = await list({ ...WEST, category: categoryId("Comida típica") });
  check("R-6", "west + Comida típica: empty list, not an error",
    westTipica.status === 200 && westTipica.restaurants.length === 0, `${westTipica.status} ${names(westTipica.restaurants)}`);

  // FR8: with the location denied, every restaurant alphabetically
  const all = await list({});
  check("R-7", "no location: all 8 restaurants, alphabetical, no distances",
    all.restaurants.length === 8 && all.restaurants[0]?.name === "Arepas Doña Rosa" &&
      all.restaurants.every((r) => r.distanceKm === null), names(all.restaurants));
  const allBurgers = await list({ category: categoryId("Hamburguesas") });
  check("R-8", "no location + Hamburguesas: both burger places in the city",
    allBurgers.restaurants.length === 2, names(allBurgers.restaurants));

  // FR11: search ignores case and treats % as plain text
  const horno = await list({ search: "HORNO" });
  check("R-9", "search ignores upper/lower case", names(horno.restaurants) === "Horno Matecaña", names(horno.restaurants));
  const wildcard = await list({ search: "%" });
  check("R-10", "search for % matches nothing (no wildcards)", wildcard.restaurants.length === 0, names(wildcard.restaurants));

  // Bad parameters get a 400
  const onlyLat = await list({ lat: 4.8 });
  check("R-11", "lat without lng -> 400", onlyLat.status === 400, `${onlyLat.status}`);
  const textLat = await list({ lat: "abc", lng: -75.7 });
  check("R-12", "lat that isn't a number -> 400", textLat.status === 400, `${textLat.status}`);
  const outOfRange = await list({ lat: 95, lng: -75.7 });
  check("R-13", "latitude out of range -> 400", outOfRange.status === 400, `${outOfRange.status}`);
  const badCategory = await list({ category: "abc" });
  check("R-14", "category that isn't an id -> 400", badCategory.status === 400, `${badCategory.status}`);

  console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
}

main().catch((err) => {
  console.error("Test run failed:", err);
  process.exit(1);
});