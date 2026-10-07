import { getConnection } from "./db";

export interface NewUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  phone: string;
  address: string;
  whatsappOptIn: boolean;
}

export async function emailExists(email: string): Promise<boolean> {
  const connection = await getConnection();
  try {
    const result = await connection.execute(
      `SELECT id FROM users WHERE email = :email`,
      { email }
    );
    const rows = result.rows as unknown[][];
    return rows.length > 0;
  } finally {
    await connection.close();
  }
}

export async function createUser(user: NewUser): Promise<void> {
  const connection = await getConnection();
  try {
    await connection.execute(
      `INSERT INTO users (id, name, email, password_hash, phone, address, whatsapp_opt_in)
       VALUES (:id, :name, :email, :passwordHash, :phone, :address, :whatsappOptIn)`,
      {
        id: user.id,
        name: user.name,
        email: user.email,
        passwordHash: user.passwordHash,
        phone: user.phone,
        address: user.address,
        whatsappOptIn: user.whatsappOptIn ? 1 : 0,
      },
      { autoCommit: true }
    );
  } finally {
    await connection.close();
  }
}