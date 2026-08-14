const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "dev-only-secret-change-me";

function signAdminToken() {
  return jwt.sign({ role: "admin" }, SECRET, { expiresIn: "12h" });
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Admin login required." });
  try {
    const payload = jwt.verify(token, SECRET);
    if (payload.role !== "admin") throw new Error("bad role");
    next();
  } catch {
    return res.status(401).json({ error: "Session expired or invalid. Log in again." });
  }
}

module.exports = { signAdminToken, requireAdmin, SECRET };
