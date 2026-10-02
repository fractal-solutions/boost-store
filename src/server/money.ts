/** Round a money amount to 2 decimals (guards against float drift). */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type TaxConfig = { enabled: boolean; rate: number; inclusive: boolean };

/**
 * Sales tax / VAT:
 * - exclusive: tax is added on top of the (net) subtotal.
 * - inclusive: the subtotal already contains tax; the amount is the tax portion.
 */
export function taxAmount(subtotal: number, tax: TaxConfig | undefined): number {
  if (!tax?.enabled || !(tax.rate > 0) || subtotal <= 0) return 0;
  if (tax.inclusive) return round2(subtotal * (tax.rate / (100 + tax.rate)));
  return round2(subtotal * (tax.rate / 100));
}

/** Grand total given a net subtotal, tax config and delivery fee. */
export function grandTotal(subtotal: number, tax: TaxConfig | undefined, deliveryFee: number): number {
  const t = taxAmount(subtotal, tax);
  return round2(subtotal + (tax?.inclusive ? 0 : t) + deliveryFee);
}
