import { expect, test } from "bun:test";
import { mapUberStatus } from "../src/server/delivery";
import { isForwardTransition, slugify } from "../src/server/lib";
import { formatDistance, formatDuration } from "../src/lib/mapConfig";
import { normalizePhone } from "../src/server/mpesa";

test("maps Uber Direct statuses onto the order lifecycle", () => {
  expect(mapUberStatus("pending")).toBe("dispatched");
  expect(mapUberStatus("pickup")).toBe("in_transit");
  expect(mapUberStatus("pickup_complete")).toBe("in_transit");
  expect(mapUberStatus("dropoff")).toBe("out_for_delivery");
  expect(mapUberStatus("delivered")).toBe("delivered");
  expect(mapUberStatus("canceled")).toBe("cancelled");
  expect(mapUberStatus("something-else")).toBeNull();
});

test("normalizes Kenyan phone numbers for M-PESA", () => {
  expect(normalizePhone("0712345678")).toBe("254712345678");
  expect(normalizePhone("+254712345678")).toBe("254712345678");
  expect(normalizePhone("712345678")).toBe("254712345678");
  expect(() => normalizePhone("12345")).toThrow();
});

test("order status transitions are forward-only", () => {
  expect(isForwardTransition("pending", "dispatched")).toBe(true);
  expect(isForwardTransition("in_transit", "out_for_delivery")).toBe(true);
  expect(isForwardTransition("delivered", "pending")).toBe(false);
  expect(isForwardTransition("cancelled", "processing")).toBe(false);
});

test("slugify produces url-safe slugs", () => {
  expect(slugify("Aurora Table Lamp")).toBe("aurora-table-lamp");
  expect(slugify("  Café & Co.  ")).toBe("caf-co");
});

test("formats distances and durations for the delivery map", () => {
  expect(formatDistance(420)).toBe("420 m");
  expect(formatDistance(2351)).toBe("2.4 km");
  expect(formatDuration(330)).toBe("6 min");
  expect(formatDuration(7200)).toBe("2h 0m");
});
