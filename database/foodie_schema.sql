-- Foodie database schema: creates all 18 tables. Run once, in order, as the app's Oracle user.
-- FR1, FR3: user accounts; the national ID (cedula) is the primary key
CREATE TABLE users (
    id VARCHAR2(20) PRIMARY KEY,          
    name VARCHAR2(120) NOT NULL,
    -- FR2: one account per email
    email VARCHAR2(120) NOT NULL UNIQUE,
    -- NFR3: only the bcrypt hash is stored
    password_hash VARCHAR2(255) NOT NULL,
    phone VARCHAR2(20) NOT NULL,
    address VARCHAR2(255) NOT NULL,
    -- FR19, FR21: the credit balance, starting at 0
    credit_balance NUMBER(10,2) DEFAULT 0 NOT NULL,
    -- FR34, FR36: email notification consent (0 or 1)
    email_opt_in NUMBER(1) DEFAULT 0 NOT NULL CHECK (email_opt_in IN (0,1)),
    created_at DATE DEFAULT SYSDATE NOT NULL,
    -- FR19, FR20: a balance can never go negative (schema change 003)
    CONSTRAINT users_credit_balance_check CHECK (credit_balance >= 0)
);

-- FR10: restaurant categories
CREATE TABLE category (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR2(50) NOT NULL
);

-- FR9: restaurants, with real coordinates for the nearby filter (FR9) and routing (FR28)
CREATE TABLE restaurant (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR2(120) NOT NULL,
    category_id NUMBER NOT NULL,
    latitude NUMBER(9,6) NOT NULL,
    longitude NUMBER(9,6) NOT NULL,
    FOREIGN KEY (category_id) REFERENCES category(id)
);

-- FR12: menu items, priced in credits
CREATE TABLE menu_item (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    restaurant_id NUMBER NOT NULL,
    name VARCHAR2(120) NOT NULL,
    price NUMBER(10,2) NOT NULL,
    description VARCHAR2(500),
    FOREIGN KEY (restaurant_id) REFERENCES restaurant(id)
);

-- FR13: free customizations, each defined once and shared across items
CREATE TABLE customization (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR2(100) NOT NULL
);

-- FR13: paid extras, each defined once and shared across items
CREATE TABLE extra (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR2(100) NOT NULL
);

-- FR13: which items offer which customizations
CREATE TABLE menu_item_customization (
    menu_item_id  NUMBER NOT NULL,
    customization_id NUMBER NOT NULL,
    PRIMARY KEY (menu_item_id, customization_id),
    FOREIGN KEY (menu_item_id) REFERENCES menu_item(id),
    FOREIGN KEY (customization_id) REFERENCES customization(id)
);

-- FR13: which items offer which extras, with the price for each item
CREATE TABLE menu_item_extra (
    menu_item_id NUMBER NOT NULL,
    extra_id NUMBER NOT NULL,
    price NUMBER(10,2) NOT NULL,
    PRIMARY KEY (menu_item_id, extra_id),
    FOREIGN KEY (menu_item_id) REFERENCES menu_item(id),
    FOREIGN KEY (extra_id) REFERENCES extra(id)
);

-- FR15-FR17: cart items, stored in the database so the cart survives closing the browser
CREATE TABLE cart_item (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id VARCHAR2(20) NOT NULL,
    menu_item_id  NUMBER NOT NULL,
    quantity NUMBER DEFAULT 1 NOT NULL,
    -- FR14, FR16: from 1 to 20, the same limit as lib/constants.ts (schema change 002)
    CONSTRAINT cart_item_quantity_check CHECK (quantity BETWEEN 1 AND 20),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (menu_item_id) REFERENCES menu_item(id)
);

-- FR14: customizations chosen for a cart item
CREATE TABLE cart_item_customization (
    cart_item_id NUMBER NOT NULL,
    customization_id NUMBER NOT NULL,
    PRIMARY KEY (cart_item_id, customization_id),
    FOREIGN KEY (cart_item_id) REFERENCES cart_item(id),
    FOREIGN KEY (customization_id) REFERENCES customization(id)
);

