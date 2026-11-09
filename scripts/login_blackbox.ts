// FR3, FR5: black-box tests for POST /api/login, using the five techniques.
// About half of roughly 20 candidate cases, chosen for coverage of the requirement.
// Needs the dev server running. Run: npx tsx scripts/login_blackbox.ts

import "./env";
import oracledb from "oracledb";

const BASE = "http://localhost:3000";
const INVALID = "Invalid email or password";

let passed = 0;
let failed = 0;

// A fake client IP per request, so the rate limiter does not interfere; random per run
const ipPrefix = `10.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
let ipCounter = 0;
const nextIp = () => `${ipPrefix}.${++ipCounter}`;

const rand = () => Math.random().toString(36).slice(2, 10).toUpperCase();

interface Reply {
  status: number;
  message: string;
  cookie: string;
  body: string;
}

// Sends a request (optionally with a session cookie) and returns the status, message, cookie and body
async function call(method: string, path: string, opts: { body?: unknown; token?: string } = {}): Promise<Reply> {
  const headers: Record<string, string> = { "x-forwarded-for": nextIp() };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers["Cookie"] = `foodie_session=${opts.token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let message = "";
  try {
    const data = JSON.parse(text);
    message = data.error ?? data.message ?? "";
  } catch {}
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith("foodie_session=")) ?? "";
  return { status: res.status, message, cookie, body: text };
}

const login = (email: unknown, password: unknown) =>
  call("POST", "/api/login", { body: { email, password } });
const tokenOf = (r: Reply) => r.cookie.split(";")[0].split("=")[1] ?? "";

// Compares the expected and actual results and prints PASS or FAIL
function check(id: string, description: string, ok: boolean, detail = "") {
  ok ? passed++ : failed++;
  const tag = ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`${tag}  ${id.padEnd(17)} ${description}${ok ? "" : `  [${detail}]`}`);
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
    // Setup: one registered account
    const user = {
      id: "TST" + rand(),
      name: "Login Blackbox",
      email: `tst${rand().toLowerCase()}@blackbox.test`,
      password: "Passw0rd!x",
      phone: "+573001234567",
      address: "Calle 14 #8-32, Pereira",
      emailOptIn: false,
    };
    const signup = await call("POST", "/api/signup", { body: user });
    if (signup.status !== 201) throw new Error(`Setup failed: signup returned ${signup.status}`);

    // ---- 1. Equivalence partitioning (FR3), also the decision table rules ----
    console.log("\n1. Equivalence partitioning (FR3)");
    const valid = await login(user.email, user.password);
    check("EP-L-1 / DT-L-4", "registered email + correct password -> logged in",
      valid.status === 200 && valid.cookie !== "", `${valid.status}`);

    const upper = await login(user.email.toUpperCase(), user.password);
    check("EP-L-2", "same email in upper case -> logged in", upper.status === 200, `${upper.status}`);

    const wrong = await login(user.email, "WrongPass1!");
    check("EP-L-3 / DT-L-3", "registered email + wrong password -> 401 generic message",
      wrong.status === 401 && wrong.message === INVALID, `${wrong.status} "${wrong.message}"`);

    const unknown = await login(`tst${rand().toLowerCase()}@blackbox.test`, user.password);
    check("EP-L-4 / DT-L-2", "unregistered email -> the same 401 and message",
      unknown.status === 401 && unknown.message === INVALID, `${unknown.status} "${unknown.message}"`);

    const noPassword = await call("POST", "/api/login", { body: { email: user.email } });
    check("EP-L-5 / DT-L-1", "password missing -> 400", noPassword.status === 400, `${noPassword.status}`);

    // ---- 2. Boundary value analysis (FR3): the "required" boundary, 0 vs 1 character ----
    console.log("\n2. Boundary value analysis (FR3)");
    const empty = await login(user.email, "");
    check("BV-L-1", "password of 0 characters -> 400 (missing)", empty.status === 400, `${empty.status}`);
    const oneChar = await login(user.email, "x");
    check("BV-L-2", "password of 1 character -> 401 (present, wrong)", oneChar.status === 401, `${oneChar.status}`);

    // ---- 3. Decision table: rules DT-L-1 to DT-L-4 are covered by the EP cases above ----
    // Conditions: both fields present / email registered / password correct
    //   DT-L-1: N - -  -> 400     DT-L-2: Y N -  -> 401
    //   DT-L-3: Y Y N  -> 401     DT-L-4: Y Y Y  -> 200

    // ---- 4. State transition (FR5): logged out -> logged in ----
    console.log("\n4. State transition (FR5)");
    const me = await call("GET", "/api/me", { token: tokenOf(valid) });
    const meUser = me.status === 200 ? JSON.parse(me.body).user : null;
    check("ST-L-1", "after login, the session gives access as that user",
      meUser?.id === user.id, `${me.status} ${me.body}`);

    const second = await login(user.email, user.password);
    const meFirst = await call("GET", "/api/me", { token: tokenOf(valid) });
    const meSecond = await call("GET", "/api/me", { token: tokenOf(second) });
    check("ST-L-2", "logging in again (a second device) gives a separate session; both work",
      tokenOf(second) !== tokenOf(valid) && meFirst.status === 200 && meSecond.status === 200,
      `${meFirst.status} / ${meSecond.status}`);

    // ---- 5. Error guessing ----
    console.log("\n5. Error guessing");
    const injection = await login("' OR '1'='1", "' OR '1'='1");
    check("EG-L-1", "SQL text as email and password -> not logged in",
      injection.status === 401 && injection.cookie === "", `${injection.status}`);
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
