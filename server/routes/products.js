const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db");
const { requireAdmin } = require("../auth");

const router = express.Router();

function rowToProduct(r) {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    costPrice: Number(r.cost_price),
    sellPrice: Number(r.sell_price),
    quantity: r.quantity,
    imageDataUrl: r.image_data_url,
    dateAdded: Number(r.date_added),
    lastRestocked: Number(r.last_restocked),
  };
}

router.get("/", async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM products ORDER BY date_added DESC");
  res.json(rows.map(rowToProduct));
});

// Add or restock a product. Admin only.
router.post("/", requireAdmin, async (req, res) => {
  const { name, category, costPrice, sellPrice, quantity, imageDataUrl } = req.body || {};

  if (!name || costPrice == null || sellPrice == null || !quantity || Number(quantity) <= 0) {
    return res.status(400).json({ error: "name, costPrice, sellPrice and a positive quantity are required." });
  }

  const now = Date.now();
  const { rows: existingRows } = await pool.query(
    "SELECT * FROM products WHERE lower(name) = lower($1) LIMIT 1",
    [name.trim()]
  );

  if (existingRows.length > 0) {
    const existing = existingRows[0];
    const newQty = existing.quantity + Number(quantity);
    const { rows } = await pool.query(
      `UPDATE products
       SET cost_price = $1, sell_price = $2, quantity = $3,
           category = COALESCE(NULLIF($4, ''), category),
           image_data_url = COALESCE($5, image_data_url),
           last_restocked = $6
       WHERE id = $7
       RETURNING *`,
      [Number(costPrice), Number(sellPrice), newQty, category || "", imageDataUrl || null, now, existing.id]
    );
    return res.json(rowToProduct(rows[0]));
  }

  const id = crypto.randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO products (id, name, category, cost_price, sell_price, quantity, image_data_url, date_added, last_restocked)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [id, name.trim(), category?.trim() || "General", Number(costPrice), Number(sellPrice), Number(quantity), imageDataUrl || null, now, now]
  );
  res.status(201).json(rowToProduct(rows[0]));
});

// Edit a product's details directly (full replace, not additive). Admin only.
router.put("/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, category, costPrice, sellPrice, quantity, imageDataUrl } = req.body || {};

  if (!name || costPrice == null || sellPrice == null || quantity == null || Number(quantity) < 0) {
    return res.status(400).json({ error: "name, costPrice, sellPrice and a non-negative quantity are required." });
  }

  const { rows: existingRows } = await pool.query("SELECT * FROM products WHERE id = $1", [id]);
  if (existingRows.length === 0) {
    return res.status(404).json({ error: "Product not found." });
  }

  const { rows } = await pool.query(
    `UPDATE products
     SET name = $1, category = $2, cost_price = $3, sell_price = $4, quantity = $5,
         image_data_url = COALESCE($6, image_data_url)
     WHERE id = $7
     RETURNING *`,
    [name.trim(), category?.trim() || "General", Number(costPrice), Number(sellPrice), Number(quantity), imageDataUrl || null, id]
  );
  res.json(rowToProduct(rows[0]));
});

// Delete a product. Admin only.
router.delete("/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { rowCount } = await pool.query("DELETE FROM products WHERE id = $1", [id]);
  if (rowCount === 0) {
    return res.status(404).json({ error: "Product not found." });
  }
  res.json({ ok: true });
});

module.exports = router;