-- FR14: extras chosen for a cart item
CREATE TABLE cart_item_extra (
    cart_item_id NUMBER NOT NULL,
    extra_id NUMBER NOT NULL,
    PRIMARY KEY (cart_item_id, extra_id),
    FOREIGN KEY (cart_item_id) REFERENCES cart_item(id),
    FOREIGN KEY (extra_id) REFERENCES extra(id)
);

-- FR23, FR26, FR29: orders, their status and the simulated driver position
CREATE TABLE orders (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id VARCHAR2(20) NOT NULL,
    -- FR26: the four statuses, in order
    status VARCHAR2(30) DEFAULT 'Placed' NOT NULL CHECK (status IN ('Placed','Driver Assigned','On the way','Delivered')),
    subtotal NUMBER(10,2) NOT NULL,
    delivery_cost NUMBER(10,2) NOT NULL,
    total NUMBER(10,2) NOT NULL,
    -- A copy of the address at checkout, so later profile edits do not change past orders
    delivery_address VARCHAR2(255) NOT NULL,
    -- FR29, FR30: the driver position, set once a driver is assigned
    driver_lat NUMBER(9,6),
    driver_lng NUMBER(9,6),
    -- FR28: the road route from OSRM, as JSON
    route CLOB,
    created_at DATE DEFAULT SYSDATE NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- FR23, FR33: the items of an order; price_at_order keeps the price paid even if the menu changes
CREATE TABLE order_item (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id  NUMBER NOT NULL,
    menu_item_id NUMBER NOT NULL,
    quantity  NUMBER NOT NULL,
    price_at_order NUMBER(10,2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (menu_item_id) REFERENCES menu_item(id)
);

-- FR33: customizations chosen for an order item
CREATE TABLE order_item_customization (
    order_item_id NUMBER NOT NULL,
    customization_id NUMBER NOT NULL,
    PRIMARY KEY (order_item_id, customization_id),
    FOREIGN KEY (order_item_id) REFERENCES order_item(id),
    FOREIGN KEY (customization_id) REFERENCES customization(id)
);

-- FR33: extras chosen for an order item
CREATE TABLE order_item_extra (
    order_item_id NUMBER NOT NULL,
    extra_id NUMBER NOT NULL,
    PRIMARY KEY (order_item_id, extra_id),
    FOREIGN KEY (order_item_id) REFERENCES order_item(id),
    FOREIGN KEY (extra_id) REFERENCES extra(id)
);

-- FR25: every credit purchase and every deduction
CREATE TABLE credit_transaction (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id VARCHAR2(20) NOT NULL,
    amount NUMBER(10,2) NOT NULL,
    transaction_type VARCHAR2(20) NOT NULL CHECK (transaction_type IN ('purchase','spend')),
    -- Only set for spend transactions
    order_id NUMBER,                                    
    transaction_date DATE DEFAULT SYSDATE NOT NULL,
    -- FR25: always a positive amount; transaction_type says the direction (schema change 003)
    CONSTRAINT credit_transaction_amount_check CHECK (amount > 0),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- FR4, FR24, FR27, NFR8: queued email notifications, retried up to 3 times
CREATE TABLE notification_queue (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id VARCHAR2(20) NOT NULL,
    message_type VARCHAR2(50) NOT NULL,
    status VARCHAR2(20) DEFAULT 'pending' NOT NULL CHECK (status IN ('pending','sent','failed')),
    retry_count NUMBER DEFAULT 0 NOT NULL,
    created_at DATE DEFAULT SYSDATE NOT NULL,
    sent_at DATE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- FR5, FR7: login sessions; the id is the SHA-256 hash of the session token
CREATE TABLE sessions (
    id VARCHAR2(255) PRIMARY KEY,
    user_id VARCHAR2(20) NOT NULL,
    created_at DATE DEFAULT SYSDATE NOT NULL,
    expires_at DATE NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);