import { expect, test } from "bun:test";
import { grandTotal, round2, taxAmount } from "../src/server/money";

test("rounds money to 2 decimals without float drift", () => {
  expect(round2(0.1 + 0.2)).toBe(0.3);
  expect(round2(2.675)).toBe(2.68);
  expect(round2(10)).toBe(10);
  expect(round2(Number.NaN)).toBe(0);
});

test("computes exclusive sales tax on the net subtotal", () => {
  expect(taxAmount(100, { enabled: true, rate: 16, inclusive: false })).toBe(16);
  expect(taxAmount(250, { enabled: true, rate: 7.5, inclusive: false })).toBe(18.75);
});

test("computes the tax portion of tax-inclusive prices", () => {
  expect(taxAmount(116, { enabled: true, rate: 16, inclusive: true })).toBe(16);
  expect(taxAmount(100, { enabled: true, rate: 0, inclusive: true })).toBe(0);
});

test("no tax when disabled, zero-rate or empty subtotal", () => {
  expect(taxAmount(100, { enabled: false, rate: 16, inclusive: false })).toBe(0);
  expect(taxAmount(100, undefined)).toBe(0);
  expect(taxAmount(0, { enabled: true, rate: 16, inclusive: false })).toBe(0);
});

test("grand total adds tax on top for exclusive prices", () => {
  expect(grandTotal(100, { enabled: true, rate: 16, inclusive: false }, 5)).toBe(121);
});

test("grand total does not double-count tax for inclusive prices", () => {
  expect(grandTotal(116, { enabled: true, rate: 16, inclusive: true }, 5)).toBe(121);
});

test("grand total ignores tax when disabled", () => {
  expect(grandTotal(100, { enabled: false, rate: 16, inclusive: false }, 5)).toBe(105);
});
