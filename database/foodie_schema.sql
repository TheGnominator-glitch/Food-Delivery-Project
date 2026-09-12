CREATE TABLE users (
    id VARCHAR2(20) PRIMARY KEY,          
    name VARCHAR2(120) NOT NULL,
    email VARCHAR2(120) NOT NULL UNIQUE,
    password_hash VARCHAR2(255) NOT NULL,
    phone VARCHAR2(20) NOT NULL,
    address VARCHAR2(255) NOT NULL,
    credit_balance NUMBER(10,2) DEFAULT 0 NOT NULL,
    whatsapp_opt_in NUMBER(1) DEFAULT 0 NOT NULL CHECK (whatsapp_opt_in IN (0,1)),
    created_at DATE DEFAULT SYSDATE NOT NULL
);

CREATE TABLE category (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR2(50) NOT NULL
);

CREATE TABLE restaurant (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR2(120) NOT NULL,
    category_id NUMBER NOT NULL,
    latitude NUMBER(9,6) NOT NULL,
    longitude NUMBER(9,6) NOT NULL,
    FOREIGN KEY (category_id) REFERENCES category(id)
);

CREATE TABLE menu_item (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    restaurant_id NUMBER NOT NULL,
    name VARCHAR2(120) NOT NULL,
    price NUMBER(10,2) NOT NULL,
    description VARCHAR2(500),
    FOREIGN KEY (restaurant_id) REFERENCES restaurant(id)
);

CREATE TABLE customization (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR2(100) NOT NULL
);

CREATE TABLE extra (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR2(100) NOT NULL
);

CREATE TABLE menu_item_customization (
    menu_item_id  NUMBER NOT NULL,
    customization_id NUMBER NOT NULL,
    PRIMARY KEY (menu_item_id, customization_id),
    FOREIGN KEY (menu_item_id) REFERENCES menu_item(id),
    FOREIGN KEY (customization_id) REFERENCES customization(id)
);

CREATE TABLE menu_item_extra (
    menu_item_id NUMBER NOT NULL,
    extra_id NUMBER NOT NULL,
    price NUMBER(10,2) NOT NULL,
    PRIMARY KEY (menu_item_id, extra_id),
    FOREIGN KEY (menu_item_id) REFERENCES menu_item(id),
    FOREIGN KEY (extra_id) REFERENCES extra(id)
);

CREATE TABLE cart_item (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id VARCHAR2(20) NOT NULL,
    menu_item_id  NUMBER NOT NULL,
    quantity NUMBER DEFAULT 1 NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (menu_item_id) REFERENCES menu_item(id)
);

CREATE TABLE cart_item_customization (
    cart_item_id NUMBER NOT NULL,
    customization_id NUMBER NOT NULL,
    PRIMARY KEY (cart_item_id, customization_id),
    FOREIGN KEY (cart_item_id) REFERENCES cart_item(id),
    FOREIGN KEY (customization_id) REFERENCES customization(id)
);

CREATE TABLE cart_item_extra (
    cart_item_id NUMBER NOT NULL,
    extra_id NUMBER NOT NULL,
    PRIMARY KEY (cart_item_id, extra_id),
    FOREIGN KEY (cart_item_id) REFERENCES cart_item(id),
    FOREIGN KEY (extra_id) REFERENCES extra(id)
);

CREATE TABLE orders (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id VARCHAR2(20) NOT NULL,
    status VARCHAR2(30) DEFAULT 'Placed' NOT NULL CHECK (status IN ('Placed','Driver Assigned','On the way','Delivered')),
    subtotal NUMBER(10,2) NOT NULL,
    delivery_cost NUMBER(10,2) NOT NULL,
    total NUMBER(10,2) NOT NULL,
    delivery_address VARCHAR2(255) NOT NULL,
    driver_lat NUMBER(9,6),
    driver_lng NUMBER(9,6),
    route CLOB,
    created_at DATE DEFAULT SYSDATE NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE order_item (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id  NUMBER NOT NULL,
    menu_item_id NUMBER NOT NULL,
    quantity  NUMBER NOT NULL,
    price_at_order NUMBER(10,2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (menu_item_id) REFERENCES menu_item(id)
);

CREATE TABLE order_item_customization (
    order_item_id NUMBER NOT NULL,
    customization_id NUMBER NOT NULL,
    PRIMARY KEY (order_item_id, customization_id),
    FOREIGN KEY (order_item_id) REFERENCES order_item(id),
    FOREIGN KEY (customization_id) REFERENCES customization(id)
);

CREATE TABLE order_item_extra (
    order_item_id NUMBER NOT NULL,
    extra_id NUMBER NOT NULL,
    PRIMARY KEY (order_item_id, extra_id),
    FOREIGN KEY (order_item_id) REFERENCES order_item(id),
    FOREIGN KEY (extra_id) REFERENCES extra(id)
);

CREATE TABLE credit_transaction (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id VARCHAR2(20) NOT NULL,
    amount NUMBER(10,2) NOT NULL,
    transaction_type VARCHAR2(20) NOT NULL CHECK (transaction_type IN ('purchase','spend')),
    order_id NUMBER,                                    
    transaction_date DATE DEFAULT SYSDATE NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

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

CREATE TABLE sessions (
    id VARCHAR2(255) PRIMARY KEY,
    user_id VARCHAR2(20) NOT NULL,
    created_at DATE DEFAULT SYSDATE NOT NULL,
    expires_at DATE NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);