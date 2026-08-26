import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import oracledb from "oracledb";

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