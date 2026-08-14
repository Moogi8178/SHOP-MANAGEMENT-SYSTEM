const express = require("express");
const { signAdminToken } = require("../auth");

const router = express.Router();

router.post("/login", (req, res) => {
  const { pin } = req.body || {};
  const correctPin = process.env.ADMIN_PIN || "2580";
  if (!pin || pin !== correctPin) {
    return res.status(401).json({ error: "Incorrect PIN." });
  }
  const token = signAdminToken();
  res.json({ token });
});

module.exports = router;
