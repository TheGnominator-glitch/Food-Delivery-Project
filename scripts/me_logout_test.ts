// FR5, FR7: tests GET /api/me and POST /api/logout (needs the dev server running)
// Run: npx tsx scripts/me_logout_test.ts
import "./env";
import oracledb from "oracledb";

const BASE = "http://localhost:3000";

let passed = 0;
let failed = 0;

// A fake client IP per request, so the rate limiter (NFR4) does not interfere; random per run
const ipPrefix = `10.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
let ipCounter = 0;
const nextIp = () => `${ipPrefix}.${++ipCounter}`;

const rand = () => Math.random().toString(36).slice(2, 10).toUpperCase();

function check(id: string, description: string, ok: boolean, detail = "") {
  ok ? passed++ : failed++;
  const tag = ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`${tag}  ${id.padEnd(5)} ${description}${ok ? "" : `  [${detail}]`}`);
}

// Sends a request, optionally with a session cookie, and returns the status, body and cookie
async function call(method: string, path: string, opts: { body?: unknown; token?: string } = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": nextIp() };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token !== undefined) headers["Cookie"] = `foodie_session=${opts.token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith("foodie_session=")) ?? "";
  return { status: res.status, text, cookie };
}

async function main() {
  const db = await oracledb.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING,
  });

  // Deletes test sessions and users (IDs starting with TST), sessions first
  const cleanup = async () => {
    await db.execute("DELETE FROM sessions WHERE user_id LIKE 'TST%'");
    await db.execute("DELETE FROM users WHERE id LIKE 'TST%'");
    await db.commit();
  };
  await cleanup();

  try {

    // FR5: without a valid session, /api/me answers 401
    const noCookie = await call("GET", "/api/me");
    check("M-1", "/api/me with no cookie -> 401", noCookie.status === 401, `got ${noCookie.status}`);
    const forged = await call("GET", "/api/me", { token: "f".repeat(64) });
    check("M-2", "/api/me with a made-up token -> 401", forged.status === 401, `got ${forged.status}`);


    // Setup: signup logs the user in, so its cookie is the session under test
    const account = {
      id: "TST" + rand(),
      name: "Session Flow Test",
      email: `tst${rand().toLowerCase()}@blackbox.test`,
      password: "Passw0rd!x",
      phone: "+573001234567",
      address: "Calle 14 #8-32, Pereira",
      emailOptIn: true,
    };

    const signup = await call("POST", "/api/signup", { body: account });
    const token = signup.cookie.split(";")[0].split("=")[1];
    if (signup.status !== 201 || !token) {
      throw new Error(`Setup failed: signup returned ${signup.status} with ${token ? "a" : "no"} cookie`);
    }

    // FR5: the session works, and the response never contains the password or its hash
    const me = await call("GET", "/api/me", { token });
    const user = me.status === 200 ? JSON.parse(me.text).user : null;
    check("M-3", "signup's session works: /api/me -> 200 and the right user",
      user?.id === account.id && user?.email === account.email && user?.emailOptIn === true,
      `${me.status} ${me.text}`);
    check("M-4", "/api/me never includes the password or its hash",
      !/password/i.test(me.text) && !me.text.includes("$2"), me.text);

    // FR7: logout clears the cookie, kills the token on the server and deletes the row
    const logout = await call("POST", "/api/logout", { token });
    check("O-1", "logout -> 200 and the cookie is cleared",
      logout.status === 200 && /max-age=0/i.test(logout.cookie), `${logout.status} ${logout.cookie}`);

    const after = await call("GET", "/api/me", { token });
    check("O-2", "the old token no longer works after logout (dead on the server)",
      after.status === 401, `got ${after.status}`);

    const rows = await db.execute("SELECT COUNT(*) FROM sessions WHERE user_id = :id", { id: account.id });
    const count = Number((rows.rows as unknown[][])[0][0]);
    check("O-3", "the session row is gone from the database", count === 0, `${count} rows left`);

    // FR7: logging out without a session is harmless, and logout only accepts POST
    const noSession = await call("POST", "/api/logout");
    check("O-4", "logout without being logged in -> 200, harmless", noSession.status === 200, `got ${noSession.status}`);

    const getLogout = await call("GET", "/api/logout");
    check("O-5", "GET /api/logout -> 405 (logout is POST only)", getLogout.status === 405, `got ${getLogout.status}`);
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