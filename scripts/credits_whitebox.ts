// FR20-FR22, FR25: white-box tests for credits, one test per basis path of each graph:
// POST /api/credits/purchase (V(G) = 12), passesLuhn (4), parseExpiry (3) and safeReturnTo (2),
// plus MC/DC for the amount rule (D5) and for safeReturnTo's compound check. Graph: diagrams/cfg/credits_cfg.png
// Paths that need the database to fail are checked by scripts/outage_check.ts.
// Needs the dev server running. Run: npx tsx scripts/credits_whitebox.ts

import "./env";
import oracledb from "oracledb";
import { parseExpiry, passesLuhn } from "../lib/card";
import { safeReturnTo } from "../lib/navigation";

const BASE = "http://localhost:3000";
const CARD = "4242424242424242";

let passed = 0;
let failed = 0;
let noted = 0;

const ipPrefix = `10.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
let ipCounter = 0;
const nextIp = () => `${ipPrefix}.${++ipCounter}`;
const rand = () => Math.random().toString(36).slice(2, 10).toUpperCase();

// Expiry dates relative to today, as MM/YY
const mmyy = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear() % 100).padStart(2, "0")}`;
const today = new Date();
const LAST_MONTH = mmyy(new Date(today.getFullYear(), today.getMonth() - 1, 1));
const FUTURE = mmyy(new Date(today.getFullYear() + 2, 11, 1));

function check(id: string, path: string, ok: boolean, detail = "") {
  ok ? passed++ : failed++;
  const tag = ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`${tag}  ${id.padEnd(11)} ${path}${ok ? "" : `  [${detail}]`}`);
}

