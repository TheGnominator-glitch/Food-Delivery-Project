-- Schema change 002: a cart item's quantity must be from 1 to 20 (FR14, FR16),
-- the same limit the app enforces in lib/constants.ts.
-- Run once as C##foodie on every database created before this change (the PC and the laptop).
-- New databases get the rule from foodie_schema.sql and skip this file.
ALTER TABLE cart_item ADD CONSTRAINT cart_item_quantity_check CHECK (quantity BETWEEN 1 AND 20);