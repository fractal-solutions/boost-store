import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, CreditCard, History as HistoryIcon, Pencil, Plus, Search, ShieldCheck, Trash2, Wallet } from "lucide-react";
import { TrackOrder } from "../storefront/TrackOrder";
import { Logo } from "../ui/Logo";
import { api, placeholderImage, type Accounting, type AccountingOptions, type Account, type CrmCustomer, type GatewayView, type InventoryItem, type Order, type Product, type ProductHistory, type Purchase, type StoreSummary, type Vendor, type Warehouse } from "@/lib/api";
import { formatDateTime, formatMoney, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, statusTone } from "@/lib/format";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "orders", label: "Orders" },
  { key: "inventory", label: "Inventory" },
  { key: "purchases", label: "Purchases" },
  { key: "crm", label: "CRM" },
  { key: "payments", label: "Payments" },
  { key: "delivery", label: "Delivery" },
  { key: "settings", label: "Settings" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export function Admin({ account, onExit, onSignOut }: { account: Account; onExit: () => void; onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [store, setStore] = useState<StoreSummary | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [gateways, setGateways] = useState<GatewayView[]>([]);
  const [stats, setStats] = useState<{ orders: number; revenue: number; currency: string; customers: number; byStatus: Record<string, number> } | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadAll = useCallback(async () => {
    try {
      const [nextStore, nextOrders, nextProducts, nextGateways, nextStats] = await Promise.all([
        api.get<StoreSummary>("/api/admin/settings"),
        api.get<Order[]>("/api/admin/orders"),
        api.get<Product[]>("/api/admin/products"),
        api.get<GatewayView[]>("/api/admin/payments/gateways"),
        api.get<{ orders: number; revenue: number; currency: string; customers: number; byStatus: Record<string, number> }>("/api/admin/stats"),
      ]);
      setStore(nextStore);
      setOrders(nextOrders);
      setProducts(nextProducts);
      setGateways(nextGateways);
      setStats(nextStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data.");
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900"><Logo className="bolt-glow h-4 w-4 text-amber-400" /></span>
            {store?.name ?? "Boost Store"} · Admin
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{account.email}</span>
            <button onClick={onExit} className="rounded-lg border px-3 py-1.5 hover:bg-muted">View store</button>
            <button onClick={onSignOut} className="rounded-lg border px-3 py-1.5 hover:bg-muted">Sign out</button>
          </div>
        </div>
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
          {TABS.map((item) => (
            <button key={item.key} onClick={() => { setTab(item.key); setSelectedOrder(null); }} className={cn("border-b-2 px-3 py-2 text-sm", tab === item.key ? "border-amber-700 font-medium text-amber-800" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {error && <p className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {tab === "dashboard" && stats && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Orders" value={String(stats.orders)} />
              <Stat label="Revenue" value={formatMoney(stats.revenue, stats.currency)} />
              <Stat label="Customers" value={String(stats.customers)} />
              <Stat label="Delivered" value={String(stats.byStatus.delivered ?? 0)} />
            </div>
            <div className="rounded-xl border bg-background p-4">
              <h3 className="mb-3 font-medium">Recent orders</h3>
              <OrderTable orders={orders.slice(0, 6)} currency={stats.currency} onOpen={setSelectedOrder} />
            </div>
          </div>
        )}

        {tab === "orders" && (
          selectedOrder ? (
            <div>
              <button onClick={() => setSelectedOrder(null)} className="mb-4 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">← All orders</button>
              <div className="rounded-xl border bg-background p-5">
                <TrackOrder orderId={selectedOrder} />
                <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
                  {["processing", "ready", "dispatched", "delivered", "cancelled"].map((status) => (
                    <button key={status} onClick={async () => { await api.patch(`/api/admin/orders/${selectedOrder}/status`, { status }); void loadAll(); }} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
                      Mark {ORDER_STATUS_LABELS[status]}
                    </button>
                  ))}
                  <button onClick={async () => { await api.post(`/api/admin/orders/${selectedOrder}/book-delivery`); void loadAll(); }} className="rounded-lg bg-amber-700 px-3 py-1.5 text-sm text-white">Book delivery</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border bg-background p-4">
              <OrderTable orders={orders} currency={store?.currency ?? "KES"} onOpen={setSelectedOrder} />
            </div>
          )
        )}

        {tab === "inventory" && <InventoryPanel currency={store?.currency ?? "KES"} />}
        {tab === "purchases" && <PurchasesPanel currency={store?.currency ?? "KES"} />}
        {tab === "crm" && <CrmPanel currency={store?.currency ?? "KES"} />}
        {tab === "payments" && store && <PaymentsPanel store={store} gateways={gateways} reload={loadAll} />}
        {tab === "delivery" && store && <DeliveryPanel store={store} reload={loadAll} />}
        {tab === "settings" && store && <SettingsPanel store={store} reload={loadAll} />}
      </main>
    </div>
  );
}

function CrmPanel({ currency }: { currency: string }) {
  const [customers, setCustomers] = useState<CrmCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [gender, setGender] = useState("");

  useEffect(() => {
    void api.get<CrmCustomer[]>("/api/admin/customers").then(setCustomers).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = customers.filter((c) => {
    if (gender && c.gender !== gender) return false;
    if (query && !`${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const now = new Date();
  const newThisMonth = customers.filter((c) => { const d = new Date(c.createdAt); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); }).length;
  const withOrders = customers.filter((c) => c.orders > 0).length;
  const spend = customers.reduce((sum, c) => sum + c.spent, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Customers" value={String(customers.length)} />
        <Stat label="New this month" value={String(newThisMonth)} />
        <Stat label="With orders" value={String(withOrders)} />
        <Stat label="Lifetime spend" value={formatMoney(spend, currency)} />
      </div>

      <div className="rounded-xl border bg-background p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg border px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email or phone" className="w-full bg-transparent text-sm outline-none" />
          </div>
          <select value={gender} onChange={(event) => setGender(event.target.value)} className="rounded-lg border px-3 py-2 text-sm">
            <option value="">All genders</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading customers…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No customers found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Customer</th>
                  <th>Gender</th>
                  <th>Birthday</th>
                  <th>Age</th>
                  <th className="text-right">Orders</th>
                  <th className="text-right">Spent</th>
                  <th>Last order</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="py-2">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.email} · {c.phone}</p>
                    </td>
                    <td className="capitalize">{c.gender || "—"}</td>
                    <td>{c.birthday || "—"}</td>
                    <td>{c.age ?? "—"}</td>
                    <td className="text-right">{c.orders}</td>
                    <td className="text-right">{formatMoney(c.spent, currency)}</td>
                    <td className="text-xs text-muted-foreground">{c.lastOrderAt ? formatDateTime(c.lastOrderAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function InventoryPanel({ currency }: { currency: string }) {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingWarehouse, setEditingWarehouse] = useState<Partial<Warehouse> | null>(null);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const [inv, wh] = await Promise.all([api.get<InventoryItem[]>("/api/admin/inventory"), api.get<Warehouse[]>("/api/admin/warehouses")]);
    setInventory(inv);
    setWarehouses(wh);
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const openEdit = (item: InventoryItem) =>
    setEditingProduct({ id: item.productId, name: item.name, category: item.category, price: item.price, image: item.image, status: item.status, warehouseId: item.warehouseId, stock: item.quantity, reorderLevel: item.reorderLevel });

  const askDeleteWarehouse = (w: Warehouse) =>
    setConfirm({
      title: "Delete warehouse?",
      message: `“${w.name}” will be removed. Its products become unassigned but keep their catalogue entries.`,
      confirmLabel: "Delete warehouse",
      onConfirm: async () => {
        await api.del(`/api/admin/warehouses/${w.id}`);
        await load();
      },
    });

  const units = inventory.reduce((sum, item) => sum + item.quantity, 0);
  const value = inventory.reduce((sum, item) => sum + item.value, 0);
  const costValue = inventory.reduce((sum, item) => sum + item.costValue, 0);
  const marginValue = inventory.reduce((sum, item) => sum + item.marginValue, 0);
  const low = inventory.filter((item) => item.low).length;
  const inTransit = inventory.reduce((sum, item) => sum + item.inTransit, 0);
  const warehouseValue = inventory.reduce((map, item) => {
    const key = item.warehouseId || "";
    map.set(key, (map.get(key) ?? 0) + item.value);
    return map;
  }, new Map<string, number>());
  const warehouseMargin = inventory.reduce((map, item) => {
    const key = item.warehouseId || "";
    map.set(key, (map.get(key) ?? 0) + item.marginValue);
    return map;
  }, new Map<string, number>());
  const filtered = inventory.filter((item) => `${item.name} ${item.category} ${item.sku}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="SKUs" value={String(inventory.length)} />
        <Stat label="On hand" value={String(units)} />
        <Stat label="In transit" value={String(inTransit)} />
        <Stat label="Low stock" value={String(low)} />
        <Stat label="Retail value" value={formatMoney(value, currency)} />
        <Stat label="At cost" value={formatMoney(costValue, currency)} />
        <Stat label="Margin" value={formatMoney(marginValue, currency)} />
      </div>

      <div className="rounded-xl border bg-background p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">Warehouses</p>
            <p className="text-xs text-muted-foreground">Pickup locations, operating hours and contacts.</p>
          </div>
          <button onClick={() => setEditingWarehouse({ active: true, hours: { alwaysOpen: true, days: [...WEEKDAYS], open: "08:00", close: "18:00" } })} className="rounded-lg bg-amber-700 px-3 py-1.5 text-sm text-white">New warehouse</button>
        </div>
        {warehouses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No warehouses yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {warehouses.map((w) => (
              <div key={w.id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{w.name}{w.code && <span className="text-xs text-muted-foreground"> · {w.code}</span>}</p>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px]", w.active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground")}>{w.active ? "Active" : "Inactive"}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{[w.streetAddress, w.city, w.country].filter(Boolean).join(", ") || "No address"}</p>
                <p className="mt-1 text-xs text-muted-foreground">{w.contactName || w.phone || w.email ? [w.contactName, w.phone, w.email].filter(Boolean).join(" · ") : "No contact"}</p>
                <p className="mt-1 text-xs text-muted-foreground">Hours: {w.hours.alwaysOpen ? "Always open" : `${w.hours.days.join(", ") || "no days"} · ${w.hours.open}–${w.hours.close}`}</p>
                <p className="mt-1 text-xs font-medium">Value {formatMoney(warehouseValue.get(w.id) ?? 0, currency)} · Margin {formatMoney(warehouseMargin.get(w.id) ?? 0, currency)}</p>
                <div className="mt-2 flex gap-3 text-xs">
                  <button onClick={() => setEditingWarehouse(w)} className="text-amber-700 hover:underline">Edit</button>
                  <button onClick={() => askDeleteWarehouse(w)} className="text-red-600 hover:underline">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-background p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg border px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products" className="w-full bg-transparent text-sm outline-none" />
          </div>
          <button onClick={() => setEditingProduct({ status: "active", stock: 0, reorderLevel: 5, warehouseId: warehouses[0]?.id ?? "" })} className="rounded-lg bg-amber-700 px-3 py-1.5 text-sm text-white">New product</button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No products.</p>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="space-y-3 sm:hidden">
              {filtered.map((item) => (
                <div key={item.productId} className="squircle border p-3">
                  <div className="flex gap-3">
                    <img src={placeholderImage(item.image, 64)} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {item.name}
                        {item.low && <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">Low</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{item.category} · {item.warehouseName}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <MiniStat label="On hand" value={String(item.quantity)} />
                    <MiniStat label="Reserved" value={String(item.reserved)} />
                    <MiniStat label="In transit" value={String(item.inTransit)} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Margin {formatMoney(item.marginValue, currency)} ({(item.marginPct * 100).toFixed(0)}%)</p>
                  <div className="mt-3 flex items-center gap-4 text-xs">
                    <button onClick={() => openEdit(item)} className="text-amber-700 hover:underline">Edit</button>
                    <button onClick={() => setHistoryId(item.productId)} className="inline-flex items-center gap-1 text-amber-700 hover:underline"><HistoryIcon className="h-3.5 w-3.5" /> History</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2">Product</th>
                    <th>Warehouse</th>
                    <th className="text-right">On hand</th>
                    <th className="text-right">Reserved</th>
                    <th className="text-right">In transit</th>
                    <th className="text-right">Reorder</th>
                    <th className="text-right">Margin</th>
                    <th className="text-right">Value</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.productId} className="border-t">
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <img src={placeholderImage(item.image, 64)} alt="" className="h-9 w-9 rounded-lg object-cover" />
                          <div>
                            <p className="font-medium">
                              {item.name}
                              {item.low && <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">Low</span>}
                            </p>
                            <p className="text-xs text-muted-foreground">{item.category} · {item.status}</p>
                          </div>
                        </div>
                      </td>
                      <td className="text-muted-foreground">{item.warehouseName}</td>
                      <td className="text-right font-medium">{item.quantity}</td>
                      <td className="text-right text-muted-foreground">{item.reserved}</td>
                      <td className="text-right text-muted-foreground">{item.inTransit}</td>
                      <td className="text-right text-muted-foreground">{item.reorderLevel}</td>
                      <td className="text-right text-emerald-700">{formatMoney(item.marginValue, currency)} <span className="text-[10px]">{(item.marginPct * 100).toFixed(0)}%</span></td>
                      <td className="text-right">{formatMoney(item.value, currency)}</td>
                      <td className="text-right">
                        <div className="flex justify-end gap-3 text-xs">
                          <button onClick={() => setHistoryId(item.productId)} className="inline-flex items-center gap-1 text-amber-700 hover:underline"><HistoryIcon className="h-3.5 w-3.5" /> History</button>
                          <button onClick={() => openEdit(item)} className="text-amber-700 hover:underline">Edit</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />}
      {editingWarehouse && <WarehouseModal value={editingWarehouse} onClose={() => setEditingWarehouse(null)} onSaved={() => { setEditingWarehouse(null); void load(); }} />}
      {editingProduct && <CatalogModal value={editingProduct} warehouses={warehouses} onClose={() => setEditingProduct(null)} onSaved={() => { setEditingProduct(null); void load(); }} />}
      {historyId && <HistoryModal productId={historyId} currency={currency} onClose={() => setHistoryId(null)} />}
    </div>
  );
}

function WarehouseModal({ value, onClose, onSaved }: { value: Partial<Warehouse>; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<Partial<Warehouse>>({ active: true, hours: { alwaysOpen: true, days: [...WEEKDAYS], open: "08:00", close: "18:00" }, ...value });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Warehouse>) => setDraft((current) => ({ ...current, ...patch }));
  const hours = draft.hours ?? { alwaysOpen: true, days: [...WEEKDAYS], open: "08:00", close: "18:00" };
  const setHours = (patch: Partial<typeof hours>) => set({ hours: { ...hours, ...patch } });

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        name: draft.name, code: draft.code, contactName: draft.contactName, phone: draft.phone, email: draft.email,
        streetAddress: draft.streetAddress, city: draft.city, country: draft.country,
        latitude: draft.latitude, longitude: draft.longitude, hours: draft.hours, active: draft.active !== false,
      };
      if (draft.id) await api.patch(`/api/admin/warehouses/${draft.id}`, payload);
      else await api.post("/api/admin/warehouses", payload);
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title={draft.id ? "Edit warehouse" : "New warehouse"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Name" value={draft.name ?? ""} onChange={(v) => set({ name: v })} />
        <Input label="Code" value={draft.code ?? ""} onChange={(v) => set({ code: v })} />
        <Input label="Contact name" value={draft.contactName ?? ""} onChange={(v) => set({ contactName: v })} />
        <Input label="Phone" value={draft.phone ?? ""} onChange={(v) => set({ phone: v })} />
        <Input label="Email" value={draft.email ?? ""} onChange={(v) => set({ email: v })} />
        <Input label="City" value={draft.city ?? ""} onChange={(v) => set({ city: v })} />
        <div className="sm:col-span-2"><Input label="Street address (pickup)" value={draft.streetAddress ?? ""} onChange={(v) => set({ streetAddress: v })} /></div>
        <Input label="Country" value={draft.country ?? ""} onChange={(v) => set({ country: v })} />
        <Input label="Latitude" value={draft.latitude == null ? "" : String(draft.latitude)} onChange={(v) => set({ latitude: v ? Number(v) : null })} />
        <Input label="Longitude" value={draft.longitude == null ? "" : String(draft.longitude)} onChange={(v) => set({ longitude: v ? Number(v) : null })} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.active !== false} onChange={(event) => set({ active: event.target.checked })} className="h-4 w-4 accent-amber-700" /> Active
        </label>
      </div>

      <div className="mt-4 rounded-xl border border-border/60 p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Operating hours</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hours.alwaysOpen} onChange={(event) => setHours({ alwaysOpen: event.target.checked })} className="h-4 w-4 accent-amber-700" /> Always open
          </label>
        </div>
        {!hours.alwaysOpen && (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((day) => (
                <button key={day} onClick={() => setHours({ days: hours.days.includes(day) ? hours.days.filter((d) => d !== day) : [...hours.days, day] })} className={cn("rounded-full border px-2.5 py-1 text-xs capitalize", hours.days.includes(day) ? "border-amber-600 bg-amber-50 text-amber-800" : "hover:bg-muted")}>{day}</button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <input type="time" value={hours.open} onChange={(event) => setHours({ open: event.target.value })} className="rounded-lg border px-2 py-1" />
              <span className="text-muted-foreground">to</span>
              <input type="time" value={hours.close} onChange={(event) => setHours({ close: event.target.value })} className="rounded-lg border px-2 py-1" />
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
        <button onClick={save} disabled={busy} className="rounded-lg bg-amber-700 px-4 py-2 text-sm text-white disabled:opacity-50">Save</button>
      </div>
    </Modal>
  );
}

function CatalogModal({ value, warehouses, onClose, onSaved }: { value: Partial<Product>; warehouses: Warehouse[]; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<Partial<Product> & { reorderLevel?: number }>({ status: "active", featured: false, trackInventory: true, ...value });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Product> & { reorderLevel?: number }) => setDraft((current) => ({ ...current, ...patch }));

  const save = async () => {
    setBusy(true);
    try {
      const catalog = {
        name: draft.name, description: draft.description, price: Number(draft.price),
        compareAtPrice: draft.compareAtPrice ?? null, category: draft.category, image: draft.image,
        status: draft.status, featured: Boolean(draft.featured), warehouseId: draft.warehouseId,
        cost: Number(draft.cost ?? 0), trackInventory: draft.trackInventory !== false,
        stock: Number(draft.stock ?? 0), reorderLevel: Number(draft.reorderLevel ?? 0),
      };
      if (draft.id) {
        await api.patch(`/api/admin/products/${draft.id}`, { ...catalog, stock: undefined });
        if (draft.warehouseId) await api.patch(`/api/admin/inventory/${draft.id}`, { warehouseId: draft.warehouseId, quantity: Number(draft.stock ?? 0), reorderLevel: Number(draft.reorderLevel ?? 0) });
      } else {
        await api.post("/api/admin/products", catalog);
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const margin = Number(draft.price ?? 0) - Number(draft.cost ?? 0);
  const marginPct = Number(draft.price ?? 0) > 0 ? (margin / Number(draft.price ?? 1)) * 100 : 0;

  return (
    <Modal onClose={onClose} title={draft.id ? "Edit product" : "New product"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Name" value={draft.name ?? ""} onChange={(v) => set({ name: v })} />
        <Input label="Category" value={draft.category ?? ""} onChange={(v) => set({ category: v })} />
        <Input label="Price" type="number" value={String(draft.price ?? "")} onChange={(v) => set({ price: Number(v) })} />
        <Input label="Cost" type="number" value={String(draft.cost ?? "")} onChange={(v) => set({ cost: Number(v) })} helper={`Margin: ${margin} (${marginPct.toFixed(1)}%)`} />
        <Input label="Compare at" type="number" value={String(draft.compareAtPrice ?? "")} onChange={(v) => set({ compareAtPrice: v ? Number(v) : null })} />
        <Input label="Image seed" value={draft.image ?? ""} onChange={(v) => set({ image: v })} />
        <Input label="Stock" type="number" value={String(draft.stock ?? "")} onChange={(v) => set({ stock: Number(v) })} />
        <Input label="Reorder at" type="number" value={String((draft as { reorderLevel?: number }).reorderLevel ?? 0)} onChange={(v) => set({ reorderLevel: Number(v) })} />
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Warehouse</span>
          <select value={draft.warehouseId ?? ""} onChange={(event) => set({ warehouseId: event.target.value })} className="w-full rounded-lg border px-3 py-2">
            <option value="">Unassigned</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <div className="sm:col-span-2">
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Description</span>
            <textarea value={draft.description ?? ""} onChange={(event) => set({ description: event.target.value })} className="h-20 w-full rounded-lg border px-3 py-2" />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(draft.featured)} onChange={(event) => set({ featured: event.target.checked })} className="h-4 w-4 accent-amber-700" /> Featured</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.trackInventory !== false} onChange={(event) => set({ trackInventory: event.target.checked })} className="h-4 w-4 accent-amber-700" /> Track inventory</label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Status</span>
          <select value={draft.status ?? "active"} onChange={(event) => set({ status: event.target.value })} className="rounded-lg border px-2 py-1">
            <option value="active">Active</option>
            <option value="draft">Draft</option>
          </select>
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
        <button onClick={save} disabled={busy} className="rounded-lg bg-amber-700 px-4 py-2 text-sm text-white disabled:opacity-50">Save</button>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-xl overflow-auto rounded-2xl bg-background p-5 shadow-xl">
        <h3 className="mb-4 font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 p-2 text-center">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

type ConfirmState = { title: string; message: string; confirmLabel?: string; onConfirm: () => void | Promise<void> } | null;

function ConfirmDialog({ state, onClose }: { state: NonNullable<ConfirmState>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm overflow-hidden squircle bg-background p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-100 text-red-600"><AlertTriangle className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="font-display font-semibold">{state.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{state.message}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
          <button
            onClick={async () => { setBusy(true); try { await state.onConfirm(); } finally { setBusy(false); onClose(); } }}
            disabled={busy}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "Working…" : state.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryModal({ productId, currency, onClose }: { productId: string; currency: string; onClose: () => void }) {
  const [history, setHistory] = useState<ProductHistory | null>(null);
  useEffect(() => {
    void api.get<ProductHistory>(`/api/admin/inventory/${productId}/history`).then(setHistory).catch(() => {});
  }, [productId]);
  const max = history ? Math.max(1, ...history.daily.map((d) => d.units)) : 1;

  return (
    <Modal onClose={onClose} title={history ? `${history.name} — performance` : "History"}>
      {!history ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniStat label="Units sold" value={String(history.unitsSold)} />
            <MiniStat label="Revenue" value={formatMoney(history.revenue, currency)} />
            <MiniStat label="Orders" value={String(history.orderCount)} />
            <MiniStat label="On hand" value={String(history.onHand)} />
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-muted px-2.5 py-1">Reserved: {history.reserved}</span>
            <span className="rounded-full bg-muted px-2.5 py-1">In transit: {history.inTransit}</span>
            <span className="rounded-full bg-muted px-2.5 py-1">Reorder at: {history.reorderLevel}</span>
          </div>

          <div className="rounded-xl border border-border/60 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Forecast</p>
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] capitalize", history.forecast.trend === "rising" ? "bg-green-100 text-green-700" : history.forecast.trend === "falling" ? "bg-red-100 text-red-600" : "bg-muted text-muted-foreground")}>{history.forecast.trend}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div><p className="text-[11px] text-muted-foreground">Avg / day</p><p className="font-semibold">{history.forecast.avgDailyUnits}</p></div>
              <div><p className="text-[11px] text-muted-foreground">Days of cover</p><p className="font-semibold">{history.forecast.daysOfCover ?? "—"}</p></div>
              <div><p className="text-[11px] text-muted-foreground">Suggest reorder</p><p className="font-semibold">{history.forecast.suggestedReorder}</p></div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Units sold · last 30 days</p>
            <div className="flex h-24 items-end gap-0.5">
              {history.daily.map((day) => (
                <div key={day.date} title={`${day.date}: ${day.units}`} className="flex-1 rounded-t bg-amber-600/70" style={{ height: `${(day.units / max) * 100}%`, minHeight: day.units > 0 ? 3 : 0 }} />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Stock movements</p>
            {history.movements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No movements yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {history.movements.map((m) => (
                  <li key={m.id} className="flex items-center justify-between text-sm">
                    <span className="capitalize">{m.type}</span>
                    <span className="text-muted-foreground">{m.quantity} · {formatDateTime(m.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function PurchasesPanel({ currency }: { currency: string }) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [editingVendor, setEditingVendor] = useState<Partial<Vendor> | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [paying, setPaying] = useState<Purchase | null>(null);
  const [payingVendor, setPayingVendor] = useState<Vendor | null>(null);
  const [hardDelete, setHardDelete] = useState<Purchase | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [v, p, pr] = await Promise.all([api.get<Vendor[]>("/api/admin/vendors"), api.get<Purchase[]>("/api/admin/purchases"), api.get<Product[]>("/api/admin/products")]);
    setVendors(v);
    setPurchases(p);
    setProducts(pr);
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const owed = vendors.reduce((sum, v) => sum + v.owed, 0);
  const spent = purchases.reduce((sum, p) => sum + p.amountPaid, 0);
  const total = purchases.reduce((sum, p) => sum + p.total, 0);

  const askDeleteVendor = (v: Vendor) =>
    setConfirm({
      title: "Delete vendor?",
      message: `“${v.name}” will be removed. Purchases linked to it keep their records but lose the vendor link.`,
      confirmLabel: "Delete vendor",
      onConfirm: async () => { await api.del(`/api/admin/vendors/${v.id}`); await load(); },
    });

  const askReceive = (purchase: Purchase) =>
    setConfirm({
      title: "Receive into stock?",
      message: `Add ${purchase.items.length} line(s) from ${purchase.vendorName || "this vendor"} to inventory? On-hand stock will increase.`,
      confirmLabel: "Receive stock",
      onConfirm: async () => { await api.post(`/api/admin/purchases/${purchase.id}/receive`); await load(); },
    });

  const runAction = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    }
  };

  const askDeletePurchase = (purchase: Purchase) => {
    if (purchase.status !== "received" && purchase.amountPaid <= 0) {
      setConfirm({
        title: "Delete purchase?",
        message: `Purchase #${purchase.id.slice(-8)} (${purchase.items.length} line(s)) will be removed.`,
        confirmLabel: "Delete purchase",
        onConfirm: async () => { await api.del(`/api/admin/purchases/${purchase.id}`); await load(); },
      });
    } else {
      setHardDelete(purchase);
    }
  };

  return (
    <div className="space-y-5">
      {error && <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Vendors" value={String(vendors.length)} />
        <Stat label="Purchases" value={String(purchases.length)} />
        <Stat label="Owed to vendors" value={formatMoney(owed, currency)} />
        <Stat label="Paid out" value={formatMoney(spent, currency)} />
      </div>

      <div className="rounded-xl border bg-background p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">Vendors</p>
            <p className="text-xs text-muted-foreground">Suppliers you purchase stock from.</p>
          </div>
          <button onClick={() => setEditingVendor({ active: true })} className="inline-flex items-center gap-1 rounded-lg bg-amber-700 px-3 py-1.5 text-sm text-white"><Plus className="h-3.5 w-3.5" /> New</button>
        </div>
        {vendors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No vendors yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {vendors.map((v) => (
              <div key={v.id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{v.name}</p>
                  {v.owed > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Owed {formatMoney(v.owed, currency)}</span>}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{[v.contactName, v.phone, v.email].filter(Boolean).join(" · ") || "No contact"}</p>
                <p className="mt-1 text-xs text-muted-foreground">{v.purchaseCount} purchase{v.purchaseCount === 1 ? "" : "s"}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  {v.owed > 0 && (
                    <button onClick={() => setPayingVendor(v)} className="inline-flex items-center gap-1 rounded-lg bg-amber-700 px-2.5 py-1 font-medium text-white transition hover:bg-amber-800">
                      <Wallet className="h-3.5 w-3.5" /> Pay {formatMoney(v.owed, currency)}
                    </button>
                  )}
                  <button onClick={() => setEditingVendor(v)} className="text-amber-700 hover:underline">Edit</button>
                  <button onClick={() => askDeleteVendor(v)} className="text-red-600 hover:underline">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-background p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">Purchases</p>
            <p className="text-xs text-muted-foreground">Stock orders, receiving and vendor payments.</p>
          </div>
          <button onClick={() => setCreating(true)} disabled={products.length === 0} className="inline-flex items-center gap-1 rounded-lg bg-amber-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> New purchase</button>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : purchases.length === 0 ? (
          <p className="text-sm text-muted-foreground">No purchases yet.</p>
        ) : (
          <div className="space-y-2">
            {purchases.map((purchase) => {
              const outstanding = Math.max(0, purchase.total - purchase.amountPaid);
              const units = purchase.items.reduce((sum, item) => sum + item.quantity, 0);
              const isOpen = expanded.has(purchase.id);
              return (
                <div key={purchase.id} className="squircle border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">#{purchase.id.slice(-8)} · {purchase.vendorName || "No vendor"}</span>
                    <div className="flex items-center gap-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px]", purchase.status === "received" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground")}>{purchase.status}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px]", purchase.paymentStatus === "paid" ? "bg-green-100 text-green-700" : purchase.paymentStatus === "partial" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-600")}>{purchase.paymentStatus}</span>
                    </div>
                  </div>
                  <button onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(purchase.id)) next.delete(purchase.id); else next.add(purchase.id); return next; })} className="mt-2 flex w-full items-center justify-between gap-2 text-left text-sm">
                    <span className="text-muted-foreground">
                      {purchase.items.length} line{purchase.items.length === 1 ? "" : "s"} · {units} unit{units === 1 ? "" : "s"} · {formatDateTime(purchase.createdAt)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">{isOpen ? "Hide lines" : "View lines"} <ChevronDown className={cn("h-3.5 w-3.5 transition", isOpen && "rotate-180")} /></span>
                  </button>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span />
                    <span className="font-semibold">{formatMoney(purchase.total, currency)}{outstanding > 0 && <span className="ml-2 text-xs font-normal text-amber-800">owed {formatMoney(outstanding, currency)}</span>}</span>
                  </div>

                  {isOpen && (
                    <div className="mt-2 overflow-hidden rounded-lg border border-border/60">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 text-left text-muted-foreground">
                          <tr><th className="px-2 py-1.5">Item</th><th className="px-2 py-1.5 text-right">Qty</th><th className="px-2 py-1.5 text-right">Unit cost</th><th className="px-2 py-1.5 text-right">Line total</th></tr>
                        </thead>
                        <tbody>
                          {purchase.items.map((item) => (
                            <tr key={item.id} className="border-t border-border/50">
                              <td className="px-2 py-1.5">{item.name}</td>
                              <td className="px-2 py-1.5 text-right">{item.quantity}</td>
                              <td className="px-2 py-1.5 text-right">{formatMoney(item.unitCost, currency)}</td>
                              <td className="px-2 py-1.5 text-right">{formatMoney(item.lineTotal, currency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {purchase.status !== "received" && purchase.amountPaid <= 0 && (
                      <button onClick={() => setEditingPurchase(purchase)} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 font-medium transition hover:bg-muted"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                    )}
                    {purchase.status !== "received" && (
                      <button onClick={() => runAction(() => api.post(`/api/admin/purchases/${purchase.id}/send`, {}))} className="rounded-lg border px-2.5 py-1 font-medium transition hover:bg-muted">Send PO</button>
                    )}
                    {purchase.status !== "received" && <button onClick={() => askReceive(purchase)} className="rounded-lg border px-2.5 py-1 font-medium transition hover:bg-muted">Receive into stock</button>}
                    {outstanding > 0 && (
                      <button onClick={() => setPaying(purchase)} className="inline-flex items-center gap-1 rounded-lg bg-amber-700 px-2.5 py-1 font-medium text-white transition hover:bg-amber-800">
                        <Wallet className="h-3.5 w-3.5" /> Pay {formatMoney(outstanding, currency)}
                      </button>
                    )}
                    <button onClick={() => askDeletePurchase(purchase)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 font-medium text-red-600 transition hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />}
      {editingVendor && <VendorModal value={editingVendor} onClose={() => setEditingVendor(null)} onSaved={() => { setEditingVendor(null); void load(); }} />}
      {creating && <PurchaseModal vendors={vendors} products={products} currency={currency} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); void load(); }} />}
      {editingPurchase && <PurchaseModal editing={editingPurchase} vendors={vendors} products={products} currency={currency} onClose={() => setEditingPurchase(null)} onSaved={() => { setEditingPurchase(null); void load(); }} />}
      {hardDelete && <HardDeleteModal purchase={hardDelete} onClose={() => setHardDelete(null)} onDeleted={() => { setHardDelete(null); void load(); }} />}
      {paying && <PayModal purchase={paying} currency={currency} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); void load(); }} />}
      {payingVendor && <PayVendorModal vendor={payingVendor} currency={currency} onClose={() => setPayingVendor(null)} onSaved={() => { setPayingVendor(null); void load(); }} />}
    </div>
  );
}

function VendorModal({ value, onClose, onSaved }: { value: Partial<Vendor>; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<Partial<Vendor>>({ active: true, ...value });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Vendor>) => setDraft((current) => ({ ...current, ...patch }));
  const save = async () => {
    setBusy(true);
    try {
      const payload = { name: draft.name, contactName: draft.contactName, phone: draft.phone, email: draft.email, address: draft.address, notes: draft.notes, active: draft.active !== false };
      if (draft.id) await api.patch(`/api/admin/vendors/${draft.id}`, payload);
      else await api.post("/api/admin/vendors", payload);
      onSaved();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={draft.id ? "Edit vendor" : "New vendor"} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Name" value={draft.name ?? ""} onChange={(v) => set({ name: v })} />
        <Input label="Contact name" value={draft.contactName ?? ""} onChange={(v) => set({ contactName: v })} />
        <Input label="Phone" value={draft.phone ?? ""} onChange={(v) => set({ phone: v })} />
        <Input label="Email" value={draft.email ?? ""} onChange={(v) => set({ email: v })} />
        <div className="sm:col-span-2"><Input label="Address" value={draft.address ?? ""} onChange={(v) => set({ address: v })} /></div>
        <div className="sm:col-span-2">
          <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Notes</span>
            <textarea value={draft.notes ?? ""} onChange={(event) => set({ notes: event.target.value })} className="h-16 w-full rounded-lg border px-3 py-2" />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.active !== false} onChange={(event) => set({ active: event.target.checked })} className="h-4 w-4 accent-amber-700" /> Active</label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
        <button onClick={save} disabled={busy} className="rounded-lg bg-amber-700 px-4 py-2 text-sm text-white disabled:opacity-50">Save</button>
      </div>
    </Modal>
  );
}

type PurchaseLine = { productId: string; name: string; quantity: number; unitCost: number };

function PurchaseModal({ editing, vendors, products, currency, onClose, onSaved }: { editing?: Purchase | null; vendors: Vendor[]; products: Product[]; currency: string; onClose: () => void; onSaved: () => void }) {
  const [vendorId, setVendorId] = useState(editing?.vendorId ?? vendors[0]?.id ?? "");
  const [reference, setReference] = useState(editing?.reference ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [lines, setLines] = useState<PurchaseLine[]>(
    editing && editing.items.length > 0
      ? editing.items.map((item) => ({ productId: item.productId, name: item.name, quantity: item.quantity, unitCost: item.unitCost }))
      : [{ productId: products[0]?.id ?? "", name: products[0]?.name ?? "", quantity: 1, unitCost: products[0]?.cost ?? 0 }],
  );
  const [busy, setBusy] = useState(false);
  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);

  const setLine = (index: number, patch: Partial<PurchaseLine>) => setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  const pickProduct = (index: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    setLine(index, { productId, name: product?.name ?? "", unitCost: product?.cost ?? 0 });
  };

  const save = async () => {
    setBusy(true);
    try {
      const payload = { vendorId, reference, notes, items: lines.filter((line) => line.name && line.quantity > 0) };
      if (editing) await api.patch(`/api/admin/purchases/${editing.id}`, payload);
      else await api.post("/api/admin/purchases", payload);
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={editing ? "Edit purchase" : "New purchase"} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Vendor</span>
          <select value={vendorId} onChange={(event) => setVendorId(event.target.value)} className="w-full rounded-lg border px-3 py-2">
            <option value="">No vendor</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        <Input label="Reference" value={reference} onChange={setReference} />
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-sm font-medium">Items</p>
        {lines.map((line, index) => (
          <div key={index} className="rounded-lg border p-2">
            <select value={line.productId} onChange={(event) => pickProduct(index, event.target.value)} className="w-full rounded-lg border px-2 py-1.5 text-sm">
              <option value="">Select product…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="mt-2 flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs text-muted-foreground">Qty
                <input type="number" min={1} value={line.quantity} onChange={(event) => setLine(index, { quantity: Number(event.target.value) })} className="w-16 rounded-lg border px-2 py-1 text-center" />
              </label>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">Unit cost
                <input type="number" min={0} value={line.unitCost} onChange={(event) => setLine(index, { unitCost: Number(event.target.value) })} className="w-24 rounded-lg border px-2 py-1 text-center" />
              </label>
              <span className="ml-auto text-sm font-medium">{formatMoney(line.quantity * line.unitCost, currency)}</span>
              {lines.length > 1 && <button onClick={() => setLines((current) => current.filter((_, i) => i !== index))} className="text-red-600" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>}
            </div>
          </div>
        ))}
        <button onClick={() => setLines((current) => [...current, { productId: "", name: "", quantity: 1, unitCost: 0 }])} className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:underline"><Plus className="h-3.5 w-3.5" /> Add item</button>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-sm font-semibold">
        <span>Total</span>
        <span>{formatMoney(total, currency)}</span>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
        <button onClick={save} disabled={busy} className="rounded-lg bg-amber-700 px-4 py-2 text-sm text-white disabled:opacity-50">{editing ? "Save changes" : "Create purchase"}</button>
      </div>
    </Modal>
  );
}

function PayModal({ purchase, currency, onClose, onSaved }: { purchase: Purchase; currency: string; onClose: () => void; onSaved: () => void }) {
  const outstanding = Math.max(0, purchase.total - purchase.amountPaid);
  const [amount, setAmount] = useState(String(outstanding));
  const [gateway, setGateway] = useState("mock");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.post(`/api/admin/purchases/${purchase.id}/pay`, { amount: Number(amount), gateway });
      onSaved();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Pay vendor" onClose={onClose}>
      <p className="mb-4 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
        {purchase.vendorName || "Vendor"} · outstanding <strong>{formatMoney(outstanding, currency)}</strong>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label={`Amount (${currency})`} type="number" value={amount} onChange={setAmount} />
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Gateway</span>
          <select value={gateway} onChange={(event) => setGateway(event.target.value)} className="w-full rounded-lg border px-3 py-2">
            <option value="mock">Demo / Mock</option>
            <option value="mpesa">M-PESA</option>
          </select>
        </label>
      </div>
      <p className="mt-3 flex items-start gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        Vendor payouts would use the gateway's disbursement/B2C API. Mock records the payment instantly; M-PESA B2C needs to be enabled on the account.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
        <button onClick={save} disabled={busy} className="rounded-lg bg-amber-700 px-4 py-2 text-sm text-white disabled:opacity-50">Record payment</button>
      </div>
    </Modal>
  );
}

function PayVendorModal({ vendor, currency, onClose, onSaved }: { vendor: Vendor; currency: string; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(String(vendor.owed));
  const [gateway, setGateway] = useState("mock");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.post(`/api/admin/vendors/${vendor.id}/pay`, { amount: Number(amount), gateway });
      onSaved();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`Pay ${vendor.name}`} onClose={onClose}>
      <p className="mb-4 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
        Outstanding balance <strong>{formatMoney(vendor.owed, currency)}</strong>. Payments are applied to the vendor's oldest unpaid purchases first.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label={`Amount (${currency})`} type="number" value={amount} onChange={setAmount} />
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Gateway</span>
          <select value={gateway} onChange={(event) => setGateway(event.target.value)} className="w-full rounded-lg border px-3 py-2">
            <option value="mock">Demo / Mock</option>
            <option value="mpesa">M-PESA</option>
          </select>
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => setAmount(String(vendor.owed))} className="rounded-lg border px-3 py-1.5 text-xs">Full balance</button>
        <button onClick={() => setAmount(String(Math.round(vendor.owed / 2)))} className="rounded-lg border px-3 py-1.5 text-xs">Half</button>
      </div>
      <p className="mt-3 flex items-start gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        Mock records the payment instantly; M-PESA vendor payouts need the B2C/disbursement API enabled on the account.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
        <button onClick={save} disabled={busy} className="rounded-lg bg-amber-700 px-4 py-2 text-sm text-white disabled:opacity-50">Pay {formatMoney(Number(amount) || 0, currency)}</button>
      </div>
    </Modal>
  );
}

function HardDeleteModal({ purchase, onClose, onDeleted }: { purchase: Purchase; onClose: () => void; onDeleted: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const received = purchase.status === "received";
  const done = text.trim().toUpperCase() === "DELETE";
  const confirm = async () => {
    setBusy(true);
    try {
      await api.del(`/api/admin/purchases/${purchase.id}`);
      onDeleted();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Delete completed purchase" onClose={onClose}>
      <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        This purchase is <strong>{received ? "already received" : "paid"}</strong>. Deleting it will {received ? "reverse its stock from inventory and " : ""}remove its payment records. This cannot be undone.
      </p>
      <p className="mt-3 text-sm">Type <strong>DELETE</strong> to confirm.</p>
      <input value={text} onChange={(event) => setText(event.target.value)} placeholder="DELETE" className="mt-2 w-full rounded-lg border px-3 py-2 font-mono tracking-widest" />
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
        <button onClick={confirm} disabled={!done || busy} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Delete permanently</button>
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function OrderTable({ orders, currency, onOpen }: { orders: Order[]; currency: string; onOpen: (id: string) => void }) {
  if (orders.length === 0) return <p className="text-sm text-muted-foreground">No orders yet.</p>;
  return (
    <>
      {/* Mobile cards */}
      <div className="space-y-2 sm:hidden">
        {orders.map((order) => (
          <button key={order.id} onClick={() => onOpen(order.id)} className="block w-full squircle border p-3 text-left">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-muted-foreground">#{order.id.slice(-8)}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-[11px]", statusTone(order.status))}>{ORDER_STATUS_LABELS[order.status] ?? order.status}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-sm">{order.customer?.name ?? "—"}</span>
              <span className="font-semibold">{formatMoney(order.total, currency)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className={cn("rounded-full px-2 py-0.5 text-[11px]", statusTone(order.paymentStatus))}>{PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}</span>
              <span className="text-xs text-muted-foreground">{formatDateTime(order.createdAt)}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2">Order</th>
              <th>Customer</th>
              <th>Total</th>
              <th>Status</th>
              <th>Payment</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-t">
                <td className="py-2 font-mono text-xs">{order.id}</td>
                <td>{order.customer?.name ?? "—"}</td>
                <td>{formatMoney(order.total, currency)}</td>
                <td><span className={cn("rounded-full px-2 py-0.5 text-xs", statusTone(order.status))}>{ORDER_STATUS_LABELS[order.status] ?? order.status}</span></td>
                <td><span className={cn("rounded-full px-2 py-0.5 text-xs", statusTone(order.paymentStatus))}>{PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}</span></td>
                <td className="text-right"><button onClick={() => onOpen(order.id)} className="rounded-lg border px-2 py-1 text-xs hover:bg-muted">Open</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ProductsPanel({ products, currency, reload }: { products: Product[]; currency: string; reload: () => void }) {
  const [editing, setEditing] = useState<Partial<Product> | null>(null);

  const save = async () => {
    if (!editing) return;
    const payload = {
      name: editing.name,
      description: editing.description,
      price: Number(editing.price),
      compareAtPrice: editing.compareAtPrice ? Number(editing.compareAtPrice) : null,
      category: editing.category,
      stock: Number(editing.stock ?? 0),
      image: editing.image || editing.name,
      status: editing.status ?? "active",
      featured: Boolean(editing.featured),
    };
    if (editing.id) await api.patch(`/api/admin/products/${editing.id}`, payload);
    else await api.post("/api/admin/products", payload);
    setEditing(null);
    reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <h3 className="font-medium">{products.length} products</h3>
        <button onClick={() => setEditing({ status: "active", stock: 10 })} className="rounded-lg bg-amber-700 px-3 py-1.5 text-sm text-white">New product</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <div key={product.id} className="flex gap-3 rounded-xl border bg-background p-3">
            <img src={placeholderImage(product.image, 80)} alt="" className="h-16 w-16 rounded-lg object-cover" />
            <div className="flex-1">
              <p className="text-sm font-medium">{product.name}</p>
              <p className="text-xs text-muted-foreground">{product.category} · {product.stock} in stock</p>
              <p className="text-sm">{formatMoney(product.price, currency)}</p>
              <div className="mt-1 flex gap-2">
                <button onClick={() => setEditing(product)} className="text-xs text-amber-800 hover:underline">Edit</button>
                <button onClick={async () => { await api.del(`/api/admin/products/${product.id}`); reload(); }} className="text-xs text-red-600 hover:underline">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditing(null)} />
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl bg-background p-5">
            <h3 className="font-semibold">{editing.id ? "Edit product" : "New product"}</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Input label="Name" value={editing.name ?? ""} onChange={(v) => setEditing({ ...editing, name: v })} />
              <Input label="Category" value={editing.category ?? ""} onChange={(v) => setEditing({ ...editing, category: v })} />
              <Input label="Price" type="number" value={String(editing.price ?? "")} onChange={(v) => setEditing({ ...editing, price: Number(v) })} />
              <Input label="Compare at" type="number" value={String(editing.compareAtPrice ?? "")} onChange={(v) => setEditing({ ...editing, compareAtPrice: v ? Number(v) : null })} />
              <Input label="Stock" type="number" value={String(editing.stock ?? "")} onChange={(v) => setEditing({ ...editing, stock: Number(v) })} />
              <Input label="Image seed" value={editing.image ?? ""} onChange={(v) => setEditing({ ...editing, image: v })} />
              <div className="sm:col-span-2">
                <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Description</span>
                  <textarea value={editing.description ?? ""} onChange={(event) => setEditing({ ...editing, description: event.target.value })} className="h-20 w-full rounded-lg border px-3 py-2" />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(editing.featured)} onChange={(event) => setEditing({ ...editing, featured: event.target.checked })} /> Featured</label>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Status</span>
                <select value={editing.status ?? "active"} onChange={(event) => setEditing({ ...editing, status: event.target.value })} className="rounded-lg border px-2 py-1">
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                </select>
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
              <button onClick={save} className="rounded-lg bg-amber-700 px-4 py-2 text-sm text-white">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function redact(value: string, reveal = 3): string {
  if (!value) return "—";
  if (value.length <= reveal * 2 + 2) return "•".repeat(Math.max(6, value.length));
  return `${value.slice(0, reveal)}${"•".repeat(6)}${value.slice(-reveal)}`;
}

function ConfigRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/50 py-2 text-sm last:border-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-xs">{secret ? redact(value) : value || "—"}</span>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-xs">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-3.5 w-3.5 accent-amber-700" />
      {label}
    </label>
  );
}

function BalanceRow({ label, value, included, currency }: { label: string; value: number; included: boolean; currency: string }) {
  return (
    <div className={cn("flex items-center justify-between border-b border-border/50 py-2 text-sm last:border-0", !included && "opacity-40")}>
      <span className="text-muted-foreground">{label}{!included && " (excluded)"}</span>
      <span className="font-mono text-xs">{formatMoney(value, currency)}</span>
    </div>
  );
}

const ACC_COLORS = {
  cash: "#94a3b8",
  receivables: "#f59e0b",
  inventory: "#b45309",
  equity: "#059669",
  payables: "#f43f5e",
  overdraft: "#0ea5e9",
  sales: "#0f766e",
  cogs: "#94a3b8",
  profit: "#059669",
};

function CompositionBar({ segments, height = 12 }: { segments: { label: string; value: number; color: string }[]; height?: number }) {
  const total = segments.reduce((sum, seg) => sum + Math.max(0, seg.value), 0);
  return (
    <div className="flex w-full overflow-hidden rounded-full bg-muted" style={{ height }}>
      {total > 0 &&
        segments.map((seg) =>
          seg.value > 0 ? (
            <div key={seg.label} title={`${seg.label}: ${Math.round((seg.value / total) * 100)}%`} style={{ width: `${(seg.value / total) * 100}%`, backgroundColor: seg.color }} />
          ) : null,
        )}
    </div>
  );
}

function SplitBar({ a, b, aColor, bColor }: { a: number; b: number; aColor: string; bColor: string }) {
  const total = a + b;
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
      {total > 0 && (
        <>
          <div style={{ width: `${(a / total) * 100}%`, backgroundColor: aColor }} />
          <div style={{ width: `${(b / total) * 100}%`, backgroundColor: bColor }} />
        </>
      )}
    </div>
  );
}

function LegendRow({ label, value, color, included = true, currency, onClick }: { label: string; value: number; color: string; included?: boolean; currency: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className="flex items-center gap-2 text-muted-foreground">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        {label}
        {!included && " (excluded)"}
      </span>
      <span className="flex items-center gap-1 font-mono text-xs">
        {formatMoney(value, currency)}
        {onClick && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
      </span>
    </>
  );
  const base = cn("flex w-full items-center justify-between gap-3 border-b border-border/40 py-1.5 text-left text-sm last:border-0", !included && "opacity-40");
  return onClick ? <button onClick={onClick} className={cn(base, "transition hover:bg-muted/50")}>{inner}</button> : <div className={base}>{inner}</div>;
}

function BarChart({ bars, currency, onBar }: { bars: { label: string; value: number; color: string }[]; currency: string; onBar?: (label: string) => void }) {
  const max = Math.max(1, ...bars.map((bar) => bar.value));
  return (
    <div className="flex items-end gap-3">
      {bars.map((bar) => {
        const content = (
          <>
            <span className="text-[10px] font-medium">{formatMoney(bar.value, currency)}</span>
            <div className="flex h-24 w-full items-end">
              <div className="w-full rounded-t-md transition-all" style={{ height: `${(bar.value / max) * 100}%`, backgroundColor: bar.color, minHeight: bar.value > 0 ? 4 : 0 }} />
            </div>
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">{bar.label}{onBar && <ChevronRight className="h-2.5 w-2.5" />}</span>
          </>
        );
        return onBar ? (
          <button key={bar.label} onClick={() => onBar(bar.label)} className="flex flex-1 flex-col items-center gap-1 rounded-lg py-1 transition hover:bg-muted/50">{content}</button>
        ) : (
          <div key={bar.label} className="flex flex-1 flex-col items-center gap-1">{content}</div>
        );
      })}
    </div>
  );
}

function AccountingDashboard({ data, options, onToggle }: { data: Accounting; options: AccountingOptions; onToggle: (patch: Partial<AccountingOptions>) => void }) {
  const [drill, setDrill] = useState<string | null>(null);
  const currency = data.currency;
  const inventoryValue = options.inventoryBasis === "retail" ? data.inventory.retailValue : data.inventory.costValue;
  const rawCash = data.balance.cash;
  const overdraft = rawCash < 0 ? -rawCash : 0;
  const cashAsset = options.includeCash ? Math.max(0, rawCash) : 0;
  const receivables = options.includeReceivables ? data.balance.receivables : 0;
  const inventory = options.includeInventory ? inventoryValue : 0;
  const totalAssets = cashAsset + receivables + inventory;
  const payables = options.includePayables ? data.balance.payables : 0;
  const overdraftLiability = options.includeCash ? overdraft : 0;
  const totalLiabilities = payables + overdraftLiability;
  const equity = totalAssets - totalLiabilities;
  const collectedPct = data.sales.total > 0 ? data.sales.paid / data.sales.total : 1;
  const paidPct = data.purchases.total > 0 ? data.purchases.paid / data.purchases.total : 1;

  const tiles = [
    { label: "Revenue (paid)", value: formatMoney(data.sales.paid, currency) },
    { label: "Outstanding", value: formatMoney(data.sales.outstanding, currency) },
    { label: "Payables", value: formatMoney(data.purchases.owed, currency) },
    { label: "Gross profit", value: formatMoney(data.grossProfit, currency) },
    { label: "Gross margin", value: `${(data.grossMarginPct * 100).toFixed(1)}%` },
    { label: options.inventoryBasis === "retail" ? "Inventory (retail)" : "Inventory (cost)", value: formatMoney(inventoryValue, currency) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((tile) => (
          <Stat key={tile.label} label={tile.label} value={tile.value} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Assets */}
        <div className="rounded-xl border bg-background p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="font-medium">Assets</p>
            <span className="text-sm font-semibold">{formatMoney(totalAssets, currency)}</span>
          </div>
          <CompositionBar segments={[{ label: "Cash", value: cashAsset, color: ACC_COLORS.cash }, { label: "Receivables", value: receivables, color: ACC_COLORS.receivables }, { label: "Inventory", value: inventory, color: ACC_COLORS.inventory }]} />
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Toggle label="Cash" checked={options.includeCash} onChange={(v) => onToggle({ includeCash: v })} />
            <Toggle label="Receivables" checked={options.includeReceivables} onChange={(v) => onToggle({ includeReceivables: v })} />
            <Toggle label="Inventory" checked={options.includeInventory} onChange={(v) => onToggle({ includeInventory: v })} />
            <select
              value={options.inventoryBasis}
              onChange={(event) => onToggle({ inventoryBasis: event.target.value as "cost" | "retail" })}
              className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs"
              title="Inventory valuation basis"
            >
              <option value="cost">At cost</option>
              <option value="retail">At retail</option>
            </select>
          </div>
          <div className="mt-3">
            <LegendRow label="Cash" value={Math.max(0, rawCash)} color={ACC_COLORS.cash} included={options.includeCash} currency={currency} onClick={() => setDrill("cash")} />
            <LegendRow label="Receivables" value={data.balance.receivables} color={ACC_COLORS.receivables} included={options.includeReceivables} currency={currency} onClick={() => setDrill("receivables")} />
            <LegendRow label={options.inventoryBasis === "retail" ? "Inventory (retail)" : "Inventory (cost)"} value={inventoryValue} color={ACC_COLORS.inventory} included={options.includeInventory} currency={currency} onClick={() => setDrill("inventory")} />
            <div className="flex items-center justify-between border-t border-border/60 py-2 text-sm font-semibold">
              <span>Total assets</span>
              <span>{formatMoney(totalAssets, currency)}</span>
            </div>
          </div>
        </div>

        {/* Liabilities & equity */}
        <div className="rounded-xl border bg-background p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="font-medium">Liabilities &amp; equity</p>
            <span className="text-sm font-semibold">{formatMoney(totalLiabilities + equity, currency)}</span>
          </div>
          <CompositionBar segments={[{ label: "Payables", value: payables, color: ACC_COLORS.payables }, { label: "Overdraft", value: overdraftLiability, color: ACC_COLORS.overdraft }, { label: "Equity", value: equity, color: ACC_COLORS.equity }]} />
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Toggle label="Accounts payable" checked={options.includePayables} onChange={(v) => onToggle({ includePayables: v })} />
          </div>
          <div className="mt-3">
            <LegendRow label="Accounts payable" value={data.balance.payables} color={ACC_COLORS.payables} included={options.includePayables} currency={currency} onClick={() => setDrill("payables")} />
            {overdraftLiability > 0 && <LegendRow label="Bank overdraft" value={overdraftLiability} color={ACC_COLORS.overdraft} currency={currency} onClick={() => setDrill("overdraft")} />}
            <LegendRow label="Equity" value={equity} color={ACC_COLORS.equity} currency={currency} onClick={() => setDrill("equity")} />
            <div className="flex items-center justify-between border-t border-border/60 py-2 text-sm font-semibold">
              <span>Liabilities + equity</span>
              <span>{formatMoney(totalLiabilities + equity, currency)}</span>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Assets = liabilities + equity · tap a line to see the breakdown</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Sales & costs */}
        <div className="rounded-xl border bg-background p-4">
          <div className="mb-4 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-amber-700" />
            <p className="font-medium">Sales &amp; costs</p>
          </div>
          <BarChart
            bars={[{ label: "Sales", value: data.sales.total, color: ACC_COLORS.sales }, { label: "COGS", value: data.cogs, color: ACC_COLORS.cogs }, { label: "Profit", value: data.grossProfit, color: ACC_COLORS.profit }]}
            currency={currency}
            onBar={(label) => setDrill(label === "Sales" ? "sales" : label === "COGS" ? "cogs" : "profit")}
          />
          <div className="mt-4 space-y-1">
            <button onClick={() => setDrill("collected")} className="flex w-full items-center justify-between text-xs transition hover:opacity-80">
              <span className="text-muted-foreground">Collected · click for payments</span>
              <span className="flex items-center gap-1 font-medium">{formatMoney(data.sales.paid, currency)} · {Math.min(100, Math.round(collectedPct * 100))}%<ChevronRight className="h-3 w-3" /></span>
            </button>
            <SplitBar a={data.sales.paid} b={data.sales.outstanding} aColor={ACC_COLORS.profit} bColor={ACC_COLORS.receivables} />
            <button onClick={() => setDrill("receivables")} className="flex w-full items-center justify-between text-[11px] text-muted-foreground transition hover:opacity-80">
              <span>Outstanding {formatMoney(data.sales.outstanding, currency)} <ChevronRight className="inline h-2.5 w-2.5" /></span>
              <span>{data.sales.orders} order{data.sales.orders === 1 ? "" : "s"}</span>
            </button>
          </div>
        </div>

        {/* Purchases */}
        <div className="rounded-xl border bg-background p-4">
          <div className="mb-4 flex items-center gap-2">
            <Wallet className="h-4 w-4 text-amber-700" />
            <p className="font-medium">Purchases &amp; payables</p>
          </div>
          <BarChart
            bars={[{ label: "Purchases", value: data.purchases.total, color: ACC_COLORS.inventory }, { label: "Paid", value: data.purchases.paid, color: ACC_COLORS.profit }, { label: "Owed", value: data.purchases.owed, color: ACC_COLORS.payables }]}
            currency={currency}
            onBar={(label) => setDrill(label === "Purchases" ? "purchases" : label === "Paid" ? "paid" : "payables")}
          />
          <div className="mt-4 space-y-1">
            <button onClick={() => setDrill("paid")} className="flex w-full items-center justify-between text-xs transition hover:opacity-80">
              <span className="text-muted-foreground">Paid to vendors · click for payments</span>
              <span className="flex items-center gap-1 font-medium">{formatMoney(data.purchases.paid, currency)} · {Math.min(100, Math.round(paidPct * 100))}%<ChevronRight className="h-3 w-3" /></span>
            </button>
            <SplitBar a={data.purchases.paid} b={data.purchases.owed} aColor={ACC_COLORS.profit} bColor={ACC_COLORS.payables} />
            <button onClick={() => setDrill("payables")} className="flex w-full items-center justify-between text-[11px] text-muted-foreground transition hover:opacity-80">
              <span>Owed {formatMoney(data.purchases.owed, currency)} <ChevronRight className="inline h-2.5 w-2.5" /></span>
              <span>{data.purchases.count} purchase{data.purchases.count === 1 ? "" : "s"}</span>
            </button>
          </div>
        </div>
      </div>

      {drill && (
        <Modal title={DRILL_TITLES[drill] ?? "Breakdown"} onClose={() => setDrill(null)}>
          {drill === "cash" && (
            <>
              <div className="space-y-1 text-sm">
                <ConfigRow label="Customer collections" value={formatMoney(data.sales.paid, currency)} />
                <ConfigRow label="Vendor payments" value={`− ${formatMoney(data.purchases.paid, currency)}`} />
                <div className="flex items-center justify-between border-t border-border/60 py-2 font-semibold">
                  <span>Net cash</span>
                  <span>{formatMoney(rawCash, currency)}</span>
                </div>
              </div>
              {overdraft > 0 && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  Cash is negative ({formatMoney(rawCash, currency)}), so it's presented as a <strong>Bank overdraft</strong> liability of {formatMoney(overdraft, currency)} instead of a negative asset. In real accounting you can't hold negative cash — it is funded by an overdraft facility or owner's capital.
                </p>
              )}
            </>
          )}

          {drill === "receivables" && (
            data.receivablesOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No outstanding sales — everything is collected.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {data.receivablesOrders.map((order) => (
                  <li key={order.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-1.5 last:border-0">
                    <span className="min-w-0 truncate">{order.customer} <span className="font-mono text-[11px] text-muted-foreground">#{order.id.slice(-8)}</span></span>
                    <span className="flex shrink-0 items-center gap-2"><span className={cn("rounded-full px-2 py-0.5 text-[10px] capitalize", statusTone(order.paymentStatus))}>{order.paymentStatus.replace("_", " ")}</span>{formatMoney(order.total, currency)}</span>
                  </li>
                ))}
              </ul>
            )
          )}

          {drill === "inventory" && (
            <>
              <div className="space-y-1 text-sm">
                <ConfigRow label="Items (SKUs)" value={String(data.inventory.itemCount)} />
                <ConfigRow label="Units on hand" value={String(data.inventory.units)} />
                <ConfigRow label="Value at cost" value={formatMoney(data.inventory.costValue, currency)} />
                <ConfigRow label="Value at retail" value={formatMoney(data.inventory.retailValue, currency)} />
                <div className="flex items-center justify-between border-t border-border/60 py-2 font-semibold">
                  <span>Margin in stock</span>
                  <span>{formatMoney(data.inventory.retailValue - data.inventory.costValue, currency)}</span>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Valued {options.inventoryBasis === "retail" ? "at retail" : "at cost"}. See the Inventory tab for item-level detail.</p>
            </>
          )}

          {drill === "payables" && (
            data.payablesVendors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No outstanding payables — all vendors are settled.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {data.payablesVendors.map((vendor) => (
                  <li key={vendor.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-1.5 last:border-0">
                    <span className="min-w-0 truncate">{vendor.name}</span>
                    <span>{formatMoney(vendor.owed, currency)}</span>
                  </li>
                ))}
              </ul>
            )
          )}

          {drill === "overdraft" && (
            <div className="space-y-2 text-sm">
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                This is the negative cash balance reclassified as a liability, because a business cannot carry negative cash — it is funded by an overdraft facility or owner's capital.
              </p>
              <ConfigRow label="Bank overdraft" value={formatMoney(overdraft, currency)} />
              <ConfigRow label="Vendor payments" value={formatMoney(data.purchases.paid, currency)} />
              <ConfigRow label="Customer collections" value={formatMoney(data.sales.paid, currency)} />
            </div>
          )}

          {drill === "equity" && (
            <div className="space-y-1 text-sm">
              <ConfigRow label="Total assets" value={formatMoney(totalAssets, currency)} />
              <ConfigRow label="Less: accounts payable" value={`− ${formatMoney(payables, currency)}`} />
              {overdraftLiability > 0 && <ConfigRow label="Less: bank overdraft" value={`− ${formatMoney(overdraftLiability, currency)}`} />}
              <div className="flex items-center justify-between border-t border-border/60 py-2 font-semibold">
                <span>Equity (residual)</span>
                <span>{formatMoney(equity, currency)}</span>
              </div>
              <p className="mt-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                Equity is what the business is worth to its owner: <strong>Assets − Liabilities</strong>. This period's gross profit is {formatMoney(data.grossProfit, currency)}; in a fuller ledger, equity = owner's capital + retained earnings (accumulated profit − drawings).
              </p>
            </div>
          )}

          {drill === "sales" && (
            data.salesOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales yet.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {data.salesOrders.map((order) => (
                  <li key={order.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-1.5 last:border-0">
                    <span className="min-w-0 truncate">{order.customer} <span className="font-mono text-[11px] text-muted-foreground">#{order.id.slice(-8)}</span></span>
                    <span className="flex shrink-0 items-center gap-2"><span className={cn("rounded-full px-2 py-0.5 text-[10px] capitalize", statusTone(order.status))}>{order.status}</span>{formatMoney(order.total, currency)}</span>
                  </li>
                ))}
              </ul>
            )
          )}

          {drill === "cogs" && (
            data.cogsItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cost of goods sold yet.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {data.cogsItems.map((item) => (
                  <li key={item.name} className="flex items-center justify-between gap-3 border-b border-border/40 py-1.5 last:border-0">
                    <span className="min-w-0 truncate">{item.name} <span className="text-[11px] text-muted-foreground">× {item.quantity} @ {formatMoney(item.unitCost, currency)}</span></span>
                    <span className="shrink-0">{formatMoney(item.total, currency)}</span>
                  </li>
                ))}
              </ul>
            )
          )}

          {drill === "profit" && (
            <div className="space-y-1 text-sm">
              <ConfigRow label="Sales" value={formatMoney(data.sales.total, currency)} />
              <ConfigRow label="Less: cost of goods sold" value={`− ${formatMoney(data.cogs, currency)}`} />
              <div className="flex items-center justify-between border-t border-border/60 py-2 font-semibold">
                <span>Gross profit</span>
                <span>{formatMoney(data.grossProfit, currency)}</span>
              </div>
              <ConfigRow label="Gross margin" value={`${(data.grossMarginPct * 100).toFixed(1)}%`} />
            </div>
          )}

          {drill === "collected" && (
            data.salesOrders.filter((order) => order.paymentStatus === "paid").length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments collected yet.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {data.salesOrders.filter((order) => order.paymentStatus === "paid").map((order) => (
                  <li key={order.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-1.5 last:border-0">
                    <span className="min-w-0 truncate">{order.customer} <span className="font-mono text-[11px] text-muted-foreground">#{order.id.slice(-8)}</span></span>
                    <span className="shrink-0">{formatMoney(order.total, currency)}</span>
                  </li>
                ))}
              </ul>
            )
          )}

          {drill === "purchases" && (
            data.purchaseList.length === 0 ? (
              <p className="text-sm text-muted-foreground">No purchases yet.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {data.purchaseList.map((purchase) => (
                  <li key={purchase.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-1.5 last:border-0">
                    <span className="min-w-0 truncate">{purchase.vendor || "No vendor"} <span className="font-mono text-[11px] text-muted-foreground">#{purchase.id.slice(-8)}</span></span>
                    <span className="flex shrink-0 items-center gap-2"><span className={cn("rounded-full px-2 py-0.5 text-[10px] capitalize", statusTone(purchase.paymentStatus))}>{purchase.paymentStatus}</span>{formatMoney(purchase.total, currency)}</span>
                  </li>
                ))}
              </ul>
            )
          )}

          {drill === "paid" && (
            data.purchasePayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No vendor payments recorded yet.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {data.purchasePayments.map((payment) => (
                  <li key={payment.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-1.5 last:border-0">
                    <span className="min-w-0 truncate">{payment.vendor} <span className="text-[11px] capitalize text-muted-foreground">{payment.gateway}</span></span>
                    <span className="shrink-0">{formatMoney(payment.amount, currency)}</span>
                  </li>
                ))}
              </ul>
            )
          )}
        </Modal>
      )}
    </div>
  );
}

const DRILL_TITLES: Record<string, string> = {
  cash: "Cash — what makes it up",
  receivables: "Accounts receivable",
  inventory: "Inventory value",
  payables: "Accounts payable",
  overdraft: "Bank overdraft",
  equity: "Equity — how it's derived",
  sales: "Sales — recent orders",
  cogs: "Cost of goods sold",
  profit: "Gross profit",
  collected: "Payments collected",
  purchases: "Purchases",
  paid: "Vendor payments",
};

function PaymentsPanel({ store, gateways, reload }: { store: StoreSummary; gateways: GatewayView[]; reload: () => void }) {
  const [editing, setEditing] = useState<GatewayView | null>(null);
  const [accounting, setAccounting] = useState<Accounting | null>(null);
  const [options, setOptions] = useState<AccountingOptions>(store.settings.accounting);

  useEffect(() => {
    void api.get<Accounting>("/api/admin/accounting").then(setAccounting).catch(() => {});
  }, []);

  const toggle = async (gateway: GatewayView, enabled: boolean) => {
    await api.put(`/api/admin/payments/gateways/${gateway.key}`, { config: {}, enabled });
    reload();
  };

  const saveOptions = async (patch: Partial<AccountingOptions>) => {
    const next = { ...options, ...patch };
    setOptions(next);
    await api.patch("/api/admin/settings", { accounting: next }).catch(() => {});
  };

  return (
    <div className="space-y-6">
      {accounting && <AccountingDashboard data={accounting} options={options} onToggle={saveOptions} />}

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-amber-700" />
          <p className="font-medium">Payment gateways</p>
        </div>
        {gateways.map((gateway) => (
          <div key={gateway.key} className="rounded-xl border bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{gateway.label}</p>
                <p className="truncate text-xs text-muted-foreground">{gateway.description}</p>
              </div>
              <label className="flex shrink-0 items-center gap-2 text-sm">
                <input type="checkbox" checked={gateway.enabled} onChange={(event) => toggle(gateway, event.target.checked)} className="h-4 w-4 accent-amber-700" /> Enabled
              </label>
            </div>
            {gateway.requiresCredentials && (
              <>
                <div className="mt-3 rounded-lg border border-border/60 px-3">
                  {gateway.credentialFields.map((field) => (
                    <ConfigRow key={field.key} label={field.label} value={String(gateway.config[field.key] ?? "")} secret={field.type === "password"} />
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]", gateway.configured ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800")}>
                    {gateway.configured ? <><ShieldCheck className="h-3 w-3" /> Stored securely</> : "Placeholder mode"}
                  </span>
                  <button onClick={() => setEditing(gateway)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition hover:bg-muted"><Pencil className="h-3.5 w-3.5" /> Configure</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {editing && <GatewayModal gateway={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

function GatewayModal({ gateway, onClose, onSaved }: { gateway: GatewayView; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(gateway.credentialFields.map((field) => [field.key, field.type === "password" ? "" : String(gateway.config[field.key] ?? "")])),
  );
  const [enabled, setEnabled] = useState(gateway.enabled);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/api/admin/payments/gateways/${gateway.key}`, { config: draft, enabled });
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={gateway.label} onClose={onClose}>
      <p className="mb-4 flex items-start gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        Secrets are stored server-side and only shown masked. Enter a new value to replace a field, or leave it blank to keep the current one.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {gateway.credentialFields.map((field) => (
          <label key={field.key} className="block text-sm">
            <span className="mb-1 block text-muted-foreground">{field.label}{field.required && " *"}</span>
            <input
              type={field.type === "password" ? "password" : "text"}
              placeholder={field.type === "password" ? "•••••••• (enter to replace)" : field.placeholder}
              value={draft[field.key] ?? ""}
              onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
              className="w-full rounded-lg border px-3 py-2"
            />
          </label>
        ))}
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="h-4 w-4 accent-amber-700" /> Enabled</label>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
        <button onClick={save} disabled={busy} className="rounded-lg bg-amber-700 px-4 py-2 text-sm text-white disabled:opacity-50">Save securely</button>
      </div>
    </Modal>
  );
}

function DeliveryPanel({ store, reload }: { store: StoreSummary; reload: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const d = store.settings.delivery;
  const [provider, setProvider] = useState(d.provider);
  const [baseUrl, setBaseUrl] = useState(d.boostCarrier.baseUrl);
  const [customerId, setCustomerId] = useState(d.boostCarrier.customerId);
  const [markup, setMarkup] = useState(String(d.markup ?? 0));
  const [pickupLat, setPickupLat] = useState(String(store.settings.pickup.latitude));
  const [pickupLng, setPickupLng] = useState(String(store.settings.pickup.longitude));
  const [dropoffLat, setDropoffLat] = useState(String(store.settings.demoDropoff.latitude));
  const [dropoffLng, setDropoffLng] = useState(String(store.settings.demoDropoff.longitude));

  const save = async () => {
    await api.patch("/api/admin/settings", {
      delivery: { provider, markup: Number(markup), boostCarrier: { baseUrl, customerId } },
      pickup: { latitude: Number(pickupLat), longitude: Number(pickupLng) },
      demoDropoff: { latitude: Number(dropoffLat), longitude: Number(dropoffLng) },
    });
    setSaved(true);
    setEditing(false);
    reload();
  };

  return (
    <div className="max-w-xl space-y-4 rounded-xl border bg-background p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-amber-700" /><h3 className="font-medium">Delivery</h3></div>
          <p className="mt-1 text-sm text-muted-foreground">Courier provider, credentials and pickup defaults.</p>
        </div>
        <button onClick={() => setEditing(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition hover:bg-muted"><Pencil className="h-3.5 w-3.5" /> Configure</button>
      </div>
      <div className="rounded-lg border border-border/60 px-3">
        <ConfigRow label="Provider" value={d.provider} />
        <ConfigRow label="Base URL" value={d.boostCarrier.baseUrl} secret />
        <ConfigRow label="Customer ID" value={d.boostCarrier.customerId} secret />
        <ConfigRow label="Markup" value={formatMoney(Number(d.markup ?? 0), store.currency)} />
        <ConfigRow label="Pickup" value={`${store.settings.pickup.latitude}, ${store.settings.pickup.longitude}`} />
      </div>
      {saved && <p className="text-sm text-amber-800">Saved.</p>}

      {editing && (
        <Modal title="Delivery configuration" onClose={() => setEditing(false)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-muted-foreground">Provider</span>
              <select value={provider} onChange={(event) => setProvider(event.target.value)} className="w-full rounded-lg border px-3 py-2">
                <option value="boost-carrier">Boost (Uber Direct)</option>
                <option value="simulated">Simulated courier</option>
              </select>
            </label>
            <Input label="Boost-carrier base URL" value={baseUrl} onChange={setBaseUrl} />
            <Input label="Uber customer ID" value={customerId} onChange={setCustomerId} />
            <Input label="Delivery markup" type="number" value={markup} onChange={setMarkup} />
            <Input label="Pickup latitude" value={pickupLat} onChange={setPickupLat} />
            <Input label="Pickup longitude" value={pickupLng} onChange={setPickupLng} />
            <Input label="Demo drop-off latitude" value={dropoffLat} onChange={setDropoffLat} />
            <Input label="Demo drop-off longitude" value={dropoffLng} onChange={setDropoffLng} />
          </div>
          <p className="mt-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            Webhooks from boost-carrier arrive at <code className="mx-1 rounded bg-background px-1">/api/delivery/webhook</code>.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
            <button onClick={save} className="rounded-lg bg-amber-700 px-4 py-2 text-sm text-white">Save securely</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SettingsPanel({ store, reload }: { store: StoreSummary; reload: () => void }) {
  const [name, setName] = useState(store.name);
  const [description, setDescription] = useState(store.description);
  const [announcement, setAnnouncement] = useState(store.announcement);
  const [currency, setCurrency] = useState(store.currency);
  const [timing, setTiming] = useState(store.settings.paymentTiming);
  const [terms, setTerms] = useState(store.settings.terms ?? "");
  const [otpWebhook, setOtpWebhook] = useState(store.settings.otp?.webhookUrl ?? "");
  const [purchaseWebhook, setPurchaseWebhook] = useState(store.settings.purchases?.webhookUrl ?? "");
  const [notifyWebhook, setNotifyWebhook] = useState(store.settings.notifications?.webhookUrl ?? "");
  const [taxEnabled, setTaxEnabled] = useState(store.settings.tax?.enabled ?? false);
  const [taxRate, setTaxRate] = useState(String(store.settings.tax?.rate ?? 0));
  const [taxInclusive, setTaxInclusive] = useState(store.settings.tax?.inclusive ?? false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    await api.patch("/api/admin/settings", {
      name,
      description,
      announcement,
      currency,
      paymentTiming: timing,
      terms,
      otp: { webhookUrl: otpWebhook },
      purchases: { webhookUrl: purchaseWebhook },
      notifications: { webhookUrl: notifyWebhook },
      tax: { enabled: taxEnabled, rate: Number(taxRate) || 0, inclusive: taxInclusive },
    });
    setSaved(true);
    reload();
  };

  return (
    <div className="max-w-xl space-y-4 rounded-xl border bg-background p-5">
      <h3 className="font-medium">Store settings</h3>
      <Input label="Store name" value={name} onChange={setName} />
      <Input label="Description" value={description} onChange={setDescription} />
      <Input label="Announcement bar" value={announcement} onChange={setAnnouncement} />
      <Input label="Currency" value={currency} onChange={setCurrency} />
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">Default payment timing</span>
        <select value={timing} onChange={(event) => setTiming(event.target.value as "prepay" | "cod")} className="w-full rounded-lg border px-3 py-2">
          <option value="prepay">Pay before delivery</option>
          <option value="cod">Pay on delivery</option>
        </select>
      </label>

      <div className="space-y-3 rounded-xl border border-border/60 p-3">
        <div>
          <p className="text-sm font-medium">Customer onboarding</p>
          <p className="text-xs text-muted-foreground">Signups are verified with a 6-digit OTP sent to email + WhatsApp.</p>
        </div>
        <Input label="OTP / n8n webhook URL" value={otpWebhook} onChange={setOtpWebhook} />
        <p className="text-xs text-muted-foreground">Leave empty to show the OTP on screen (demo mode). When set, we POST <code className="rounded bg-muted px-1">{`{ event, purpose, otp_code, email, phone }`}</code> so n8n can deliver it.</p>
      </div>

      <div className="space-y-3 rounded-xl border border-border/60 p-3">
        <div>
          <p className="text-sm font-medium">Purchase orders</p>
          <p className="text-xs text-muted-foreground">Send purchase orders to vendors through your automation (n8n).</p>
        </div>
        <Input label="Purchase-order webhook URL" value={purchaseWebhook} onChange={setPurchaseWebhook} />
        <p className="text-xs text-muted-foreground">When set, "Send PO" POSTs <code className="rounded bg-muted px-1">{`{ event, store, vendor, purchase, items }`}</code> to this URL so n8n can email the vendor.</p>
      </div>

      <div className="space-y-3 rounded-xl border border-border/60 p-3">
        <div>
          <p className="text-sm font-medium">Order notifications</p>
          <p className="text-xs text-muted-foreground">Notify customers on order events through your automation (n8n).</p>
        </div>
        <Input label="Order-notification webhook URL" value={notifyWebhook} onChange={setNotifyWebhook} />
        <p className="text-xs text-muted-foreground">When set, we POST <code className="rounded bg-muted px-1">{`{ event, store, order, customer }`}</code> on every status change (pending → delivered, cancelled, …).</p>
      </div>

      <div className="space-y-3 rounded-xl border border-border/60 p-3">
        <div>
          <p className="text-sm font-medium">Tax / VAT</p>
          <p className="text-xs text-muted-foreground">Applied to the product subtotal at checkout (not delivery).</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={taxEnabled} onChange={(event) => setTaxEnabled(event.target.checked)} />
          Charge tax on orders
        </label>
        <div className="flex items-center gap-3">
          <Input label="Rate (%)" value={taxRate} onChange={setTaxRate} type="number" />
          <label className="mt-5 flex items-center gap-2 whitespace-nowrap text-sm">
            <input type="checkbox" checked={taxInclusive} disabled={!taxEnabled} onChange={(event) => setTaxInclusive(event.target.checked)} />
            Prices include tax
          </label>
        </div>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">Terms &amp; conditions</span>
        <textarea value={terms} onChange={(event) => setTerms(event.target.value)} className="h-40 w-full rounded-lg border px-3 py-2 font-mono text-xs" />
      </label>

      <div className="flex items-center gap-3">
        <button onClick={save} className="rounded-lg bg-amber-700 px-4 py-2 text-sm text-white">Save</button>
        {saved && <span className="text-sm text-amber-800">Saved</span>}
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border px-3 py-2" />
    </label>
  );
}
