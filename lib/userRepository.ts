import { getConnection } from "./db";

// FR1: the fields stored for a new account
export interface NewUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  phone: string;
  address: string;
  emailOptIn: boolean;
}

// FR2: check for an existing email, ignoring upper/lower case, via LOWER()
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

// FR2: check for an existing CC
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

// FR1, FR34: insert the account, storing the email opt-in as 1 or 0
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

// FR3: what login needs: the user id and the password hash
export interface LoginUser {
  id: string;
  passwordHash: string;
}

// FR3: find an account by email, ignoring upper/lower case
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

// FR5: the user data the app may expose 
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  creditBalance: number;
  emailOptIn: boolean;
}

// FR5: load the logged-in user via an explicit column list, so password_hash is never read
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