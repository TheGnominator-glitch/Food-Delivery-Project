import { MIN_ITEM_QUANTITY, MAX_ITEM_QUANTITY } from "./constants";

// A database id sent in a request: a positive whole number
export const isId = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

// A list of ids with no repeats
export const isIdList = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every(isId) && new Set(value).size === value.length;

// FR14: a quantity from 1 to 20
export const isQuantity = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) &&
  value >= MIN_ITEM_QUANTITY && value <= MAX_ITEM_QUANTITY;
