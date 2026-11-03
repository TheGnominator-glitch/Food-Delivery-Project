import { getConnection } from "./db";

export interface Category {
  id: number;
  name: string;
}

export interface RestaurantSummary {
  id: number;
  name: string;
  categoryId: number;
  category: string;
  distanceKm: number | null; 
}

export interface RestaurantFilters {
  location: { lat: number; lng: number; radiusKm: number } | null;
  categoryId: number | null;
  search: string | null;
}

export async function listCategories(): Promise<Category[]> {
  const connection = await getConnection();
  try {
    const result = await connection.execute(`SELECT id, name FROM category ORDER BY name`);
    const rows = result.rows as unknown[][];
    return rows.map(([id, name]) => ({ id: Number(id), name: String(name) }));
  } finally {
    await connection.close();
  }
}

const DISTANCE_KM = `6371 * 2 * ASIN(SQRT(
    POWER(SIN((r.latitude - :lat) * ACOS(-1) / 360), 2) +
    COS(:lat * ACOS(-1) / 180) * COS(r.latitude * ACOS(-1) / 180) *
    POWER(SIN((r.longitude - :lng) * ACOS(-1) / 360), 2)))`;


export async function findRestaurants(filters: RestaurantFilters): Promise<RestaurantSummary[]> {
  const binds: Record<string, string | number> = {};
  const conditions: string[] = [];
  let distanceColumn = "NULL";

  if (filters.location) {
    distanceColumn = DISTANCE_KM;
    binds.lat = filters.location.lat;
    binds.lng = filters.location.lng;
    binds.radius = filters.location.radiusKm;
    conditions.push("distance_km <= :radius");
  }
  if (filters.categoryId !== null) {
    conditions.push("category_id = :categoryId");
    binds.categoryId = filters.categoryId;
  }
  if (filters.search) {
    conditions.push("INSTR(LOWER(name), LOWER(:search)) > 0");
    binds.search = filters.search;
  }

  const sql = `
    SELECT id, name, category_id, category_name, distance_km FROM (
      SELECT r.id, r.name, c.id AS category_id, c.name AS category_name,
             ${distanceColumn} AS distance_km
      FROM restaurant r JOIN category c ON c.id = r.category_id
    )
    ${conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : ""}
    ORDER BY ${filters.location ? "distance_km" : "name"}`;

  const connection = await getConnection();
  try {
    const result = await connection.execute(sql, binds);
    const rows = result.rows as unknown[][];
    return rows.map(([id, name, categoryId, category, distance]) => ({
      id: Number(id),
      name: String(name),
      categoryId: Number(categoryId),
      category: String(category),
      distanceKm: distance === null ? null : Math.round(Number(distance) * 10) / 10,
    }));
  } finally {
    await connection.close();
  }
}

export interface MenuOption {
  id: number;
  name: string;
}

export interface MenuExtra {
  id: number;
  name: string;
  price: number; 
}

export interface MenuItem {
  id: number;
  name: string;
  price: number; 
  description: string | null;
  customizations: MenuOption[];
  extras: MenuExtra[];
}

export interface RestaurantMenu {
  id: number;
  name: string;
  category: string;
  items: MenuItem[];
}

export async function findRestaurantMenu(restaurantId: number): Promise<RestaurantMenu | null> {
  const connection = await getConnection();
  try {
    const restaurantResult = await connection.execute(
      `SELECT r.id, r.name, c.name
       FROM restaurant r JOIN category c ON c.id = r.category_id
       WHERE r.id = :id`,
      { id: restaurantId }
    );
    const restaurantRows = restaurantResult.rows as unknown[][];
    if (restaurantRows.length === 0) return null;
    const [id, name, category] = restaurantRows[0];

    const itemResult = await connection.execute(
      `SELECT id, name, price, description FROM menu_item
       WHERE restaurant_id = :id ORDER BY id`,
      { id: restaurantId }
    );
    const items = new Map<number, MenuItem>();
    for (const [itemId, itemName, price, description] of itemResult.rows as unknown[][]) {
      items.set(Number(itemId), {
        id: Number(itemId),
        name: String(itemName),
        price: Number(price),
        description: description === null ? null : String(description),
        customizations: [],
        extras: [],
      });
    }

    const customizationResult = await connection.execute(
      `SELECT mic.menu_item_id, cu.id, cu.name
       FROM menu_item_customization mic
       JOIN customization cu ON cu.id = mic.customization_id
       JOIN menu_item mi ON mi.id = mic.menu_item_id
       WHERE mi.restaurant_id = :id
       ORDER BY cu.name`,
      { id: restaurantId }
    );
    for (const [itemId, optionId, optionName] of customizationResult.rows as unknown[][]) {
      items.get(Number(itemId))?.customizations.push({ id: Number(optionId), name: String(optionName) });
    }

    const extraResult = await connection.execute(
      `SELECT mie.menu_item_id, e.id, e.name, mie.price
       FROM menu_item_extra mie
       JOIN extra e ON e.id = mie.extra_id
       JOIN menu_item mi ON mi.id = mie.menu_item_id
       WHERE mi.restaurant_id = :id
       ORDER BY e.name`,
      { id: restaurantId }
    );
    for (const [itemId, extraId, extraName, price] of extraResult.rows as unknown[][]) {
      items.get(Number(itemId))?.extras.push({ id: Number(extraId), name: String(extraName), price: Number(price) });
    }

    return { id: Number(id), name: String(name), category: String(category), items: Array.from(items.values()) };
  } finally {
    await connection.close();
  }
}