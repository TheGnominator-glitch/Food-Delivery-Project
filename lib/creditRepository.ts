import { getConnection } from "./db";

// FR21, FR25: add the credits and record the purchase together, then return the new balance.
// Either both changes are saved or neither is, so the balance always matches the transaction history.
export async function purchaseCredits(userId: string, amount: number): Promise<number> {
  const connection = await getConnection();
  try {
    await connection.execute(
      `UPDATE users SET credit_balance = credit_balance + :amount WHERE id = :userId`,
      { amount, userId }
    );
    await connection.execute(
      `INSERT INTO credit_transaction (user_id, amount, transaction_type) VALUES (:userId, :amount, 'purchase')`,
      { userId, amount }
    );
    const result = await connection.execute(`SELECT credit_balance FROM users WHERE id = :userId`, { userId });
    await connection.commit();
    return Number((result.rows as unknown[][])[0][0]);
  } finally {
    await connection.close(); // closing without commit rolls back any partial change
  }
}