// A path that cannot be run from here, with the reason and where it is verified instead
function note(id: string, path: string, reason: string) {
  noted++;
  console.log(`\x1b[33mNOTE\x1b[0m  ${id.padEnd(11)} ${path}  [${reason}]`);
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

const AMOUNT_RULE = "amount must be a whole number of credits from 1 to 1000";

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
    // Setup: one account, registered through the real signup endpoint (which also logs it in)
    const account = {
      id: "TST" + rand(),
      name: "Credits Whitebox",
      email: `tst${rand().toLowerCase()}@whitebox.test`,
      password: "Passw0rd!x",
      phone: "+573001234567",
      address: "Calle 14 #8-32, Pereira",
      emailOptIn: false,
    };
    const signup = await call("POST", "/api/signup", { body: account });
    const token = signup.cookie.split(";")[0].split("=")[1];
    if (signup.status !== 201 || !token) throw new Error(`Setup failed: signup returned ${signup.status}`);

    const buy = (body: unknown, t: string = token) => call("POST", "/api/credits/purchase", { body, token: t });
    const card = (overrides: Record<string, unknown> = {}) =>
      ({ amount: 25, cardNumber: CARD, expiry: FUTURE, securityCode: "123", ...overrides });

    console.log("\nPOST /api/credits/purchase (V(G) = 12)");
    note("CP-CR-01", "D1(T) -> R1", "needs the database down: verified by outage_check.ts");
    check("CP-CR-02", "D2(T) -> R2: no session -> 401", is(await buy(card(), ""), 401, "Not logged in"));
    check("CP-CR-03", "D3(T) -> R3: malformed JSON -> 400",
      is(await call("POST", "/api/credits/purchase", { raw: '{"amount":', token }), 400, "Request body is not valid JSON"));
    check("CP-CR-04", "D4(T) -> R4: body [] -> 400", is(await buy([]), 400, "Request body must be a JSON object"));
    check("CP-CR-05", "D5(T) -> R5: amount 0 -> 400", is(await buy(card({ amount: 0 })), 400, AMOUNT_RULE));
    check("CP-CR-06", "D6(T) -> R6: card number missing -> 400",
      is(await buy(card({ cardNumber: undefined })), 400, "Card number, expiry and security code are required"));
    check("CP-CR-07", "D7(T) -> R7: 15 digits -> 400",
      is(await buy(card({ cardNumber: CARD.slice(1) })), 400, "Card number must be 16 digits"));
    check("CP-CR-08", "D8(T) -> R8: Luhn check fails -> 400",
      is(await buy(card({ cardNumber: "4242424242424241" })), 400, "Card number is not valid"));
    check("CP-CR-09", "D9(T) -> R9: expiry 1/30 (not MM/YY) -> 400",
      is(await buy(card({ expiry: "1/30" })), 400, "Expiry must be a month and year as MM/YY"));
    check("CP-CR-10", `D10(T) -> R10: last month (${LAST_MONTH}) -> 400`,
      is(await buy(card({ expiry: LAST_MONTH })), 400, "Card has expired"));
    check("CP-CR-11", "D11(T) -> R11: security code 12 -> 400",
      is(await buy(card({ securityCode: "12" })), 400, "Security code must be 3 digits"));

    const before = await db.execute(
      "SELECT credit_balance, (SELECT COUNT(*) FROM credit_transaction WHERE user_id = :id) FROM users WHERE id = :id",
      { id: account.id }
    );
    const [balanceBefore, txBefore] = (before.rows as unknown[][])[0].map(Number);
    const ok = await buy(card({ amount: 25 }));
    const after = await db.execute(
      `SELECT u.credit_balance, t.amount, t.transaction_type,
              (SELECT COUNT(*) FROM credit_transaction WHERE user_id = :id)
       FROM users u
       JOIN credit_transaction t ON t.user_id = u.id
       WHERE u.id = :id
       ORDER BY t.id DESC FETCH FIRST 1 ROWS ONLY`,
      { id: account.id }
    );
    const [balanceAfter, txAmount, txType, txAfter] = (after.rows as unknown[][])[0];
    check("CP-CR-12", "D1-D11(F) -> R12: valid -> 201, balance +25 and one 'purchase' row of 25",
      is(ok, 201, "Credits added") && ok.data.creditBalance === balanceBefore + 25 &&
        Number(balanceAfter) === balanceBefore + 25 && Number(txAmount) === 25 && txType === "purchase" &&
        Number(txAfter) === txBefore + 1,
      `${show(ok)} balance ${balanceBefore} -> ${balanceAfter}, tx ${txBefore} -> ${txAfter}`);

    console.log("\nMC/DC for D5: not a number || not whole || below 1 || above 1000");
    check("MC-CR-D5-1", "F F F F: 25 -> accepted", (await buy(card({ amount: 25 }))).status === 201);
    check("MC-CR-D5-2", 'T - - -: "25" (text) -> rejected', is(await buy(card({ amount: "25" })), 400, AMOUNT_RULE));
    check("MC-CR-D5-3", "F T - -: 2.5 -> rejected", is(await buy(card({ amount: 2.5 })), 400, AMOUNT_RULE));
    check("MC-CR-D5-4", "F F T -: 0 -> rejected", is(await buy(card({ amount: 0 })), 400, AMOUNT_RULE));
    check("MC-CR-D5-5", "F F F T: 1001 -> rejected", is(await buy(card({ amount: 1001 })), 400, AMOUNT_RULE));

    console.log("\npassesLuhn (V(G) = 4)");
    check("CP-LU-1", "D1(F): no digits -> the loop never runs -> true (the route's 16-digit check comes first)",
      passesLuhn("") === true);
    check("CP-LU-2", "D1(T) D2(F): one digit, not doubled -> 5 is not a multiple of 10", passesLuhn("5") === false);
    check("CP-LU-3", "D2(T) D3(F): doubled digit stays at 9 or less -> 8 + (1x2) = 10", passesLuhn("18") === true);
    check("CP-LU-4", "D2(T) D3(T): doubled digit passes 9 -> 9 + (5x2-9) = 10", passesLuhn("59") === true);

    console.log("\nparseExpiry (V(G) = 3)");
    check("CP-PE-1", "D1(T) -> R1: 1/30 is not MM/YY -> null", parseExpiry("1/30") === null);
    check("CP-PE-2", "D1(F) D2(T) -> R2: 13/30 is not a real month -> null", parseExpiry("13/30") === null);
    const parsed = parseExpiry("12/30");
    check("CP-PE-3", "D1-D2(F) -> R3: 12/30 -> month 12, year 2030",
      parsed?.month === 12 && parsed?.year === 2030, JSON.stringify(parsed));

    console.log("\nsafeReturnTo (V(G) = 2), with MC/DC: missing || not / || // || /\\");
    check("CP-SR-1 / MC-SR-2", "T - - -: nothing -> /home", safeReturnTo(null) === "/home");
    check("CP-SR-2 / MC-SR-1", "F F F F: /checkout -> kept", safeReturnTo("/checkout") === "/checkout");
    check("MC-SR-3", "F T - -: checkout (no leading /) -> /home", safeReturnTo("checkout") === "/home");
    check("MC-SR-4", "F F T -: //evil.example (another site) -> /home", safeReturnTo("//evil.example") === "/home");
    check("MC-SR-5", "F F F T: /\\evil.example (another site) -> /home", safeReturnTo("/\\evil.example") === "/home");
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
