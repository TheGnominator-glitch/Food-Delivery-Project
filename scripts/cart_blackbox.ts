// FR14-FR17: black-box tests for the cart API, using the five techniques.
// About half of roughly 40 candidate cases.
// Needs the dev server running and the seed loaded. Run: npx tsx scripts/cart_blackbox.ts

import "./env";
import oracledb from "oracledb";

const BASE = "http://localhost:3000";

let passed = 0;
let failed = 0;

const ipPrefix = `10.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
let ipCounter = 0;
const nextIp = () => `${ipPrefix}.${++ipCounter}`;
const rand = () => Math.random().toString(36).slice(2, 10).toUpperCase();

function check(id: string, description: string, ok: boolean, detail = "") {
  ok ? passed++ : failed++;
  const tag = ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`${tag}  ${id.padEnd(17)} ${description}${ok ? "" : `  [${detail}]`}`);
}

interface Line {
  id: number;
  menuItemId: number;
  restaurantName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  customizations: { name: string }[];
  extras: { name: string }[];
}
interface Cart {
  items: Line[];
  subtotal: number;
  itemCount: number;
}

// Sends a request, optionally with a session cookie
async function call(method: string, path: string, opts: { body?: unknown; token?: string } = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": nextIp() };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers["Cookie"] = `foodie_session=${opts.token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith("foodie_session=")) ?? "";
  return { status: res.status, data, cookie };
}

const tokenOf = (cookie: string) => cookie.split(";")[0].split("=")[1] ?? "";

