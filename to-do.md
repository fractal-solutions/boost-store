# Boost Store — blind spots & to-do

A working list of gaps identified in the current implementation, grouped by area.
Priority: **P0** = do first / real risk, **P1** = important, **P2** = nice-to-have.
Effort: **S** = small, **M** = medium, **L** = large.

> Note: the "free-delivery announcement not enforced" item was intentionally left out.
> Status legend: `[x]` done · `[~]` partial (see **Done** / **Remaining**) · `[ ]` not started.

---

## Security & privacy (highest priority)

- [x] **1. OTP leaks on webhook failure** — `customers.ts` now uses a tri-state (`configured` + `delivered`); `demoCode` is only returned when the webhook is genuinely **unset**. `P0 · S`
- [x] **2. Public order enumeration** — `GET /api/orders` now requires the customer session; the `?email=` lookup was removed. (Single orders remain capability URLs by unguessable id.) `P0 · S`
- [x] **3. Public settings leak** — `/api/store` now returns `publicStoreSummary()`, limited to `paymentTiming`, `pickup`, `demoDropoff`, `tax`. `P1 · S`
- [x] **4. No rate limiting** — added `ratelimit.ts` (fixed-window per-IP) and applied it to register/login/OTP/forgot/reset on the auth + account routes. `P0 · M`
- [ ] **5. No CSRF tokens** on cookie-authenticated mutations. `SameSite=Lax` isn't enough; add tokens / require a custom header. `P1 · M`
- [ ] **6. Secrets at rest in plaintext** — stored in `stores.settings` JSON (SQLite); masking is read-time only. Encrypt or use a secrets store; lock down file permissions. `P1 · M`
- [ ] **7. Unsigned OTP webhook** — add an HMAC signature header (same pattern as the delivery webhook). `P1 · S`
- [ ] **8. Session hardening** — 30-day sessions, no rotation/revocation, no "sign out everywhere", no 2FA for admins. `P1 · M`
- [ ] **9. No admin audit log** — record who changed keys, deleted purchases, edited terms, etc. `P2 · M`
- [ ] **10. Missing security headers / HTTPS enforcement** — CSP, HSTS, frame-options, etc. `P2 · S`

## Money & compliance (Kenya)

- [~] **11. Tax / VAT** — *Partial.* `P0 · L`
  - **Done:** `money.ts` (`taxAmount`/`grandTotal`), `settings.tax { enabled, rate, inclusive }`, `orders.tax` column + migration, server-side tax in `createOrder`/`hydrateOrder`, tax lines in Checkout + TrackOrder, admin settings UI to configure it.
  - **Remaining:** KRA **eTIMS** fiscal invoice generation/submission; tax reporting & period summaries; per-product tax classes/exemptions; the delivery fee is currently untaxed (tax is on the product subtotal only); no fiscal-invoice document/PDF.
- [~] **12. Floats for money** — *Partial.* `P1 · M`
  - **Done:** `round2()` guards order line/subtotal/tax/total maths against drift.
  - **Remaining:** DB columns are still SQLite `REAL`; purchases, inventory cost/COGS, accounting and vendor payments still use raw JS floats; no integer minor-unit (cents) migration; no shared/typed money value object.
- [ ] **13. No refunds / returns / customer cancellation / invoices / receipts.** `P1 · L`
- [ ] **14. Vendor payouts are placeholders** — M-Pesa B2C/disbursement isn't implemented; "Pay vendor" only records. `P1 · M`
- [ ] **15. M-Pesa callback integrity** — endpoint accepts any body; validate source and add idempotency. `P1 · M`

## Data integrity & reliability

