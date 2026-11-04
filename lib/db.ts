import oracledb from "oracledb";

// Database credentials, read from .env.local so they never appear in the code
const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectString: process.env.DB_CONNECT_STRING,
};

// Opens an Oracle connection; every repository gets its connection from here
export async function getConnection() {
  try {
    return await oracledb.getConnection(dbConfig);
  } catch (err) {
    console.error("Failed:", err);
    throw err;
  }
}