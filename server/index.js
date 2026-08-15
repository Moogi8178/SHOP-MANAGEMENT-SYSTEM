require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const { initDb } = require("./db");

const productsRouter = require("./routes/products");
const salesRouter = require("./routes/sales");
const adminRouter = require("./routes/admin");
const cashiersRouter = require("./routes/cashiers");
const pettyCashRouter = require("./routes/pettycash");

const app = express();
app.use(cors());
app.use(express.json({ limit: "12mb" })); // product photos are base64

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/products", productsRouter);
app.use("/api/sales", salesRouter);
app.use("/api/admin", adminRouter);
app.use("/api/cashiers", cashiersRouter);
app.use("/api/pettycash", pettyCashRouter);

// Serve the built React app in production.
const clientDist = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientDist));
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Ekambi Hardware server listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });
