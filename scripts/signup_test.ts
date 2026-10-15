import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
import oracledb from "oracledb";

const URL = "http://localhost:3000/api/signup";

let passed = 0;
let failed = 0;
let db: oracledb.Connection;

let ipCounter = 0;
const nextIp = () => `10.20.30.${++ipCounter}`;

const rand = () => Math.random().toString(36).slice(2, 10).toUpperCase();

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    id: "TST" + rand(),
    name: "Test User",
    email: `tst${rand().toLowerCase()}@blackbox.test`,
    password: "Passw0rd!x",
    phone: "+573001234567",
    address: "Calle 14 #8-32, Pereira",
    whatsappOptIn: true,
    ...overrides,
  };
}

async function post(body: unknown, opts: { ip?: string; raw?: string } = {}) {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": opts.ip ?? nextIp(),
    },
    body: opts.raw !== undefined ? opts.raw : JSON.stringify(body),
  });
  return { status: res.status, headers: res.headers };
}

function check(id: string, description: string, expected: string, actual: string) {
  const ok = expected === actual;
  ok ? passed++ : failed++;
  const tag = ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`${tag}  ${id.padEnd(6)} ${description}${ok ? "" : `  [expected ${expected}, got ${actual}]`}`);
}

async function expectStatus(id: string, description: string, body: unknown, expected: number) {
  const res = await post(body);
  check(id, description, String(expected), String(res.status));
}

async function main() {
  db = await oracledb.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING,
  });

  const cleanup = async () => {
    await db.execute("DELETE FROM users WHERE id LIKE 'TST%'");
    await db.commit();
  };
  await cleanup();

  try {
    console.log("\n1. Equivalence partitioning");

    const existing = validBody();
    await expectStatus("EP-1", "all fields valid", existing, 201);
    await expectStatus("EP-2", "email without @", validBody({ email: "notanemail.test" }), 400);
    await expectStatus("EP-3", "phone with letters", validBody({ phone: "30012abc45" }), 400);
    await expectStatus("EP-4", "required field missing (no name)", validBody({ name: "" }), 400);
    await expectStatus("EP-5", "email already registered", validBody({ email: existing.email }), 409);

    console.log("\n2. Boundary value analysis (phone: 7-15 digits)");

    await expectStatus("BV-1", "6 digits (just below minimum)", validBody({ phone: "123456" }), 400);
    await expectStatus("BV-2", "7 digits (minimum)", validBody({ phone: "1234567" }), 201);
    await expectStatus("BV-3", "15 digits (maximum)", validBody({ phone: "1".repeat(15) }), 201);
    await expectStatus("BV-4", "16 digits (just above maximum)", validBody({ phone: "1".repeat(16) }), 400);
    await expectStatus("BV-5", "name of 130 characters (column holds 120)", validBody({ name: "A".repeat(130) }), 400);

    console.log("\n3. Decision table (signup rules)");

    const dup = validBody();
    await post(dup); 

    await expectStatus("D1", "fields missing -> 400", { id: "TST" + rand() }, 400);
    await expectStatus("D2", "format invalid -> 400", validBody({ email: "bad" }), 400);
    await expectStatus("D3", "email registered -> 409", validBody({ email: dup.email }), 409);
    await expectStatus("D4", "all conditions met -> 201", validBody(), 201);

    console.log("\n4. State transition (rate limiter: Open -> Blocked)");

    const ip = nextIp();
    let allOpen = true;
    for (let i = 1; i <= 5; i++) {
      const res = await post({}, { ip });
      if (res.status === 429) allOpen = false;
    }
    check("ST-1", "attempts 1-5 stay in Open", "none blocked", allOpen ? "none blocked" : "blocked early");

    const sixth = await post({}, { ip });
    check("ST-2", "6th attempt moves to Blocked", "429", String(sixth.status));

    const seventh = await post({}, { ip });
    check("ST-3", "further attempts stay Blocked", "429", String(seventh.status));

    const otherIp = await post({}, { ip: nextIp() });
    check("ST-4", "a different IP is unaffected", "not 429", otherIp.status === 429 ? "429" : "not 429");

    console.log("\n5. Error guessing");

    const malformed = await post(null, { raw: '{"id":' });
    check("EG-1", "malformed JSON body", "400", String(malformed.status));

    const sqlName = "Robert'); DROP TABLE users;--";
    const sqlRes = await post(validBody({ name: sqlName }));
    const tableAlive = await db
      .execute("SELECT COUNT(*) FROM users")
      .then(() => true)
      .catch(() => false);
    check("EG-2", "SQL text in the name is stored, not executed",
      "201 and table intact",
      `${sqlRes.status} and table ${tableAlive ? "intact" : "MISSING"}`);

    const optInBody = validBody({ whatsappOptIn: "false" });
    await post(optInBody);
    const optInRow = await db.execute(
      "SELECT whatsapp_opt_in FROM users WHERE id = :id",
      { id: optInBody.id }
    );
    const optInStored = (optInRow.rows as unknown[][])[0]?.[0];
    check("EG-3", 'opt-in sent as the text "false"',
      "not opted in",
      optInStored === 1 ? "opted in" : "not opted in");

    const extraBody = validBody({ creditBalance: 99999 });
    await post(extraBody);
    const balRow = await db.execute(
      "SELECT credit_balance FROM users WHERE id = :id",
      { id: extraBody.id }
    );
    const balance = (balRow.rows as unknown[][])[0]?.[0];
    check("EG-4", "extra fields in the body are ignored", "balance 0", `balance ${balance ?? "none"}`);

    const getRes = await fetch(URL, { method: "GET" });
    check("EG-5", "GET on a POST-only endpoint", "405", String(getRes.status));
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