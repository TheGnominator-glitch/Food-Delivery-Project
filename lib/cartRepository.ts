import oracledb from "oracledb";
import { getConnection } from "./db";
import { MAX_ITEM_QUANTITY } from "./constants";

// FR13: the options a menu item offers
export interface MenuItemOptions {
  customizationIds: Set<number>;
  extraIds: Set<number>;
}

// FR14: the options a menu item offers, or null if the item does not exist
export async function findMenuItemOptions(menuItemId: number): Promise<MenuItemOptions | null> {
  const connection = await getConnection();
  try {
    const item = await connection.execute(`SELECT id FROM menu_item WHERE id = :id`, { id: menuItemId });
    if ((item.rows as unknown[][]).length === 0) return null;

    const customizations = await connection.execute(
      `SELECT customization_id FROM menu_item_customization WHERE menu_item_id = :id`,
      { id: menuItemId }
    );
    const extras = await connection.execute(
      `SELECT extra_id FROM menu_item_extra WHERE menu_item_id = :id`,
      { id: menuItemId }
    );
    return {
      customizationIds: new Set((customizations.rows as unknown[][]).map(([id]) => Number(id))),
      extraIds: new Set((extras.rows as unknown[][]).map(([id]) => Number(id))),
    };
  } finally {
    await connection.close();
  }
}

// FR16: one line of the cart, priced at the current menu prices
export interface CartLine {
  id: number;
  menuItemId: number;
  name: string;
  restaurantId: number;
  restaurantName: string;
  quantity: number;
  unitPrice: number; // item price + chosen extras
  lineTotal: number; // unitPrice x quantity
  customizations: { id: number; name: string }[];
  extras: { id: number; name: string; price: number }[];
}

// FR16: the whole cart
export interface Cart {
  items: CartLine[];
  subtotal: number;
  itemCount: number; // total quantity, shown on the cart link
}

// FR15-FR17: the user's cart from the database, grouped by restaurant, at current prices
export async function getCart(userId: string): Promise<Cart> {
  const connection = await getConnection();
  try {
    const lineResult = await connection.execute(
      `SELECT ci.id, ci.quantity, mi.id, mi.name, mi.price, r.id, r.name
       FROM cart_item ci
       JOIN menu_item mi ON mi.id = ci.menu_item_id
       JOIN restaurant r ON r.id = mi.restaurant_id
       WHERE ci.user_id = :userId
       ORDER BY r.name, ci.id`,
      { userId }
    );
    const lines = new Map<number, CartLine & { basePrice: number }>();
    for (const [id, quantity, menuItemId, name, price, restaurantId, restaurantName] of lineResult.rows as unknown[][]) {
      lines.set(Number(id), {
        id: Number(id),
        menuItemId: Number(menuItemId),
        name: String(name),
        restaurantId: Number(restaurantId),
        restaurantName: String(restaurantName),
        quantity: Number(quantity),
        basePrice: Number(price),
        unitPrice: 0,
        lineTotal: 0,
        customizations: [],
        extras: [],
      });
    }

    const customizationResult = await connection.execute(
      `SELECT cic.cart_item_id, cu.id, cu.name
       FROM cart_item_customization cic
       JOIN cart_item ci ON ci.id = cic.cart_item_id
       JOIN customization cu ON cu.id = cic.customization_id
       WHERE ci.user_id = :userId
       ORDER BY cu.name`,
      { userId }
    );
    for (const [lineId, id, name] of customizationResult.rows as unknown[][]) {
      lines.get(Number(lineId))?.customizations.push({ id: Number(id), name: String(name) });
    }

    // FR13: the extra's current price for this specific item, from menu_item_extra
    const extraResult = await connection.execute(
      `SELECT cie.cart_item_id, e.id, e.name, mie.price
       FROM cart_item_extra cie
       JOIN cart_item ci ON ci.id = cie.cart_item_id
       JOIN extra e ON e.id = cie.extra_id
       JOIN menu_item_extra mie ON mie.menu_item_id = ci.menu_item_id AND mie.extra_id = cie.extra_id
       WHERE ci.user_id = :userId
       ORDER BY e.name`,
      { userId }
    );
    for (const [lineId, id, name, price] of extraResult.rows as unknown[][]) {
      lines.get(Number(lineId))?.extras.push({ id: Number(id), name: String(name), price: Number(price) });
    }

    // FR16: prices are always calculated here, never taken from the browser
    const items: CartLine[] = [];
    for (const { basePrice, ...line } of lines.values()) {
      line.unitPrice = basePrice + line.extras.reduce((sum, e) => sum + e.price, 0);
      line.lineTotal = line.unitPrice * line.quantity;
      items.push(line);
    }
    return {
      items,
      subtotal: items.reduce((sum, l) => sum + l.lineTotal, 0),
      itemCount: items.reduce((sum, l) => sum + l.quantity, 0),
    };
  } finally {
    await connection.close();
  }
}

export type AddResult =
  | { outcome: "added" | "merged"; cartItemId: number; quantity: number }
  | { outcome: "over-limit"; quantity: number };

