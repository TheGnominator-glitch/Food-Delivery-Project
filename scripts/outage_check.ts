// White-box exception paths: the routes must answer a clean 500 (never crash) when the database fails.
// No input can reach these paths, so they are verified with Oracle stopped:
//   1. Open Windows "Services" and stop OracleServiceXE
//   2. npx tsx scripts/outage_check.ts   (the dev server must be running)
//   3. Start OracleServiceXE again
// Each new module adds its exception paths here.

// Makes this file a module, so its names do not clash with the other scripts
export {};

const BASE = "http://localhost:3000";
const FAKE_TOKEN = "f".repeat(64);

let passed = 0;
let failed = 0;

const ipPrefix = `10.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
let ipCounter = 0;
const nextIp = () => `${ipPrefix}.${++ipCounter}`;

// Sends a request and returns the status and message
async function call(method: string, path: string, opts: { body?: unknown; token?: string } = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": nextIp() };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers["Cookie"] = `foodie_session=${opts.token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  return { status: res.status, message: data.error ?? data.message ?? "" };
}

function check(id: string, path: string, reply: { status: number; message: string }, message: string) {
  const ok = reply.status === 500 && reply.message === message;
  ok ? passed++ : failed++;
  const tag = ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  const detail = ok ? "" : `  [expected 500, got ${reply.status} "${reply.message}". Is Oracle stopped?]`;
  console.log(`${tag}  ${id.padEnd(9)} ${path}${detail}`);
}

async function main() {
  console.log("\nException paths (Oracle must be stopped)");

  // FR3: login, path 6
  check("CP-L-06", "POST /api/login: user lookup throws -> 500",
    await call("POST", "/api/login", { body: { email: "outage@whitebox.test", password: "Passw0rd!x" } }),
    "Something went wrong logging in");

  // FR5: session check, path 1 (needs a cookie, or no database call happens)
  check("CP-ME-1", "GET /api/me: session lookup throws -> 500",
    await call("GET", "/api/me", { token: FAKE_TOKEN }),
    "Something went wrong checking your session");

  // FR7: logout, path 1 (needs a cookie, or no database call happens)
  check("CP-LO-1", "POST /api/logout: ending the session throws -> 500",
    await call("POST", "/api/logout", { token: FAKE_TOKEN }),
    "Something went wrong logging out");

  // FR8-FR11: restaurant list, path 7
  check("CP-R-07", "GET /api/restaurants: the query throws -> 500",
    await call("GET", "/api/restaurants"),
    "Something went wrong loading restaurants");

  // FR10: categories, path 2
  check("CP-C-02", "GET /api/categories: the query throws -> 500",
    await call("GET", "/api/categories"),
    "Something went wrong loading categories");

  // FR12, FR13: menu, path 2
  check("CP-MR-2", "GET /api/restaurants/[id]: the menu lookup throws -> 500",
    await call("GET", "/api/restaurants/1"),
    "Something went wrong loading this menu");

  // FR15-FR17: cart, path 1 of each handler (with a cookie, so the session lookup reaches the database)
  check("CP-CG-1", "GET /api/cart: a database step throws -> 500",
    await call("GET", "/api/cart", { token: FAKE_TOKEN }),
    "Something went wrong loading your cart");
  check("CP-CP-01", "POST /api/cart: a database step throws -> 500",
    await call("POST", "/api/cart", { token: FAKE_TOKEN, body: { menuItemId: 1, quantity: 1 } }),
    "Something went wrong updating your cart");
  check("CP-CU-1", "PATCH /api/cart/[id]: a database step throws -> 500",
    await call("PATCH", "/api/cart/1", { token: FAKE_TOKEN, body: { quantity: 1 } }),
    "Something went wrong updating your cart");
  check("CP-CD-1", "DELETE /api/cart/[id]: a database step throws -> 500",
    await call("DELETE", "/api/cart/1", { token: FAKE_TOKEN }),
    "Something went wrong updating your cart");

  // FR21, FR22: buying credits, path 1 (with a cookie, so the session lookup reaches the database)
  check("CP-CR-01", "POST /api/credits/purchase: a database step throws -> 500",
    await call("POST", "/api/credits/purchase", {
      token: FAKE_TOKEN,
      body: { amount: 25, cardNumber: "4242424242424242", expiry: "12/30", securityCode: "123" },
    }),
    "Something went wrong buying credits");

  console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
}

main().catch((err) => {
  console.error("Run failed (is the dev server running?):", err);
  process.exit(1);
});
