import "./env";
import oracledb from "oracledb";
import { categories, restaurants, type SeedItem, type SeedRestaurant } from "../database/seed-data";

type Conn = oracledb.Connection;

const counts: Record<string, { added: number; updated: number }> = {};
function count(table: string, kind: "added" | "updated") {
  counts[table] ??= { added: 0, updated: 0 };
  counts[table][kind]++;
}

async function findId(db: Conn, sql: string, binds: oracledb.BindParameters): Promise<number | null> {
  const result = await db.execute(sql, binds);
  const rows = result.rows as unknown[][];
  return rows.length > 0 ? Number(rows[0][0]) : null;
}

async function insertReturningId(db: Conn, sql: string, binds: Record<string, unknown>): Promise<number> {
  const result = await db.execute(sql, {
    ...binds,
    id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
  } as oracledb.BindParameters);
  return (result.outBinds as { id: number[] }).id[0];
}

async function findOrAddByName(db: Conn, table: "category" | "customization" | "extra", name: string) {
  const existing = await findId(db, `SELECT id FROM ${table} WHERE name = :name`, { name });
  if (existing !== null) return existing;
  count(table, "added");
  return insertReturningId(db, `INSERT INTO ${table} (name) VALUES (:name) RETURNING id INTO :id`, { name });
}

async function upsertRestaurant(db: Conn, r: SeedRestaurant, categoryId: number): Promise<number> {
  const binds = { categoryId, lat: r.latitude, lng: r.longitude };
  const existing = await findId(db, `SELECT id FROM restaurant WHERE name = :name`, { name: r.name });
  if (existing !== null) {
    await db.execute(
      `UPDATE restaurant SET category_id = :categoryId, latitude = :lat, longitude = :lng WHERE id = :id`,
      { ...binds, id: existing } as oracledb.BindParameters
    );
    count("restaurant", "updated");
    return existing;
  }
  count("restaurant", "added");
  return insertReturningId(
    db,
    `INSERT INTO restaurant (name, category_id, latitude, longitude)
     VALUES (:name, :categoryId, :lat, :lng) RETURNING id INTO :id`,
    { ...binds, name: r.name }
  );
}

async function upsertMenuItem(db: Conn, restaurantId: number, item: SeedItem): Promise<number> {
  const description = item.description ?? null;
  const existing = await findId(
    db,
    `SELECT id FROM menu_item WHERE restaurant_id = :restaurantId AND name = :name`,
    { restaurantId, name: item.name }
  );
  if (existing !== null) {
    await db.execute(
      `UPDATE menu_item SET price = :price, description = :description WHERE id = :id`,
      { price: item.price, description, id: existing }
    );
    count("menu_item", "updated");
    return existing;
  }
  count("menu_item", "added");
  return insertReturningId(
    db,
    `INSERT INTO menu_item (restaurant_id, name, price, description)
     VALUES (:restaurantId, :name, :price, :description) RETURNING id INTO :id`,
    { restaurantId, name: item.name, price: item.price, description }
  );
}

async function linkCustomization(db: Conn, menuItemId: number, customizationId: number) {
  const binds = { menuItemId, customizationId };
  const existing = await findId(
    db,
    `SELECT 1 FROM menu_item_customization WHERE menu_item_id = :menuItemId AND customization_id = :customizationId`,
    binds
  );
  if (existing !== null) return;
  await db.execute(
    `INSERT INTO menu_item_customization (menu_item_id, customization_id) VALUES (:menuItemId, :customizationId)`,
    binds
  );
  count("menu_item_customization", "added");
}

async function linkExtra(db: Conn, menuItemId: number, extraId: number, price: number) {
  const binds = { menuItemId, extraId, price };
  const existing = await findId(
    db,
    `SELECT 1 FROM menu_item_extra WHERE menu_item_id = :menuItemId AND extra_id = :extraId`,
    { menuItemId, extraId }
  );
  if (existing !== null) {
    await db.execute(
      `UPDATE menu_item_extra SET price = :price WHERE menu_item_id = :menuItemId AND extra_id = :extraId`,
      binds
    );
    count("menu_item_extra", "updated");
    return;
  }
  await db.execute(
    `INSERT INTO menu_item_extra (menu_item_id, extra_id, price) VALUES (:menuItemId, :extraId, :price)`,
    binds
  );
  count("menu_item_extra", "added");
}

async function main() {
  const db = await oracledb.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING,
  });
  const waiting: string[] = [];

  try {
    const categoryIds = new Map<string, number>();
    for (const name of categories) {
      categoryIds.set(name, await findOrAddByName(db, "category", name));
    }

    const customizationIds = new Map<string, number>();
    const extraIds = new Map<string, number>();
    for (const r of restaurants) {
      for (const item of r.items) {
        for (const c of item.customizations ?? []) {
          if (!customizationIds.has(c)) customizationIds.set(c, await findOrAddByName(db, "customization", c));
        }
        for (const e of item.extras ?? []) {
          if (!extraIds.has(e.name)) extraIds.set(e.name, await findOrAddByName(db, "extra", e.name));
        }
      }
    }

    for (const r of restaurants) {
      if (r.latitude === null || r.longitude === null) {
        waiting.push(`${r.name} (${r.category})`);
        continue;
      }
      const categoryId = categoryIds.get(r.category);
      if (categoryId === undefined) {
        throw new Error(`Restaurant "${r.name}" uses unknown category "${r.category}"`);
      }
      const restaurantId = await upsertRestaurant(db, r, categoryId);

      for (const item of r.items) {
        const itemId = await upsertMenuItem(db, restaurantId, item);
        for (const c of item.customizations ?? []) {
          await linkCustomization(db, itemId, customizationIds.get(c)!);
        }
        for (const e of item.extras ?? []) {
          await linkExtra(db, itemId, extraIds.get(e.name)!, e.price);
        }
      }
    }

    await db.commit();
  } catch (err) {
    await db.rollback();
    throw err;
  } finally {
    await db.close();
  }

  console.log("Seed complete. All changes were saved together.\n");
  const tables = Object.entries(counts);
  if (tables.length === 0) console.log("  Nothing new to add.");
  for (const [table, c] of tables) {
    console.log(`  ${table.padEnd(24)} ${c.added} added, ${c.updated} refreshed`);
  }
  if (waiting.length > 0) {
    console.log(`\nSkipped ${waiting.length} restaurant(s) still waiting for coordinates:`);
    for (const w of waiting) console.log(`  - ${w}`);
  }
}

main().catch((err) => {
  console.error("Seed failed, nothing was saved:", err);
  process.exit(1);
});