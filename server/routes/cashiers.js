const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db");
const { requireAdmin, signCashierToken } = require("../auth");
const { hashPassword, verifyPassword } = require("../password");

const router = express.Router();

function rowToCashier(r) {
  return { id: r.id, name: r.name, username: r.username, active: r.active, createdAt: Number(r.created_at) };
}

// Admin: list cashier accounts.
router.get("/", requireAdmin, async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM cashiers ORDER BY created_at DESC");
  res.json(rows.map(rowToCashier));
});

// Admin: create a cashier account. This is the only way accounts get created.
router.post("/", requireAdmin, async (req, res) => {
  const { name, username, password } = req.body || {};
  if (!name || !username || !password || password.length < 4) {
    return res.status(400).json({ error: "Name, username and a password (at least 4 characters) are required." });
  }

  const { rows: existing } = await pool.query(
    "SELECT id FROM cashiers WHERE lower(username) = lower($1)",
    [username.trim()]
  );
  if (existing.length > 0) {
    return res.status(409).json({ error: "That username is already taken." });
  }

  const id = crypto.randomUUID();
  const passwordHash = hashPassword(password);
  const { rows } = await pool.query(
    `INSERT INTO cashiers (id, name, username, password_hash, active, created_at)
     VALUES ($1,$2,$3,$4,true,$5) RETURNING *`,
    [id, name.trim(), username.trim(), passwordHash, Date.now()]
  );
  res.status(201).json(rowToCashier(rows[0]));
});

// Admin: remove a cashier account.
router.delete("/:id", requireAdmin, async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM cashiers WHERE id = $1", [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: "Cashier not found." });
  res.json({ ok: true });
});

// Public: cashier sign-in (used by the Register screen).
router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Enter your username and password." });
  }
  const { rows } = await pool.query(
    "SELECT * FROM cashiers WHERE lower(username) = lower($1)",
    [username.trim()]
  );
  const cashier = rows[0];
  if (!cashier || !cashier.active || !verifyPassword(password, cashier.password_hash)) {
    return res.status(401).json({ error: "Incorrect username or password." });
  }
  const token = signCashierToken(cashier);
  res.json({ token, name: cashier.name });
});

module.exports = router;