// True when two lists of ids hold exactly the same ids, in any order
function sameIds(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  return sortedA.every((v, i) => v === sortedB[i]);
}

// FR14, FR17: add an item with its choices. The same item with exactly the same choices
// merges into one line, up to 20; anything over that is refused and nothing changes.
export async function addCartItem(
  userId: string,
  menuItemId: number,
  quantity: number,
  customizationIds: number[],
  extraIds: number[]
): Promise<AddResult> {
  const connection = await getConnection();
  try {
    // This item's lines already in the cart, locked until the end of this transaction
    const lineResult = await connection.execute(
      `SELECT id, quantity FROM cart_item
       WHERE user_id = :userId AND menu_item_id = :menuItemId
       FOR UPDATE`,
      { userId, menuItemId }
    );
    const existing = (lineResult.rows as unknown[][]).map(([id, qty]) => ({
      id: Number(id),
      quantity: Number(qty),
      customizationIds: [] as number[],
      extraIds: [] as number[],
    }));

    if (existing.length > 0) {
      const byId = new Map(existing.map((line) => [line.id, line]));
      const chosen = await connection.execute(
        `SELECT cart_item_id, customization_id FROM cart_item_customization
         WHERE cart_item_id IN (SELECT id FROM cart_item WHERE user_id = :userId AND menu_item_id = :menuItemId)`,
        { userId, menuItemId }
      );
      for (const [lineId, id] of chosen.rows as unknown[][]) byId.get(Number(lineId))?.customizationIds.push(Number(id));
      const chosenExtras = await connection.execute(
        `SELECT cart_item_id, extra_id FROM cart_item_extra
         WHERE cart_item_id IN (SELECT id FROM cart_item WHERE user_id = :userId AND menu_item_id = :menuItemId)`,
        { userId, menuItemId }
      );
      for (const [lineId, id] of chosenExtras.rows as unknown[][]) byId.get(Number(lineId))?.extraIds.push(Number(id));
    }

    // Merge into a line with exactly the same choices, if there is one
    const match = existing.find(
      (line) => sameIds(line.customizationIds, customizationIds) && sameIds(line.extraIds, extraIds)
    );
    if (match) {
      const merged = match.quantity + quantity;
      if (merged > MAX_ITEM_QUANTITY) {
        return { outcome: "over-limit", quantity: match.quantity }; // closing without commit changes nothing
      }
      await connection.execute(`UPDATE cart_item SET quantity = :quantity WHERE id = :id`, { quantity: merged, id: match.id });
      await connection.commit();
      return { outcome: "merged", cartItemId: match.id, quantity: merged };
    }

    // Otherwise a new line, with its choices
    const inserted = await connection.execute(
      `INSERT INTO cart_item (user_id, menu_item_id, quantity)
       VALUES (:userId, :menuItemId, :quantity)
       RETURNING id INTO :id`,
      { userId, menuItemId, quantity, id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } }
    );
    const cartItemId = (inserted.outBinds as { id: number[] }).id[0];
    if (customizationIds.length > 0) {
      await connection.executeMany(
        `INSERT INTO cart_item_customization (cart_item_id, customization_id) VALUES (:cartItemId, :id)`,
        customizationIds.map((id) => ({ cartItemId, id }))
      );
    }
    if (extraIds.length > 0) {
      await connection.executeMany(
        `INSERT INTO cart_item_extra (cart_item_id, extra_id) VALUES (:cartItemId, :id)`,
        extraIds.map((id) => ({ cartItemId, id }))
      );
    }
    await connection.commit(); // the line and its choices are saved together, or not at all
    return { outcome: "added", cartItemId, quantity };
  } finally {
    await connection.close(); // closing without commit rolls back any partial change
  }
}

// FR16: change a line's quantity; false if the line is not in this user's cart
export async function updateCartItemQuantity(userId: string, cartItemId: number, quantity: number): Promise<boolean> {
  const connection = await getConnection();
  try {
    const result = await connection.execute(
      `UPDATE cart_item SET quantity = :quantity WHERE id = :id AND user_id = :userId`,
      { quantity, id: cartItemId, userId },
      { autoCommit: true }
    );
    return result.rowsAffected === 1;
  } finally {
    await connection.close();
  }
}

// FR16: remove a line and its choices; false if the line is not in this user's cart
export async function removeCartItem(userId: string, cartItemId: number): Promise<boolean> {
  const connection = await getConnection();
  try {
    const owned = await connection.execute(
      `SELECT id FROM cart_item WHERE id = :id AND user_id = :userId FOR UPDATE`,
      { id: cartItemId, userId }
    );
    if ((owned.rows as unknown[][]).length === 0) return false;

    // The choices first, since they point at the line
    await connection.execute(`DELETE FROM cart_item_customization WHERE cart_item_id = :id`, { id: cartItemId });
    await connection.execute(`DELETE FROM cart_item_extra WHERE cart_item_id = :id`, { id: cartItemId });
    await connection.execute(`DELETE FROM cart_item WHERE id = :id`, { id: cartItemId });
    await connection.commit();
    return true;
  } finally {
    await connection.close();
  }
}
