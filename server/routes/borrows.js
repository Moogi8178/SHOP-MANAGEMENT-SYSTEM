const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db");
const { requireCashierOrAdmin, requireAdmin } = require("../auth");

const router = express.Router();

function borrowRow(b) {
  return {
    id: b.id,
    timestamp: Number(b.ts),
    customerName: b.customer_name || null,
    customerPhone: b.customer_phone || null,
    cashierName: b.cashier_name || null,
    returned: b.returned,
    returnedAt: b.returned_at != null ? Number(b.returned_at) : null,
    items: [],
  };
}

function itemRow(it) {
  return {
    productId: it.product_id,
    name: it.name,
    qty: it.qty,
    returnedQty: it.returned_qty || 0,
  };
}

// Admin: list every borrow record.
router.get("/", requireAdmin, async (_req, res) => {
  const { rows: borrows } = await pool.query("SELECT * FROM borrows ORDER BY ts DESC");
  const { rows: items } = await pool.query("SELECT * FROM borrow_items ORDER BY id ASC");

  const byBorrow = {};
  for (const b of borrows) byBorrow[b.id] = borrowRow(b);
  for (const it of items) {
    if (byBorrow[it.borrow_id]) byBorrow[it.borrow_id].items.push(itemRow(it));
  }
  res.json(Object.values(byBorrow));
});

// Cashier or admin: log items being borrowed. Stock is removed from
// inventory immediately, same as a sale, since the items leave the store.
// Body: { items: [{ productId, qty }], customerName, customerPhone }
router.post("/", requireCashierOrAdmin, async (req, res) => {
  const { items, customerName, customerPhone } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Select at least one item to borrow." });
  }
  if (!customerName || !customerName.trim()) {
    return res.status(400).json({ error: "A customer name is required to log a borrow." });
  }

  const cashierId = req.auth.role === "cashier" ? req.auth.cashierId : null;
  const cashierName = req.auth.role === "cashier" ? req.auth.name : "Admin";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const borrowItems = [];
    for (const line of items) {
      const qty = Number(line.qty);
      if (!line.productId || !qty || qty <= 0) throw { status: 400, message: "Invalid item line." };

      const { rows } = await client.query("SELECT * FROM products WHERE id = $1 FOR UPDATE", [line.productId]);
      const product = rows[0];
      if (!product) throw { status: 404, message: `Product not found: ${line.productId}` };
      if (product.quantity < qty) throw { status: 409, message: `Not enough stock for ${product.name}. Only ${product.quantity} left.` };

      await client.query("UPDATE products SET quantity = quantity - $1 WHERE id = $2", [qty, product.id]);
      borrowItems.push({ productId: product.id, name: product.name, qty });
    }

    const id = crypto.randomUUID();
    const ts = Date.now();
    const cName = customerName.trim();
    const cPhone = (customerPhone || "").trim() || null;

    await client.query(
      `INSERT INTO borrows (id, ts, customer_name, customer_phone, cashier_id, cashier_name, returned)
       VALUES ($1,$2,$3,$4,$5,$6,false)`,
      [id, ts, cName, cPhone, cashierId, cashierName]
    );

    for (const it of borrowItems) {
      await client.query(
        `INSERT INTO borrow_items (borrow_id, product_id, name, qty) VALUES ($1,$2,$3,$4)`,
        [id, it.productId, it.name, it.qty]
      );
    }

    await client.query("COMMIT");
    res.status(201).json({
      id,
      timestamp: ts,
      customerName: cName,
      customerPhone: cPhone,
      cashierName,
      returned: false,
      returnedAt: null,
      items: borrowItems.map((it) => ({ ...it, returnedQty: 0 })),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Could not log this borrow." });
  } finally {
    client.release();
  }
});

// Admin: mark item(s) as returned. Restocks quantity; marks the whole
// borrow as returned once every item is fully back.
// Body: { items: [{ productId, qty }] }
router.patch("/:id/return", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Select at least one item to return." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: borrowRows } = await client.query("SELECT * FROM borrows WHERE id = $1 FOR UPDATE", [id]);
    if (borrowRows.length === 0) throw { status: 404, message: "Borrow record not found." };

    let anyReturned = false;
    for (const line of items) {
      const qty = Number(line.qty);
      if (!line.productId || !qty || qty <= 0) continue;

      const { rows: itemRows } = await client.query(
        "SELECT * FROM borrow_items WHERE borrow_id = $1 AND product_id = $2 FOR UPDATE",
        [id, line.productId]
      );
      const item = itemRows[0];
      if (!item) throw { status: 404, message: "That item isn't part of this borrow." };

      const remaining = item.qty - item.returned_qty;
      if (qty > remaining) {
        throw { status: 400, message: `Only ${remaining} of ${item.name} can still be returned.` };
      }

      await client.query("UPDATE borrow_items SET returned_qty = returned_qty + $1 WHERE id = $2", [qty, item.id]);
      await client.query("UPDATE products SET quantity = quantity + $1 WHERE id = $2", [qty, item.product_id]);
      anyReturned = true;
    }

    if (!anyReturned) throw { status: 400, message: "Select at least one item to return." };

    const { rows: allItems } = await client.query("SELECT * FROM borrow_items WHERE borrow_id = $1", [id]);
    const fullyReturned = allItems.every((it) => it.returned_qty >= it.qty);

    const { rows: updatedBorrowRows } = await client.query(
      `UPDATE borrows SET returned = $1, returned_at = $2 WHERE id = $3 RETURNING *`,
      [fullyReturned, fullyReturned ? Date.now() : null, id]
    );

    await client.query("COMMIT");

    const result = borrowRow(updatedBorrowRows[0]);
    result.items = allItems.map(itemRow);
    res.json(result);
  } catch (err) {
    await client.query("ROLLBACK");
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Could not process the return." });
  } finally {
    client.release();
  }
});

// Admin: delete a single borrow record permanently.
router.delete("/:id", requireAdmin, async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM borrows WHERE id = $1", [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: "Borrow record not found." });
  res.json({ ok: true });
});

// Admin: bulk-delete all borrow records.
router.delete("/", requireAdmin, async (_req, res) => {
  const { rowCount } = await pool.query("DELETE FROM borrows");
  res.json({ ok: true, deleted: rowCount });
});

module.exports = router;
