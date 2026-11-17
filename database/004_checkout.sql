-- Schema change 004: what checkout needs to place an order (FR18, FR23, FR24, FR28, FR33).
--   orders: the delivery point chosen on the map, and amounts that must add up
--   order_item: quantities from 1 to 20 and prices that cannot be negative
--   order_item_extra: the price each extra cost when ordered, so past orders stay correct (FR33)
--   notification_queue: which order a notification is about (FR24, FR27)
-- Run once as C##foodie on every database created before this change (the PC and the laptop).
-- No orders exist yet, so the new NOT NULL columns can be added. If Oracle answers ORA-01758,
-- a test order was left behind: stop and report it rather than deleting anything.
-- New databases get all of this from foodie_schema.sql and skip this file.
ALTER TABLE orders ADD (delivery_lat NUMBER(9,6) NOT NULL, delivery_lng NUMBER(9,6) NOT NULL);
ALTER TABLE orders ADD CONSTRAINT orders_delivery_point_check
    CHECK (delivery_lat BETWEEN -90 AND 90 AND delivery_lng BETWEEN -180 AND 180);
ALTER TABLE orders ADD CONSTRAINT orders_amounts_check
    CHECK (subtotal > 0 AND delivery_cost >= 0 AND total = subtotal + delivery_cost);
ALTER TABLE order_item ADD CONSTRAINT order_item_quantity_check CHECK (quantity BETWEEN 1 AND 20);
ALTER TABLE order_item ADD CONSTRAINT order_item_price_check CHECK (price_at_order >= 0);
ALTER TABLE order_item_extra ADD (price_at_order NUMBER(10,2) NOT NULL);
ALTER TABLE order_item_extra ADD CONSTRAINT order_item_extra_price_check CHECK (price_at_order >= 0);
ALTER TABLE notification_queue ADD (order_id NUMBER);
ALTER TABLE notification_queue ADD CONSTRAINT notification_queue_order_fk FOREIGN KEY (order_id) REFERENCES orders(id);