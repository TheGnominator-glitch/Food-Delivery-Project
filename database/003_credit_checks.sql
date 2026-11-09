-- Schema change 003: credits can never go negative, and every transaction moves a positive amount
-- (FR19, FR20, FR23, FR25). The transaction type says the direction: 'purchase' adds, 'spend' subtracts.
-- Run once as C##foodie on every database created before this change (the PC and the laptop).
-- New databases get these rules from foodie_schema.sql and skip this file.
ALTER TABLE users ADD CONSTRAINT users_credit_balance_check CHECK (credit_balance >= 0);
ALTER TABLE credit_transaction ADD CONSTRAINT credit_transaction_amount_check CHECK (amount > 0);
