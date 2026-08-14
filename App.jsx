import { useState, useEffect, useCallback, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Hammer, Wrench, Package, TrendingUp, Plus, Search, ShoppingCart,
  Printer, X, AlertTriangle, Lock, LogOut, Boxes, DollarSign, Minus,
  ImagePlus, Trash2, CheckCircle2, RefreshCw,
} from "lucide-react";
import { api } from "./api";

const LOW_STOCK = 5;
const STORE_NAME = "EKAMBI HARDWARE";

const money = (n) => `KSh ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const dateKey = (ts) => new Date(ts).toISOString().slice(0, 10);

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 420;
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Tag({ children, tone }) {
  return <span className={`tag tone-${tone || "default"}`}>{children}</span>;
}

function ProductThumb({ src, size = 56 }) {
  if (src) return <img src={src} alt="" className="thumb" style={{ width: size, height: size }} />;
  return (
    <div className="thumb thumb-empty" style={{ width: size, height: size }}>
      <Wrench size={size * 0.4} />
    </div>
  );
}

function EmptyNote({ text }) {
  return <div className="empty-note">{text}</div>;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);

  const [view, setView] = useState("employee");
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem("ekambi_admin_token") || "");
  const [showPin, setShowPin] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([api.getProducts(), api.getSales()]);
      setProducts(p);
      setSales(s);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const submitPin = async () => {
    try {
      const { token } = await api.adminLogin(pinInput);
      localStorage.setItem("ekambi_admin_token", token);
      setAdminToken(token);
      setShowPin(false);
      setPinInput("");
      setPinError("");
      setView("admin");
    } catch (err) {
      setPinError(err.message || "Wrong PIN. Try again.");
      setPinInput("");
    }
  };

  const logoutAdmin = () => {
    localStorage.removeItem("ekambi_admin_token");
    setAdminToken("");
    setView("employee");
  };

  return (
    <div className="app-root">
      <header className="topbar no-print">
        <div className="brand">
          <div className="brand-icon"><Hammer size={20} /></div>
          <div>
            <div className="brand-name">{STORE_NAME}</div>
            <div className="brand-tag">Stock &amp; Till</div>
          </div>
        </div>
        <nav className="role-nav">
          <button className="refresh-btn" title="Refresh data" onClick={refresh}><RefreshCw size={15} /></button>
          <button className={view === "employee" ? "active" : ""} onClick={() => setView("employee")}>
            <ShoppingCart size={15} /> Register
          </button>
          <button
            className={view === "admin" ? "active" : ""}
            onClick={() => (adminToken ? setView("admin") : setShowPin(true))}
          >
            <Lock size={15} /> Admin
          </button>
          {adminToken && (
            <button className="logout" title="Log out of admin" onClick={logoutAdmin}>
              <LogOut size={15} />
            </button>
          )}
        </nav>
      </header>

      <main className="main no-print">
        {loadError && (
          <div className="banner-error">Couldn't reach the server: {loadError}. <button onClick={refresh}>Retry</button></div>
        )}
        {loading ? (
          <div className="loading-state"><Boxes size={26} /> Loading the stockroom…</div>
        ) : view === "admin" ? (
          <AdminPanel products={products} sales={sales} adminToken={adminToken} onChanged={refresh} onAuthFail={logoutAdmin} />
        ) : (
          <EmployeePanel products={products} onChanged={refresh} />
        )}
      </main>

      {showPin && (
        <div className="modal-backdrop no-print" onClick={() => setShowPin(false)}>
          <div className="pin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pin-modal-head"><Lock size={18} /> Admin PIN</div>
            <p className="pin-modal-sub">Enter the store's admin PIN to open profits &amp; stock intake.</p>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pinInput}
              onChange={(e) => { setPinInput(e.target.value.replace(/\D/g, "")); setPinError(""); }}
              onKeyDown={(e) => e.key === "Enter" && submitPin()}
              className={`pin-input ${pinError ? "err" : ""}`}
              placeholder="••••"
            />
            {pinError && <div className="pin-error">{pinError}</div>}
            <button className="btn btn-primary" style={{ width: "100%" }} onClick={submitPin}>Unlock</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ================= ADMIN =================
function AdminPanel({ products, sales, adminToken, onChanged, onAuthFail }) {
  const [tab, setTab] = useState("dashboard");

  return (
    <div className="panel">
      <div className="subnav">
        <button className={tab === "dashboard" ? "active" : ""} onClick={() => setTab("dashboard")}>
          <TrendingUp size={15} /> Dashboard
        </button>
        <button className={tab === "addstock" ? "active" : ""} onClick={() => setTab("addstock")}>
          <Plus size={15} /> Add Stock
        </button>
        <button className={tab === "inventory" ? "active" : ""} onClick={() => setTab("inventory")}>
          <Boxes size={15} /> Inventory
        </button>
      </div>

      {tab === "dashboard" && <Dashboard products={products} sales={sales} />}
      {tab === "addstock" && (
        <AddStockForm products={products} adminToken={adminToken} onChanged={onChanged} onAuthFail={onAuthFail} />
      )}
      {tab === "inventory" && <Inventory products={products} />}
    </div>
  );
}

function Dashboard({ products, sales }) {
  const stats = useMemo(() => {
    let revenue = 0, cost = 0, itemsSold = 0;
    for (const s of sales) {
      for (const it of s.items) {
        revenue += it.sellPrice * it.qty;
        cost += it.costPrice * it.qty;
        itemsSold += it.qty;
      }
    }
    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { revenue, cost, profit, margin, itemsSold, transactions: sales.length };
  }, [sales]);

  const dailySeries = useMemo(() => {
    const byDay = {};
    for (const s of sales) {
      const k = dateKey(s.timestamp);
      byDay[k] = byDay[k] || { day: k, revenue: 0, profit: 0 };
      for (const it of s.items) {
        byDay[k].revenue += it.sellPrice * it.qty;
        byDay[k].profit += (it.sellPrice - it.costPrice) * it.qty;
      }
    }
    return Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day)).slice(-14);
  }, [sales]);

  const topProducts = useMemo(() => {
    const byName = {};
    for (const s of sales) {
      for (const it of s.items) {
        byName[it.name] = byName[it.name] || { name: it.name, revenue: 0, qty: 0 };
        byName[it.name].revenue += it.sellPrice * it.qty;
        byName[it.name].qty += it.qty;
      }
    }
    return Object.values(byName).sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  }, [sales]);

  const lowStock = products.filter((p) => p.quantity <= LOW_STOCK);

  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label"><DollarSign size={14} /> Revenue</div>
          <div className="kpi-value">{money(stats.revenue)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><Package size={14} /> Cost of goods</div>
          <div className="kpi-value">{money(stats.cost)}</div>
        </div>
        <div className="kpi-card kpi-highlight">
          <div className="kpi-label"><TrendingUp size={14} /> Profit</div>
          <div className="kpi-value">{money(stats.profit)}</div>
          <div className="kpi-sub">{stats.margin.toFixed(1)}% margin</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><ShoppingCart size={14} /> Transactions</div>
          <div className="kpi-value">{stats.transactions}</div>
          <div className="kpi-sub">{stats.itemsSold} items sold</div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <div className="chart-title">Revenue &amp; profit, last 14 days</div>
          {dailySeries.length === 0 ? (
            <EmptyNote text="No sales recorded yet — figures will chart here as receipts come in." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={dailySeries}>
                <CartesianGrid stroke="#DCD8D0" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace" }} tickFormatter={(d) => d.slice(5)} stroke="#5B6167" />
                <YAxis tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace" }} stroke="#5B6167" width={44} />
                <Tooltip formatter={(v) => money(v)} labelStyle={{ fontFamily: "IBM Plex Mono, monospace" }} contentStyle={{ fontFamily: "IBM Plex Sans, sans-serif", fontSize: 12, borderRadius: 8 }} />
                <Line type="monotone" dataKey="revenue" stroke="#5B6167" strokeWidth={2} dot={false} name="Revenue" />
                <Line type="monotone" dataKey="profit" stroke="#2D6A4F" strokeWidth={2.5} dot={false} name="Profit" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="chart-card">
          <div className="chart-title">Top sellers by revenue</div>
          {topProducts.length === 0 ? (
            <EmptyNote text="Top sellers show up here once items have been rung up." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={topProducts} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid stroke="#DCD8D0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace" }} stroke="#5B6167" />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} stroke="#5B6167" />
                <Tooltip formatter={(v) => money(v)} contentStyle={{ fontFamily: "IBM Plex Sans, sans-serif", fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="revenue" fill="#F5B700" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="chart-card" style={{ marginTop: 16 }}>
        <div className="chart-title"><AlertTriangle size={15} color="#C1440E" /> Low stock ({LOW_STOCK} units or fewer)</div>
        {lowStock.length === 0 ? (
          <EmptyNote text="Everything is stocked above the low-stock line." />
        ) : (
          <div className="low-stock-list">
            {lowStock.map((p) => (
              <div className="low-stock-row" key={p.id}>
                <ProductThumb src={p.imageDataUrl} size={36} />
                <div className="low-stock-name">{p.name}</div>
                <Tag tone="danger">{p.quantity} left</Tag>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AddStockForm({ products, adminToken, onChanged, onAuthFail }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const existing = useMemo(
    () => products.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase()),
    [products, name]
  );

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setImageDataUrl(await compressImage(file));
    } catch { /* ignore bad image */ }
  };

  const reset = () => {
    setName(""); setCategory(""); setCostPrice(""); setSellPrice(""); setQuantity(""); setImageDataUrl(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name || !costPrice || !sellPrice || !quantity) return;
    setSaving(true);
    setError("");
    try {
      await api.addStock(
        {
          name: name.trim(),
          category: category.trim(),
          costPrice: Number(costPrice),
          sellPrice: Number(sellPrice),
          quantity: Number(quantity),
          imageDataUrl,
        },
        adminToken
      );
      await onChanged();
      setDone(true);
      reset();
      setTimeout(() => setDone(false), 2200);
    } catch (err) {
      if (String(err.message).toLowerCase().includes("login")) onAuthFail();
      setError(err.message || "Could not save this product.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="addstock-wrap">
      <form className="card form-card" onSubmit={submit}>
        <div className="form-title">Restock a product</div>
        <p className="form-hint">
          Log what came in, what it cost, and what it should sell for. Matching an existing product name adds to
          its stock and updates the price.
        </p>

        <label className="field">
          <span>Product name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 4-inch Hinge (pair)" required />
          {existing && <span className="field-note">Matches existing stock — this restocks {existing.quantity} → {existing.quantity + (Number(quantity) || 0)}</span>}
        </label>

        <label className="field">
          <span>Category</span>
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Fasteners, Tools, Plumbing" />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Cost price (bought at)</span>
            <input type="number" min="0" step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="0" required />
          </label>
          <label className="field">
            <span>Sell price (list at)</span>
            <input type="number" min="0" step="0.01" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} placeholder="0" required />
          </label>
          <label className="field">
            <span>Quantity restocked</span>
            <input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" required />
          </label>
        </div>

        {costPrice && sellPrice && (
          <div className="margin-preview">
            Margin per unit: <strong>{money(Number(sellPrice) - Number(costPrice))}</strong>
            {" "}({(((Number(sellPrice) - Number(costPrice)) / Number(sellPrice || 1)) * 100).toFixed(1)}%)
          </div>
        )}

        <label className="field">
          <span>Product photo</span>
          <div className="image-upload">
            <ProductThumb src={imageDataUrl} size={64} />
            <label className="btn btn-ghost">
              <ImagePlus size={15} /> Choose image
              <input type="file" accept="image/*" onChange={onFile} hidden />
            </label>
          </div>
        </label>

        {error && <div className="pin-error" style={{ marginBottom: 10 }}>{error}</div>}

        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : existing ? "Restock product" : "Add product to inventory"}
        </button>
        {done && <div className="save-confirm"><CheckCircle2 size={15} /> Saved to inventory</div>}
      </form>
    </div>
  );
}

function Inventory({ products }) {
  const [q, setQ] = useState("");
  const filtered = products
    .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.category.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.dateAdded - a.dateAdded);

  return (
    <div>
      <div className="search-row">
        <Search size={16} />
        <input placeholder="Search inventory…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {filtered.length === 0 ? (
        <EmptyNote text="No products yet — add stock to see it listed here." />
      ) : (
        <div className="table-wrap">
          <table className="inv-table">
            <thead>
              <tr>
                <th></th><th>Product</th><th>Category</th><th>Cost</th><th>Sell</th><th>Margin</th><th>Qty</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className={p.quantity <= LOW_STOCK ? "row-low" : ""}>
                  <td><ProductThumb src={p.imageDataUrl} size={40} /></td>
                  <td className="cell-name">{p.name}</td>
                  <td><Tag>{p.category}</Tag></td>
                  <td className="mono">{money(p.costPrice)}</td>
                  <td className="mono">{money(p.sellPrice)}</td>
                  <td className="mono">{money(p.sellPrice - p.costPrice)}</td>
                  <td className="mono">
                    {p.quantity}
                    {p.quantity <= LOW_STOCK && <Tag tone="danger">low</Tag>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ================= EMPLOYEE =================
function EmployeePanel({ products, onChanged }) {
  const [q, setQ] = useState("");
  const [cart, setCart] = useState([]);
  const [receipt, setReceipt] = useState(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState("");

  const filtered = products.filter(
    (p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.category.toLowerCase().includes(q.toLowerCase())
  );

  const addToCart = (p) => {
    if (p.quantity <= 0) return;
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === p.id);
      if (existing) {
        if (existing.qty >= p.quantity) return prev;
        return prev.map((c) => (c.productId === p.id ? { ...c, qty: c.qty + 1 } : c));
      }
      return [...prev, { productId: p.id, name: p.name, sellPrice: p.sellPrice, qty: 1, stock: p.quantity }];
    });
  };

  const changeQty = (id, delta) => {
    setCart((prev) =>
      prev
        .map((c) => (c.productId === id ? { ...c, qty: Math.min(c.stock, Math.max(0, c.qty + delta)) } : c))
        .filter((c) => c.qty > 0)
    );
  };

  const removeItem = (id) => setCart((prev) => prev.filter((c) => c.productId !== id));

  const total = cart.reduce((s, c) => s + c.sellPrice * c.qty, 0);

  const checkout = async () => {
    if (cart.length === 0 || checkingOut) return;
    setCheckingOut(true);
    setError("");
    try {
      const sale = await api.createSale(cart.map((c) => ({ productId: c.productId, qty: c.qty })));
      setReceipt(sale);
      setCart([]);
      await onChanged();
    } catch (err) {
      setError(err.message || "Could not complete the sale.");
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <div className="register-wrap">
      <div className="catalog">
        <div className="search-row">
          <Search size={16} />
          <input placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {filtered.length === 0 ? (
          <EmptyNote text={products.length === 0 ? "No products in stock yet — ask an admin to add stock." : "No matches for that search."} />
        ) : (
          <div className="product-grid">
            {filtered.map((p) => (
              <button key={p.id} className="price-tag" onClick={() => addToCart(p)} disabled={p.quantity <= 0}>
                <span className="tag-hole" />
                <ProductThumb src={p.imageDataUrl} size={64} />
                <div className="tag-name">{p.name}</div>
                <div className="tag-cat">{p.category}</div>
                <div className="tag-price">{money(p.sellPrice)}</div>
                <div className={`tag-stock ${p.quantity <= LOW_STOCK ? "low" : ""}`}>
                  {p.quantity > 0 ? `${p.quantity} in stock` : "Out of stock"}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="cart-panel">
        <div className="cart-head"><ShoppingCart size={16} /> Current sale</div>
        {cart.length === 0 ? (
          <EmptyNote text="Tap a product to add it to the sale." />
        ) : (
          <div className="cart-items">
            {cart.map((c) => (
              <div className="cart-item" key={c.productId}>
                <div className="cart-item-name">{c.name}</div>
                <div className="cart-item-controls">
                  <button onClick={() => changeQty(c.productId, -1)}><Minus size={13} /></button>
                  <span className="mono">{c.qty}</span>
                  <button onClick={() => changeQty(c.productId, 1)} disabled={c.qty >= c.stock}><Plus size={13} /></button>
                  <button className="cart-remove" onClick={() => removeItem(c.productId)}><Trash2 size={13} /></button>
                </div>
                <div className="cart-item-total mono">{money(c.sellPrice * c.qty)}</div>
              </div>
            ))}
          </div>
        )}
        <div className="cart-total-row">
          <span>Total</span>
          <span className="mono cart-total">{money(total)}</span>
        </div>
        {error && <div className="pin-error" style={{ marginBottom: 10 }}>{error}</div>}
        <button className="btn btn-primary" style={{ width: "100%" }} disabled={cart.length === 0 || checkingOut} onClick={checkout}>
          {checkingOut ? "Processing…" : "Checkout & print receipt"}
        </button>
      </div>

      {receipt && <ReceiptModal sale={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

function ReceiptModal({ sale, onClose }) {
  const dt = new Date(sale.timestamp);
  return (
    <div className="modal-backdrop">
      <div className="receipt-shell">
        <div className="receipt-print">
          <div className="receipt-paper">
            <div className="receipt-store">{STORE_NAME}</div>
            <div className="receipt-sub">Stock &amp; Till · Sales Receipt</div>
            <div className="receipt-meta">
              {dt.toLocaleDateString()} {dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="receipt-meta">Ticket #{sale.id.slice(-6).toUpperCase()}</div>
            <div className="receipt-divider" />
            <div className="receipt-lines">
              {sale.items.map((it) => (
                <div className="receipt-line" key={it.productId}>
                  <div className="receipt-line-name">{it.name}</div>
                  <div className="receipt-line-qty mono">{it.qty} × {money(it.sellPrice)}</div>
                  <div className="receipt-line-total mono">{money(it.qty * it.sellPrice)}</div>
                </div>
              ))}
            </div>
            <div className="receipt-divider" />
            <div className="receipt-total-row">
              <span>TOTAL</span>
              <span className="mono">{money(sale.total)}</span>
            </div>
            <div className="receipt-footer">Thank you for shopping with us</div>
          </div>
        </div>
        <div className="receipt-actions no-print">
          <button className="btn btn-ghost" onClick={onClose}><X size={15} /> Close</button>
          <button className="btn btn-primary" onClick={() => window.print()}><Printer size={15} /> Print</button>
        </div>
      </div>
    </div>
  );
}
