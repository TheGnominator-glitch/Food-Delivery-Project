import oracledb, { type Connection } from "oracledb";
import { getConnection } from "./db";
import { planDelivery, type Point, type Stop } from "./geo";

// FR18, FR23: one cart line as checkout prices it, from the current menu
export interface CheckoutLine {
  cartItemId: number;
  menuItemId: number;
  name: string;
  restaurantId: number;
  restaurantName: string;
  quantity: number;
  basePrice: number;
  unitPrice: number; // item price + chosen extras
  lineTotal: number; // unitPrice x quantity
  customizations: { id: number; name: string }[];
  extras: { id: number; name: string; price: number }[];
}

// FR18, FR19: everything the Checkout page shows
export interface CheckoutQuote {
  items: CheckoutLine[];
  pickups: { id: number; name: string }[];
  subtotal: number;
  deliveryCost: number;
  estimateMinutes: number;
  distanceKm: number;
  total: number;
  creditBalance: number;
  deliveryAddress: string;
  hasActiveOrder: boolean;
}

// FR23: what happened when the user pressed Confirm and pay
export type PlaceOrderResult =
  | { outcome: "active-order" }
  | { outcome: "empty-cart" }
  | { outcome: "price-changed"; total: number }
  | { outcome: "insufficient-credits"; total: number; creditBalance: number }
  | { outcome: "placed"; orderId: number; total: number; creditBalance: number };

