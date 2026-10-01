import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, History as HistoryIcon, Search } from "lucide-react";
import { TrackOrder } from "../storefront/TrackOrder";
import { Logo } from "../ui/Logo";
import { api, placeholderImage, type Account, type CrmCustomer, type GatewayView, type InventoryItem, type Order, type Product, type ProductHistory, type StoreSummary, type Warehouse } from "@/lib/api";
import { formatDateTime, formatMoney, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, statusTone } from "@/lib/format";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "orders", label: "Orders" },
  { key: "inventory", label: "Inventory" },
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
            <div className="grid gap-4 sm:grid-cols-4">
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
        {tab === "crm" && <CrmPanel currency={store?.currency ?? "KES"} />}
        {tab === "payments" && <PaymentsPanel gateways={gateways} reload={loadAll} />}
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
      <div className="grid gap-4 sm:grid-cols-4">
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
  const low = inventory.filter((item) => item.low).length;
  const inTransit = inventory.reduce((sum, item) => sum + item.inTransit, 0);
  const filtered = inventory.filter((item) => `${item.name} ${item.category} ${item.sku}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="SKUs" value={String(inventory.length)} />
        <Stat label="On hand" value={String(units)} />
        <Stat label="In transit" value={String(inTransit)} />
        <Stat label="Low stock" value={String(low)} />
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
  const [draft, setDraft] = useState<Partial<Product> & { reorderLevel?: number }>({ status: "active", featured: false, ...value });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Product> & { reorderLevel?: number }) => setDraft((current) => ({ ...current, ...patch }));

  const save = async () => {
    setBusy(true);
    try {
      const catalog = {
        name: draft.name, description: draft.description, price: Number(draft.price),
        compareAtPrice: draft.compareAtPrice ?? null, category: draft.category, image: draft.image,
        status: draft.status, featured: Boolean(draft.featured), warehouseId: draft.warehouseId,
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

  return (
    <Modal onClose={onClose} title={draft.id ? "Edit product" : "New product"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Name" value={draft.name ?? ""} onChange={(v) => set({ name: v })} />
        <Input label="Category" value={draft.category ?? ""} onChange={(v) => set({ category: v })} />
        <Input label="Price" type="number" value={String(draft.price ?? "")} onChange={(v) => set({ price: Number(v) })} />
        <Input label="Compare at" type="number" value={String(draft.compareAtPrice ?? "")} onChange={(v) => set({ compareAtPrice: v ? Number(v) : null })} />
        <Input label="Stock" type="number" value={String(draft.stock ?? "")} onChange={(v) => set({ stock: Number(v) })} />
        <Input label="Reorder at" type="number" value={String((draft as { reorderLevel?: number }).reorderLevel ?? 0)} onChange={(v) => set({ reorderLevel: Number(v) })} />
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Warehouse</span>
          <select value={draft.warehouseId ?? ""} onChange={(event) => set({ warehouseId: event.target.value })} className="w-full rounded-lg border px-3 py-2">
            <option value="">Unassigned</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <Input label="Image seed" value={draft.image ?? ""} onChange={(v) => set({ image: v })} />
        <div className="sm:col-span-2">
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Description</span>
            <textarea value={draft.description ?? ""} onChange={(event) => set({ description: event.target.value })} className="h-20 w-full rounded-lg border px-3 py-2" />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(draft.featured)} onChange={(event) => set({ featured: event.target.checked })} className="h-4 w-4 accent-amber-700" /> Featured</label>
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
    <div className="overflow-x-auto">
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

function PaymentsPanel({ gateways, reload }: { gateways: GatewayView[]; reload: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>({});
  const [busy, setBusy] = useState("");

  useEffect(() => {
    setDrafts(Object.fromEntries(gateways.map((g) => [g.key, { ...g.config }])));
  }, [gateways]);

  const save = async (gateway: GatewayView, enabled?: boolean) => {
    setBusy(gateway.key);
    try {
      await api.put(`/api/admin/payments/gateways/${gateway.key}`, { config: drafts[gateway.key] ?? {}, enabled: enabled ?? gateway.enabled });
      reload();
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-4">
      {gateways.map((gateway) => (
        <div key={gateway.key} className="rounded-xl border bg-background p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{gateway.label}</p>
              <p className="text-xs text-muted-foreground">{gateway.description}</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={gateway.enabled} onChange={(event) => save(gateway, event.target.checked)} disabled={busy === gateway.key} />
              Enabled
            </label>
          </div>
          {gateway.requiresCredentials && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {gateway.credentialFields.map((field) => (
                <label key={field.key} className="block text-sm">
                  <span className="mb-1 block text-muted-foreground">{field.label}{field.required && " *"}</span>
                  <input
                    type={field.type === "password" ? "password" : "text"}
                    placeholder={field.placeholder}
                    value={String(drafts[gateway.key]?.[field.key] ?? "")}
                    onChange={(event) => setDrafts((current) => ({ ...current, [gateway.key]: { ...current[gateway.key], [field.key]: event.target.value } }))}
                    className="w-full rounded-lg border px-3 py-2"
                  />
                </label>
              ))}
              <div className="sm:col-span-2 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {gateway.configured ? "Configured" : "No credentials yet — runs in placeholder mode when enabled."}
                </p>
                <button onClick={() => save(gateway)} disabled={busy === gateway.key} className="rounded-lg bg-amber-700 px-4 py-2 text-sm text-white disabled:opacity-50">Save credentials</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DeliveryPanel({ store, reload }: { store: StoreSummary; reload: () => void }) {
  const [provider, setProvider] = useState(store.settings.delivery.provider);
  const [baseUrl, setBaseUrl] = useState(store.settings.delivery.boostCarrier.baseUrl);
  const [customerId, setCustomerId] = useState(store.settings.delivery.boostCarrier.customerId);
  const [markup, setMarkup] = useState(String(store.settings.delivery.markup ?? 0));
  const [pickupLat, setPickupLat] = useState(String(store.settings.pickup.latitude));
  const [pickupLng, setPickupLng] = useState(String(store.settings.pickup.longitude));
  const [dropoffLat, setDropoffLat] = useState(String(store.settings.demoDropoff.latitude));
  const [dropoffLng, setDropoffLng] = useState(String(store.settings.demoDropoff.longitude));
  const [saved, setSaved] = useState(false);

  const save = async () => {
    await api.patch("/api/admin/settings", {
      delivery: { provider, markup: Number(markup), boostCarrier: { baseUrl, customerId } },
      pickup: { latitude: Number(pickupLat), longitude: Number(pickupLng) },
      demoDropoff: { latitude: Number(dropoffLat), longitude: Number(dropoffLng) },
    });
    setSaved(true);
    reload();
  };

  return (
    <div className="max-w-xl space-y-4 rounded-xl border bg-background p-5">
      <div>
        <h3 className="font-medium">Delivery provider</h3>
        <p className="text-sm text-muted-foreground">Boost (Uber Direct) is plug-and-play: point it at the mock API locally or real Uber in production.</p>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">Provider</span>
        <select value={provider} onChange={(event) => setProvider(event.target.value)} className="w-full rounded-lg border px-3 py-2">
          <option value="boost-carrier">Boost (Uber Direct)</option>
          <option value="simulated">Simulated courier</option>
        </select>
      </label>
      <Input label="Boost-carrier base URL" value={baseUrl} onChange={setBaseUrl} />
      <Input label="Uber customer ID" value={customerId} onChange={setCustomerId} />
      <Input label="Delivery markup (KES)" type="number" value={markup} onChange={setMarkup} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Pickup latitude" value={pickupLat} onChange={setPickupLat} />
        <Input label="Pickup longitude" value={pickupLng} onChange={setPickupLng} />
        <Input label="Demo drop-off latitude" value={dropoffLat} onChange={setDropoffLat} />
        <Input label="Demo drop-off longitude" value={dropoffLng} onChange={setDropoffLng} />
      </div>
      <p className="text-xs text-muted-foreground">
        These coordinates drive the live delivery map for new orders. Align them with your provider's courier area (the bundled mock reports San
        Francisco: 37.7749, -122.4194).
      </p>
      <div className="flex items-center gap-3">
        <button onClick={save} className="rounded-lg bg-amber-700 px-4 py-2 text-sm text-white">Save</button>
        {saved && <span className="text-sm text-amber-800">Saved</span>}
      </div>
      <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
        Local tip: run the uber-delivery-mock-api, then boost-carrier pointed at it, and set the base URL to boost-carrier. Inbound webhooks arrive at
        <code className="mx-1 rounded bg-background px-1">/api/delivery/webhook</code> — set it as boost-carrier's <code className="mx-1 rounded bg-background px-1">DELIVERY_WEBHOOK_FORWARD_URL</code>.
      </p>
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
  const [saved, setSaved] = useState(false);

  const save = async () => {
    await api.patch("/api/admin/settings", { name, description, announcement, currency, paymentTiming: timing, terms, otp: { webhookUrl: otpWebhook } });
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
