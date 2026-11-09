// FR5, FR7: black-box tests for the session check (GET /api/me) and logout (POST /api/logout),
// using the five techniques. About half of roughly 20 candidate cases.
// Needs the dev server running. Run: npx tsx scripts/session_blackbox.ts

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
  console.log(`${tag}  ${id.padEnd(18)} ${description}${ok ? "" : `  [${detail}]`}`);
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
  const text = await res.text();
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith("foodie_session=")) ?? "";
  return { status: res.status, text, cookie };
}

const tokenOf = (cookie: string) => cookie.split(";")[0].split("=")[1] ?? "";

async function main() {
  const db = await oracledb.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING,
  });

  const cleanup = async () => {
    await db.execute("DELETE FROM sessions WHERE user_id LIKE 'TST%'");
    await db.execute("DELETE FROM users WHERE id LIKE 'TST%'");
    await db.commit();
  };
  await cleanup();

  // Registers an account (which logs it in) and returns it with its session token
  async function register() {
    const account = {
      id: "TST" + rand(),
      name: "Session Blackbox",
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

  const meAs = (token?: string) => call("GET", "/api/me", { token });

  try {
    const a = await register();
    const b = await register();
    const c = await register();

    // ---- 1. Equivalence partitioning (FR5), also the decision table rules ----
    console.log("\n1. Equivalence partitioning (FR5)");
    const valid = await meAs(a.token);
    check("EP-SE-1 / DT-SE-4", "valid session -> 200 and that user",
      valid.status === 200 && JSON.parse(valid.text).user?.id === a.id, `${valid.status}`);
    const none = await meAs();
    check("EP-SE-2 / DT-SE-1", "no session cookie -> 401", none.status === 401, `${none.status}`);
    const invented = await meAs("a".repeat(64));
    check("EP-SE-3 / DT-SE-2", "a made-up token -> 401", invented.status === 401, `${invented.status}`);

    // ---- 2. Boundary value analysis (FR5): the moment a session expires ----
    console.log("\n2. Boundary value analysis (FR5)");
    await db.execute("UPDATE sessions SET expires_at = SYSDATE + 1/1440 WHERE user_id = :id", { id: b.id });
    await db.commit();
    const lastMinute = await meAs(b.token);
    check("BV-SE-1", "session expiring in 1 minute -> still logged in", lastMinute.status === 200, `${lastMinute.status}`);
    await db.execute("UPDATE sessions SET expires_at = SYSDATE - 1/1440 WHERE user_id = :id", { id: b.id });
    await db.commit();
    const justExpired = await meAs(b.token);
    check("BV-SE-2 / DT-SE-3", "session expired 1 minute ago -> 401", justExpired.status === 401, `${justExpired.status}`);

    // ---- 3. Decision table for GET /api/me: rules covered by the cases above ----
    // Conditions: cookie present / session exists / not expired
    //   DT-SE-1: N - -  -> 401    DT-SE-2: Y N -  -> 401
    //   DT-SE-3: Y Y N  -> 401    DT-SE-4: Y Y Y  -> 200

    // ---- 4. State transition (FR7): logged in -> logged out ----
    console.log("\n4. State transition (FR7)");
    const logout = await call("POST", "/api/logout", { token: a.token });
    const afterLogout = await meAs(a.token);
    check("ST-SE-1", "logout clears the cookie, and the old token stops working",
      logout.status === 200 && /max-age=0/i.test(logout.cookie) && afterLogout.status === 401,
      `${logout.status} / ${afterLogout.status}`);

    const second = await call("POST", "/api/login", { body: { email: c.email, password: c.password } });
    const cToken2 = tokenOf(second.cookie);
    await call("POST", "/api/logout", { token: c.token });
    const otherStillIn = await meAs(cToken2);
    check("ST-SE-2", "logging out of one session leaves another session active",
      otherStillIn.status === 200, `${otherStillIn.status}`);

    const anonymous = await call("POST", "/api/logout");
    check("ST-SE-3", "logging out without a session -> 200, harmless", anonymous.status === 200, `${anonymous.status}`);

    // ---- 5. Error guessing ----
    console.log("\n5. Error guessing");
    const tampered = cToken2.slice(0, -1) + (cToken2.endsWith("0") ? "1" : "0");
    const tamperedReply = await meAs(tampered);
    check("EG-SE-1", "a real token with one character changed -> 401", tamperedReply.status === 401, `${tamperedReply.status}`);
    const getLogout = await call("GET", "/api/logout");
    check("EG-SE-2", "GET /api/logout -> 405 (logout only accepts POST)", getLogout.status === 405, `${getLogout.status}`);
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
