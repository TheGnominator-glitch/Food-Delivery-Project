import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
import oracledb from "oracledb";

const URL = "http://localhost:3000/api/signup";

let passed = 0;
let failed = 0;

const ipPrefix = `10.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
let ipCounter = 0;
const nextIp = () => `${ipPrefix}.${++ipCounter}`;

const rand = () => Math.random().toString(36).slice(2, 10).toUpperCase();

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "TST" + rand(),
    name: "Test User",
    email: `tst${rand().toLowerCase()}@whitebox.test`,
    password: "Passw0rd!x",
    phone: "+573001234567",
    address: "Calle 14 #8-32, Pereira",
    emailOptIn: true,
    ...overrides,
  };
}

const MSG = {
  R1: "Too many signup attempts. Please try again later.",
  R2: "Request body is not valid JSON",
  R3: "Request body must be a JSON object",
  R4: "All fields are required",
  R5: "One or more fields are too long",
  R6: "Invalid email format",
  R7: "Invalid phone number format",
  R8: "emailOptIn must be true or false",
  R9: "Email already exists",
  R10: "Something went wrong creating your account",
  R11: "Account created successfully",
};

interface Reply {
  status: number;
  message: string;
}

async function post(body: unknown, opts: { ip?: string; raw?: string } = {}): Promise<Reply> {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": opts.ip ?? nextIp(),
    },
    body: opts.raw !== undefined ? opts.raw : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  return { status: res.status, message: data.error ?? data.message ?? "" };
}

function check(id: string, path: string, reply: Reply, status: number, message: string) {
  const ok = reply.status === status && reply.message === message;
  ok ? passed++ : failed++;
  const tag = ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  const detail = ok ? "" : `  [expected ${status} "${message}", got ${reply.status} "${reply.message}"]`;
  console.log(`${tag}  ${id.padEnd(9)} ${path}${detail}`);
}

async function main() {
  const db = await oracledb.getConnection({
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

    const existing = validBody();
    await post(existing);

    console.log("\nBasis paths (V(G) = 11)");

    const ip = nextIp();
    for (let i = 0; i < 5; i++) await post({}, { ip });
    check("CP-CB-01", "D1(T) -> R1", await post({}, { ip }), 429, MSG.R1);

    check("CP-CB-02", "D1(F) D2(T) -> R2", await post(null, { raw: '{"id":' }), 400, MSG.R2);
    check("CP-CB-03", "D1-D2(F) D3(T) -> R3", await post([]), 400, MSG.R3);
    check("CP-CB-04", "D1-D3(F) D4(T) -> R4", await post(validBody({ name: "" })), 400, MSG.R4);
    check("CP-CB-05", "D1-D4(F) D5(T) -> R5", await post(validBody({ name: "A".repeat(121) })), 400, MSG.R5);
    check("CP-CB-06", "D1-D5(F) D6(T) -> R6", await post(validBody({ email: "bad" })), 400, MSG.R6);
    check("CP-CB-07", "D1-D6(F) D7(T) -> R7", await post(validBody({ phone: "12ab" })), 400, MSG.R7);
    check("CP-CB-08", "D1-D7(F) D8(T) -> R8", await post(validBody({ emailOptIn: "false" })), 400, MSG.R8);
    check("CP-CB-09", "D1-D8(F) D9(T) -> R9", await post(validBody({ email: existing.email })), 409, MSG.R9);

    check("CP-CB-10", "D1-D9(F) D10(T) -> R10", await post(validBody({ id: existing.id })), 500, MSG.R10);

    check("CP-CB-11", "D1-D10(F) -> R11", await post(validBody()), 201, MSG.R11);

    console.log("\nMC/DC for D3: typeof body !== 'object' || body === null || Array.isArray(body)");
    check("MC-D3-1", "F F F (object) -> continues to D4", await post({}), 400, MSG.R4);
    check("MC-D3-2", "T F F (text)", await post(null, { raw: '"hola"' }), 400, MSG.R3);
    check("MC-D3-3", "F T F (null)", await post(null, { raw: "null" }), 400, MSG.R3);
    check("MC-D3-4", "F F T (array)", await post([]), 400, MSG.R3);

    console.log("\nMC/DC for D8: emailOptIn !== undefined && typeof emailOptIn !== 'boolean'");
    const absent = validBody();
    delete absent.emailOptIn;
    check("MC-D8-1", "F T (absent) -> accepted", await post(absent), 201, MSG.R11);
    check("MC-D8-2", "T F (false) -> accepted", await post(validBody({ emailOptIn: false })), 201, MSG.R11);
    check("MC-D8-3", 'T T (text "false") -> rejected', await post(validBody({ emailOptIn: "false" })), 400, MSG.R8);
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