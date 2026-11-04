
// FR5, FR7: tests the session helpers in lib/session.ts directly, without the web server (needs only Oracle)
// Run: npx tsx scripts/session_test.ts
import "./env";
import crypto from "crypto";
import oracledb from "oracledb";
import { createSession, getSessionUserId, endSession } from "../lib/session";

// A throwaway user that only exists during the test
const USER_ID = "TSTSESSION1";
let passed = 0;
let failed = 0;

function check(id: string, description: string, ok: boolean, detail = "") {
  ok ? passed++ : failed++;
  const tag = ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`${tag}  ${id.padEnd(5)} ${description}${ok ? "" : `  [${detail}]`}`);
}

async function main() {
  const db = await oracledb.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING,
  });

  // Removes the test user and its sessions (sessions first, since they point at the user)
  const cleanup = async () => {
    await db.execute("DELETE FROM sessions WHERE user_id = :id", { id: USER_ID });
    await db.execute("DELETE FROM users WHERE id = :id", { id: USER_ID });
    await db.commit();
  };

  await cleanup();
  await db.execute(
    `INSERT INTO users (id, name, email, password_hash, phone, address)
     VALUES (:id, 'Session Test', 'tstsession@blackbox.test', 'not-a-real-hash', '+573001234567', 'Test address')`,
    { id: USER_ID }
  );
  await db.commit();

  try {
    // FR5: a new session gets a long random token
    const token = await createSession(USER_ID);
    check("S-1", "createSession returns a 64-character token", token.length === 64, `length ${token.length}`);

    // FR5: the database stores only the hash, and the session expires in 7 days
    const row = await db.execute(
      "SELECT id, ROUND(expires_at - SYSDATE, 2) FROM sessions WHERE user_id = :id",
      { id: USER_ID }
    );
    const [storedId, daysLeft] = (row.rows as unknown[][])[0] ?? [];
    const expectedHash = crypto.createHash("sha256").update(token).digest("hex");
    check("S-2", "database stores the hash, never the token", storedId === expectedHash && storedId !== token, `stored ${storedId}`);
    check("S-3", "session expires in 7 days", Number(daysLeft) > 6.9 && Number(daysLeft) <= 7, `days left ${daysLeft}`);

    // FR5: a valid token finds the user; an unknown one finds nobody
    check("S-4", "valid token returns the user", (await getSessionUserId(token)) === USER_ID);
    check("S-5", "unknown token returns null", (await getSessionUserId("not-a-real-token")) === null);

    // FR5: an expired session counts as logged out
    await db.execute("UPDATE sessions SET expires_at = SYSDATE - 1 WHERE user_id = :id", { id: USER_ID });
    await db.commit();
    check("S-6", "expired session returns null", (await getSessionUserId(token)) === null);

    // FR7: ending a session removes it immediately
    const token2 = await createSession(USER_ID);
    await endSession(token2);
    const left = await db.execute(
      "SELECT COUNT(*) FROM sessions WHERE id = :id",
      { id: crypto.createHash("sha256").update(token2).digest("hex") }
    );
    const count = Number((left.rows as unknown[][])[0][0]);
    check("S-7", "endSession deletes the row and the token stops working",
      count === 0 && (await getSessionUserId(token2)) === null, `rows left ${count}`);
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