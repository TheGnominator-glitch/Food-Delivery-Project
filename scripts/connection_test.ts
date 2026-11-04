// Checks that Oracle is reachable with the credentials in .env.local
// Run: npx tsx scripts/connection_test.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import oracledb from "oracledb";

// Lists the tables the user owns; seeing all 18 confirms the connection, the credentials and the schema
async function testConnection() {
  try {
    const connection = await oracledb.getConnection({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      connectString: process.env.DB_CONNECT_STRING,
    });

    console.log("Connected");

    const result = await connection.execute(
      "SELECT table_name FROM user_tables ORDER BY table_name"
    );

    const rows = result.rows as unknown[][];
    rows.forEach((row) => console.log(row[0]));

    await connection.close();
  } catch (err) {
    console.error("Failed:", (err as Error).message);
  }
}

testConnection();