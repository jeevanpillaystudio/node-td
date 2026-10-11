import { describe, expect, test } from "bun:test";
import { SeededRNG } from "./rng";

function draws(rng: SeededRNG, n: number): number[] {
  return Array.from({ length: n }, () => rng.random());
}

describe("SeededRNG", () => {
  // Golden values taken from the current sfc32 implementation. Every
  // seeded artwork depends on them, so a change here changes every patch.
  test("SeededRNG(42) draws these first five values", () => {
    expect(draws(new SeededRNG(42), 5)).toEqual([
      0.4318885391112417, 0.4581744223833084, 0.20653736079111695, 0.7228580883238465,
      0.294395147357136,
    ]);
  });

  test("SeededRNG('abc') draws these first five values", () => {
    expect(draws(new SeededRNG("abc"), 5)).toEqual([
      0.9323754522483796, 0.9664754935074598, 0.33332817046903074, 0.8070604719687253,
      0.4650839555542916,
    ]);
  });

  test("a string seed is its FNV-1a hash", () => {
    expect(SeededRNG.hashString("")).toBe(0x811c9dc5);
    expect(SeededRNG.hashString("a")).toBe(0xe40c292c);
    expect(SeededRNG.hashString("abc")).toBe(440920331);
    expect(draws(new SeededRNG("abc"), 5)).toEqual(draws(new SeededRNG(440920331), 5));
  });

  test("the same seed gives the same stream; different seeds differ", () => {
    expect(draws(new SeededRNG(7), 100)).toEqual(draws(new SeededRNG(7), 100));
    expect(draws(new SeededRNG(7), 5)).not.toEqual(draws(new SeededRNG(8), 5));
  });

  test("draws lie in [0, 1)", () => {
    const values = draws(new SeededRNG(123), 10_000);
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  test.failing("fork is a pure function of (seed, tag)", () => {
    const fresh = new SeededRNG(42);
    const used = new SeededRNG(42);
    used.random();
    expect(used.fork("x").random()).toBe(fresh.fork("x").random());
  });
});
