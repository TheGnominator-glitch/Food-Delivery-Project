// FR18-FR20, FR23-FR25, FR28: white-box tests for checkout, one test per basis path of each graph:
// GET /api/checkout (V(G) = 6), POST /api/checkout (11), placeOrder (9), loadCart (6) and planDelivery (3).
// Graphs: diagrams/cfg/checkout_routes_cfg.png, checkout_logic_cfg.png
// Paths that need the database to fail are checked by scripts/outage_check.ts.
// Needs the dev server running and the seed loaded. Run: npx tsx scripts/checkout_whitebox.ts

import "./env";
import oracledb from "oracledb";
import { getCheckoutQuote, placeOrder } from "../lib/checkoutRepository";
import { planDelivery } from "../lib/geo";

const BASE = "http://localhost:3000";
const POINT = { lat: 4.809243, lng: -75.760298 }; // Nori Sushi Bar's spot, in the west cluster
const COORDINATES = "lat and lng must be valid coordinates, sent together";

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
const at = (p: { lat: number; lng: number }) => `lat=${p.lat}&lng=${p.lng}`;

async function main() {
  const db = await oracledb.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING,
  });
  const one = async (sql: string, binds: oracledb.BindParameters) =>
    ((await db.execute(sql, binds)).rows as unknown[][])[0]?.[0];
  const count = async (sql: string, binds: oracledb.BindParameters) => Number(await one(sql, binds));

  // Deletes everything test accounts (IDs starting with TST) own, in foreign-key order
  const cleanup = async () => {
    const tst = "SELECT id FROM orders WHERE user_id LIKE 'TST%'";
    await db.execute("DELETE FROM notification_queue WHERE user_id LIKE 'TST%'");
    await db.execute("DELETE FROM credit_transaction WHERE user_id LIKE 'TST%'");
    await db.execute(`DELETE FROM order_item_customization WHERE order_item_id IN (SELECT id FROM order_item WHERE order_id IN (${tst}))`);
    await db.execute(`DELETE FROM order_item_extra WHERE order_item_id IN (SELECT id FROM order_item WHERE order_id IN (${tst}))`);
    await db.execute(`DELETE FROM order_item WHERE order_id IN (${tst})`);
    await db.execute("DELETE FROM orders WHERE user_id LIKE 'TST%'");
    await db.execute("DELETE FROM cart_item_customization WHERE cart_item_id IN (SELECT id FROM cart_item WHERE user_id LIKE 'TST%')");
    await db.execute("DELETE FROM cart_item_extra WHERE cart_item_id IN (SELECT id FROM cart_item WHERE user_id LIKE 'TST%')");
    await db.execute("DELETE FROM cart_item WHERE user_id LIKE 'TST%'");
    await db.execute("DELETE FROM sessions WHERE user_id LIKE 'TST%'");
    await db.execute("DELETE FROM users WHERE id LIKE 'TST%'");
    await db.commit();
  };
  await cleanup();

  // Registers an account (which logs it in) and returns its id and session token
  async function register(emailOptIn = false) {
    const account = {
      id: "TST" + rand(),
      name: "Checkout Whitebox",
      email: `tst${rand().toLowerCase()}@whitebox.test`,
      password: "Passw0rd!x",
      phone: "+573001234567",
      address: "Calle 14 #8-32, Pereira",
      emailOptIn,
    };
    const res = await call("POST", "/api/signup", { body: account });
    const token = res.cookie.split(";")[0].split("=")[1];
    if (res.status !== 201 || !token) throw new Error(`Setup failed: signup returned ${res.status}`);
    return { id: account.id, token };
  }
  const setBalance = async (userId: string, balance: number) => {
    await db.execute("UPDATE users SET credit_balance = :balance WHERE id = :id", { balance, id: userId });
    await db.commit();
  };
  const balanceOf = async (userId: string) => count("SELECT credit_balance FROM users WHERE id = :id", { id: userId });

  try {
    // Setup: the seed items used below, through the public API
    async function menuOf(name: string) {
      const list = await call("GET", `/api/restaurants?search=${encodeURIComponent(name)}`);
      const found = (list.data.restaurants as { id: number; name: string }[]).find((r) => r.name === name);
      if (!found) throw new Error(`Setup failed: "${name}" not found. Is the seed loaded?`);
      const menu = await call("GET", `/api/restaurants/${found.id}`);
      return (menu.data.restaurant as {
        items: { id: number; name: string; price: number; customizations: { id: number; name: string }[]; extras: { id: number; name: string; price: number }[] }[];
      }).items;
    }
    const parrilla = await menuOf("La Parrilla de la 30");
    const horno = await menuOf("Horno Matecaña");
    const find = (items: typeof parrilla, name: string) => {
      const item = items.find((i) => i.name === name);
      if (!item) throw new Error(`Setup failed: item "${name}" not found`);
      return item;
    };
    const limonada = find(parrilla, "Limonada de coco");
    const papas = find(parrilla, "Papas a la francesa");
    const quesoPapas = papas.extras.find((e) => e.name === "Queso extra")!;
    const margarita = find(horno, "Pizza margarita mediana");
    const masaDelgada = margarita.customizations.find((c) => c.name === "Masa delgada")!;

    const add = (token: string, menuItemId: number, extra: Record<string, unknown> = {}) =>
      call("POST", "/api/cart", { body: { menuItemId, quantity: 1, ...extra }, token });
    const quoteTotal = async (userId: string) => (await getCheckoutQuote(userId, POINT)).total;
    const ordersOf = async (userId: string) => count("SELECT COUNT(*) FROM orders WHERE user_id = :id", { id: userId });

    // ---------------- GET /api/checkout ----------------
    console.log("\nGET /api/checkout (V(G) = 6)");
    const g = await register();
    await add(g.token, limonada.id);
    note("CP-CQ-1", "D1(T) -> R1", "needs the database down: verified by outage_check.ts");
    check("CP-CQ-2", "D2(T) -> R2: no session -> 401", is(await call("GET", `/api/checkout?${at(POINT)}`), 401, "Not logged in"));
    check("CP-CQ-3", "T1(T) -> D3(T): lat missing -> 400",
      is(await call("GET", `/api/checkout?lng=${POINT.lng}`, { token: g.token }), 400, COORDINATES));
    check("CP-CQ-4", "T2(T) -> D3(T): lng missing -> 400",
      is(await call("GET", `/api/checkout?lat=${POINT.lat}`, { token: g.token }), 400, COORDINATES));
    check("CP-CQ-5", "T1-T2(F) D3(T): lat 91 -> 400",
      is(await call("GET", `/api/checkout?lat=91&lng=${POINT.lng}`, { token: g.token }), 400, COORDINATES));
    const quote = await call("GET", `/api/checkout?${at(POINT)}`, { token: g.token });
    check("CP-CQ-6", "D1-D3(F) -> R4: valid -> 200, and the total adds up",
      quote.status === 200 && Number(quote.data.total) === Number(quote.data.subtotal) + Number(quote.data.deliveryCost),
      `${show(quote)} ${JSON.stringify(quote.data).slice(0, 120)}`);

    // ---------------- POST /api/checkout ----------------
    console.log("\nPOST /api/checkout (V(G) = 11)");
    const a = await register();
    const b = await register();
    await add(a.token, limonada.id);
    const pay = (token: string, body: unknown) => call("POST", "/api/checkout", { body, token });
    const aTotal = await quoteTotal(a.id);
    note("CP-CO-01", "D1(T) -> R1", "needs the database down: verified by outage_check.ts");
    check("CP-CO-02", "D2(T) -> R2: no session -> 401", is(await pay("", { ...POINT, expectedTotal: aTotal }), 401, "Not logged in"));
    check("CP-CO-03", "D3(T) -> R3: malformed JSON -> 400",
      is(await call("POST", "/api/checkout", { raw: '{"lat":', token: a.token }), 400, "Request body is not valid JSON"));
    check("CP-CO-04", "D4(T) -> R4: body [] -> 400", is(await pay(a.token, []), 400, "Request body must be a JSON object"));
    check("CP-CO-05", "D5(T) -> R5: lat 91 -> 400", is(await pay(a.token, { lat: 91, lng: POINT.lng, expectedTotal: aTotal }), 400, COORDINATES));
    check("CP-CO-06", 'D6(T) -> R6: expectedTotal "10" (text) -> 400',
      is(await pay(a.token, { ...POINT, expectedTotal: String(aTotal) }), 400, "expectedTotal must be the total shown on the page"));
    check("CP-CO-08", "S1(F) S2(T) -> R8: empty cart -> 409",
      is(await pay(b.token, { ...POINT, expectedTotal: 0 }), 409, "Your cart is empty"));
    const changed = await pay(a.token, { ...POINT, expectedTotal: aTotal + 1 });
    check("CP-CO-09", "S3(T) -> R9: a different total -> 409, with the real total",
      is(changed, 409, "Prices changed. Please review your order before paying.") && changed.data.total === aTotal, show(changed));
    check("CP-CO-10", "S4(T) -> R10: balance 0 -> 402", is(await pay(a.token, { ...POINT, expectedTotal: aTotal }), 402, "Not enough credits"));
    await setBalance(a.id, 500);
    const placed = await pay(a.token, { ...POINT, expectedTotal: aTotal });
    check("CP-CO-11", "S1-S4(F) -> R11: everything valid -> 201",
      is(placed, 201, "Order placed") && placed.data.creditBalance === 500 - aTotal, show(placed));
    await add(a.token, limonada.id);
    check("CP-CO-07", "S1(T) -> R7: an order still in progress -> 409",
      is(await pay(a.token, { ...POINT, expectedTotal: await quoteTotal(a.id) }), 409, "You already have an order in progress"));

    // ---------------- placeOrder ----------------
    console.log("\nplaceOrder (V(G) = 9)");
    const po1 = await placeOrder(a.id, POINT, await quoteTotal(a.id));
    check("CP-PO-1", "D1(T) -> R1: an order not yet Delivered -> active-order", po1.outcome === "active-order", po1.outcome);
    const po2 = await placeOrder(b.id, POINT, 0);
    check("CP-PO-2", "D1(F) D2(T) -> R2: empty cart -> empty-cart", po2.outcome === "empty-cart", po2.outcome);

    const c = await register();
    await add(c.token, limonada.id);
    const cTotal = await quoteTotal(c.id);
    const po3 = await placeOrder(c.id, POINT, cTotal - 1);
    check("CP-PO-3", "D3(T) -> R3: total differs -> price-changed, nothing saved",
      po3.outcome === "price-changed" && po3.total === cTotal && (await ordersOf(c.id)) === 0, JSON.stringify(po3));
    const po4 = await placeOrder(c.id, POINT, cTotal);
    check("CP-PO-4", "D4(T) -> R4: balance below total -> insufficient-credits, nothing saved",
      po4.outcome === "insufficient-credits" && (await ordersOf(c.id)) === 0 && (await balanceOf(c.id)) === 0, JSON.stringify(po4));

    await setBalance(c.id, 100);
    const po5 = await placeOrder(c.id, POINT, cTotal);
    const orderId = po5.outcome === "placed" ? po5.orderId : -1;
    const row = (await db.execute(
      "SELECT status, subtotal, delivery_cost, total, delivery_lat, delivery_lng FROM orders WHERE id = :id", { id: orderId }
    )).rows as unknown[][];
    const [status, subtotal, deliveryCost, total, dLat, dLng] = row[0] ?? [];
    const spend = await count(
      "SELECT COUNT(*) FROM credit_transaction WHERE user_id = :u AND transaction_type = 'spend' AND amount = :t AND order_id = :o",
      { u: c.id, t: cTotal, o: orderId });
    check("CP-PO-5", "L1(T) D5(F) D6(F) D7(F): a plain item -> placed (order, item, spend, empty cart, no notification)",
      po5.outcome === "placed" && status === "Placed" && Number(total) === Number(subtotal) + Number(deliveryCost) &&
        Number(dLat) === POINT.lat && Number(dLng) === POINT.lng &&
        (await count("SELECT COUNT(*) FROM order_item WHERE order_id = :o", { o: orderId })) === 1 &&
        (await count("SELECT COUNT(*) FROM order_item_customization WHERE order_item_id IN (SELECT id FROM order_item WHERE order_id = :o)", { o: orderId })) === 0 &&
        (await count("SELECT COUNT(*) FROM order_item_extra WHERE order_item_id IN (SELECT id FROM order_item WHERE order_id = :o)", { o: orderId })) === 0 &&
        spend === 1 && (await balanceOf(c.id)) === 100 - cTotal &&
        (await count("SELECT COUNT(*) FROM cart_item WHERE user_id = :u", { u: c.id })) === 0 &&
        (await count("SELECT COUNT(*) FROM notification_queue WHERE user_id = :u", { u: c.id })) === 0,
      `${JSON.stringify(po5)} ${status} ${subtotal}+${deliveryCost}=${total} spend ${spend}`);

    const e = await register();
    await add(e.token, margarita.id, { customizationIds: [masaDelgada.id] });
    await setBalance(e.id, 200);
    const po6 = await placeOrder(e.id, POINT, await quoteTotal(e.id));
    const eOrder = po6.outcome === "placed" ? po6.orderId : -1;
    check("CP-PO-6", "D5(T): an item with a customization -> saved with the order",
      po6.outcome === "placed" &&
        (await count("SELECT COUNT(*) FROM order_item_customization WHERE customization_id = :c AND order_item_id IN (SELECT id FROM order_item WHERE order_id = :o)",
          { c: masaDelgada.id, o: eOrder })) === 1, JSON.stringify(po6));

    const f = await register();
    await add(f.token, papas.id, { extraIds: [quesoPapas.id] });
    await setBalance(f.id, 200);
    const po7 = await placeOrder(f.id, POINT, await quoteTotal(f.id));
    const fOrder = po7.outcome === "placed" ? po7.orderId : -1;
    const extraPrice = await one(
      "SELECT price_at_order FROM order_item_extra WHERE extra_id = :x AND order_item_id IN (SELECT id FROM order_item WHERE order_id = :o)",
      { x: quesoPapas.id, o: fOrder });
    check("CP-PO-7", `D6(T): an item with an extra -> saved with its price (${quesoPapas.price})`,
      po7.outcome === "placed" && Number(extraPrice) === quesoPapas.price, `${JSON.stringify(po7)} price ${extraPrice}`);

    const d = await register(true);
    await add(d.token, limonada.id);
    await setBalance(d.id, 200);
    const po8 = await placeOrder(d.id, POINT, await quoteTotal(d.id));
    const dOrder = po8.outcome === "placed" ? po8.orderId : -1;
    check("CP-PO-8", "D7(T): an opted-in user -> one pending 'order_placed' notification for this order",
      po8.outcome === "placed" &&
        (await count("SELECT COUNT(*) FROM notification_queue WHERE user_id = :u AND message_type = 'order_placed' AND status = 'pending' AND order_id = :o",
          { u: d.id, o: dOrder })) === 1, JSON.stringify(po8));
    note("CP-PO-9", "D4(F) L1(F) at once", "infeasible: D2 guarantees at least one cart line, so the loop always runs");

    // ---------------- loadCart (reached through getCheckoutQuote and placeOrder) ----------------
    console.log("\nloadCart (V(G) = 6)");
    const empty = await getCheckoutQuote(b.id, POINT);
    check("CP-LC-1", "D0(F) L1-L4(F): quote, empty cart -> no items", empty.items.length === 0 && empty.subtotal === 0);
    check("CP-LC-2", "D0(T): Confirm and pay locks the lines (its query ran: CP-PO-5 placed)", po5.outcome === "placed");
    const h = await register();
    await add(h.token, limonada.id);
    await add(h.token, margarita.id, { customizationIds: [masaDelgada.id] });
    await add(h.token, papas.id, { extraIds: [quesoPapas.id] });
    const hq = await getCheckoutQuote(h.id, POINT);
    const line = (id: number) => hq.items.find((l) => l.menuItemId === id);
    check("CP-LC-3", "L1(T) L4(T): a plain line -> priced at the item price",
      line(limonada.id)?.unitPrice === limonada.price && line(limonada.id)?.lineTotal === limonada.price, JSON.stringify(line(limonada.id)));
    check("CP-LC-4", "L2(T): a customization is attached to its line",
      line(margarita.id)?.customizations.map((x) => x.name).join() === "Masa delgada", JSON.stringify(line(margarita.id)));
    check("CP-LC-5", "L3(T): an extra is attached with this item's price",
      line(papas.id)?.unitPrice === papas.price + quesoPapas.price, JSON.stringify(line(papas.id)));
    note("CP-LC-6", "L1(F) L4(T)", "infeasible: L4 prices the lines L1 loaded, so it cannot run without them");

    // ---------------- planDelivery ----------------
    console.log("\nplanDelivery (V(G) = 3)");
    const nori = { id: 1, name: "Nori Sushi Bar", lat: 4.809243, lng: -75.760298 };
    const hornoStop = { id: 2, name: "Horno Matecaña", lat: 4.808922, lng: -75.742761 };
    const p1 = planDelivery([], POINT);
    check("CP-PD-1", "L1(F): no pickups -> 0 km, 3 credits, 15 min",
      p1.distanceKm === 0 && p1.deliveryCost === 3 && p1.estimateMinutes === 15, JSON.stringify(p1));
    const p2 = planDelivery([nori], { lat: 4.818232, lng: -75.760298 });
    check("CP-PD-2", "L1(T) D1(F): one pickup -> straight to the customer (1.000 km, 4 credits, 18 min)",
      p2.distanceKm === 1 && p2.deliveryCost === 4 && p2.estimateMinutes === 18, JSON.stringify(p2));
    const p3 = planDelivery([nori, hornoStop], POINT);
    check("CP-PD-3", "D1(T): two pickups -> farthest first, then the customer (1.943 km, 5 credits, 21 min)",
      p3.pickups.map((s) => s.name).join(" > ") === "Horno Matecaña > Nori Sushi Bar" &&
        p3.distanceKm === 1.943 && p3.deliveryCost === 5 && p3.estimateMinutes === 21, JSON.stringify(p3));
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
