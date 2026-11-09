// FR5, FR7: white-box tests for the session code, one test per basis path of each graph:
// GET /api/me (V(G) = 4), POST /api/logout (V(G) = 2), and the helpers getSessionUserId,
// findSessionUserId and endSession (V(G) = 2 each). Graph: diagrams/cfg/session_cfg.png
// Paths that need the database to fail are checked by scripts/outage_check.ts.
// Needs the dev server running. Run: npx tsx scripts/session_whitebox.ts

import "./env";
import crypto from "crypto";
import oracledb from "oracledb";
import { createSession, getSessionUserId, endSession } from "../lib/session";

const BASE = "http://localhost:3000";

let passed = 0;
let failed = 0;
let noted = 0;

const ipPrefix = `10.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
let ipCounter = 0;
const nextIp = () => `${ipPrefix}.${++ipCounter}`;

const rand = () => Math.random().toString(36).slice(2, 10).toUpperCase();
const hashOf = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

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

async function main() {
  const db = await oracledb.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING,
  });

  const countSessions = async (userId: string) => {
    const r = await db.execute("SELECT COUNT(*) FROM sessions WHERE user_id = :id", { id: userId });
    return Number((r.rows as unknown[][])[0][0]);
  };

  // Deletes test sessions and users (IDs starting with TST), sessions first
  const cleanup = async () => {
    await db.execute("DELETE FROM sessions WHERE user_id LIKE 'TST%'");
    await db.execute("DELETE FROM users WHERE id LIKE 'TST%'");
    await db.commit();
  };
  await cleanup();

  try {
    // Setup: one account, registered through the real signup endpoint (which also logs it in)
    const account = {
      id: "TST" + rand(),
      name: "Session Whitebox",
      email: `tst${rand().toLowerCase()}@whitebox.test`,
      password: "Passw0rd!x",
      phone: "+573001234567",
      address: "Calle 14 #8-32, Pereira",
      emailOptIn: false,
    };
    const signup = await call("POST", "/api/signup", { body: account });
    const token = signup.cookie.split(";")[0].split("=")[1];
    if (signup.status !== 201 || !token) throw new Error(`Setup failed: signup returned ${signup.status}`);

    console.log("\nGET /api/me (V(G) = 4)");
    note("CP-ME-1", "D1(T) -> R1", "needs the database down: verified by outage_check.ts");
    const noSession = await call("GET", "/api/me");
    check("CP-ME-2", "D1(F) D2(T) -> R2: no valid session -> 401", noSession.status === 401, `${noSession.status}`);
    note("CP-ME-3", "D2(F) D3(T) -> R3", "infeasible: the sessions foreign key stops a session outliving its user");
    const me = await call("GET", "/api/me", { token });
    const meUser = me.status === 200 ? JSON.parse(me.text).user : null;
    check("CP-ME-4", "D1-D3(F) -> R4: valid session -> 200 and the user", meUser?.id === account.id, `${me.status} ${me.text}`);

    console.log("\nPOST /api/logout (V(G) = 2)");
    note("CP-LO-1", "D1(T) -> R1", "needs the database down: verified by outage_check.ts");
    const logoutToken = await createSession(account.id);
    const logout = await call("POST", "/api/logout", { token: logoutToken });
    check("CP-LO-2", "D1(F) -> R2: 200 and the cookie cleared",
      logout.status === 200 && /max-age=0/i.test(logout.cookie), `${logout.status} ${logout.cookie}`);

    console.log("\ngetSessionUserId(token) (V(G) = 2)");
    check("CP-GS-1", "D1(T) -> R1: no token -> null", (await getSessionUserId(undefined)) === null);
    check("CP-GS-2", "D1(F) -> N1 -> R2: a token is looked up", (await getSessionUserId(token)) === account.id);

    console.log("\nfindSessionUserId(hash) (V(G) = 2), reached through getSessionUserId");
    check("CP-FS-1", "D1(T) -> R1: row found -> user id", (await getSessionUserId(token)) === account.id);
    check("CP-FS-2", "D1(F) -> R2: no row -> null", (await getSessionUserId("not-a-real-token")) === null);

    console.log("\nendSession(token) (V(G) = 2)");
    const before = await countSessions(account.id);
    await endSession(undefined);
    check("CP-ES-1", "D1(T) -> R1: no token -> nothing deleted", (await countSessions(account.id)) === before,
      `${before} before, ${await countSessions(account.id)} after`);
    const doomed = await createSession(account.id);
    await endSession(doomed);
    const left = await db.execute("SELECT COUNT(*) FROM sessions WHERE id = :id", { id: hashOf(doomed) });
    check("CP-ES-2", "D1(F) -> N1 -> R2: the session row is deleted",
      Number((left.rows as unknown[][])[0][0]) === 0);
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
