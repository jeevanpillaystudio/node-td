/** The four numbers of a SeededRNG's state. */
export type RngState = readonly [number, number, number, number];

/**
 * SeededRNG — deterministic pseudo-random number generator.
 *
 * Uses sfc32 (Small Fast Chaotic 32-bit) internally — the same
 * family used by fxhash and Art Blocks for on-chain generative art.
 * Fast, excellent statistical properties, 128-bit state.
 *
 * Seeding spreads a single integer across 4 state words via splitmix32,
 * then discards 12 outputs to escape initial correlation.
 *
 * In the graph, SeededRNG lives on GraphEnv.rng and is read by any
 * operator that needs randomness (SOP seed placement, dash patterns, etc.).
 */
export class SeededRNG {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number | string) {
    const s = typeof seed === "string" ? SeededRNG.hashString(seed) : seed;
    // Spread single seed across 4 state words
    this.a = splitmix32(s);
    this.b = splitmix32(this.a);
    this.c = splitmix32(this.b);
    this.d = splitmix32(this.c);
    // Warm up — discard first 12 outputs
    for (let i = 0; i < 12; i++) this.random();
  }

  /** Returns a float in [0, 1) — the core primitive. */
  random(): number {
    const t = ((this.a + this.b) >>> 0) + this.d;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = ((this.c << 21) | (this.c >>> 11)) + (t >>> 0);
    this.d = (this.d + 1) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** The generator's whole state: the stream continues from here. */
  getState(): RngState {
    return [this.a, this.b, this.c, this.d];
  }

  /** Continue the stream from a state getState returned. */
  setState(state: RngState): void {
    [this.a, this.b, this.c, this.d] = state;
  }

  /** FNV-1a hash: string → 32-bit unsigned integer. */
  static hashString(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }
}

/** splitmix32: spreads a single integer into a well-distributed 32-bit value. */
function splitmix32(seed: number): number {
  seed = (seed + 0x9e3779b9) | 0;
  seed = Math.imul(seed ^ (seed >>> 16), 0x85ebca6b);
  seed = Math.imul(seed ^ (seed >>> 13), 0xc2b2ae35);
  return (seed ^ (seed >>> 16)) >>> 0;
}