- [x] **16. Reserve race** — reservation now happens inside the order transaction with a conditional decrement (`WHERE stock >= qty`), so concurrent orders can't oversell. `P1 · S`
- [x] **17. Reserved stock has no TTL** — `orders.reservation_expires_at` is set on prepay orders; a 60s sweep (`releaseExpiredReservations`) releases expired unpaid reservations and cancels the order. `P1 · S`
- [ ] **18. Idempotency** — no client `idempotency_key` on order creation; duplicate webhooks can accumulate pings/movements. `P1 · M`
- [ ] **19. `products.stock` vs `inventory.quantity` drift** — many manual sync points; derive or add a reconciliation job. `P2 · M`
- [ ] **20. SQLite single-writer / single process** — no horizontal scaling; plan a path (Postgres) if needed. `P1 · M`
- [ ] **21. No migration framework** — ad-hoc `ALTER TABLE` list + one `user_version` backfill → drift risk. Adopt a real migration runner. `P2 · M`
- [ ] **22. No graceful shutdown / dependency health checks** — carrier, geocoder, webhooks. `P2 · S`

## Product & UX

- [~] **23. Customer order lifecycle** — *Partial.* `P2 · L`
  - **Done:** customer cancel via `POST /api/orders/:id/cancel` (ownership-checked, pre-dispatch only) which releases reserved stock and marks paid orders `refunded`; `refunded` payment label/tone; cancel button in TrackOrder; admin can still cancel through the order-status path.
  - **Remaining:** return/RMA flow and restocking on return; reorder; downloadable PDF invoice/receipt; real gateway refund execution (currently only the payment status flips to `refunded` — no money moves).
- [~] **24. No customer notifications** — *Partial.* `P1 · M`
  - **Done:** `settings.notifications.webhookUrl` (admin UI) receives a POST on every order status change with `{ event, store, order, customer }`; wired into `appendEvent`.
  - **Remaining:** failures are swallowed (fire-and-forget, 6s timeout) with no retry/queue or delivery log; no per-event opt-in; no message templates or customer notification preferences; no direct SMS/WhatsApp/email fallback beyond the n8n webhook.
- [ ] **25. Multi-merchant storefront is broken** — `publicStore` returns the *first* store, so a second merchant's storefront and customer signup target store #1. `P1 · M`
- [ ] **26. Catalog is thin** — no variants (size/colour), single image, static rating (no reviews), no SEO/sitemap, no pagination, no coupons/promotions. `P2 · L`
- [ ] **27. Search** is a client-side filter over fully-loaded products; no server search or pagination on catalogue/orders/CRM. `P2 · M`
- [ ] **28. Analytics are a snapshot** — no revenue/orders time-series, no CRM cohorts or segmented campaigns despite collecting gender/birthday. `P2 · M`
- [ ] **29. Accessibility & i18n** — English-only, no a11y pass. `P2 · M`

## Testing & operations

- [~] **30. Tests cover only pure helpers** — *Partial.* `P0 · M`
  - **Done:** `test/money.test.ts` (rounding, exclusive/inclusive VAT, disabled/zero-rate).
  - **Remaining:** orders (create/tax/reservation/cancel), inventory release + TTL sweep, payments/gateway callbacks, accounting, account/OTP + rate limiting, webhook delivery.
- [ ] **31. No CI, no typecheck gate** — `bun run build` doesn't typecheck; wire up `tsc --noEmit` / `bun test` in CI. `P1 · S`
- [ ] **32. Observability** is `console.log` only — add structured logs, metrics and alerts (webhook failures, low stock, failed payouts). `P1 · M`
- [ ] **33. No backups / monitoring** for the SQLite database. `P1 · M`

---

## Suggested order of attack

1. Security quick wins: **1, 2, 3, 4** — ✅ done.
2. Money correctness + compliance: **11, 12** — `[~]` partial (tax/VAT + rounding shipped; eTIMS & minor-units remain).
3. Inventory integrity: **16, 17** — ✅ done.
4. Tests for the money paths: **30** — `[~]` partial (money helpers tested; other modules remain).
5. Customer notifications + real cancel/refund path: **24, 23** — `[~]` partial (cancel + notification webhook shipped; returns/invoices and gateway refunds remain).
