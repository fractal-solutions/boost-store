import { expect, test } from "bun:test";
import { geometryLength, pointAtFraction, sliceAtFraction, statusFraction } from "../src/lib/route";

test("statusFraction advances through the delivery lifecycle", () => {
  expect(statusFraction("pending")).toBe(0);
  expect(statusFraction("dispatched")).toBeGreaterThan(0);
  expect(statusFraction("in_transit")).toBeGreaterThan(statusFraction("dispatched"));
  expect(statusFraction("out_for_delivery")).toBeGreaterThan(statusFraction("in_transit"));
  expect(statusFraction("delivered")).toBe(1);
  expect(statusFraction("completed")).toBe(1);
});

test("pointAtFraction walks the polyline proportionally", () => {
  const line: [number, number][] = [
    [0, 0],
    [1, 0],
    [2, 0],
  ];
  const mid = pointAtFraction(line, 0.5);
  expect(mid).not.toBeNull();
  expect(mid![0]).toBeCloseTo(1, 1);
});

test("sliceAtFraction returns the travelled portion from the start", () => {
  const line: [number, number][] = [
    [0, 0],
    [0, 1],
    [0, 2],
  ];
  const slice = sliceAtFraction(line, 0.5);
  expect(slice[0]).toEqual([0, 0]);
  expect(slice.length).toBeGreaterThanOrEqual(2);
  expect(geometryLength(slice)).toBeLessThan(geometryLength(line));
});
