import { useEffect, useMemo, useState } from "react";
import {
  BadgePercent,
  ChevronRight,
  Clock,
  Flame,
  Home,
  MapPin,
  Minus,
  Package,
  Plus,
  Receipt,
  Search,
  Settings,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  User,
  X,
} from "lucide-react";
import { Checkout } from "./Checkout";
import { TrackOrder } from "./TrackOrder";
import { AuthScreen } from "../account/AuthScreen";
import { Logo } from "../ui/Logo";
import { ProductImage } from "../ui/ProductImage";
import { api, type Customer, type Mashup, type Order, type Product, type StoreSummary } from "@/lib/api";
import { formatDateTime, formatMoney, ORDER_STATUS_LABELS, statusTone } from "@/lib/format";
import { cn } from "@/lib/utils";

type CartItem = { product: Product; quantity: number };
type View = "home" | "shop" | "orders";

const THEMES = [
  { key: "curated", label: "For you", Icon: Sparkles },
  { key: "deals", label: "Deals", Icon: BadgePercent },
  { key: "trending", label: "Trending", Icon: Flame },
  { key: "fresh", label: "New", Icon: Clock },
] as const;

const SAVED_ORDERS_KEY = "boost-store-orders";

function readSavedOrders(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_ORDERS_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function saveOrderId(id: string): void {
  const ids = new Set(readSavedOrders());
  ids.add(id);
  localStorage.setItem(SAVED_ORDERS_KEY, JSON.stringify([...ids]));
}

const CUSTOMER_EMAIL_KEY = "boost-store-email";

function readCustomerEmail(): string {
  return localStorage.getItem(CUSTOMER_EMAIL_KEY) ?? "";
}

function saveCustomerEmail(email: string): void {
  if (email) localStorage.setItem(CUSTOMER_EMAIL_KEY, email);
}

export function Storefront({ store, onAdmin }: { store: StoreSummary; onAdmin?: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [mashup, setMashup] = useState<Mashup | null>(null);
  const [mashupTheme, setMashupTheme] = useState("curated");
  const [view, setView] = useState<View>("home");
  const [selected, setSelected] = useState<Product | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("featured");

  useEffect(() => {
    void api.get<Customer | null>("/api/customer/me").then(setCustomer).catch(() => {});
  }, []);

  useEffect(() => {
    void api.get<Product[]>("/api/products").then(setProducts).catch(() => {});
  }, []);

  useEffect(() => {
    void api.get<Mashup>(`/api/mashup?theme=${mashupTheme}&limit=10`).then(setMashup).catch(() => {});
  }, [mashupTheme]);

  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))].sort(), [products]);

  const filtered = useMemo(() => {
    let list = [...products];
    if (search) list = list.filter((p) => `${p.name} ${p.category}`.toLowerCase().includes(search.toLowerCase()));
    if (category) list = list.filter((p) => p.category === category);
    if (sort === "price-asc") list.sort((a, b) => a.price - b.price);
    else if (sort === "price-desc") list.sort((a, b) => b.price - a.price);
    else if (sort === "rating") list.sort((a, b) => b.rating - a.rating);
    else list.sort((a, b) => Number(b.featured) - Number(a.featured));
    return list;
  }, [products, search, category, sort]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  const addToCart = (product: Product, quantity = 1) => {
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (existing) return current.map((item) => (item.product.id === product.id ? { ...item, quantity: item.quantity + quantity } : item));
      return [...current, { product, quantity }];
    });
  };

  const updateQty = (productId: string, delta: number) => {
    setCart((current) =>
      current.map((item) => (item.product.id === productId ? { ...item, quantity: item.quantity + delta } : item)).filter((item) => item.quantity > 0),
    );
  };

  if (order) {
    return (
      <div className="min-h-screen bg-muted/40">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <TrackOrder
            orderId={order.id}
            onBack={() => { setOrder(null); setView("orders"); }}
            onShop={() => { setOrder(null); setView("home"); }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/40 pb-24 sm:pb-12">
      {store.announcement && (
        <div className="bg-slate-900 px-4 py-2 text-center text-xs font-semibold tracking-wide text-white">{store.announcement}</div>
      )}

      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl px-4 pt-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setView("home")} className="flex min-w-0 items-center gap-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-900 shadow-sm">
                <Logo className="bolt-glow h-5 w-5 text-amber-400" />
              </span>
              <span className="truncate text-base font-bold tracking-tight">{store.name}</span>
            </button>

            <nav className="ml-3 hidden items-center gap-0.5 sm:flex">
              <HeaderNav Icon={Home} label="Home" active={view === "home"} onClick={() => setView("home")} />
              <HeaderNav Icon={Store} label="Shop" active={view === "shop"} onClick={() => setView("shop")} />
              <HeaderNav Icon={Receipt} label="Orders" active={view === "orders"} onClick={() => setView("orders")} />
            </nav>

            <div className="ml-auto flex items-center gap-1.5">
              <button onClick={() => setAuthOpen(true)} className="grid h-10 w-10 place-items-center rounded-full border border-border/70 text-muted-foreground transition hover:bg-muted" aria-label="Account">
                {customer ? <span className="grid h-7 w-7 place-items-center rounded-full bg-amber-700 text-xs font-bold text-white">{customer.name.charAt(0).toUpperCase()}</span> : <User className="h-4.5 w-4.5" />}
              </button>
              {onAdmin && (
                <button onClick={onAdmin} className="grid h-10 w-10 place-items-center rounded-full border border-border/70 text-muted-foreground transition hover:bg-muted" aria-label="Admin">
                  <Settings className="h-4.5 w-4.5" />
                </button>
              )}
              <button onClick={() => setCartOpen(true)} className="relative grid h-10 w-10 place-items-center rounded-full bg-amber-700 text-white shadow-sm transition hover:bg-amber-800" aria-label="Cart">
                <ShoppingCart className="h-4.5 w-4.5" />
                {cartCount > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 w-5 place-items-center rounded-full bg-amber-400 text-[11px] font-bold text-black">{cartCount}</span>}
              </button>
            </div>
          </div>

          <button onClick={() => setView("home")} className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 text-amber-700" />
            Deliver to <span className="font-medium text-foreground">{store.settings.pickup.city || "your area"}</span>
          </button>

          <div className="flex items-center gap-2 py-3">
            <SearchBox
              products={products}
              currency={store.currency}
              onSelect={(product) => setSelected(product)}
              onSeeAll={(query) => { setSearch(query); setView("shop"); }}
              placeholder={`Search ${store.name}`}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4">
        {view === "home" && (
          <>
            <section className="mt-4 overflow-hidden squircle bg-slate-900 p-6 text-white shadow-lg">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/80">{store.description || "Delivered by Boost"}</p>
              <h1 className="mt-2 text-2xl font-bold leading-tight sm:text-3xl">{String(store.theme.heroHeadline ?? "Everyday essentials, delivered fast.")}</h1>
              <p className="mt-2 text-sm text-white/85">{String(store.theme.heroSubhead ?? "")}</p>
              <div className="mt-5 flex gap-2">
                <button onClick={() => setView("shop")} className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-amber-800 shadow-sm transition hover:scale-[1.02]">Shop now</button>
                <button onClick={() => document.getElementById("mashup")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="rounded-full border border-white/40 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10">Today's mix</button>
              </div>
            </section>

            <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
              <Chip active={!category} onClick={() => { setCategory(""); setView("shop"); }}>All</Chip>
              {categories.map((item) => (
                <Chip key={item} active={category === item} onClick={() => { setCategory(item); setView("shop"); }}>{item}</Chip>
              ))}
            </div>

            <section id="mashup" className="mt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold tracking-tight">{mashup?.title ?? "Today's mix"}</h2>
                  <p className="text-xs text-muted-foreground">{mashup?.subtitle}</p>
                </div>
              </div>
              <div className="mt-2.5 flex gap-1.5">
                {THEMES.map(({ key, label, Icon }) => (
                  <Chip key={key} active={mashupTheme === key} onClick={() => setMashupTheme(key)}>
                    <Icon className="mr-1 h-3.5 w-3.5" />
                    {label}
                  </Chip>
                ))}
              </div>

              <div className="-mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
                {mashup?.items.map((item) => (
                  <button key={item.product.id} onClick={() => setSelected(item.product)} className="w-44 shrink-0 snap-start overflow-hidden rounded-2xl border border-border/60 bg-card text-left shadow-sm transition hover:shadow-md">
                    <div className="relative aspect-square">
                      <ProductImage seed={item.product.image} alt={item.product.name} className="h-full w-full" />
                      <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur">{item.reason}</span>
                    </div>
                    <div className="p-2.5">
                      <p className="truncate text-sm font-medium">{item.product.name}</p>
                      <p className="text-sm font-bold text-amber-800">{formatMoney(item.product.price, store.currency)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-8">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold tracking-tight">Popular near you</h2>
                <button onClick={() => setView("shop")} className="text-xs font-semibold text-amber-800 hover:underline">See all</button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {products.slice(0, 6).map((product) => (
                  <ProductCard key={product.id} product={product} currency={store.currency} onOpen={() => setSelected(product)} onAdd={() => addToCart(product)} />
                ))}
              </div>
            </section>
          </>
        )}

        {view === "shop" && (
          <section className="mt-4">
            <div className="flex gap-2 overflow-x-auto pb-1">
              <Chip active={!category} onClick={() => setCategory("")}>All</Chip>
              {categories.map((item) => (
                <Chip key={item} active={category === item} onClick={() => setCategory(item)}>{item}</Chip>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{filtered.length} products</p>
              <select value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs outline-none">
                <option value="featured">Featured</option>
                <option value="price-asc">Price ↑</option>
                <option value="price-desc">Price ↓</option>
                <option value="rating">Top rated</option>
              </select>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {filtered.map((product) => (
                <ProductCard key={product.id} product={product} currency={store.currency} onOpen={() => setSelected(product)} onAdd={() => addToCart(product)} />
              ))}
            </div>
          </section>
        )}

        {view === "orders" && (
          <OrdersView
            customer={customer}
            onTrack={async (id) => setOrder(await api.get<Order>(`/api/orders/${id}`))}
            onShop={() => setView("shop")}
            onSignIn={() => setAuthOpen(true)}
          />
        )}
      </main>

      <footer className="mx-auto max-w-3xl px-4 pb-6 pt-8 text-center text-[11px] text-muted-foreground/70">
        {store.name} · Powered by Boost delivery · Maps © OpenStreetMap contributors, © CARTO
      </footer>

      {/* Bottom navigation (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 backdrop-blur-xl sm:hidden">
        <div className="mx-auto flex max-w-3xl items-stretch">
          <NavItem Icon={Home} label="Home" active={view === "home"} onClick={() => setView("home")} />
          <NavItem Icon={Store} label="Shop" active={view === "shop"} onClick={() => setView("shop")} />
          <NavItem Icon={Receipt} label="Orders" active={view === "orders"} onClick={() => setView("orders")} />
          <NavItem Icon={User} label="Account" active={authOpen} onClick={() => setAuthOpen(true)} />
          <NavItem Icon={ShoppingCart} label="Cart" badge={cartCount} onClick={() => setCartOpen(true)} />
        </div>
      </nav>

      {cartCount > 0 && !cartOpen && (
        <button onClick={() => setCartOpen(true)} className="fixed inset-x-0 bottom-16 z-20 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-amber-700 px-5 py-3.5 text-white shadow-2xl sm:bottom-4">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-white/20 text-sm font-bold">{cartCount}</span>
          <span className="flex-1 text-left text-sm font-medium">View cart</span>
          <span className="text-sm font-bold">{formatMoney(cartTotal, store.currency)}</span>
        </button>
      )}

      {selected && (
        <ProductSheet product={selected} currency={store.currency} onClose={() => setSelected(null)} onAdd={(quantity) => { addToCart(selected, quantity); setSelected(null); }} />
      )}

      {cartOpen && (
        <CartSheet cart={cart} currency={store.currency} onClose={() => setCartOpen(false)} onUpdate={updateQty} onCheckout={() => { setCartOpen(false); setCheckoutOpen(true); }} />
      )}

      {checkoutOpen && (
        <Checkout
          cart={cart}
          store={store}
          customer={customer}
          defaultTiming={store.settings.paymentTiming}
          onClose={() => setCheckoutOpen(false)}
          onPlaced={(placed) => { setCheckoutOpen(false); setCart([]); saveOrderId(placed.id); saveCustomerEmail(placed.customer?.email ?? ""); setOrder(placed); }}
        />
      )}

      {authOpen && (
        <AuthScreen
          customer={customer}
          onClose={() => setAuthOpen(false)}
          onAuthed={(user) => setCustomer(user)}
          onOrders={() => setView("orders")}
        />
      )}
    </div>
  );
}

function NavItem({ Icon, label, active, badge, onClick }: { Icon: typeof Home; label: string; active?: boolean; badge?: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-1 flex-col items-center gap-0.5 py-2.5">
      <span className={cn("relative grid h-7 w-11 place-items-center rounded-full transition", active ? "bg-amber-100 text-amber-800" : "text-muted-foreground")}>
        <Icon className="h-5 w-5" />
        {badge ? <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-amber-400 text-[10px] font-bold text-black">{badge}</span> : null}
      </span>
      <span className={cn("text-[10px]", active ? "font-semibold text-amber-800" : "text-muted-foreground")}>{label}</span>
    </button>
  );
}

function HeaderNav({ Icon, label, active, onClick }: { Icon: typeof Home; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition", active ? "bg-amber-50 text-amber-800" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("inline-flex shrink-0 items-center rounded-full border px-3.5 py-1.5 text-xs font-medium transition", active ? "border-amber-700 bg-amber-700 text-white shadow-sm" : "border-border/70 bg-background hover:bg-muted")}>
      {children}
    </button>
  );
}

function SearchBox({ products, currency, onSelect, onSeeAll, placeholder }: {
  products: Product[];
  currency: string;
  onSelect: (product: Product) => void;
  onSeeAll: (query: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return products.filter((p) => `${p.name} ${p.category} ${p.tags.join(" ")}`.toLowerCase().includes(q)).slice(0, 6);
  }, [query, products]);

  const close = () => setOpen(false);
  const select = (product: Product) => { onSelect(product); close(); };
  const seeAll = () => { onSeeAll(query); close(); };

  return (
    <div className="relative flex-1">
      <div className="flex items-center gap-2.5 rounded-2xl border border-border/70 bg-muted/50 px-3.5 py-2.5 transition focus-within:ring-2 focus-within:ring-amber-600/30">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm outline-none"
        />
        {query && (
          <button onClick={() => { setQuery(""); close(); }} className="text-muted-foreground hover:text-foreground" aria-label="Clear">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-border/70 bg-background shadow-xl">
          {results.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              No matches for “{query}”.
              <button onClick={seeAll} className="mt-1 block font-semibold text-amber-800 hover:underline">Browse the full catalogue</button>
            </div>
          ) : (
            <>
              <ul className="max-h-[60vh] overflow-auto">
                {results.map((product) => (
                  <li key={product.id}>
                    <button onClick={() => select(product)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-muted">
                      <ProductImage seed={product.image} className="h-11 w-11 shrink-0 rounded-lg" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{product.name}</span>
                        <span className="block text-xs text-muted-foreground">{product.category}</span>
                      </span>
                      <span className="text-sm font-bold text-amber-800">{formatMoney(product.price, currency)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <button onClick={seeAll} className="block w-full border-t border-border/60 px-3 py-2.5 text-center text-xs font-semibold text-amber-800 transition hover:bg-muted">
                See all results for “{query}”
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ProductCard({ product, currency, onOpen, onAdd }: { product: Product; currency: string; onOpen: () => void; onAdd: () => void }) {
  const discount = product.compareAtPrice && product.compareAtPrice > product.price ? Math.round((1 - product.price / product.compareAtPrice) * 100) : 0;
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition hover:shadow-md">
      <button onClick={onOpen} className="relative aspect-square overflow-hidden bg-muted">
        <ProductImage seed={product.image} alt={product.name} className="h-full w-full" />
        {discount > 0 && <span className="absolute left-2 top-2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">-{discount}%</span>}
      </button>
      <div className="flex flex-1 flex-col p-2.5">
        <button onClick={onOpen} className="text-left text-sm font-medium leading-snug">{product.name}</button>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{product.category}</p>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-sm font-bold text-amber-800">{formatMoney(product.price, currency)}</span>
          {product.compareAtPrice && <span className="text-[11px] text-muted-foreground line-through">{formatMoney(product.compareAtPrice, currency)}</span>}
        </div>
        <button onClick={onAdd} disabled={product.stock <= 0} className="mt-2 inline-flex items-center justify-center gap-1 rounded-full bg-amber-700 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-800 disabled:bg-muted disabled:text-muted-foreground">
          <Plus className="h-3.5 w-3.5" />
          {product.stock <= 0 ? "Sold out" : "Add"}
        </button>
      </div>
    </div>
  );
}

function ProductSheet({ product, currency, onClose, onAdd }: { product: Product; currency: string; onClose: () => void; onAdd: (quantity: number) => void }) {
  const [quantity, setQuantity] = useState(1);
  return (
    <Sheet onClose={onClose}>
      <ProductImage seed={product.image} alt={product.name} className="aspect-video w-full" />
      <div className="p-5">
        <p className="text-xs text-muted-foreground">{product.category}</p>
        <h2 className="text-xl font-bold tracking-tight">{product.name}</h2>
        <p className="mt-1 flex items-center gap-1 text-sm text-amber-500">
          <Star className="h-3.5 w-3.5 fill-current" /> <span className="font-medium">{product.rating.toFixed(1)}</span>
        </p>
        <p className="mt-3 text-sm text-muted-foreground">{product.description}</p>
        <p className="mt-4 text-2xl font-bold">{formatMoney(product.price, currency)}</p>
        <div className="mt-5 flex items-center gap-3">
          <div className="flex items-center rounded-full border border-border/70">
            <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="px-4 py-2" aria-label="Decrease"><Minus className="h-4 w-4" /></button>
            <span className="w-8 text-center text-sm">{quantity}</span>
            <button onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))} className="px-4 py-2" aria-label="Increase"><Plus className="h-4 w-4" /></button>
          </div>
          <button onClick={() => onAdd(quantity)} disabled={product.stock <= 0} className="flex-1 rounded-full bg-amber-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Add to cart</button>
        </div>
      </div>
    </Sheet>
  );
}

function CartSheet({ cart, currency, onClose, onUpdate, onCheckout }: { cart: CartItem[]; currency: string; onClose: () => void; onUpdate: (id: string, delta: number) => void; onCheckout: () => void }) {
  const total = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border/60 p-4">
        <h2 className="text-base font-bold">Your cart</h2>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <div className="max-h-[60vh] overflow-auto p-4">
        {cart.length === 0 ? (
          <p className="text-sm text-muted-foreground">Your cart is empty.</p>
        ) : (
          <ul className="space-y-4">
            {cart.map((item) => (
              <li key={item.product.id} className="flex gap-3">
                <ProductImage seed={item.product.image} className="h-16 w-16 rounded-xl" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{item.product.name}</p>
                  <p className="text-xs text-muted-foreground">{formatMoney(item.product.price, currency)}</p>
                  <div className="mt-1 inline-flex items-center rounded-full border border-border/70">
                    <button onClick={() => onUpdate(item.product.id, -1)} className="px-3 py-1" aria-label="Decrease"><Minus className="h-3.5 w-3.5" /></button>
                    <span className="w-7 text-center text-sm">{item.quantity}</span>
                    <button onClick={() => onUpdate(item.product.id, 1)} className="px-3 py-1" aria-label="Increase"><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <span className="text-sm font-semibold">{formatMoney(item.product.price * item.quantity, currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-border/60 p-4">
        <div className="mb-3 flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-bold">{formatMoney(total, currency)}</span>
        </div>
        <button onClick={onCheckout} disabled={cart.length === 0} className="w-full rounded-full bg-amber-700 py-3 font-semibold text-white disabled:opacity-50">Checkout</button>
        <p className="mt-2 text-center text-xs text-muted-foreground">Delivery & fees calculated at checkout</p>
      </div>
    </Sheet>
  );
}

function OrdersView({ customer, onTrack, onShop, onSignIn }: { customer: Customer | null; onTrack: (id: string) => void; onShop: () => void; onSignIn: () => void }) {
  const [email, setEmail] = useState(readCustomerEmail());
  const [draft, setDraft] = useState(readCustomerEmail());
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        let list: Order[] = [];
        if (customer) {
          list = await api.get<Order[]>("/api/orders");
        } else if (email) {
          list = await api.get<Order[]>(`/api/orders?email=${encodeURIComponent(email)}`);
        } else {
          const ids = readSavedOrders();
          const fetched = await Promise.all(ids.map((id) => api.get<Order>(`/api/orders/${id}`).catch(() => null)));
          list = fetched.filter((o): o is Order => o !== null).reverse();
        }
        if (!cancelled) setOrders(list);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load your orders.");
          setOrders([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email, customer]);

  const lookup = () => {
    const next = draft.trim().toLowerCase();
    if (!next) return;
    saveCustomerEmail(next);
    setEmail(next);
  };
  const clearEmail = () => {
    localStorage.removeItem(CUSTOMER_EMAIL_KEY);
    setEmail("");
    setDraft("");
  };

  if (loading) {
    return (
      <section className="mt-4 space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="squircle h-28 animate-pulse border border-border/60 bg-muted" />
        ))}
      </section>
    );
  }

  if (orders.length === 0 && !email && !customer) {
    return (
      <div className="mx-auto mt-12 max-w-sm px-2 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-muted">
          <Package className="h-7 w-7 text-muted-foreground" />
        </span>
        <p className="mt-3 font-display text-lg font-bold">Find your orders</p>
        <p className="mt-1 text-sm text-muted-foreground">Sign in, or enter the email you used at checkout, to see your orders on any device.</p>
        <button onClick={onSignIn} className="mt-4 w-full rounded-xl bg-amber-700 py-3 text-sm font-semibold text-white transition hover:bg-amber-800">Sign in or create account</button>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && lookup()}
          placeholder="you@example.com"
          type="email"
          className="mt-3 w-full rounded-xl border border-border/70 bg-background px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-500/30"
        />
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <button onClick={lookup} className="mt-2 w-full rounded-xl border border-border/70 py-3 text-sm font-semibold transition hover:bg-muted">Find my orders</button>
        <button onClick={onShop} className="mt-2 w-full rounded-xl border border-border/70 py-3 text-sm font-semibold transition hover:bg-muted">Start shopping</button>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="mt-16 flex flex-col items-center gap-3 px-6 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-muted">
          <Package className="h-7 w-7 text-muted-foreground" />
        </span>
        <p className="font-display text-lg font-bold">No orders yet</p>
        <p className="max-w-xs text-sm text-muted-foreground">Nothing found for {email}. Place an order and it will show up here on any device.</p>
        <button onClick={clearEmail} className="mt-1 text-xs font-semibold text-amber-800 hover:underline">Use a different email</button>
        <button onClick={onShop} className="rounded-full bg-amber-700 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-800">Start shopping</button>
      </div>
    );
  }

  const active = orders.filter((order) => ACTIVE_STATUSES.has(order.status));
  const past = orders.filter((order) => !ACTIVE_STATUSES.has(order.status));

  return (
    <section className="mt-4 space-y-7">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-xs text-muted-foreground">{customer ? customer.email : email || "This device"}</p>
        {customer ? null : <button onClick={clearEmail} className="shrink-0 text-xs font-medium text-amber-800 hover:underline">Change email</button>}
      </div>

      {active.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-600" />
            </span>
            <h2 className="font-display text-lg font-bold tracking-tight">In progress</h2>
          </div>
          {active.map((order) => (
            <OrderHistoryCard key={order.id} order={order} onTrack={onTrack} active />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display text-lg font-bold tracking-tight">Past orders</h2>
          {past.map((order) => (
            <OrderHistoryCard key={order.id} order={order} onTrack={onTrack} />
          ))}
        </div>
      )}
    </section>
  );
}

const ACTIVE_STATUSES = new Set(["pending", "processing", "ready", "dispatched", "in_transit", "out_for_delivery", "delivered"]);

function OrderHistoryCard({ order, onTrack, active }: { order: Order; onTrack: (id: string) => void; active?: boolean }) {
  const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const thumbs = order.items.slice(0, 4);
  return (
    <button onClick={() => onTrack(order.id)} className="block w-full min-w-0 squircle border border-border/60 bg-card p-4 text-left shadow-sm transition hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">#{order.id.slice(-8)}</span>
        <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", statusTone(order.status))}>{ORDER_STATUS_LABELS[order.status] ?? order.status}</span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="flex -space-x-3">
          {thumbs.map((item) => (
            <ProductImage key={item.id} seed={item.image} className="h-11 w-11 rounded-xl ring-2 ring-card" />
          ))}
          {order.items.length > thumbs.length && (
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-muted text-xs font-semibold ring-2 ring-card">+{order.items.length - thumbs.length}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{order.items[0]?.name ?? "Order"}{order.items.length > 1 ? ` +${order.items.length - 1} more` : ""}</p>
          <p className="text-xs text-muted-foreground">{count} item{count === 1 ? "" : "s"} · {formatDateTime(order.createdAt)}</p>
        </div>
        <span className="shrink-0 font-bold">{formatMoney(order.total, order.currency)}</span>
      </div>

      {active ? (
        <div className="mt-3 flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2">
          <span className="text-xs font-medium text-amber-800">
            {order.status === "delivered" ? "Arrived — confirm receipt" : order.delivery.etaMinutes > 0 ? `Arriving in ~${order.delivery.etaMinutes} min` : "Preparing your order"}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800">Track <ChevronRight className="h-3.5 w-3.5" /></span>
        </div>
      ) : (
        <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-amber-800">View order <ChevronRight className="h-3.5 w-3.5" /></div>
      )}
    </button>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full max-w-lg overflow-auto rounded-t-2xl bg-background shadow-2xl sm:squircle">{children}</div>
    </div>
  );
}