// FR15, FR18: the user's cart with current prices and each restaurant's location.
// With lock = true the cart lines stay locked until the transaction ends, so they cannot change mid-checkout.
async function loadCart(connection: Connection, userId: string, lock: boolean) {
  const lineResult = await connection.execute(
    `SELECT ci.id, ci.quantity, mi.id, mi.name, mi.price, r.id, r.name, r.latitude, r.longitude
     FROM cart_item ci
     JOIN menu_item mi ON mi.id = ci.menu_item_id
     JOIN restaurant r ON r.id = mi.restaurant_id
     WHERE ci.user_id = :userId
     ORDER BY r.name, ci.id` + (lock ? ` FOR UPDATE OF ci.quantity` : ``),
    { userId }
  );
  const lines = new Map<number, CheckoutLine>();
  const restaurants = new Map<number, Stop>();
  for (const [id, quantity, menuItemId, name, price, restaurantId, restaurantName, lat, lng] of lineResult.rows as unknown[][]) {
    lines.set(Number(id), {
      cartItemId: Number(id),
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
    restaurants.set(Number(restaurantId), { id: Number(restaurantId), name: String(restaurantName), lat: Number(lat), lng: Number(lng) });
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

  // FR13: each extra's current price for this specific item
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

  // FR18: prices are always calculated here, never taken from the browser
  const items = [...lines.values()];
  for (const line of items) {
    line.unitPrice = line.basePrice + line.extras.reduce((sum, e) => sum + e.price, 0);
    line.lineTotal = line.unitPrice * line.quantity;
  }
  return { items, restaurants: [...restaurants.values()] };
}

// FR18: the order's amounts for a delivery point
function price(items: CheckoutLine[], restaurants: Stop[], point: Point) {
  const plan = planDelivery(restaurants, point);
  const subtotal = items.reduce((sum, l) => sum + l.lineTotal, 0);
  return { plan, subtotal, total: subtotal + plan.deliveryCost };
}

// One active order at a time: any order not yet Delivered
async function hasActiveOrder(connection: Connection, userId: string): Promise<boolean> {
  const result = await connection.execute(
    `SELECT COUNT(*) FROM orders WHERE user_id = :userId AND status <> 'Delivered'`,
    { userId }
  );
  return Number((result.rows as unknown[][])[0][0]) > 0;
}

// FR18, FR19: what the Checkout page shows for a delivery point; nothing is saved
export async function getCheckoutQuote(userId: string, point: Point): Promise<CheckoutQuote> {
  const connection = await getConnection();
  try {
    const userResult = await connection.execute(
      `SELECT credit_balance, address FROM users WHERE id = :userId`,
      { userId }
    );
    const [creditBalance, address] = (userResult.rows as unknown[][])[0];
    const { items, restaurants } = await loadCart(connection, userId, false);
    const { plan, subtotal, total } = price(items, restaurants, point);
    return {
      items,
      pickups: plan.pickups.map(({ id, name }) => ({ id, name })),
      subtotal,
      deliveryCost: plan.deliveryCost,
      estimateMinutes: plan.estimateMinutes,
      distanceKm: plan.distanceKm,
      total,
      creditBalance: Number(creditBalance),
      deliveryAddress: String(address),
      hasActiveOrder: await hasActiveOrder(connection, userId),
    };
  } finally {
    await connection.close();
  }
}

// FR20, FR23-FR25: Confirm and pay. In one transaction: create the order (Placed) with its items,
// deduct the credits, log a 'spend' transaction, queue a notification if the user opted in, and
// empty the cart. Either all of it is saved or none of it is.
export async function placeOrder(userId: string, point: Point, expectedTotal: number): Promise<PlaceOrderResult> {
  const connection = await getConnection();
  try {
    // Locking the user's row makes two simultaneous checkouts by the same user run one after the other
    const userResult = await connection.execute(
      `SELECT credit_balance, address, email_opt_in FROM users WHERE id = :userId FOR UPDATE`,
      { userId }
    );
    const [balanceValue, address, optIn] = (userResult.rows as unknown[][])[0];
    const creditBalance = Number(balanceValue);

    // One active order at a time
    if (await hasActiveOrder(connection, userId)) return { outcome: "active-order" };

    const { items, restaurants } = await loadCart(connection, userId, true);
    if (items.length === 0) return { outcome: "empty-cart" };

    // FR18: the total is recalculated; if it differs from what the page showed, nothing is charged
    const { plan, subtotal, total } = price(items, restaurants, point);
    if (total !== expectedTotal) return { outcome: "price-changed", total };

    // FR20: not enough credits; the page sends the user to Buy Credits
    if (creditBalance < total) return { outcome: "insufficient-credits", total, creditBalance };

    // FR23: the order, with a copy of the address and the delivery point
    const orderInsert = await connection.execute(
      `INSERT INTO orders (user_id, subtotal, delivery_cost, total, delivery_address, delivery_lat, delivery_lng)
       VALUES (:userId, :subtotal, :deliveryCost, :total, :address, :lat, :lng)
       RETURNING id INTO :id`,
      {
        userId, subtotal, deliveryCost: plan.deliveryCost, total, address: String(address),
        lat: point.lat, lng: point.lng, id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );
    const orderId = (orderInsert.outBinds as { id: number[] }).id[0];

    // FR23, FR33: each item, with the prices paid, so later menu changes do not alter the order
    for (const line of items) {
      const itemInsert = await connection.execute(
        `INSERT INTO order_item (order_id, menu_item_id, quantity, price_at_order)
         VALUES (:orderId, :menuItemId, :quantity, :price)
         RETURNING id INTO :id`,
        { orderId, menuItemId: line.menuItemId, quantity: line.quantity, price: line.basePrice, id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } }
      );
      const orderItemId = (itemInsert.outBinds as { id: number[] }).id[0];
      if (line.customizations.length > 0) {
        await connection.executeMany(
          `INSERT INTO order_item_customization (order_item_id, customization_id) VALUES (:orderItemId, :id)`,
          line.customizations.map((c) => ({ orderItemId, id: c.id }))
        );
      }
      if (line.extras.length > 0) {
        await connection.executeMany(
          `INSERT INTO order_item_extra (order_item_id, extra_id, price_at_order) VALUES (:orderItemId, :id, :price)`,
          line.extras.map((e) => ({ orderItemId, id: e.id, price: e.price }))
        );
      }
    }

    // FR23, FR25: deduct the credits and log the spend (schema change 003 refuses a negative balance)
    await connection.execute(
      `UPDATE users SET credit_balance = credit_balance - :total WHERE id = :userId`,
      { total, userId }
    );
    await connection.execute(
      `INSERT INTO credit_transaction (user_id, amount, transaction_type, order_id)
       VALUES (:userId, :total, 'spend', :orderId)`,
      { userId, total, orderId }
    );

    // FR24, FR34, NFR9: queue the confirmation only for a user who opted in; the sender comes later
    if (Number(optIn) === 1) {
      await connection.execute(
        `INSERT INTO notification_queue (user_id, message_type, order_id) VALUES (:userId, 'order_placed', :orderId)`,
        { userId, orderId }
      );
    }

    // FR23: empty the cart, deleting only the lines that were paid for (choices first)
    const lineIds = items.map((l) => ({ id: l.cartItemId }));
    await connection.executeMany(`DELETE FROM cart_item_customization WHERE cart_item_id = :id`, lineIds);
    await connection.executeMany(`DELETE FROM cart_item_extra WHERE cart_item_id = :id`, lineIds);
    await connection.executeMany(`DELETE FROM cart_item WHERE id = :id`, lineIds);

    await connection.commit();
    return { outcome: "placed", orderId, total, creditBalance: creditBalance - total };
  } finally {
    await connection.close(); // closing without commit rolls back any partial change
  }
}
