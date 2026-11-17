// FR18-FR20, FR23, FR25, FR28: black-box tests for checkout (GET and POST /api/checkout), using the five
// techniques. About half of roughly 40 candidate cases. The map and the redirects happen in the browser,
// so they are covered by the manual checklist in the module documentation.
// Needs the dev server running and the seed loaded. Run: npx tsx scripts/checkout_blackbox.ts

import "./env";
import oracledb from "oracledb";

const BASE = "http://localhost:3000";
const AT_NORI = { lat: 4.809243, lng: -75.760298 };
// Due north of Nori Sushi Bar: exactly 1.000 km and 1.001 km away
const NORI_1000_M = { lat: 4.818232, lng: -75.760298 };
const NORI_1001_M = { lat: 4.818241, lng: -75.760298 };

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

interface Quote {
  subtotal: number;
  deliveryCost: number;
  estimateMinutes: number;
  total: number;
  pickups: { name: string }[];
  hasActiveOrder: boolean;
}

async function main() {
  const db = await oracledb.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING,
  });
  const count = async (sql: string, binds: oracledb.BindParameters) =>
    Number(((await db.execute(sql, binds)).rows as unknown[][])[0][0]);

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

  async function register() {
    const account = {
      id: "TST" + rand(),
      name: "Checkout Blackbox",
      email: `tst${rand().toLowerCase()}@blackbox.test`,
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
  const setBalance = async (id: string, balance: number) => {
    await db.execute("UPDATE users SET credit_balance = :balance WHERE id = :id", { balance, id });
    await db.commit();
  };
  const balanceOf = async (token: string) =>
    Number(((await call("GET", "/api/me", { token })).data.user as { creditBalance: number }).creditBalance);
  const cartCount = async (token: string) => Number((await call("GET", "/api/cart", { token })).data.itemCount);
  const ordersOf = (id: string) => count("SELECT COUNT(*) FROM orders WHERE user_id = :id", { id });

  async function firstItemOf(name: string) {
    const list = await call("GET", `/api/restaurants?search=${encodeURIComponent(name)}`);
    const found = (list.data.restaurants as { id: number; name: string }[]).find((r) => r.name === name);
    if (!found) throw new Error(`Setup failed: "${name}" not found. Is the seed loaded?`);
    const menu = await call("GET", `/api/restaurants/${found.id}`);
    return (menu.data.restaurant as { items: { id: number }[] }).items[0].id;
  }

  try {
    const noriItem = await firstItemOf("Nori Sushi Bar");
    const hornoItem = await firstItemOf("Horno Matecaña");
    const add = (token: string, menuItemId: number) =>
      call("POST", "/api/cart", { body: { menuItemId, quantity: 1 }, token });
    const quote = async (token: string, p = AT_NORI) =>
      (await call("GET", `/api/checkout?lat=${p.lat}&lng=${p.lng}`, { token })).data as unknown as Quote;
    const pay = (token: string, expectedTotal: unknown, p: Record<string, unknown> = AT_NORI) =>
      call("POST", "/api/checkout", { body: { ...p, expectedTotal }, token });

    // ---- 1. Equivalence partitioning ----
    console.log("\n1. Equivalence partitioning (FR18, FR23, FR28)");
    const u1 = await register();
    await add(u1.token, noriItem);
    await setBalance(u1.id, 300);
    const q1 = await quote(u1.token);
    const r1 = await pay(u1.token, q1.total);
    check("EP-CO-1 / DT-CO-5", "a valid order with enough credits -> 201, balance down by the total, cart empty",
      r1.status === 201 && (await balanceOf(u1.token)) === 300 - q1.total && (await cartCount(u1.token)) === 0,
      `${r1.status} ${JSON.stringify(r1.data)}`);
    const anonymous = await pay("", 10);
    check("EP-CO-2", "paying without logging in -> 401", anonymous.status === 401, `${anonymous.status}`);
    const u2 = await register();
    const emptyCart = await pay(u2.token, 0);
    check("EP-CO-3 / DT-CO-2", "an empty cart -> 409", emptyCart.status === 409, `${emptyCart.status}`);

    const u3 = await register();
    await add(u3.token, noriItem);
    await add(u3.token, hornoItem);
    await setBalance(u3.id, 300);
    const badPoint = await pay(u3.token, 10, { lat: 91, lng: AT_NORI.lng });
    check("EP-CO-4", "latitude 91 -> 400", badPoint.status === 400, `${badPoint.status}`);
    const noTotal = await call("POST", "/api/checkout", { body: { ...AT_NORI }, token: u3.token });
    check("EP-CO-5", "no expectedTotal -> 400", noTotal.status === 400, `${noTotal.status}`);
    const q3 = await quote(u3.token);
    check("EP-CO-6", "two restaurants -> one driver, farthest first; 1.943 km = 5 credits, 21 min; total adds up",
      q3.pickups.map((p) => p.name).join(" > ") === "Horno Matecaña > Nori Sushi Bar" &&
        q3.deliveryCost === 5 && q3.estimateMinutes === 21 && q3.total === q3.subtotal + q3.deliveryCost,
      JSON.stringify(q3).slice(0, 200));

    // ---- 2. Boundary value analysis ----
    console.log("\n2. Boundary value analysis (FR18, FR20, FR28)");
    const u4 = await register();
    await add(u4.token, noriItem);
    const q4 = await quote(u4.token);
    await setBalance(u4.id, q4.total);
    const exact = await pay(u4.token, q4.total);
    check("BV-CO-1", "balance exactly equal to the total -> 201, balance 0",
      exact.status === 201 && (await balanceOf(u4.token)) === 0, `${exact.status}`);
    const u5 = await register();
    await add(u5.token, noriItem);
    const q5 = await quote(u5.token);
    await setBalance(u5.id, q5.total - 1);
    const short = await pay(u5.token, q5.total);
    check("BV-CO-2 / DT-CO-4", "balance 1 credit short -> 402, balance and cart unchanged",
      short.status === 402 && (await balanceOf(u5.token)) === q5.total - 1 && (await cartCount(u5.token)) === 1 &&
        (await ordersOf(u5.id)) === 0, `${short.status}`);
    const u6 = await register();
    await add(u6.token, noriItem);
    const at1000 = await quote(u6.token, NORI_1000_M);
    check("BV-CO-3", "delivery point exactly 1.000 km away -> 4 credits", at1000.deliveryCost === 4, `${at1000.deliveryCost}`);
    const at1001 = await quote(u6.token, NORI_1001_M);
    check("BV-CO-4", "delivery point 1.001 km away -> 5 credits (a started km counts)", at1001.deliveryCost === 5, `${at1001.deliveryCost}`);
    const lat90 = await call("GET", `/api/checkout?lat=90&lng=${AT_NORI.lng}`, { token: u6.token });
    check("BV-CO-5", "latitude 90 -> accepted", lat90.status === 200, `${lat90.status}`);
    const lat90plus = await call("GET", `/api/checkout?lat=90.000001&lng=${AT_NORI.lng}`, { token: u6.token });
    check("BV-CO-6", "latitude 90.000001 -> 400", lat90plus.status === 400, `${lat90plus.status}`);

    // ---- 3. Decision table: rules covered by the cases above and below ----
    // Conditions: an order in progress / cart has items / total unchanged / enough credits
    //   DT-CO-1: an order in progress           -> 409
    //   DT-CO-2: none, cart empty               -> 409   (EP-CO-3)
    //   DT-CO-3: items, but the total changed   -> 409, nothing charged
    //   DT-CO-4: total unchanged, not enough    -> 402   (BV-CO-2)
    //   DT-CO-5: all fine                       -> 201   (EP-CO-1)
    console.log("\n3. Decision table (FR18, FR20, FR23)");
    await add(u1.token, noriItem);
    const busy = await pay(u1.token, (await quote(u1.token)).total);
    check("DT-CO-1", "an order still in progress -> 409", busy.status === 409, `${busy.status}`);
    const moved = await pay(u3.token, q3.total + 1);
    check("DT-CO-3", "the total changed since the page loaded -> 409 with the real total, nothing charged",
      moved.status === 409 && moved.data.total === q3.total && (await balanceOf(u3.token)) === 300, `${moved.status} ${JSON.stringify(moved.data)}`);

    // ---- 4. State transition (FR20, FR23) ----
    console.log("\n4. State transition (FR20, FR23, FR26)");
    const placedRow = await count("SELECT COUNT(*) FROM orders WHERE user_id = :id AND status = 'Placed'", { id: u1.id });
    check("ST-CO-1", "no order -> Placed: the order shows as in progress",
      placedRow === 1 && (await quote(u1.token)).hasActiveOrder === true);
    await db.execute("UPDATE orders SET status = 'Delivered' WHERE user_id = :id", { id: u1.id });
    await db.commit();
    const again = await pay(u1.token, (await quote(u1.token)).total);
    check("ST-CO-2", "Placed -> Delivered: the user can order again", again.status === 201, `${again.status}`);
    await call("POST", "/api/credits/purchase", {
      body: { amount: 25, cardNumber: "4242424242424242", expiry: "12/30", securityCode: "123" },
      token: u5.token,
    });
    const retry = await pay(u5.token, q5.total);
    check("ST-CO-3", "not enough -> buy credits -> pay again, cart intact -> 201", retry.status === 201, `${retry.status}`);

    // ---- 5. Error guessing ----
    console.log("\n5. Error guessing (FR23)");
    const u7 = await register();
    await add(u7.token, noriItem);
    await setBalance(u7.id, 300);
    const q7 = await quote(u7.token);
    const [first, second] = await Promise.all([pay(u7.token, q7.total), pay(u7.token, q7.total)]);
    const statuses = [first.status, second.status].sort().join(",");
    check("EG-CO-1", "Confirm and pay pressed twice at once -> one order, charged once",
      statuses === "201,409" && (await ordersOf(u7.id)) === 1 && (await balanceOf(u7.token)) === 300 - q7.total, statuses);
    const cheaper = await pay(u3.token, q3.total - 1);
    check("EG-CO-2", "a total lowered by the browser -> 409, nothing charged",
      cheaper.status === 409 && (await balanceOf(u3.token)) === 300 && (await ordersOf(u3.id)) === 0, `${cheaper.status}`);
    const textLat = await pay(u3.token, q3.total, { lat: "4.809243", lng: AT_NORI.lng });
    check("EG-CO-3", "latitude sent as text -> 400", textLat.status === 400, `${textLat.status}`);
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
