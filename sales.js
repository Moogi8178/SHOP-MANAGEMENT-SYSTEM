const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db");

const router = express.Router();

router.get("/", async (_req, res) => {
  const { rows: sales } = await pool.query("SELECT * FROM sales ORDER BY ts ASC");
  const { rows: items } = await pool.query("SELECT * FROM sale_items ORDER BY id ASC");

  const bySale = {};
  for (const s of sales) {
    bySale[s.id] = { id: s.id, timestamp: Number(s.ts), total: Number(s.total), items: [] };
  }
  for (const it of items) {
    if (bySale[it.sale_id]) {
      bySale[it.sale_id].items.push({
        productId: it.product_id,
        name: it.name,
        sellPrice: Number(it.sell_price),
        costPrice: Number(it.cost_price),
        qty: it.qty,
      });
    }
  }
  res.json(Object.values(bySale));
});

// Body: { items: [{ productId, qty }] }
// Server looks up authoritative prices & stock, decrements inventory, records the sale.
router.post("/", async (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Cart is empty." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const saleItems = [];
    let total = 0;

    for (const line of items) {
      const qty = Number(line.qty);
      if (!line.productId || !qty || qty <= 0) throw { status: 400, message: "Invalid cart line." };

      const { rows } = await client.query("SELECT * FROM products WHERE id = $1 FOR UPDATE", [line.productId]);
      const product = rows[0];
      if (!product) throw { status: 404, message: `Product not found: ${line.productId}` };
      if (product.quantity < qty) throw { status: 409, message: `Not enough stock for ${product.name}. Only ${product.quantity} left.` };

      await client.query("UPDATE products SET quantity = quantity - $1 WHERE id = $2", [qty, product.id]);

      const sellPrice = Number(product.sell_price);
      const costPrice = Number(product.cost_price);
      total += sellPrice * qty;
      saleItems.push({ productId: product.id, name: product.name, sellPrice, costPrice, qty });
    }

    const saleId = crypto.randomUUID();
    const ts = Date.now();
    await client.query("INSERT INTO sales (id, ts, total) VALUES ($1,$2,$3)", [saleId, ts, total]);

    for (const it of saleItems) {
      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, name, sell_price, cost_price, qty)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [saleId, it.productId, it.name, it.sellPrice, it.costPrice, it.qty]
      );
    }

    await client.query("COMMIT");
    res.status(201).json({ id: saleId, timestamp: ts, total, items: saleItems });
  } catch (err) {
    await client.query("ROLLBACK");
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Could not complete the sale." });
  } finally {
    client.release();
  }
});

module.exports = router;
