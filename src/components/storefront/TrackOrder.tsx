import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  BadgeCheck,
  Bike,
  CheckCircle2,
  ChefHat,
  CreditCard,
  Flag,
  Home,
  MessageCircle,
  Navigation,
  Package,
  Phone,
  Receipt,
  Route,
  Smartphone,
  Store,
  XCircle,
} from "lucide-react";
import { MapView } from "../map/MapView";
import { ProductImage } from "../ui/ProductImage";
import { api, type Coords, type DeliveryAddress, type Order } from "@/lib/api";
import { fetchRoute, formatDistance, formatDuration, type RouteResult } from "@/lib/mapConfig";
import { distanceToGeometry, pointAtFraction, projectFraction, sliceAtFraction, statusFraction } from "@/lib/route";
import { formatDateTime, formatMoney, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, statusTone, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

type PaymentMethod = { key: string; label: string; description: string; requiresCredentials: boolean; supportsPlaceholder: boolean; configured: boolean };

const LIFECYCLE = [
  { key: "pending", label: "Placed", Icon: Receipt },
  { key: "processing", label: "Preparing", Icon: ChefHat },
  { key: "dispatched", label: "Courier", Icon: Bike },
  { key: "in_transit", label: "On the way", Icon: Navigation },
  { key: "out_for_delivery", label: "Nearby", Icon: Flag },
  { key: "delivered", label: "Delivered", Icon: CheckCircle2 },
];

export function TrackOrder({ orderId, onBack, onShop }: { orderId: string; onBack?: () => void; onShop?: () => void }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [gateway, setGateway] = useState("mock");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setOrder(await api.get<Order>(`/api/orders/${orderId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load order.");
    }
  }, [orderId]);

  useEffect(() => {
    void load();
    void api.get<PaymentMethod[]>("/api/payment-methods").then(setMethods).catch(() => {});
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [load]);

  const pickup = order?.delivery.pickupCoords ?? null;
  const dropoff = order?.delivery.dropoffCoords ?? null;

  useEffect(() => {
    if (route || !pickup || !dropoff) return;
    void fetchRoute(pickup, dropoff).then(setRoute);
  }, [route, pickup, dropoff]);

  const routeGeom = route?.geometry ?? null;

  // Place the courier: use the provider's real location when it is near the
  // route, otherwise derive its position from the route + delivery status so
  // the map still animates realistically (the local mock reports a fixed,
  // out-of-area courier).
  const { courierPos, traveled, fraction } = useMemo(() => {
    const real = order?.delivery.courier ?? null;
    if (!order) return { courierPos: null as Coords | null, traveled: [] as [number, number][], fraction: 0 };
    if (!routeGeom) return { courierPos: real, traveled: [] as [number, number][], fraction: 0 };
    const nearRoute = real ? distanceToGeometry(real, routeGeom) < 3000 : false;
    const frac = nearRoute && real ? projectFraction(real, routeGeom) : statusFraction(order.status);
    const point = nearRoute && real ? { latitude: real.latitude, longitude: real.longitude } : (() => {
      const p = pointAtFraction(routeGeom, frac);
      return p ? { latitude: p[1], longitude: p[0] } : null;
    })();
    const done = order.status === "delivered" || order.status === "completed";
    const travelled = done ? routeGeom : sliceAtFraction(routeGeom, frac);
    return { courierPos: point, traveled: travelled, fraction: frac };
  }, [order, routeGeom]);

  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const confirmReceipt = () => action(() => api.post<Order>(`/api/orders/${order.id}/confirm`));

  if (!order) {
    return <div className="rounded-2xl border bg-background p-6 text-sm text-muted-foreground">Loading order…</div>;
  }

  const currentIndex = LIFECYCLE.findIndex((step) => step.key === order.status);
  const isCompleted = order.status === "completed";
  const isDelivered = order.status === "delivered";
  const needsPayment = order.paymentTiming === "prepay" && ["unpaid", "pending", "failed"].includes(order.paymentStatus);
  const canCancel = !isCompleted && !isDelivered && order.status !== "cancelled" && !["dispatched", "in_transit", "out_for_delivery"].includes(order.status);
  const cancelOrder = () => {
    if (!window.confirm("Cancel this order? Any payment will be refunded.")) return;
    void action(() => api.post<Order>(`/api/orders/${order.id}/cancel`));
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        {(onBack || onShop) && (
          <button onClick={onBack ?? onShop} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border/60 bg-background shadow-sm transition hover:bg-muted" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-base font-bold">Order details</h1>
          <p className="truncate text-xs text-muted-foreground">{order.id}</p>
        </div>
        <span className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-bold capitalize", statusTone(order.status))}>
          {ORDER_STATUS_LABELS[order.status] ?? order.status}
        </span>
      </header>

      {/* Success banner */}
      {isCompleted && (
        <div className="squircle border border-green-200 bg-green-50 p-6 text-center">
          <BadgeCheck className="mx-auto h-12 w-12 text-green-600" />
          <h2 className="mt-2 text-xl font-bold">Order complete</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {order.paymentTiming === "cod" ? "Paid on delivery" : `Paid via ${order.paymentGateway}`} · {formatMoney(order.total, order.currency)}
          </p>
          {order.confirmedAt && <p className="mt-1 text-xs text-muted-foreground">Confirmed {formatDateTime(order.confirmedAt)}</p>}
          <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
            {onShop && <button onClick={onShop} className="rounded-full bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-800">Continue shopping</button>}
            {onBack && <button onClick={onBack} className="rounded-full border border-border/70 bg-background px-5 py-2.5 text-sm font-semibold transition hover:bg-muted">View my orders</button>}
          </div>
        </div>
      )}

      {/* Live map */}
      <div className="relative overflow-hidden squircle border border-border/60 shadow-sm">
        <MapView
          className="h-64 sm:h-80"
          pickup={pickup}
          dropoff={dropoff}
          courier={courierPos}
          route={routeGeom}
          traveled={traveled}
          follow={order.status === "out_for_delivery" || order.status === "in_transit"}
        />
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <span className={cn("rounded-full px-3 py-1.5 text-xs font-bold capitalize shadow", isCompleted ? "bg-green-600 text-white" : "bg-white/95 text-foreground")}>
            {ORDER_STATUS_LABELS[order.status] ?? order.status}
          </span>
          <span className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold shadow">
            {isCompleted ? "Delivered" : isDelivered ? "Arrived — confirm receipt" : order.delivery.etaMinutes > 0 ? `${order.delivery.etaMinutes} min away` : "Calculating…"}
          </span>
        </div>
      </div>

      {/* Courier card */}
      <div className="flex items-center gap-3 squircle border border-border/60 bg-card p-4 shadow-sm">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-700 text-white"><Bike className="h-6 w-6" /></div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{order.delivery.courier ? order.delivery.courier.name || "Your courier" : "Assigning a courier…"}</p>
          <p className="text-xs text-muted-foreground">{order.delivery.courier ? `Updated ${formatDateTime(order.delivery.courier.updatedAt)}` : "Waiting for a courier to accept"}</p>
        </div>
        <a href={order.delivery.courier?.phone ? `tel:${order.delivery.courier.phone}` : undefined} className="grid h-10 w-10 place-items-center rounded-full bg-muted transition hover:bg-muted/70" aria-label="Call"><Phone className="h-4.5 w-4.5" /></a>
        <button className="grid h-10 w-10 place-items-center rounded-full bg-muted transition hover:bg-muted/70" aria-label="Message"><MessageCircle className="h-4.5 w-4.5" /></button>
      </div>

      {/* Route: pickup + drop-off */}
      <div className="min-w-0 squircle border border-border/60 bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Route className="h-4 w-4 text-amber-700" />
          <p className="font-display text-sm font-semibold">Pickup & drop-off</p>
          {route && (
            <span className="ml-auto text-xs font-medium text-muted-foreground">
              {formatDistance(route.distanceMeters)} · {formatDuration(route.durationSeconds)}
            </span>
          )}
        </div>
        <div className="relative space-y-6">
          <span className="absolute left-[13px] top-8 bottom-8 w-px border-l border-dashed border-border" aria-hidden />
          <RouteStop tone="slate" Icon={Store} label="Pickup" title="Boost Store" address={order.delivery.pickup} />
          <RouteStop tone="amber" Icon={Home} label="Drop-off" title={order.customer?.name || "Customer"} address={order.delivery.dropoff} />
        </div>
      </div>

      {/* Progress */}
      <div className="squircle border border-border/60 bg-card p-4 shadow-sm">
        <div className="flex items-start">
          {LIFECYCLE.map(({ key, label, Icon }, index) => {
            const done = isCompleted || currentIndex >= index;
            const active = !isCompleted && currentIndex === index;
            return (
              <div key={key} className="flex flex-1 flex-col items-center">
                <div className={cn("grid h-9 w-9 place-items-center rounded-full transition", done ? "bg-amber-700 text-white" : "bg-muted text-muted-foreground", active && "ring-4 ring-amber-200")}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className={cn("mt-1.5 text-center text-[10px] leading-tight", done ? "font-semibold text-amber-800" : "text-muted-foreground")}>{label}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-amber-600 transition-all" style={{ width: `${order.delivery.progressPercent}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>{route ? `${formatDistance(route.distanceMeters * (1 - fraction))} left` : "—"}</span>
          <span>{route ? formatDistance(route.distanceMeters) : "—"} total</span>
          <span>{isCompleted ? "Complete" : order.delivery.etaMinutes > 0 ? `ETA ${order.delivery.etaMinutes} min` : "Arriving"}</span>
        </div>
      </div>

      {/* Confirm receipt */}
      {isDelivered && !isCompleted && (
        <div className="squircle border border-green-300 bg-green-50 p-5 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-green-600" />
          <p className="mt-2 font-semibold">Your order has been delivered</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{order.paymentTiming === "cod" ? "Confirm receipt and settle your payment on delivery." : "Confirm that everything arrived as expected."}</p>
          <button onClick={confirmReceipt} disabled={busy} className="mt-4 w-full rounded-full bg-green-600 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50 sm:w-auto sm:px-8">
            {order.paymentTiming === "cod" ? "Confirm receipt · pay on delivery" : "Confirm order received"}
          </button>
        </div>
      )}

      {/* Payment */}
      {needsPayment && (
        <div className="squircle border border-amber-300 bg-amber-50 p-4">
          <p className="font-semibold">Complete payment to dispatch your delivery</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{order.paymentStatus === "pending" ? "Waiting for M-PESA confirmation." : "Choose how you'd like to pay."}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {methods.map((method) => (
              <button key={method.key} onClick={() => setGateway(method.key)} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm", gateway === method.key ? "border-amber-600 bg-white" : "hover:bg-white/60")}>
                {method.key === "mpesa" ? <Smartphone className="h-3.5 w-3.5" /> : <CreditCard className="h-3.5 w-3.5" />}
                {method.label}
              </button>
            ))}
          </div>
          {methods.find((m) => m.key === gateway)?.requiresCredentials && (
            <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="M-PESA phone, e.g. 0712 345 678" className="mt-2 w-full rounded-xl border px-3 py-2.5 text-sm" />
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => action(() => api.post(`/api/orders/${order.id}/pay`, { gateway, phone }))} disabled={busy} className="rounded-full bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Pay {formatMoney(order.total, order.currency)}
            </button>
            {order.paymentStatus === "pending" && (
              <button onClick={() => action(() => api.post(`/api/orders/${order.id}/simulate-callback`))} disabled={busy} className="rounded-full border bg-white px-4 py-2 text-sm disabled:opacity-50">
                Simulate M-PESA confirmation
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 squircle border border-border/60 bg-card p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold">Order details</p>
          <div className="space-y-2 text-sm">
            <Line label="Order" value={order.id} mono />
            <Line label="Payment" value={PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus} />
            <Line label="Subtotal" value={formatMoney(order.subtotal, order.currency)} />
            {order.tax > 0 && <Line label="Tax / VAT" value={formatMoney(order.tax, order.currency)} />}
            <Line label="Delivery" value={formatMoney(order.deliveryFee, order.currency)} />
            <div className="flex justify-between border-t border-border/60 pt-2 font-semibold">
              <span>Total</span>
              <span>{formatMoney(order.total, order.currency)}</span>
            </div>
          </div>
        </div>

        <div className="min-w-0 squircle border border-border/60 bg-card p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold">Items</p>
          <ul className="space-y-3">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3">
                <ProductImage seed={item.image} className="h-10 w-10 shrink-0 rounded-xl" />
                <span className="min-w-0 flex-1 truncate text-sm">{item.name} × {item.quantity}</span>
                <span className="shrink-0 text-sm">{formatMoney(item.lineTotal, order.currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="min-w-0 squircle border border-border/60 bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-amber-700" />
          <p className="font-display text-sm font-semibold">Delivery timeline</p>
        </div>
        <OrderTimeline events={order.events} />
      </div>

      {/* Cancel order */}
      {canCancel && (
        <div className="flex flex-wrap items-center justify-between gap-3 squircle border border-border/60 bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Changed your mind? You can cancel before the courier is dispatched.</p>
          <button onClick={cancelOrder} disabled={busy} className="rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50">
            Cancel order
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

const STATUS_ICON: Record<string, typeof Receipt> = {
  pending: Receipt,
  processing: ChefHat,
  ready: Package,
  dispatched: Bike,
  in_transit: Navigation,
  out_for_delivery: Flag,
  delivered: CheckCircle2,
  completed: BadgeCheck,
  cancelled: XCircle,
};

function OrderTimeline({ events }: { events: Order["events"] }) {
  // One node per milestone, in the order it was reached.
  const seen = new Set<string>();
  const nodes = events.filter((event) => (seen.has(event.status) ? false : (seen.add(event.status), true)));
  const lastIndex = nodes.length - 1;

  if (nodes.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <ol className="relative">
      {nodes.map((event, index) => {
        const Icon = STATUS_ICON[event.status] ?? Activity;
        const isLast = index === lastIndex;
        const isCancelled = event.status === "cancelled";
        const isTerminal = isCancelled || event.status === "delivered" || event.status === "completed";
        return (
          <li key={event.id} className="relative flex gap-4 pb-6 last:pb-0">
            {!isLast && <span className="absolute left-4 top-9 bottom-0 w-px bg-border" aria-hidden />}
            <span
              className={cn(
                "relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full text-white shadow-sm",
                isCancelled ? "bg-red-500" : isTerminal ? "bg-green-600" : "bg-amber-700",
                isLast && !isTerminal && "ring-4 ring-amber-200",
              )}
            >
              <Icon className="h-4 w-4" />
              {isLast && !isTerminal && <span className="absolute inset-0 animate-ping rounded-full bg-amber-500 opacity-30" aria-hidden />}
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className={cn("text-sm", isLast ? "font-semibold" : "font-medium text-foreground/85")}>{event.message}</p>
                <span className="shrink-0 text-[11px] text-muted-foreground" title={formatDateTime(event.createdAt)}>{timeAgo(event.createdAt)}</span>
              </div>
              <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{ORDER_STATUS_LABELS[event.status] ?? event.status}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Line({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 truncate text-right", mono && "font-mono text-xs")}>{value}</span>
    </div>
  );
}

function RouteStop({ Icon, tone, label, title, address }: { Icon: typeof Store; tone: "slate" | "amber"; label: string; title: string; address: DeliveryAddress }) {
  const lines = [address.street_address.filter(Boolean).join(", "), address.city, address.country].filter(Boolean);
  return (
    <div className="relative flex gap-3.5">
      <span className={cn("relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-white shadow-sm", tone === "amber" ? "bg-amber-700" : "bg-slate-500")}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{lines.join(" · ") || "—"}</p>
      </div>
    </div>
  );
}
