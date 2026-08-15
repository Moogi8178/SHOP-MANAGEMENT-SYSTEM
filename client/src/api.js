async function handle(res) {
  if (!res.ok) {
    let msg = "Something went wrong.";
    try {
      const body = await res.json();
      msg = body.error || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  getProducts: () => fetch("/api/products").then(handle),

  addStock: (payload, token) =>
    fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    }).then(handle),

  updateProduct: (id, payload, token) =>
    fetch(`/api/products/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    }).then(handle),

  deleteProduct: (id, token) =>
    fetch(`/api/products/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).then(handle),

  getSales: () => fetch("/api/sales").then(handle),

  createSale: (items, cashierToken) =>
    fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cashierToken}` },
      body: JSON.stringify({ items }),
    }).then(handle),

  adminLogin: (pin) =>
    fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    }).then(handle),

  cashierLogin: (username, password) =>
    fetch("/api/cashiers/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(handle),

  listCashiers: (token) =>
    fetch("/api/cashiers", { headers: { Authorization: `Bearer ${token}` } }).then(handle),

  createCashier: (payload, token) =>
    fetch("/api/cashiers", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    }).then(handle),

  deleteCashier: (id, token) =>
    fetch(`/api/cashiers/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).then(handle),
};
