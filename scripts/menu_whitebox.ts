// FR12, FR13: white-box tests for the menu, one test per basis path of each graph:
// GET /api/restaurants/[id] (V(G) = 4) and findRestaurantMenu (V(G) = 6). Graph: diagrams/cfg/menu_cfg.png
// Paths that need the database to fail are checked by scripts/outage_check.ts.
// Needs the dev server running and the seed loaded. Run: npx tsx scripts/menu_whitebox.ts

import "./env";
import oracledb from "oracledb";
import { findRestaurantMenu, listCategories } from "../lib/restaurantRepository";

const BASE = "http://localhost:3000";

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

// Finds a seed restaurant's id through the list endpoint
async function restaurantId(name: string): Promise<number> {
  const res = await fetch(`${BASE}/api/restaurants?search=${encodeURIComponent(name)}`);
  const match = ((await res.json()).restaurants ?? []).find((r: { name: string }) => r.name === name);
  if (!match) throw new Error(`Setup failed: "${name}" not found. Is the seed loaded?`);
  return match.id;
}

async function menuRoute(id: string | number) {
  const res = await fetch(`${BASE}/api/restaurants/${id}`);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, error: data.error ?? "", restaurant: data.restaurant };
}

async function main() {
  const db = await oracledb.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING,
  });

  // Removes the temporary test restaurant (name starting with TST)
  const cleanup = async () => {
    await db.execute("DELETE FROM restaurant WHERE name LIKE 'TST%'");
    await db.commit();
  };
  await cleanup();

  try {
    const hornoId = await restaurantId("Horno Matecaña");
    const parrillaId = await restaurantId("La Parrilla de la 30");

    // Setup: a restaurant with no items, at 0, 0 so it never shows up in a nearby search
    const pizzaId = (await listCategories()).find((c) => c.name === "Pizza")?.id;
    const inserted = await db.execute(
      `INSERT INTO restaurant (name, category_id, latitude, longitude)
       VALUES ('TST Empty Kitchen', :cat, 0, 0) RETURNING id INTO :id`,
      { cat: pizzaId ?? 0, id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } }
    );
    await db.commit();
    const emptyId = (inserted.outBinds as { id: number[] }).id[0];

    console.log("\nGET /api/restaurants/[id] (V(G) = 4)");
    const invalid = await menuRoute("abc");
    check("CP-MR-1", "D1(T) -> R1: id that is not a number -> 400",
      invalid.status === 400 && invalid.error === "Restaurant id must be a positive whole number", `${invalid.status}`);
    note("CP-MR-2", "D1(F) D2(T) -> R2", "needs the database down: verified by outage_check.ts");
    const missing = await menuRoute(999999);
    check("CP-MR-3", "D2(F) D3(T) -> R3: restaurant that does not exist -> 404",
      missing.status === 404 && missing.error === "Restaurant not found", `${missing.status}`);
    const found = await menuRoute(hornoId);
    check("CP-MR-4", "D1-D3(F) -> R4: existing restaurant -> 200 and its menu",
      found.status === 200 && found.restaurant?.name === "Horno Matecaña", `${found.status}`);

    console.log("\nfindRestaurantMenu (V(G) = 6)");
    check("CP-FM-1", "D1(T) -> R1: unknown restaurant -> null", (await findRestaurantMenu(999999)) === null);

    const empty = await findRestaurantMenu(emptyId);
    check("CP-FM-2", "D1(F) D2(F) D4(F) D5(F) -> R2: no items -> an empty menu",
      empty !== null && empty.name === "TST Empty Kitchen" && empty.items.length === 0, JSON.stringify(empty));

    const horno = await findRestaurantMenu(hornoId);
    const item = (name: string) => horno?.items.find((i) => i.name === name);
    const margarita = item("Pizza margarita mediana");
    const hawaiana = item("Pizza hawaiana mediana");
    const pan = item("Pan de ajo");

    check("CP-FM-3", "D2(T) D3(F): item with a description -> its text",
      margarita?.description === "Tomate, mozzarella y albahaca", `${margarita?.description}`);
    check("CP-FM-4", "D2(T) D3(T): item without a description -> null", pan?.description === null, `${pan?.description}`);

    const names = (list?: { name: string }[]) => (list ?? []).map((o) => o.name).join(", ");
    check("CP-FM-5", "D4(T): each customization attached to its own item",
      names(margarita?.customizations) === "Masa delgada" &&
        names(hawaiana?.customizations) === "Masa delgada, Sin piña" &&
        pan?.customizations.length === 0,
      `${names(margarita?.customizations)} | ${names(hawaiana?.customizations)} | ${pan?.customizations.length}`);

    const parrilla = await findRestaurantMenu(parrillaId);
    const pizzaCheese = margarita?.extras.find((e) => e.name === "Queso extra")?.price;
    const burgerCheese = parrilla?.items.find((i) => i.name === "Hamburguesa clásica")
      ?.extras.find((e) => e.name === "Queso extra")?.price;
    check("CP-FM-6", "D5(T): each extra attached to its item, with that item's price",
      pizzaCheese === 5 && burgerCheese === 3 && pan?.extras.length === 0,
      `pizza ${pizzaCheese}, burger ${burgerCheese}`);
  } finally {
    await cleanup();
    await db.close();
  }

  console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total (${noted} verified separately)`);
}

main().catch((err) => {
  console.error("Test run failed:", err);
  process.exit(1);
});
