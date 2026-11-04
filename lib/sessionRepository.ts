import { getConnection } from "./db";

// FR5: store a session; Oracle sets the expiry via SYSDATE + days, so one clock decides
export async function insertSession(idHash: string, userId: string, days: number): Promise<void> {
  const connection = await getConnection();
  try {
    await connection.execute(
      `INSERT INTO sessions (id, user_id, expires_at) VALUES (:id, :userId, SYSDATE + :days)`,
      { id: idHash, userId, days },
      { autoCommit: true }
    );
  } finally {
    await connection.close();
  }
}

// FR5: the user of a session that has not expired yet
export async function findSessionUserId(idHash: string): Promise<string | null> {
  const connection = await getConnection();
  try {
    const result = await connection.execute(
      `SELECT user_id FROM sessions WHERE id = :id AND expires_at > SYSDATE`,
      { id: idHash }
    );
    const rows = result.rows as unknown[][];
    return rows.length > 0 ? String(rows[0][0]) : null;
  } finally {
    await connection.close();
  }
}

// FR7: delete a session so its token stops working immediately
export async function deleteSession(idHash: string): Promise<void> {
  const connection = await getConnection();
  try {
    await connection.execute(
      `DELETE FROM sessions WHERE id = :id`,
      { id: idHash },
      { autoCommit: true }
    );
  } finally {
    await connection.close();
  }
}