async function main() {
  const db = await oracledb.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING,
  });

  // Deletes test carts, sessions and users (IDs starting with TST), in foreign-key order
  const cleanup = async () => {
    await db.execute("DELETE FROM cart_item_customization WHERE cart_item_id IN (SELECT id FROM cart_item WHERE user_id LIKE 'TST%')");
    await db.execute("DELETE FROM cart_item_extra WHERE cart_item_id IN (SELECT id FROM cart_item WHERE user_id LIKE 'TST%')");
    await db.execute("DELETE FROM cart_item WHERE user_id LIKE 'TST%'");
    await db.execute("DELETE FROM sessions WHERE user_id LIKE 'TST%'");
    await db.execute("DELETE FROM users WHERE id LIKE 'TST%'");
    await db.commit();
  };
  await cleanup();

  async function register() {
    const account = {
      id: "TST" + rand(),
      name: "Cart Blackbox",
      email: `tst${rand().toLowerCase()}@blackbox.test`,
      password: "Passw0rd!x",
      phone: "+573001234567",
      address: "Calle 14 #8-32, Pereira",
      emailOptIn: false,
    };
    const res = await call("POST", "/api/signup", { body: account });
    const token = tokenOf(res.cookie);
    if (res.status !== 201 || !token) throw new Error(`Setup failed: signup returned ${res.status}`);
    return { ...account, token };
  }

  // A seed restaurant's menu, through the public API
  async function menuOf(name: string) {
    const list = await call("GET", `/api/restaurants?search=${encodeURIComponent(name)}`);
    const found = (list.data.restaurants as { id: number; name: string }[]).find((r) => r.name === name);
    if (!found) throw new Error(`Setup failed: "${name}" not found. Is the seed loaded?`);
    const menu = await call("GET", `/api/restaurants/${found.id}`);
    return (menu.data.restaurant as { items: { id: number; name: string; customizations: { id: number; name: string }[]; extras: { id: number; name: string }[] }[] }).items;
  }

  try {
    const parrilla = await menuOf("La Parrilla de la 30");
    const horno = await menuOf("Horno Matecaña");
    const item = (items: typeof parrilla, name: string) => items.find((i) => i.name === name)!;
    const clasica = item(parrilla, "Hamburguesa clásica");
    const doble = item(parrilla, "Hamburguesa doble");
    const polloBurger = item(parrilla, "Hamburguesa de pollo");
    const limonada = item(parrilla, "Limonada de coco");
    const margarita = item(horno, "Pizza margarita mediana");
    const sinCebolla = clasica.customizations.find((x) => x.name === "Sin cebolla")!.id;
    const tocineta = clasica.extras.find((x) => x.name === "Tocineta")!.id;
    const masaDelgada = margarita.customizations[0].id;
    const bordeQueso = margarita.extras.find((x) => x.name === "Borde de queso")!.id;

    const a = await register();
    const b = await register();
    const add = (body: unknown, token: string = a.token) => call("POST", "/api/cart", { body, token });
    const cartOf = async (token: string) => (await call("GET", "/api/cart", { token })).data as unknown as Cart;

    // ---- 1. Equivalence partitioning ----
    console.log("\n1. Equivalence partitioning (FR14-FR16)");
    const first = await add({ menuItemId: clasica.id, quantity: 2, customizationIds: [sinCebolla], extraIds: [tocineta] });
    const lineId = Number(first.data.cartItemId);
    const afterFirst = (await cartOf(a.token)).items.find((l) => l.id === lineId);
    check("EP-CA-1 / DT-CA-1", "an item with valid choices -> in the cart, with its choices and price (22 + 4)",
      first.status === 201 && afterFirst?.unitPrice === 26 && afterFirst?.lineTotal === 52 &&
        afterFirst.customizations[0]?.name === "Sin cebolla" && afterFirst.extras[0]?.name === "Tocineta",
      `${first.status} ${JSON.stringify(afterFirst)}`);
    const anonymous = await call("POST", "/api/cart", { body: { menuItemId: clasica.id, quantity: 1 } });
    check("EP-CA-2", "adding without logging in -> 401", anonymous.status === 401, `${anonymous.status}`);
    const wrongCustom = await add({ menuItemId: clasica.id, quantity: 1, customizationIds: [masaDelgada] });
    check("EP-CA-3", "a customization from another item -> 400", wrongCustom.status === 400, `${wrongCustom.status}`);
    const wrongExtra = await add({ menuItemId: clasica.id, quantity: 1, extraIds: [bordeQueso] });
    check("EP-CA-4", "an extra from another item -> 400", wrongExtra.status === 400, `${wrongExtra.status}`);
    const missing = await add({ menuItemId: 999999, quantity: 1 });
    check("EP-CA-5", "an item that does not exist -> 404", missing.status === 404, `${missing.status}`);
    await add({ menuItemId: margarita.id, quantity: 1 });
    const restaurants = [...new Set((await cartOf(a.token)).items.map((l) => l.restaurantName))];
    check("EP-CA-6", "items from two restaurants -> both in the cart, grouped by restaurant (FR15)",
      restaurants.join(" | ") === "Horno Matecaña | La Parrilla de la 30", restaurants.join(" | "));
    const otherPatch = await call("PATCH", `/api/cart/${lineId}`, { body: { quantity: 9 }, token: b.token });
    const otherDelete = await call("DELETE", `/api/cart/${lineId}`, { token: b.token });
    const untouched = (await cartOf(a.token)).items.find((l) => l.id === lineId);
    check("EP-CA-7", "another user changing or removing my line -> 404, and it is untouched",
      otherPatch.status === 404 && otherDelete.status === 404 && untouched?.quantity === 2,
      `${otherPatch.status} / ${otherDelete.status} / ${untouched?.quantity}`);

    // ---- 2. Boundary value analysis: quantity limits (FR14) ----
    console.log("\n2. Boundary value analysis (FR14)");
    const q0 = await add({ menuItemId: limonada.id, quantity: 0 });
    check("BV-CA-1", "quantity 0 -> 400", q0.status === 400, `${q0.status}`);
    const q1 = await add({ menuItemId: limonada.id, quantity: 1 });
    check("BV-CA-2", "quantity 1 -> added", q1.status === 201, `${q1.status}`);
    const q20 = await add({ menuItemId: doble.id, quantity: 20 });
    check("BV-CA-3", "quantity 20 -> added", q20.status === 201, `${q20.status}`);
    const q21 = await add({ menuItemId: doble.id, quantity: 21 });
    check("BV-CA-4", "quantity 21 -> 400", q21.status === 400, `${q21.status}`);
    await add({ menuItemId: polloBurger.id, quantity: 19 });
    const to20 = await add({ menuItemId: polloBurger.id, quantity: 1 });
    check("BV-CA-5", "merging up to exactly 20 -> accepted", to20.status === 201 && to20.data.quantity === 20,
      `${to20.status} ${to20.data.quantity}`);
    const to21 = await add({ menuItemId: polloBurger.id, quantity: 1 });
    const polloLine = (await cartOf(a.token)).items.find((l) => l.menuItemId === polloBurger.id);
    check("BV-CA-6 / DT-CA-4", "merging to 21 -> 409, and the line stays at 20",
      to21.status === 409 && polloLine?.quantity === 20, `${to21.status} ${polloLine?.quantity}`);

    // ---- 3. Decision table: when does an add merge? ----
    // Conditions: item already in the cart / same choices / merged quantity at most 20
    //   DT-CA-1: not in the cart                 -> new line      (EP-CA-1)
    //   DT-CA-2: in the cart, different choices  -> new line
    //   DT-CA-3: same choices, at most 20        -> merged
    //   DT-CA-4: same choices, over 20           -> 409, nothing changes (BV-CA-6)
    console.log("\n3. Decision table (FR14)");
    await add({ menuItemId: clasica.id, quantity: 1 });
    const clasicaLines = (await cartOf(a.token)).items.filter((l) => l.menuItemId === clasica.id);
    check("DT-CA-2", "same item, different choices -> a separate line", clasicaLines.length === 2, `${clasicaLines.length} lines`);
    const merged = await add({ menuItemId: clasica.id, quantity: 1, customizationIds: [sinCebolla], extraIds: [tocineta] });
    check("DT-CA-3", "same item, same choices -> merged into the existing line",
      merged.status === 201 && merged.data.merged === true && Number(merged.data.cartItemId) === lineId &&
        merged.data.quantity === 3, JSON.stringify(merged.data));

    // ---- 4. State transition (FR16, FR17) ----
    console.log("\n4. State transition (FR16, FR17)");
    await call("PATCH", `/api/cart/${lineId}`, { body: { quantity: 5 }, token: a.token });
    const changed = await cartOf(a.token);
    const changedLine = changed.items.find((l) => l.id === lineId);
    check("ST-CA-1", "changing a quantity updates the line and the subtotal",
      changedLine?.lineTotal === 130 && changed.subtotal === changed.items.reduce((s, l) => s + l.lineTotal, 0),
      `${changedLine?.lineTotal}, subtotal ${changed.subtotal}`);

    const bAdd = await add({ menuItemId: limonada.id, quantity: 1 }, b.token);
    await call("DELETE", `/api/cart/${bAdd.data.cartItemId}`, { token: b.token });
    const bCart = await cartOf(b.token);
    check("ST-CA-2", "removing the last line -> an empty cart with subtotal 0",
      bCart.items.length === 0 && bCart.subtotal === 0 && bCart.itemCount === 0, JSON.stringify(bCart));

    const before = (await cartOf(a.token)).itemCount;
    await call("POST", "/api/logout", { token: a.token });
    const relogin = await call("POST", "/api/login", { body: { email: a.email, password: a.password } });
    const after = await cartOf(tokenOf(relogin.cookie));
    check("ST-CA-3", "logging out and back in -> the same cart (FR17)", after.itemCount === before, `${before} -> ${after.itemCount}`);
    const token = tokenOf(relogin.cookie);

    // ---- 5. Error guessing ----
    console.log("\n5. Error guessing (FR14, FR16)");
    const repeated = await add({ menuItemId: clasica.id, quantity: 1, customizationIds: [sinCebolla, sinCebolla] }, token);
    check("EG-CA-1", "the same option twice -> 400", repeated.status === 400, `${repeated.status}`);
    await add({ menuItemId: limonada.id, quantity: 1, price: 1, unitPrice: 1 }, token);
    const limonadaLine = (await cartOf(token)).items.find((l) => l.menuItemId === limonada.id);
    check("EG-CA-2", "a price sent by the browser is ignored -> priced from the menu (9)",
      limonadaLine?.unitPrice === 9, `${limonadaLine?.unitPrice}`);
  } finally {
    await cleanup();
    await db.close();
  }

  console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
}

main().catch((err) => {
  console.error("Test run failed:", err);
  process.exit(1);
});
