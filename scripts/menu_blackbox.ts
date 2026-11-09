// FR12, FR13: black-box tests for the menu (GET /api/restaurants/[id]), using the five techniques.
// About half of roughly 20 candidate cases. Choosing quantity and options (FR14) happens in the browser,
// so it is covered by the manual checklist in the module documentation.
// Needs the dev server running and the seed loaded. Run: npx tsx scripts/menu_blackbox.ts

// Makes this file a module, so its names do not clash with the other scripts
export {};

const BASE = "http://localhost:3000";

let passed = 0;
let failed = 0;

function check(id: string, description: string, ok: boolean, detail = "") {
  ok ? passed++ : failed++;
  const tag = ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`${tag}  ${id.padEnd(17)} ${description}${ok ? "" : `  [${detail}]`}`);
}

interface Item {
  name: string;
  price: number;
  customizations: { name: string }[];
  extras: { name: string; price: number }[];
}

async function restaurantId(name: string): Promise<number> {
  const res = await fetch(`${BASE}/api/restaurants?search=${encodeURIComponent(name)}`);
  const match = ((await res.json()).restaurants ?? []).find((r: { name: string }) => r.name === name);
  if (!match) throw new Error(`Setup failed: "${name}" not found. Is the seed loaded?`);
  return match.id;
}

async function menu(id: string | number) {
  const res = await fetch(`${BASE}/api/restaurants/${id}`);
  const data = await res.json().catch(() => ({}));
  return {
    status: res.status,
    restaurant: data.restaurant as { name: string; category: string; items: Item[] } | undefined,
  };
}

async function main() {
  const horno = await menu(await restaurantId("Horno Matecaña"));
  const items = horno.restaurant?.items ?? [];
  const item = (name: string) => items.find((i) => i.name === name);

  // ---- 1. Equivalence partitioning (FR12, FR13), also the decision table rules ----
  console.log("\n1. Equivalence partitioning (FR12, FR13)");
  check("EP-MN-1 / DT-MN-3", "existing restaurant -> its name, category and items in menu order",
    horno.status === 200 && horno.restaurant?.category === "Pizza" && items.length === 4 &&
      items[0]?.name === "Pizza margarita mediana" && items[3]?.name === "Pan de ajo",
    `${horno.status} ${items.map((i) => i.name).join(", ")}`);
  const unknown = await menu(999999);
  check("EP-MN-2 / DT-MN-2", "restaurant that does not exist -> 404", unknown.status === 404, `${unknown.status}`);
  const notNumber = await menu("abc");
  check("EP-MN-3 / DT-MN-1", "id that is not a number -> 400", notNumber.status === 400, `${notNumber.status}`);

  const margarita = item("Pizza margarita mediana");
  const extras = margarita?.extras.map((e) => `${e.name} ${e.price}`).join(", ");
  check("EP-MN-4", "item with options -> its customizations, and its extras with prices",
    margarita?.price === 32 && margarita.customizations.map((c) => c.name).join() === "Masa delgada" &&
      extras === "Borde de queso 7, Champiñones 4, Queso extra 5", `${extras}`);
  const pan = item("Pan de ajo");
  check("EP-MN-5", "item with no options -> empty lists",
    pan?.customizations.length === 0 && pan?.extras.length === 0);

  const parrilla = await menu(await restaurantId("La Parrilla de la 30"));
  const burgerCheese = parrilla.restaurant?.items.find((i) => i.name === "Hamburguesa clásica")
    ?.extras.find((e) => e.name === "Queso extra")?.price;
  check("EP-MN-6", "the same extra on two items -> each item's own price (5 on pizza, 3 on burger)",
    margarita?.extras.find((e) => e.name === "Queso extra")?.price === 5 && burgerCheese === 3,
    `burger cheese ${burgerCheese}`);

  // ---- 2. Boundary value analysis: the smallest valid id ----
  console.log("\n2. Boundary value analysis (FR12)");
  const zero = await menu(0);
  check("BV-MN-1", "id 0 -> 400", zero.status === 400, `${zero.status}`);
  const one = await menu(1);
  check("BV-MN-2", "id 1 -> accepted (200 or 404, never 400)", one.status === 200 || one.status === 404, `${one.status}`);

  // ---- 3. Decision table: conditions id valid / restaurant exists ----
  //   DT-MN-1: id invalid        -> 400   (EP-MN-3)
  //   DT-MN-2: valid, not found  -> 404   (EP-MN-2)
  //   DT-MN-3: valid, found      -> 200   (EP-MN-1)

  // ---- 4. State transition: choosing options happens in the browser (manual checklist) ----

  // ---- 5. Error guessing ----
  console.log("\n5. Error guessing (FR12)");
  const decimal = await menu("1.5");
  check("EG-MN-1", "id with decimals -> 400", decimal.status === 400, `${decimal.status}`);
  const injection = await menu(encodeURIComponent("1 OR 1=1"));
  check("EG-MN-2", "SQL text as an id -> 400", injection.status === 400, `${injection.status}`);

  console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
}

main().catch((err) => {
  console.error("Test run failed:", err);
  process.exit(1);
});
