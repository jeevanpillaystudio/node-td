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

  // fork, which mixed the draw count into its child's seed, is gone: a
  // stream is now resumed from a recorded state instead.
  test("has no fork", () => {
    expect("fork" in SeededRNG.prototype).toBe(false);
  });

  test("setState resumes the stream from a getState", () => {
    const rng = new SeededRNG(42);
    draws(rng, 3);
    const state = rng.getState();
    const next = draws(rng, 5);
    draws(rng, 100);
    rng.setState(state);
    expect(draws(rng, 5)).toEqual(next);
  });

  test("a state is a pure function of the seed and the number of draws", () => {
    const a = new SeededRNG(42);
    const b = new SeededRNG(42);
    expect(a.getState()).toEqual(b.getState());
    draws(a, 7);
    expect(a.getState()).not.toEqual(b.getState());
    draws(b, 7);
    expect(a.getState()).toEqual(b.getState());
  });

  test("getState returns a copy, which later draws do not change", () => {
    const rng = new SeededRNG(42);
    const state = rng.getState();
    const copy = [...state];
    draws(rng, 3);
    expect([...state]).toEqual(copy);
  });

  test("setState copies the state, so the caller can reuse it", () => {
    const state = new SeededRNG(7).getState();
    const a = new SeededRNG(1);
    const b = new SeededRNG(2);
    a.setState(state);
    draws(a, 10);
    b.setState(state);
    expect(draws(b, 5)).toEqual(draws(new SeededRNG(7), 5));
  });
});
