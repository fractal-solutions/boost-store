export function formatMoney(amount: number, currency = "KES"): string {
  try {
    return new Intl.NumberFormat("en-KE", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return "—";
  const diff = Date.now() - new Date(value).getTime();
  const seconds = Math.max(0, Math.floor(diff / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  ready: "Ready",
  dispatched: "Dispatched",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: "Unpaid",
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
  cod_pending: "Pay on delivery",
};

export function statusTone(status: string): string {
  switch (status) {
    case "delivered":
    case "completed":
    case "paid":
      return "bg-green-500/15 text-green-700 dark:text-green-400";
    case "cancelled":
    case "failed":
      return "bg-red-500/15 text-red-600 dark:text-red-400";
    case "in_transit":
    case "out_for_delivery":
    case "dispatched":
      return "bg-sky-500/15 text-sky-600 dark:text-sky-400";
    case "pending":
    case "unpaid":
    case "cod_pending":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}
