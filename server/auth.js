const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "dev-only-secret-change-me";

function signAdminToken() {
  return jwt.sign({ role: "admin" }, SECRET, { expiresIn: "12h" });
}

function signCashierToken(cashier) {
  return jwt.sign({ role: "cashier", cashierId: cashier.id, name: cashier.name }, SECRET, { expiresIn: "12h" });
}

function readToken(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

function requireAdmin(req, res, next) {
  const payload = readToken(req);
  if (!payload || payload.role !== "admin") {
    return res.status(401).json({ error: "Admin login required." });
  }
  req.auth = payload;
  next();
}

// Sales can be rung up by a logged-in cashier, or by an admin directly.
function requireCashierOrAdmin(req, res, next) {
  const payload = readToken(req);
  if (!payload || (payload.role !== "cashier" && payload.role !== "admin")) {
    return res.status(401).json({ error: "Cashier login required." });
  }
  req.auth = payload;
  next();
}

module.exports = { signAdminToken, signCashierToken, requireAdmin, requireCashierOrAdmin, SECRET };
