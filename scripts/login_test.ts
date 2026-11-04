// FR3, FR5, NFR3, NFR4: tests POST /api/login (needs the dev server running)
// Run: npx tsx scripts/login_test.ts
import "./env";
import oracledb from "oracledb";
import { getSessionUserId } from "../lib/session";

const BASE = "http://localhost:3000";
const INVALID = "Invalid email or password";

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

// Sends a POST and returns the status, the message and the session cookie
async function post(path: string, body: unknown, opts: { ip?: string; raw?: string } = {}) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": opts.ip ?? nextIp() },
    body: opts.raw !== undefined ? opts.raw : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith("foodie_session=")) ?? "";
  return { status: res.status, message: data.error ?? data.message ?? "", cookie };
}

// Creates a test account through the real signup endpoint
async function register(password: string) {
  const account = {
    id: "TST" + rand(),
    name: "Login Test",
    email: `tst${rand().toLowerCase()}@blackbox.test`,
    password,
    phone: "+573001234567",
    address: "Calle 14 #8-32, Pereira",
    emailOptIn: false,
  };
  const res = await post("/api/signup", account);
  if (res.status !== 201) throw new Error(`Setup failed: signup returned ${res.status}`);
  return account;
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
    const user = await register("Passw0rd!x");

    // FR3, FR5: a correct login returns 200 and a 7-day HttpOnly session cookie
    const ok = await post("/api/login", { email: user.email, password: user.password });
    check("L-1", "correct email and password -> 200", ok.status === 200, `got ${ok.status}`);
    check("L-2", "cookie is HttpOnly and lasts 7 days",
      /httponly/i.test(ok.cookie) && /max-age=604800/i.test(ok.cookie), ok.cookie || "no cookie");
    const token = ok.cookie.split(";")[0].split("=")[1];
    check("L-3", "cookie's token maps to this user's session in the database",
      (await getSessionUserId(token)) === user.id);

    // FR3: a wrong password and an unknown email get the same answer
    const wrong = await post("/api/login", { email: user.email, password: "WrongPass1!" });
    check("L-4", "wrong password -> 401 generic message",
      wrong.status === 401 && wrong.message === INVALID, `${wrong.status} "${wrong.message}"`);
    const unknown = await post("/api/login", { email: "nobody@blackbox.test", password: "Passw0rd!x" });
    check("L-5", "unknown email -> same 401 and message",
      unknown.status === 401 && unknown.message === INVALID, `${unknown.status} "${unknown.message}"`);

    // FR3: email case does not matter
    const upper = await post("/api/login", { email: user.email.toUpperCase(), password: user.password });
    check("L-6", "email in different case -> 200", upper.status === 200, `got ${upper.status}`);

    // Bad requests get a 400
    const missing = await post("/api/login", { email: user.email });
    check("L-7", "missing password -> 400", missing.status === 400, `got ${missing.status}`);
    const broken = await post("/api/login", null, { raw: '{"email":' });
    check("L-8", "malformed JSON -> 400", broken.status === 400, `got ${broken.status}`);

    // NFR3: bcrypt ignores bytes past 72, so a longer guess must still fail
    const longUser = await register("a".repeat(72));
    const longGuess = await post("/api/login", { email: longUser.email, password: "a".repeat(72) + "x" });
    check("L-9", "real 72-byte password + 1 extra character -> 401",
      longGuess.status === 401, `got ${longGuess.status}`);

    // NFR4: the sixth attempt from one IP within the hour is blocked
    const ip = nextIp();
    for (let i = 0; i < 5; i++) await post("/api/login", { email: user.email, password: "WrongPass1!" }, { ip });
    const sixth = await post("/api/login", { email: user.email, password: user.password }, { ip });
    check("L-10", "6th attempt from one IP -> 429, even with the right password",
      sixth.status === 429, `got ${sixth.status}`);
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