
// Limits shared by the pages and the API, so the two can never disagree
// FR14: the quantity of a single item, from 1 to 20
export const MIN_ITEM_QUANTITY = 1;
export const MAX_ITEM_QUANTITY = 20;

// FR16: announced whenever the cart changes, so the cart link can refresh its count
export const CART_CHANGED_EVENT = "cart-changed";

// FR21: the fixed credit packages, and the range for a custom amount (whole credits)
export const CREDIT_PACKAGES = [25, 50, 100];
export const MIN_CREDIT_PURCHASE = 1;
export const MAX_CREDIT_PURCHASE = 1000;

// FR21: the price of one credit
export const COP_PER_CREDIT = 1000;

// FR22: an example card number, shown as the card field's placeholder
export const TEST_CARD_NUMBER = "4242 4242 4242 4242";
