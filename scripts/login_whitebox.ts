// FR3: white-box tests for POST /api/login. One test per basis path of its control flow graph (V(G) = 9),
// plus MC/DC for D8, the decision that grants access. Graph: diagrams/cfg/login_cfg.png
// Path 6 needs the database to fail, so it is checked by scripts/outage_check.ts.
// Needs the dev server running. Run: npx tsx scripts/login_whitebox.ts

import "./env";
import oracledb from "oracledb";

const BASE = "http://localhost:3000";

let passed = 0;
let failed = 0;
let noted = 0;

// A fake client IP per request, so the rate limiter does not interfere; random per run
const ipPrefix = `10.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
let ipCounter = 0;
const nextIp = () => `${ipPrefix}.${++ipCounter}`;

const rand = () => Math.random().toString(36).slice(2, 10).toUpperCase();

// The exact message each return node of the route answers with
const MSG = {
  R1: "Too many login attempts. Please try again later.",
  R2: "Request body is not valid JSON",
  R3: "Request body must be a JSON object",
  R4: "Email and password are required",
  R5: "Invalid email or password",
  R6: "Something went wrong logging in",
  R7: "Invalid email or password",
  R8: "Logged in",
};

interface Reply {
  status: number;
  message: string;
  cookie: string;
}

// Sends a POST and returns the status, the message and the session cookie (if any)
async function post(path: string, body: unknown, opts: { ip?: string; raw?: string } = {}): Promise<Reply> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": opts.ip ?? nextIp() },
    body: opts.raw !== undefined ? opts.raw : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith("foodie_session=")) ?? "";
  return { status: res.status, message: data.error ?? data.message ?? "", cookie };
}

// A path is confirmed by status and message, plus any extra condition the path guarantees
function check(id: string, path: string, reply: Reply, status: number, message: string, extra = true) {
  const ok = reply.status === status && reply.message === message && extra;
  ok ? passed++ : failed++;
  const tag = ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  const detail = ok ? "" : `  [expected ${status} "${message}", got ${reply.status} "${reply.message}"]`;
  console.log(`${tag}  ${id.padEnd(11)} ${path}${detail}`);
}

// A path that cannot be run from here, with the reason and where it is verified instead
function note(id: string, path: string, reason: string) {
  noted++;
  console.log(`\x1b[33mNOTE\x1b[0m  ${id.padEnd(11)} ${path}  [${reason}]`);
}

// Creates a test account through the real signup endpoint
async function register(password: string) {
  const account = {
    id: "TST" + rand(),
    name: "Login Whitebox",
    email: `tst${rand().toLowerCase()}@whitebox.test`,
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
    // Setup: one normal account, and one whose password is exactly 72 bytes
    const user = await register("Passw0rd!x");
    const longUser = await register("a".repeat(72));
    const unknownEmail = `tst${rand().toLowerCase()}@whitebox.test`;

    console.log("\nBasis paths (V(G) = 9)");

    // Path 1: five attempts fill the limit, and the sixth takes the rate-limit exit
    const ip = nextIp();
    for (let i = 0; i < 5; i++) await post("/api/login", { email: user.email, password: "WrongPass1!" }, { ip });
    check("CP-L-01", "D1(T) -> R1", await post("/api/login", { email: user.email, password: user.password }, { ip }), 429, MSG.R1);

    check("CP-L-02", "D1(F) D2(T) -> R2", await post("/api/login", null, { raw: '{"email":' }), 400, MSG.R2);
    check("CP-L-03", "D1-D2(F) D3(T) -> R3", await post("/api/login", []), 400, MSG.R3);
    check("CP-L-04", "D1-D3(F) D4(T) -> R4", await post("/api/login", { email: user.email }), 400, MSG.R4);

    // Path 5: the real password plus one byte. bcrypt alone would accept it (it ignores bytes past 72),
    // so a 401 here proves D5 took its exit
    check("CP-L-05", "D1-D4(F) D5(T) -> R5",
      await post("/api/login", { email: longUser.email, password: "a".repeat(73) }), 401, MSG.R5);

    // Path 6: only a database failure reaches the outer catch; no input can
    note("CP-L-06", "D1-D5(F) D6(T) -> R6", "needs the database down: verified by outage_check.ts");

    // Path 7: unknown email -> dummy hash -> rejected
    check("CP-L-07", "D6(F) D7(F) D8(T) -> R7",
      await post("/api/login", { email: unknownEmail, password: "Passw0rd!x" }), 401, MSG.R7);

    // Path 8: known email -> the user's hash -> wrong password -> rejected
    check("CP-L-08", "D6(F) D7(T) D8(T) -> R7",
      await post("/api/login", { email: user.email, password: "WrongPass1!" }), 401, MSG.R7);

    // Path 9: known email, right password -> session cookie
    const ok = await post("/api/login", { email: user.email, password: user.password });
    check("CP-L-09", "D6(F) D7(T) D8(F) -> R8", ok, 200, MSG.R8, ok.cookie !== "");

    console.log("\nMC/DC for D8: !user || !passwordMatches");
    const mc1 = await post("/api/login", { email: user.email, password: user.password });
    check("MC-L-D8-1", "F F (user found, password right) -> logged in", mc1, 200, MSG.R8, mc1.cookie !== "");
    // The dummy password matches the dummy hash, so only "no user" stops this login
    check("MC-L-D8-2", "T F (no user, dummy password matches) -> rejected",
      await post("/api/login", { email: unknownEmail, password: "dummy-password-for-timing" }), 401, MSG.R7);
    check("MC-L-D8-3", "F T (user found, password wrong) -> rejected",
      await post("/api/login", { email: user.email, password: "WrongPass1!" }), 401, MSG.R7);
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
