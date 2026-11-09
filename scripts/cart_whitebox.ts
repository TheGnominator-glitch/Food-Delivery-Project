// FR14-FR17: white-box tests for the cart, one test per basis path of each graph:
// POST /api/cart (V(G) = 15), GET /api/cart (3), PATCH /api/cart/[id] (8), DELETE /api/cart/[id] (5),
// and the repository: findMenuItemOptions (2), addCartItem (8), sameIds (2), getCart (5), removeCartItem (2).
// Graphs: diagrams/cfg/cart_post_cfg.png, cart_routes_cfg.png, cart_repository_cfg.png
// Paths that need the database to fail are checked by scripts/outage_check.ts.
// Needs the dev server running and the seed loaded. Run: npx tsx scripts/cart_whitebox.ts

import "./env";
import oracledb from "oracledb";
import { findRestaurantMenu, findRestaurants, type MenuItem } from "../lib/restaurantRepository";
import { addCartItem, findMenuItemOptions, getCart, removeCartItem, type AddResult } from "../lib/cartRepository";

const BASE = "http://localhost:3000";

let passed = 0;
let failed = 0;
let noted = 0;

const ipPrefix = `10.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
let ipCounter = 0;
const nextIp = () => `${ipPrefix}.${++ipCounter}`;
const rand = () => Math.random().toString(36).slice(2, 10).toUpperCase();

function check(id: string, path: string, ok: boolean, detail = "") {
  ok ? passed++ : failed++;
  const tag = ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`${tag}  ${id.padEnd(9)} ${path}${ok ? "" : `  [${detail}]`}`);
}

// A path that cannot be run from here, with the reason and where it is verified instead
function note(id: string, path: string, reason: string) {
  noted++;
  console.log(`\x1b[33mNOTE\x1b[0m  ${id.padEnd(9)} ${path}  [${reason}]`);
}

interface Reply {
  status: number;
  message: string;
  data: Record<string, unknown>;
  cookie: string;
}

// Sends a request, optionally with a session cookie or a raw (unparsed) body
async function call(method: string, path: string, opts: { body?: unknown; token?: string; raw?: string } = {}): Promise<Reply> {
  const headers: Record<string, string> = { "x-forwarded-for": nextIp() };
  if (opts.body !== undefined || opts.raw !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers["Cookie"] = `foodie_session=${opts.token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: opts.raw !== undefined ? opts.raw : opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith("foodie_session=")) ?? "";
  return { status: res.status, message: String(data.error ?? data.message ?? ""), data, cookie };
}

const is = (r: Reply, status: number, message: string) => r.status === status && r.message === message;
const show = (r: Reply) => `${r.status} "${r.message}"`;
const lineIdOf = (r: AddResult) => ("cartItemId" in r ? r.cartItemId : -1);

async function main() {
  const db = await oracledb.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING,
  });
  const count = async (sql: string, binds: oracledb.BindParameters) =>
    Number(((await db.execute(sql, binds)).rows as unknown[][])[0][0]);

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

  // Registers an account (which logs it in) and returns its id and session token
  async function register() {
    const account = {
      id: "TST" + rand(),
      name: "Cart Whitebox",
      email: `tst${rand().toLowerCase()}@whitebox.test`,
      password: "Passw0rd!x",
      phone: "+573001234567",
      address: "Calle 14 #8-32, Pereira",
      emailOptIn: false,
    };
    const res = await call("POST", "/api/signup", { body: account });
    const token = res.cookie.split(";")[0].split("=")[1];
    if (res.status !== 201 || !token) throw new Error(`Setup failed: signup returned ${res.status}`);
    return { id: account.id, token };
  }

  try {
    // Setup: menu ids from the seed, and four accounts
    const restaurantId = async (name: string) => {
      const found = (await findRestaurants({ location: null, categoryId: null, search: name }))[0];
      if (!found) throw new Error(`Setup failed: "${name}" not found. Is the seed loaded?`);
      return found.id;
    };
    const parrilla = await findRestaurantMenu(await restaurantId("La Parrilla de la 30"));
    const horno = await findRestaurantMenu(await restaurantId("Horno Matecaña"));
    const item = (menu: typeof parrilla, name: string): MenuItem => {
      const found = menu?.items.find((i) => i.name === name);
      if (!found) throw new Error(`Setup failed: item "${name}" not found`);
      return found;
    };
    const optionId = (list: { id: number; name: string }[], name: string) => {
      const found = list.find((o) => o.name === name);
      if (!found) throw new Error(`Setup failed: option "${name}" not found`);
      return found.id;
    };
    const clasica = item(parrilla, "Hamburguesa clásica");
    const doble = item(parrilla, "Hamburguesa doble");
    const polloBurger = item(parrilla, "Hamburguesa de pollo");
    const papas = item(parrilla, "Papas a la francesa");
    const limonada = item(parrilla, "Limonada de coco");
    const margarita = item(horno, "Pizza margarita mediana");
    const sinCebolla = optionId(clasica.customizations, "Sin cebolla");
    const sinTomate = optionId(clasica.customizations, "Sin tomate");
    const sinSalsas = optionId(polloBurger.customizations, "Sin salsas");
    const tocineta = optionId(clasica.extras, "Tocineta");
    const quesoPapas = optionId(papas.extras, "Queso extra");
    const masaDelgada = optionId(margarita.customizations, "Masa delgada");
    const bordeQueso = optionId(margarita.extras, "Borde de queso");

    const a = await register();
    const b = await register();
    const c = await register();
    const d = await register();

    // ---------------- GET /api/cart ----------------
    console.log("\nGET /api/cart (V(G) = 3)");
    note("CP-CG-1", "D1(T) -> R1", "needs the database down: verified by outage_check.ts");
    check("CP-CG-2", "D2(T) -> R2: no session -> 401", is(await call("GET", "/api/cart"), 401, "Not logged in"));
    const emptyGet = await call("GET", "/api/cart", { token: b.token });
    check("CP-CG-3", "D1-D2(F) -> R3: session -> 200 and the cart",
      emptyGet.status === 200 && Array.isArray(emptyGet.data.items), show(emptyGet));

    // ---------------- POST /api/cart ----------------
    console.log("\nPOST /api/cart (V(G) = 15)");
    const post = (body: unknown, token: string | undefined = a.token) => call("POST", "/api/cart", { body, token });
    note("CP-CP-01", "D1(T) -> R1", "needs the database down: verified by outage_check.ts");
    check("CP-CP-02", "D2(T) -> R2: no session -> 401",
      is(await post({ menuItemId: clasica.id, quantity: 1 }, ""), 401, "Not logged in"));
    check("CP-CP-03", "D3(T) -> R3: malformed JSON -> 400",
      is(await call("POST", "/api/cart", { raw: '{"menuItemId":', token: a.token }), 400, "Request body is not valid JSON"));
    check("CP-CP-04", "D4(T) -> R4: body [] -> 400", is(await post([]), 400, "Request body must be a JSON object"));
    check("CP-CP-05", "D5(T) -> R5: menuItemId not an id -> 400",
      is(await post({ menuItemId: "x", quantity: 1 }), 400, "menuItemId must be a menu item id"));
    check("CP-CP-06", "D6(T) -> R6: quantity 0 -> 400",
      is(await post({ menuItemId: clasica.id, quantity: 0 }), 400, "quantity must be a whole number from 1 to 20"));
    check("CP-CP-07", "D7(T) -> R7: customizationIds not a list -> 400",
      is(await post({ menuItemId: clasica.id, quantity: 1, customizationIds: "x" }), 400,
        "customizationIds must be a list of different option ids"));
    check("CP-CP-08", "D8(T) -> R8: extraIds with a repeat -> 400",
      is(await post({ menuItemId: clasica.id, quantity: 1, extraIds: [tocineta, tocineta] }), 400,
        "extraIds must be a list of different option ids"));
    check("CP-CP-09", "D9(T) -> R9: menu item that does not exist -> 404",
      is(await post({ menuItemId: 999999, quantity: 1 }), 404, "Menu item not found"));
    check("CP-CP-10", "D10(T) -> R10: a pizza's customization on a burger -> 400",
      is(await post({ menuItemId: clasica.id, quantity: 1, customizationIds: [masaDelgada] }), 400,
        "A chosen customization is not offered for this item"));
    check("CP-CP-11", "D11(T) -> R11: a pizza's extra on a burger -> 400",
      is(await post({ menuItemId: clasica.id, quantity: 1, extraIds: [bordeQueso] }), 400,
        "A chosen extra is not offered for this item"));
    const fill = await post({ menuItemId: doble.id, quantity: 20 });
    const overLimit = await post({ menuItemId: doble.id, quantity: 1 });
    check("CP-CP-12", "D12(T) -> R12: merging past 20 -> 409",
      fill.status === 201 && is(overLimit, 409, "You can have at most 20 of this item in your cart"), show(overLimit));
    const both = await post({ menuItemId: clasica.id, quantity: 1, customizationIds: [sinCebolla], extraIds: [tocineta] });
    check("CP-CP-13", "T1(F) T2(F) D5-D12(F) -> R13: both lists sent -> 201", is(both, 201, "Added to cart"), show(both));
    check("CP-CP-14", "T1(T) -> N1: customizationIds missing -> treated as none, 201",
      is(await post({ menuItemId: papas.id, quantity: 1, extraIds: [quesoPapas] }), 201, "Added to cart"));
    check("CP-CP-15", "T2(T) -> N3: extraIds missing -> treated as none, 201",
      is(await post({ menuItemId: polloBurger.id, quantity: 1, customizationIds: [sinSalsas] }), 201, "Added to cart"));

    // ---------------- PATCH /api/cart/[id] ----------------
    console.log("\nPATCH /api/cart/[id] (V(G) = 8)");
    const aLine = Number(both.data.cartItemId);
    const bAdd = await call("POST", "/api/cart", { body: { menuItemId: limonada.id, quantity: 1 }, token: b.token });
    const bLine = Number(bAdd.data.cartItemId);
    const patch = (id: string | number, opts: { body?: unknown; raw?: string; token?: string }) =>
      call("PATCH", `/api/cart/${id}`, { token: a.token, ...opts });
    note("CP-CU-1", "D1(T) -> R1", "needs the database down: verified by outage_check.ts");
    check("CP-CU-2", "D2(T) -> R2: no session -> 401", is(await patch(aLine, { body: { quantity: 2 }, token: "" }), 401, "Not logged in"));
    check("CP-CU-3", "D3(T) -> R3: id that is not a number -> 400",
      is(await patch("abc", { body: { quantity: 2 } }), 400, "Cart item id must be a positive whole number"));
    check("CP-CU-4", "D4(T) -> R4: malformed JSON -> 400", is(await patch(aLine, { raw: '{"quantity":' }), 400, "Request body is not valid JSON"));
    check("CP-CU-5", "D5(T) -> R5: body [] -> 400", is(await patch(aLine, { body: [] }), 400, "Request body must be a JSON object"));
    check("CP-CU-6", "D6(T) -> R6: quantity 21 -> 400",
      is(await patch(aLine, { body: { quantity: 21 } }), 400, "quantity must be a whole number from 1 to 20"));
    check("CP-CU-7", "D7(T) -> R7: another user's line -> 404", is(await patch(bLine, { body: { quantity: 2 } }), 404, "Cart item not found"));
    const patched = await patch(aLine, { body: { quantity: 3 } });
    check("CP-CU-8", "D1-D7(F) -> R8: own line -> 200 and the new quantity",
      patched.status === 200 && patched.data.quantity === 3, show(patched));

    // ---------------- DELETE /api/cart/[id] ----------------
    console.log("\nDELETE /api/cart/[id] (V(G) = 5)");
    note("CP-CD-1", "D1(T) -> R1", "needs the database down: verified by outage_check.ts");
    check("CP-CD-2", "D2(T) -> R2: no session -> 401", is(await call("DELETE", `/api/cart/${aLine}`), 401, "Not logged in"));
    check("CP-CD-3", "D3(T) -> R3: id that is not a number -> 400",
      is(await call("DELETE", "/api/cart/abc", { token: a.token }), 400, "Cart item id must be a positive whole number"));
    check("CP-CD-4", "D4(T) -> R4: another user's line -> 404",
      is(await call("DELETE", `/api/cart/${bLine}`, { token: a.token }), 404, "Cart item not found"));
    check("CP-CD-5", "D1-D4(F) -> R5: own line -> 200",
      is(await call("DELETE", `/api/cart/${aLine}`, { token: a.token }), 200, "Removed from cart"));

    // ---------------- findMenuItemOptions ----------------
    console.log("\nfindMenuItemOptions (V(G) = 2)");
    check("CP-FO-1", "D1(T) -> R1: unknown item -> null", (await findMenuItemOptions(999999)) === null);
    const opts = await findMenuItemOptions(clasica.id);
    check("CP-FO-2", "D1(F) -> R2: the item's own options",
      opts !== null && opts.customizationIds.size === 3 && opts.extraIds.size === 3 &&
        opts.customizationIds.has(sinCebolla) && !opts.customizationIds.has(masaDelgada),
      `${opts?.customizationIds.size} / ${opts?.extraIds.size}`);

    // ---------------- addCartItem (user C) ----------------
    console.log("\naddCartItem (V(G) = 8)");
    const ac1 = await addCartItem(c.id, limonada.id, 1, [], []);
    check("CP-AC-1", "D1(F) D4(F) D6(F) D7(F) -> R3: first line, no choices -> added", ac1.outcome === "added", ac1.outcome);
    const ac2 = await addCartItem(c.id, clasica.id, 1, [sinCebolla], []);
    check("CP-AC-2", "D6(T): a new line with a customization -> saved with it",
      ac2.outcome === "added" &&
        (await count("SELECT COUNT(*) FROM cart_item_customization WHERE cart_item_id = :id", { id: lineIdOf(ac2) })) === 1,
      ac2.outcome);
    const ac3 = await addCartItem(c.id, papas.id, 1, [], [quesoPapas]);
    check("CP-AC-3", "D7(T): a new line with an extra -> saved with it",
      ac3.outcome === "added" &&
        (await count("SELECT COUNT(*) FROM cart_item_extra WHERE cart_item_id = :id", { id: lineIdOf(ac3) })) === 1,
      ac3.outcome);
    await addCartItem(c.id, doble.id, 1, [], []);
    const ac4 = await addCartItem(c.id, doble.id, 1, [sinCebolla], []);
    const dobleLines = await count("SELECT COUNT(*) FROM cart_item WHERE user_id = :u AND menu_item_id = :m", { u: c.id, m: doble.id });
    check("CP-AC-4", "D1(T) L1(F) L2(F) D4(F): item in the cart with other choices -> a second line",
      ac4.outcome === "added" && dobleLines === 2, `${ac4.outcome}, ${dobleLines} lines`);
    const ac5 = await addCartItem(c.id, limonada.id, 1, [], []);
    check("CP-AC-5", "D1(T) D4(T) D5(F) -> R2: same choices -> merged", ac5.outcome === "merged" && ac5.quantity === 2,
      `${ac5.outcome} ${ac5.quantity}`);
    const ac6 = await addCartItem(c.id, limonada.id, 19, [], []);
    const stillTwo = await count("SELECT quantity FROM cart_item WHERE id = :id", { id: lineIdOf(ac1) });
    check("CP-AC-6", "D5(T) -> R1: merging past 20 -> over-limit, nothing saved",
      ac6.outcome === "over-limit" && stillTwo === 2, `${ac6.outcome}, quantity ${stillTwo}`);
    const ac7 = await addCartItem(c.id, clasica.id, 1, [sinCebolla], []);
    check("CP-AC-7", "L1(T): the existing line's customizations are read -> merged",
      ac7.outcome === "merged" && ac7.quantity === 2, `${ac7.outcome} ${ac7.quantity}`);
    const ac8 = await addCartItem(c.id, papas.id, 1, [], [quesoPapas]);
    check("CP-AC-8", "L2(T): the existing line's extras are read -> merged",
      ac8.outcome === "merged" && ac8.quantity === 2, `${ac8.outcome} ${ac8.quantity}`);

    // ---------------- sameIds (through addCartItem) ----------------
    console.log("\nsameIds (V(G) = 2), reached through addCartItem");
    check("CP-SI-1", "D1(T) -> R1: different lengths -> not the same (CP-AC-4 made a second line)", dobleLines === 2);
    const si2 = await addCartItem(c.id, clasica.id, 1, [sinTomate], []);
    check("CP-SI-2", "D1(F) -> N1 -> R2: same length, different ids -> not the same, a new line",
      si2.outcome === "added", si2.outcome);

    // ---------------- getCart (user D) ----------------
    console.log("\ngetCart (V(G) = 5)");
    const empty = await getCart(d.id);
    check("CP-GC-1", "L1-L4(F): empty cart -> no items, subtotal 0",
      empty.items.length === 0 && empty.subtotal === 0 && empty.itemCount === 0);
    await addCartItem(d.id, limonada.id, 2, [], []);
    const g2 = await getCart(d.id);
    check("CP-GC-2", "L1(T) L4(T): a line without choices -> priced at the item price",
      g2.items[0]?.unitPrice === 9 && g2.items[0]?.lineTotal === 18, JSON.stringify(g2.items[0]));
    await addCartItem(d.id, clasica.id, 1, [sinCebolla], []);
    const g3 = await getCart(d.id);
    const g3Clasica = g3.items.find((l) => l.menuItemId === clasica.id);
    check("CP-GC-3", "L2(T): a line's customizations are listed, at no cost",
      g3Clasica?.customizations.map((x) => x.name).join() === "Sin cebolla" && g3Clasica?.unitPrice === 22,
      JSON.stringify(g3Clasica));
    await addCartItem(d.id, papas.id, 1, [], [quesoPapas]);
    const g4 = await getCart(d.id);
    const g4Papas = g4.items.find((l) => l.menuItemId === papas.id);
    check("CP-GC-4", "L3(T): an extra adds this item's price for it (8 + 3)",
      g4Papas?.unitPrice === 11 && g4.subtotal === 18 + 22 + 11 && g4.itemCount === 4,
      `${g4Papas?.unitPrice}, subtotal ${g4.subtotal}, count ${g4.itemCount}`);
    note("CP-GC-5", "L1(F) L4(T)", "infeasible: L4 prices the lines L1 loaded, so it cannot run without them");

    // ---------------- removeCartItem ----------------
    console.log("\nremoveCartItem (V(G) = 2)");
    const removedOther = await removeCartItem(d.id, lineIdOf(ac1));
    const cLineLeft = await count("SELECT COUNT(*) FROM cart_item WHERE id = :id", { id: lineIdOf(ac1) });
    check("CP-RM-1", "D1(T) -> R1: another user's line -> false, and it stays", removedOther === false && cLineLeft === 1);
    const dClasica = g4.items.find((l) => l.menuItemId === clasica.id)?.id ?? -1;
    const removedOwn = await removeCartItem(d.id, dClasica);
    const lineLeft = await count("SELECT COUNT(*) FROM cart_item WHERE id = :id", { id: dClasica });
    const choicesLeft = await count("SELECT COUNT(*) FROM cart_item_customization WHERE cart_item_id = :id", { id: dClasica });
    check("CP-RM-2", "D1(F) -> N1 -> R2: own line -> true, the line and its choices are gone",
      removedOwn === true && lineLeft === 0 && choicesLeft === 0, `${removedOwn}, ${lineLeft} line, ${choicesLeft} choices`);
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
