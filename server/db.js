const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not set. Set it in your .env file or Render dashboard.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "false" ? false : { rejectUnauthorized: false },
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'General',
      cost_price NUMERIC NOT NULL,
      sell_price NUMERIC NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      image_data_url TEXT,
      date_added BIGINT NOT NULL,
      last_restocked BIGINT NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      total NUMERIC NOT NULL
    );
  `);

  // Safe to re-run: adds cashier attribution to sales created before this feature existed.
  await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS cashier_id TEXT;`);
  await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS cashier_name TEXT;`);

  // Payment method + debt tracking.
  await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cash';`);
  await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_name TEXT;`);
  await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_phone TEXT;`);
  await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS debt_settled BOOLEAN NOT NULL DEFAULT true;`);

  // Optional negotiable price range per product.
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS price_min NUMERIC;`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS price_max NUMERIC;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cashiers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at BIGINT NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id SERIAL PRIMARY KEY,
      sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sell_price NUMERIC NOT NULL,
      cost_price NUMERIC NOT NULL,
      qty INTEGER NOT NULL
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);`);

  // Returns: track how much of each sale line has been returned, and the
  // running refunded amount on the sale, without deleting the original record.
  await pool.query(`ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS returned_qty INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC NOT NULL DEFAULT 0;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS petty_cash (
      id TEXT PRIMARY KEY,
      amount NUMERIC NOT NULL,
      reason TEXT NOT NULL,
      cashier_id TEXT,
      cashier_name TEXT NOT NULL,
      ts BIGINT NOT NULL
    );
  `);

  // Borrowed items: stock lent out (not sold) and expected back.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS borrows (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      customer_name TEXT,
      customer_phone TEXT,
      cashier_id TEXT,
      cashier_name TEXT,
      returned BOOLEAN NOT NULL DEFAULT false,
      returned_at BIGINT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS borrow_items (
      id SERIAL PRIMARY KEY,
      borrow_id TEXT NOT NULL REFERENCES borrows(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      name TEXT NOT NULL,
      qty INTEGER NOT NULL,
      returned_qty INTEGER NOT NULL DEFAULT 0
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_borrow_items_borrow_id ON borrow_items(borrow_id);`);
}

module.exports = { pool, initDb };
