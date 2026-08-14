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
}

module.exports = { pool, initDb };
