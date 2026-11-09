// FR21, FR22, FR25: black-box tests for buying credits (POST /api/credits/purchase), using the five techniques.
// About half of roughly 44 candidate cases. The two pages (Buy Credits, Card Details) are covered by the
// manual checklist in the module documentation.
// Needs the dev server running. Run: npx tsx scripts/credits_blackbox.ts

import "./env";
import oracledb from "oracledb";

const BASE = "http://localhost:3000";
const CARD = "4242424242424242";

let passed = 0;
let failed = 0;

const ipPrefix = `10.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
let ipCounter = 0;
const nextIp = () => `${ipPrefix}.${++ipCounter}`;
const rand = () => Math.random().toString(36).slice(2, 10).toUpperCase();

// Expiry dates relative to today, as MM/YY
const mmyy = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear() % 100).padStart(2, "0")}`;
const today = new Date();
const THIS_MONTH = mmyy(today);
const LAST_MONTH = mmyy(new Date(today.getFullYear(), today.getMonth() - 1, 1));
const FUTURE = mmyy(new Date(today.getFullYear() + 2, 11, 1));

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

async function main() {
  const db = await oracledb.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING,
  });

  // Deletes test transactions, carts, sessions and users (IDs starting with TST), in foreign-key order
  const cleanup = async () => {
    await db.execute("DELETE FROM credit_transaction WHERE user_id LIKE 'TST%'");
    await db.execute("DELETE FROM cart_item_customization WHERE cart_item_id IN (SELECT id FROM cart_item WHERE user_id LIKE 'TST%')");
    await db.execute("DELETE FROM cart_item_extra WHERE cart_item_id IN (SELECT id FROM cart_item WHERE user_id LIKE 'TST%')");
    await db.execute("DELETE FROM cart_item WHERE user_id LIKE 'TST%'");
    await db.execute("DELETE FROM sessions WHERE user_id LIKE 'TST%'");
    await db.execute("DELETE FROM users WHERE id LIKE 'TST%'");
    await db.commit();
  };
  await cleanup();

  try {
    const account = {
      id: "TST" + rand(),
      name: "Credits Blackbox",
      email: `tst${rand().toLowerCase()}@blackbox.test`,
      password: "Passw0rd!x",
      phone: "+573001234567",
      address: "Calle 14 #8-32, Pereira",
      emailOptIn: false,
    };
    const signup = await call("POST", "/api/signup", { body: account });
    const token = signup.cookie.split(";")[0].split("=")[1];
    if (signup.status !== 201 || !token) throw new Error(`Setup failed: signup returned ${signup.status}`);

    // The balance through the public API, and the number of logged transactions (FR25)
    const balance = async () => Number(((await call("GET", "/api/me", { token })).data.user as { creditBalance: number }).creditBalance);
    const txCount = async () =>
      Number(((await db.execute("SELECT COUNT(*) FROM credit_transaction WHERE user_id = :id", { id: account.id })).rows as unknown[][])[0][0]);
    const buy = (overrides: Record<string, unknown> = {}, t: string = token) =>
      call("POST", "/api/credits/purchase", {
        body: { amount: 25, cardNumber: CARD, expiry: FUTURE, securityCode: "123", ...overrides },
        token: t,
      });

    // ---- 1. Equivalence partitioning ----
    console.log("\n1. Equivalence partitioning (FR21, FR22, FR25)");
    const b0 = await balance();
    const tx0 = await txCount();
    const pkg = await buy({ amount: 25 });
    check("EP-CR-1 / DT-CR-4", "a package (25) with a valid card -> balance +25, one transaction logged",
      pkg.status === 201 && (await balance()) === b0 + 25 && (await txCount()) === tx0 + 1, `${pkg.status}`);
    const b1 = await balance();
    const custom = await buy({ amount: 137 });
    check("EP-CR-2", "a custom amount (137) -> balance +137", custom.status === 201 && (await balance()) === b1 + 137,
      `${custom.status}`);
    const anonymous = await buy({}, "");
    check("EP-CR-3", "buying without logging in -> 401", anonymous.status === 401, `${anonymous.status}`);
    const textAmount = await buy({ amount: "25" });
    check("EP-CR-4", "an amount sent as text -> 400", textAmount.status === 400, `${textAmount.status}`);
    const noCard = await buy({ cardNumber: undefined, expiry: undefined, securityCode: undefined });
    check("EP-CR-5", "no card details -> 400", noCard.status === 400, `${noCard.status}`);
    const spaced = await buy({ cardNumber: "4242 4242 4242 4242" });
    check("EP-CR-6", "a card number typed with spaces -> accepted", spaced.status === 201, `${spaced.status}`);
    const letters = await buy({ cardNumber: "4242a24242424242" });
    check("EP-CR-7", "letters in the card number -> 400", letters.status === 400, `${letters.status}`);

    // ---- 2. Boundary value analysis ----
    console.log("\n2. Boundary value analysis (FR21, FR22)");
    check("BV-CR-1 / DT-CR-1", "amount 0 -> 400", (await buy({ amount: 0 })).status === 400);
    check("BV-CR-2", "amount 1 -> accepted", (await buy({ amount: 1 })).status === 201);
    check("BV-CR-3", "amount 1000 -> accepted", (await buy({ amount: 1000 })).status === 201);
    check("BV-CR-4", "amount 1001 -> 400", (await buy({ amount: 1001 })).status === 400);
    check("BV-CR-5 / DT-CR-3", `expiry last month (${LAST_MONTH}) -> 400`, (await buy({ expiry: LAST_MONTH })).status === 400);
    check("BV-CR-6", `expiry this month (${THIS_MONTH}) -> accepted (valid to the end of the month)`,
      (await buy({ expiry: THIS_MONTH })).status === 201);
    check("BV-CR-7", "15-digit card number -> 400", (await buy({ cardNumber: CARD.slice(1) })).status === 400);
    check("BV-CR-8", "17-digit card number -> 400", (await buy({ cardNumber: CARD + "2" })).status === 400);
    check("BV-CR-9", "2-digit security code -> 400", (await buy({ securityCode: "12" })).status === 400);
    check("BV-CR-10", "4-digit security code -> 400", (await buy({ securityCode: "1234" })).status === 400);

    // ---- 3. Decision table: rules covered by the cases above and below ----
    // Conditions: amount valid / card number valid / expiry current
    //   DT-CR-1: amount invalid                 -> 400   (BV-CR-1)
    //   DT-CR-2: amount valid, card invalid     -> 400   (EG-CR-1)
    //   DT-CR-3: valid amount and card, expired -> 400   (BV-CR-5)
    //   DT-CR-4: all valid                      -> 201   (EP-CR-1)

    // ---- 4. State transition: the balance only moves on a successful purchase ----
    console.log("\n4. State transition (FR21, FR25)");
    const b2 = await balance();
    const tx2 = await txCount();
    await buy({ amount: 25 });
    await buy({ amount: 50 });
    check("ST-CR-1", "two purchases (25, then 50) -> balance +75, two separate transactions",
      (await balance()) === b2 + 75 && (await txCount()) === tx2 + 2);
    const b3 = await balance();
    const tx3 = await txCount();
    await buy({ cardNumber: "4242424242424241" });
    check("ST-CR-2", "a rejected purchase -> balance and transactions unchanged",
      (await balance()) === b3 && (await txCount()) === tx3);

    // ---- 5. Error guessing ----
    console.log("\n5. Error guessing (FR21, FR22)");
    const typo = await buy({ cardNumber: "4242424242424241" });
    check("EG-CR-1 / DT-CR-2", "one mistyped digit -> rejected as not valid", typo.status === 400 && typo.data.error === "Card number is not valid",
      `${typo.status} ${typo.data.error}`);
    const swapped = await buy({ cardNumber: "2442424242424242" });
    check("EG-CR-2", "two neighbouring digits swapped -> rejected", swapped.status === 400, `${swapped.status}`);
    const negative = await buy({ amount: -50 });
    check("EG-CR-3", "a negative amount (an attempt to remove credits) -> 400", negative.status === 400, `${negative.status}`);
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
