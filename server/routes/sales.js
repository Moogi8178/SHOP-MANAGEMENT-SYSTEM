const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db");
const { requireCashierOrAdmin, requireAdmin } = require("../auth");

const router = express.Router();

const PAYMENT_METHODS = ["cash", "till", "debt"];

function saleRow(s) {
  const refundedAmount = Number(s.refunded_amount || 0);
  return {
    id: s.id,
    timestamp: Number(s.ts),
    total: Number(s.total),
    refundedAmount,
    netTotal: Number(s.total) - refundedAmount,
    cashierName: s.cashier_name || null,
    paymentMethod: s.payment_method || "cash",
    customerName: s.customer_name || null,
    customerPhone: s.customer_phone || null,
    debtSettled: s.debt_settled,
    items: [],
  };
}

function itemRow(it) {
  return {
    productId: it.product_id,
    name: it.name,
    sellPrice: Number(it.sell_price),
    costPrice: Number(it.cost_price),
    qty: it.qty,
    returnedQty: it.returned_qty || 0,
  };
}

router.get("/", async (_req, res) => {
  const { rows: sales } = await pool.query("SELECT * FROM sales ORDER BY ts DESC");
  const { rows: items } = await pool.query("SELECT * FROM sale_items ORDER BY id ASC");

  const bySale = {};
  for (const s of sales) bySale[s.id] = saleRow(s);
  for (const it of items) {
    if (bySale[it.sale_id]) bySale[it.sale_id].items.push(itemRow(it));
  }
  res.json(Object.values(bySale));
});

// Body: { items: [{ productId, qty, unitPrice? }], paymentMethod, customerName?, customerPhone? }
// unitPrice is only honored for products with a price range set, and is
// clamped to that range server-side. Otherwise the product's own sell
// price is used, ignoring anything the client sends.
router.post("/", requireCashierOrAdmin, async (req, res) => {
  const { items, paymentMethod, customerName, customerPhone } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Cart is empty." });
  }
  const method = paymentMethod && PAYMENT_METHODS.includes(paymentMethod) ? paymentMethod : "cash";

  const cashierId = req.auth.role === "cashier" ? req.auth.cashierId : null;
  const cashierName = req.auth.role === "cashier" ? req.auth.name : "Admin";

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

      let sellPrice = Number(product.sell_price);
      const priceMin = product.price_min != null ? Number(product.price_min) : null;
      const priceMax = product.price_max != null ? Number(product.price_max) : null;

      if (priceMin != null && priceMax != null && line.unitPrice != null && line.unitPrice !== "") {
        const requested = Number(line.unitPrice);
        if (Number.isNaN(requested) || requested < priceMin || requested > priceMax) {
          throw { status: 400, message: `Price for ${product.name} must be between ${priceMin} and ${priceMax}.` };
        }
        sellPrice = requested;
      }

      await client.query("UPDATE products SET quantity = quantity - $1 WHERE id = $2", [qty, product.id]);

      const costPrice = Number(product.cost_price);
      total += sellPrice * qty;
      saleItems.push({ productId: product.id, name: product.name, sellPrice, costPrice, qty });
    }

    const saleId = crypto.randomUUID();
    const ts = Date.now();
    const debtSettled = method !== "debt";
    const cName = (customerName || "").trim() || null;
    const cPhone = (customerPhone || "").trim() || null;

    await client.query(
      `INSERT INTO sales (id, ts, total, cashier_id, cashier_name, payment_method, customer_name, customer_phone, debt_settled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [saleId, ts, total, cashierId, cashierName, method, cName, cPhone, debtSettled]
    );

    for (const it of saleItems) {
      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, name, sell_price, cost_price, qty)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [saleId, it.productId, it.name, it.sellPrice, it.costPrice, it.qty]
      );
    }

    await client.query("COMMIT");
    res.status(201).json({
      id: saleId,
      timestamp: ts,
      total,
      refundedAmount: 0,
      netTotal: total,
      cashierName,
      paymentMethod: method,
      customerName: cName,
      customerPhone: cPhone,
      debtSettled,
      items: saleItems.map((it) => ({ ...it, returnedQty: 0 })),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Could not complete the sale." });
  } finally {
    client.release();
  }
});

// Admin: mark a debt as paid.
router.patch("/:id/settle-debt", requireAdmin, async (req, res) => {
  const { rows } = await pool.query(
    "UPDATE sales SET debt_settled = true WHERE id = $1 AND payment_method = 'debt' RETURNING *",
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: "Debt sale not found." });
  const sale = saleRow(rows[0]);
  const { rows: items } = await pool.query("SELECT * FROM sale_items WHERE sale_id = $1 ORDER BY id ASC", [req.params.id]);
  sale.items = items.map(itemRow);
  res.json(sale);
});

// Admin: process a return for one or more items on a sale. Restocks the
// returned quantity and increases the sale's refunded_amount; the original
// sale record is kept intact for audit purposes.
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

    const { rows: saleRows } = await client.query("SELECT * FROM sales WHERE id = $1 FOR UPDATE", [id]);
    if (saleRows.length === 0) throw { status: 404, message: "Sale not found." };

    let refundTotal = 0;

    for (const line of items) {
      const qty = Number(line.qty);
      if (!line.productId || !qty || qty <= 0) continue;

      const { rows: itemRows } = await client.query(
        "SELECT * FROM sale_items WHERE sale_id = $1 AND product_id = $2 FOR UPDATE",
        [id, line.productId]
      );
      const item = itemRows[0];
      if (!item) throw { status: 404, message: "That item isn't part of this sale." };

      const remaining = item.qty - item.returned_qty;
      if (qty > remaining) {
        throw { status: 400, message: `Only ${remaining} of ${item.name} can still be returned.` };
      }

      await client.query("UPDATE sale_items SET returned_qty = returned_qty + $1 WHERE id = $2", [qty, item.id]);
      await client.query("UPDATE products SET quantity = quantity + $1 WHERE id = $2", [qty, item.product_id]);

      refundTotal += qty * Number(item.sell_price);
    }

    if (refundTotal === 0) throw { status: 400, message: "Select at least one item to return." };

    const { rows: updatedSaleRows } = await client.query(
      "UPDATE sales SET refunded_amount = refunded_amount + $1 WHERE id = $2 RETURNING *",
      [refundTotal, id]
    );

    const { rows: updatedItems } = await client.query(
      "SELECT * FROM sale_items WHERE sale_id = $1 ORDER BY id ASC",
      [id]
    );

    await client.query("COMMIT");

    const result = saleRow(updatedSaleRows[0]);
    result.items = updatedItems.map(itemRow);
    res.json(result);
  } catch (err) {
    await client.query("ROLLBACK");
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Could not process the return." });
  } finally {
    client.release();
  }
});

// Admin: permanently delete a single sale record (does not adjust stock —
// use the return flow first if items need to go back into inventory).
router.delete("/:id", requireAdmin, async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM sales WHERE id = $1", [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: "Sale not found." });
  res.json({ ok: true });
});

// Admin: bulk-delete sales history. Optional ?paymentMethod=debt|cash|till
// scopes the wipe (e.g. clearing only debt records) instead of everything.
router.delete("/", requireAdmin, async (req, res) => {
  const { paymentMethod } = req.query;
  if (paymentMethod) {
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ error: "Invalid payment method filter." });
    }
    const { rowCount } = await pool.query("DELETE FROM sales WHERE payment_method = $1", [paymentMethod]);
    return res.json({ ok: true, deleted: rowCount });
  }
  const { rowCount } = await pool.query("DELETE FROM sales");
  res.json({ ok: true, deleted: rowCount });
});

module.exports = router;
