const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db");
const { requireCashierOrAdmin, requireAdmin } = require("../auth");

const router = express.Router();

function rowToEntry(r) {
  return {
    id: r.id,
    amount: Number(r.amount),
    reason: r.reason,
    cashierName: r.cashier_name,
    timestamp: Number(r.ts),
  };
}

// Admin: view every petty cash entry.
router.get("/", requireAdmin, async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM petty_cash ORDER BY ts DESC");
  res.json(rows.map(rowToEntry));
});

// Cashier (or admin): log a petty cash expense.
router.post("/", requireCashierOrAdmin, async (req, res) => {
  const { amount, reason } = req.body || {};
  const amt = Number(amount);
  if (!amt || amt <= 0 || !reason || !reason.trim()) {
    return res.status(400).json({ error: "Enter an amount and what it was used for." });
  }

  const cashierName = req.auth.role === "cashier" ? req.auth.name : "Admin";
  const cashierId = req.auth.role === "cashier" ? req.auth.cashierId : null;
  const id = crypto.randomUUID();
  const ts = Date.now();

  const { rows } = await pool.query(
    `INSERT INTO petty_cash (id, amount, reason, cashier_id, cashier_name, ts)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [id, amt, reason.trim(), cashierId, cashierName, ts]
  );
  res.status(201).json(rowToEntry(rows[0]));
});

module.exports = router;
