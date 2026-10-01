import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bike,
  Check,
  ChevronRight,
  CreditCard,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Smartphone,
  User,
  Zap,
} from "lucide-react";
import { AddressSearch } from "../map/AddressSearch";
import { MapView } from "../map/MapView";
import { ProductImage } from "../ui/ProductImage";
import { api, type Account, type Coords, type Order, type Product, type StoreSummary } from "@/lib/api";
import { fetchRoute, formatDistance, formatDuration, reverseGeocode, type Place, type RouteResult } from "@/lib/mapConfig";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type CartItem = { product: Product; quantity: number };

type PaymentMethod = { key: string; label: string; description: string; requiresCredentials: boolean; supportsPlaceholder: boolean; configured: boolean };

const STEPS = ["Details", "Delivery", "Payment"];

type Errors = { name?: string; email?: string; phone?: string };

function validateDetails(values: { name: string; email: string; phone: string }): Errors {
  const errors: Errors = {};
  if (values.name.trim().length < 2) errors.name = "Enter your full name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = "Enter a valid email address.";
  const digits = values.phone.replace(/[^\d]/g, "");
  if (values.phone.trim() && (digits.length < 9 || digits.length > 13)) errors.phone = "Enter a valid phone number.";
  return errors;
}

export function Checkout({
  cart,
  store,
  account,
  defaultTiming,
  onClose,
  onPlaced,
}: {
  cart: CartItem[];
  store: StoreSummary;
  account?: Account | null;
  defaultTiming: "prepay" | "cod";
  onClose: () => void;
  onPlaced: (order: Order) => void;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(account?.name ?? "");
  const [email, setEmail] = useState(account?.email ?? (typeof localStorage === "undefined" ? "" : localStorage.getItem("boost-store-email") ?? ""));
  const [phone, setPhone] = useState(account?.phone ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [place, setPlace] = useState<Place | null>(null);
  const [dropoff, setDropoff] = useState<Coords>(store.settings.demoDropoff);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [quote, setQuote] = useState<{ quoteId: string; fee: number; etaMinutes: number } | null>(null);
  const [timing, setTiming] = useState<"prepay" | "cod">(defaultTiming);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [gateway, setGateway] = useState("mock");
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pickup = useMemo<Coords>(() => ({ latitude: store.settings.pickup.latitude, longitude: store.settings.pickup.longitude }), [store]);
  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const total = subtotal + (quote?.fee ?? 0);

  useEffect(() => {
    void reverseGeocode(store.settings.demoDropoff).then((resolved) => { if (resolved) setPlace(resolved); });
  }, [store.settings.demoDropoff]);

  useEffect(() => {
    void api.get<PaymentMethod[]>("/api/payment-methods").then((list) => {
      setMethods(list);
      if (list.length && !list.some((m) => m.key === gateway)) setGateway(list[0]!.key);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addressLine = place?.street || place?.name || "";

  const choosePlace = (selected: Place) => {
    setPlace(selected);
    setDropoff({ latitude: selected.latitude, longitude: selected.longitude });
    setQuote(null);
    setRoute(null);
  };

  const pickOnMap = async (coords: Coords) => {
    setDropoff(coords);
    setQuote(null);
    setRoute(null);
    const resolved = await reverseGeocode(coords);
    setPlace(resolved ?? { label: "Dropped pin", name: "Dropped pin", street: "", city: "", country: "", countryCode: "", ...coords });
  };

  const next = () => {
    if (step === 0) {
      const errs = validateDetails({ name, email, phone });
      setErrors(errs);
      if (Object.keys(errs).length) return;
    }
    setError("");
    setStep((current) => Math.min(current + 1, 2));
  };

  const getQuote = async () => {
    setBusy(true);
    setError("");
    try {
      const [routeResult, quoteResult] = await Promise.all([
        fetchRoute(pickup, dropoff),
        api.post<{ quoteId: string; fee: number; etaMinutes: number }>("/api/delivery/quote", {
          dropoff: { street_address: [addressLine || "Dropped pin"], city: place?.city || "", country: place?.countryCode || place?.country || "KE" },
        }),
      ]);
      setRoute(routeResult);
      setQuote(quoteResult);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not get a delivery quote.");
    } finally {
      setBusy(false);
    }
  };

  const placeOrder = async () => {
    setBusy(true);
    setError("");
    try {
      const order = await api.post<Order>("/api/orders", {
        customer: { name: name.trim(), email: email.trim(), phone, address: place?.label ?? addressLine },
        items: cart.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
        paymentTiming: timing,
        dropoff: { street_address: [addressLine || "Dropped pin"], city: place?.city || "", country: place?.countryCode || place?.country || "KE" },
        dropoffCoords: dropoff,
        quoteId: quote?.quoteId,
      });
      if (timing === "prepay") {
        try {
          onPlaced(await api.post<Order>(`/api/orders/${order.id}/pay`, { gateway, phone: mpesaPhone || phone }));
          return;
        } catch {
          // fall through: order exists and can be paid from the tracking screen
        }
      }
      onPlaced(order);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not place the order.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
        <button onClick={() => (step === 0 ? onClose() : setStep(step - 1))} className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <p className="font-display text-sm font-semibold">Checkout</p>
          <p className="text-xs text-muted-foreground">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
        </div>
        <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">Close</button>
      </header>

      <div className="flex gap-1.5 px-4 pt-3">
        {STEPS.map((label, index) => (
          <div key={label} className="flex flex-1 items-center gap-1.5">
            <div className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold", index < step ? "bg-amber-600 text-white" : index === step ? "bg-amber-700 text-white ring-2 ring-amber-200" : "bg-muted text-muted-foreground")}>
              {index < step ? <Check className="h-3 w-3" /> : index + 1}
            </div>
            <div className={cn("h-1 flex-1 rounded-full", index < step ? "bg-amber-600" : "bg-muted")} />
            <span className={cn("text-[11px] font-medium", index === step ? "text-amber-800" : "text-muted-foreground")}>{label}</span>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5">
        {step === 0 && (
          <div className="space-y-4">
            <SectionHeader title="Your details" subtitle="We'll use these for the delivery." Icon={User} />
            <Field
              label="Full name"
              icon={<User className="h-4 w-4" />}
              value={name}
              onChange={setName}
              placeholder="Jane Doe"
              autoComplete="name"
              error={errors.name}
              autoFocus
            />
            <Field
              label="Email"
              icon={<Mail className="h-4 w-4" />}
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="jane@example.com"
              autoComplete="email"
              error={errors.email}
            />
            <Field
              label="Phone"
              icon={<Phone className="h-4 w-4" />}
              type="tel"
              value={phone}
              onChange={setPhone}
              placeholder="0712 345 678"
              autoComplete="tel"
              error={errors.phone}
              helper="For delivery and payment updates."
            />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <SectionHeader title="Delivery address" subtitle="Search or drop a pin on the map." Icon={MapPin} />
            <AddressSearch onSelect={choosePlace} autoFocus />
            <div className="overflow-hidden squircle border border-border/60">
              <MapView className="h-64" pickup={pickup} dropoff={dropoff} route={route?.geometry} onPick={pickOnMap} />
            </div>
            {place && (
              <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/40 p-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div>
                  <p className="text-sm font-medium">{place.name}</p>
                  <p className="text-xs text-muted-foreground">{place.label}</p>
                </div>
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            {route && (
              <div className="overflow-hidden squircle border border-border/60">
                <MapView className="h-52" pickup={pickup} dropoff={dropoff} route={route.geometry} />
              </div>
            )}
            {route && (
              <div className="grid grid-cols-3 gap-2 text-center">
                <Metric label="Distance" value={formatDistance(route.distanceMeters)} />
                <Metric label="Trip time" value={formatDuration(route.durationSeconds)} />
                <Metric label="Delivery" value={quote ? formatMoney(quote.fee, store.currency) : "—"} />
              </div>
            )}

            <div>
              <p className="mb-2 text-sm font-semibold">When do you want to pay?</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <TimingCard active={timing === "prepay"} title="Pay now" subtitle="Courier dispatched after payment" Icon={Zap} onClick={() => setTiming("prepay")} />
                <TimingCard active={timing === "cod"} title="Pay on delivery" subtitle="Cash or M-PESA on arrival" Icon={Bike} onClick={() => setTiming("cod")} />
              </div>
            </div>

            {timing === "prepay" && (
              <div>
                <p className="mb-2 text-sm font-semibold">Payment method</p>
                <div className="space-y-2">
                  {methods.map((method) => (
                    <button key={method.key} onClick={() => setGateway(method.key)} className={cn("flex w-full items-center gap-3 rounded-xl border p-3 text-left transition", gateway === method.key ? "border-amber-600 bg-amber-50" : "hover:bg-muted")}>
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-muted">
                        {method.key === "mpesa" ? <Smartphone className="h-4.5 w-4.5" /> : <CreditCard className="h-4.5 w-4.5" />}
                      </span>
                      <span className="flex-1">
                        <span className="block text-sm font-medium">{method.label}</span>
                        <span className="block text-xs text-muted-foreground">{method.description}</span>
                      </span>
                      {gateway === method.key && <Check className="h-4 w-4 text-amber-700" />}
                      {method.requiresCredentials && !method.configured && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">placeholder</span>}
                    </button>
                  ))}
                </div>
                {methods.find((m) => m.key === gateway)?.requiresCredentials && (
                  <Field label="M-PESA phone" icon={<Phone className="h-4 w-4" />} type="tel" value={mpesaPhone} onChange={setMpesaPhone} placeholder="0712 345 678" className="mt-3" />
                )}
              </div>
            )}

            <div className="squircle border border-border/60 p-4">
              <p className="mb-3 text-sm font-semibold">Order summary</p>
              <ul className="space-y-2">
                {cart.map((item) => (
                  <li key={item.product.id} className="flex items-center gap-3">
                    <ProductImage seed={item.product.image} className="h-10 w-10 rounded-lg" />
                    <span className="flex-1 text-sm">{item.product.name} × {item.quantity}</span>
                    <span className="text-sm">{formatMoney(item.product.price * item.quantity, store.currency)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 space-y-1 border-t border-border/60 pt-3 text-sm">
                <Row label="Subtotal" value={formatMoney(subtotal, store.currency)} />
                <Row label="Delivery" value={quote ? formatMoney(quote.fee, store.currency) : "—"} />
                <div className="flex justify-between pt-1 text-base font-semibold">
                  <span>Total</span>
                  <span>{formatMoney(total, store.currency)}</span>
                </div>
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}
      </div>

      <footer className="border-t border-border/60 bg-background p-4">
        {step === 0 && (
          <button onClick={next} className="flex w-full items-center justify-center gap-1 rounded-xl bg-amber-700 py-3 font-semibold text-white transition hover:bg-amber-800 disabled:opacity-50">
            Continue <ChevronRight className="h-4 w-4" />
          </button>
        )}
        {step === 1 && (
          <button onClick={getQuote} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-700 py-3 font-semibold text-white transition hover:bg-amber-800 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {busy ? "Getting quote…" : "Get delivery quote"}
          </button>
        )}
        {step === 2 && (
          <button onClick={placeOrder} disabled={busy || !quote} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-700 py-3 font-semibold text-white transition hover:bg-amber-800 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Placing order…" : timing === "prepay" ? `Pay ${formatMoney(total, store.currency)} & place order` : "Place order · pay on delivery"}
          </button>
        )}
      </footer>
    </div>
  );
}

function SectionHeader({ title, subtitle, Icon }: { title: string; subtitle: string; Icon: typeof User }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-50 text-amber-700"><Icon className="h-4 w-4" /></span>
      <div>
        <h2 className="font-display text-base font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function Field({ label, icon, value, onChange, type = "text", placeholder, autoComplete, error, helper, autoFocus, className }: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  error?: string;
  helper?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <div className={cn("flex items-center gap-2.5 rounded-xl border bg-background px-3.5 py-3 transition focus-within:ring-2", error ? "border-red-400 focus-within:ring-red-300" : "border-border/70 focus-within:ring-amber-500/30")}>
        <span className={cn(error ? "text-red-500" : "text-muted-foreground")}>{icon}</span>
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>
      {error ? (
        <span className="mt-1.5 block text-xs text-red-600">{error}</span>
      ) : helper ? (
        <span className="mt-1.5 block text-xs text-muted-foreground">{helper}</span>
      ) : null}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="squircle border border-border/60 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

function TimingCard({ active, title, subtitle, Icon, onClick }: { active: boolean; title: string; subtitle: string; Icon: typeof Zap; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("flex items-center gap-3 rounded-xl border p-3 text-left transition", active ? "border-amber-600 bg-amber-50" : "hover:bg-muted")}>
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-muted text-amber-700"><Icon className="h-4.5 w-4.5" /></span>
      <span className="flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{subtitle}</span>
      </span>
      {active && <Check className="h-4 w-4 text-amber-700" />}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
