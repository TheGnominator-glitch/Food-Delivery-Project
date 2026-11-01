import { getConnection } from "./db";

export interface NewUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  phone: string;
  address: string;
  emailOptIn: boolean;
}

export async function emailExists(email: string): Promise<boolean> {
  const connection = await getConnection();
  try {
    const result = await connection.execute(
      `SELECT id FROM users WHERE LOWER(email) = LOWER(:email)`,
      { email }
    );
    const rows = result.rows as unknown[][];
    return rows.length > 0;
  } finally {
    await connection.close();
  }
}

export async function idExists(id: string): Promise<boolean> {
  const connection = await getConnection();
  try {
    const result = await connection.execute(
      `SELECT id FROM users WHERE id = :id`,
      { id }
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
      `INSERT INTO users (id, name, email, password_hash, phone, address, email_opt_in)
       VALUES (:id, :name, :email, :passwordHash, :phone, :address, :emailOptIn)`,
      {
        id: user.id,
        name: user.name,
        email: user.email,
        passwordHash: user.passwordHash,
        phone: user.phone,
        address: user.address,
        emailOptIn: user.emailOptIn ? 1 : 0,
      },
      { autoCommit: true }
    );
  } finally {
    await connection.close();
  }
}

export interface LoginUser {
  id: string;
  passwordHash: string;
}

export async function findUserForLogin(email: string): Promise<LoginUser | null> {
  const connection = await getConnection();
  try {
    const result = await connection.execute(
      `SELECT id, password_hash FROM users WHERE LOWER(email) = LOWER(:email)`,
      { email }
    );
    const rows = result.rows as unknown[][];
    if (rows.length === 0) return null;
    return { id: String(rows[0][0]), passwordHash: String(rows[0][1]) };
  } finally {
    await connection.close();
  }
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  creditBalance: number;
  emailOptIn: boolean;
}

export async function findUserById(id: string): Promise<PublicUser | null> {
  const connection = await getConnection();
  try {
    const result = await connection.execute(
      `SELECT id, name, email, phone, address, credit_balance, email_opt_in
       FROM users WHERE id = :id`,
      { id }
    );
    const rows = result.rows as unknown[][];
    if (rows.length === 0) return null;
    const [userId, name, email, phone, address, creditBalance, emailOptIn] = rows[0];
    return {
      id: String(userId),
      name: String(name),
      email: String(email),
      phone: String(phone),
      address: String(address),
      creditBalance: Number(creditBalance),
      emailOptIn: Number(emailOptIn) === 1,
    };
  } finally {
    await connection.close();
  }
}