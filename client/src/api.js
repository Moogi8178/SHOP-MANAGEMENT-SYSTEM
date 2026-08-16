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

  createSale: (payload, cashierToken) =>
    fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cashierToken}` },
      body: JSON.stringify(payload),
    }).then(handle),

  settleDebt: (id, token) =>
    fetch(`/api/sales/${id}/settle-debt`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    }).then(handle),

  processReturn: (saleId, items, token) =>
    fetch(`/api/sales/${saleId}/return`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ items }),
    }).then(handle),

  deleteSale: (id, token) =>
    fetch(`/api/sales/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).then(handle),

  clearSales: (token, paymentMethod) =>
    fetch(`/api/sales${paymentMethod ? `?paymentMethod=${paymentMethod}` : ""}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
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

  listPettyCash: (token) =>
    fetch("/api/pettycash", { headers: { Authorization: `Bearer ${token}` } }).then(handle),

  createPettyCash: (payload, cashierToken) =>
    fetch("/api/pettycash", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cashierToken}` },
      body: JSON.stringify(payload),
    }).then(handle),

  deletePettyCash: (id, token) =>
    fetch(`/api/pettycash/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).then(handle),

  clearPettyCash: (token) =>
    fetch("/api/pettycash", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).then(handle),

  listBorrows: (token) =>
    fetch("/api/borrows", { headers: { Authorization: `Bearer ${token}` } }).then(handle),

  createBorrow: (payload, cashierToken) =>
    fetch("/api/borrows", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cashierToken}` },
      body: JSON.stringify(payload),
    }).then(handle),

  returnBorrowItems: (id, items, token) =>
    fetch(`/api/borrows/${id}/return`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ items }),
    }).then(handle),

  deleteBorrow: (id, token) =>
    fetch(`/api/borrows/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).then(handle),

  clearBorrows: (token) =>
    fetch("/api/borrows", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).then(handle),
};
