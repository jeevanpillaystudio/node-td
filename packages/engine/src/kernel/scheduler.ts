import type { CookEngine } from "./cook";
import type { GraphEnv } from "./types";

// ─── Cook Scheduler ──────────────────────────────────────────────
//
// Global scheduler for multi-instance cook management.
// Distributes a per-frame time budget across registered engines
// based on priority (visible+focused > visible > off-screen).
//
// Mirrors TouchDesigner's cook loop:
//  - Only visible networks cook
//  - Focused network gets priority
//  - Frame budget prevents jank
//
// Usage:
//   const scheduler = new CookScheduler();
//   const id = scheduler.register(engine, envFn);
//   scheduler.setPriority(id, 0);     // focused
//   scheduler.setVisible(id, true);   // in viewport
//   scheduler.tick(12);               // 12ms budget per frame
//   scheduler.unregister(id);

export interface CookEntry {
  id: number;
  engine: CookEngine;
  /** Returns the current GraphEnv for this engine */
  getEnv: () => GraphEnv;
  /** 0 = focused (highest), 1 = visible, Infinity = off-screen */
  priority: number;
  visible: boolean;
  /** Callback when cook completes */
  onComplete?: () => void;
}

let _nextId = 0;

export class CookScheduler {
  private entries = new Map<number, CookEntry>();

  /** Register an engine. Returns an ID for future reference. */
  register(
    engine: CookEngine,
    getEnv: () => GraphEnv,
    onComplete?: () => void,
  ): number {
    const id = _nextId++;
    this.entries.set(id, {
      id,
      engine,
      getEnv,
      priority: 1,
      visible: false,
      onComplete,
    });
    return id;
  }

  /** Remove an engine from the scheduler. */
  unregister(id: number): void {
    this.entries.delete(id);
  }

  /** Set the priority for an engine (0 = focused, 1 = visible, Infinity = off-screen). */
  setPriority(id: number, priority: number): void {
    const entry = this.entries.get(id);
    if (entry) entry.priority = priority;
  }

  /** Set whether an engine is visible in the viewport. */
  setVisible(id: number, visible: boolean): void {
    const entry = this.entries.get(id);
    if (entry) entry.visible = visible;
  }

  /**
   * Run one scheduler tick, distributing `budgetMs` across engines.
   *
   * Engines are sorted by priority. Each engine gets a fair share
   * of the remaining budget. Off-screen engines are skipped entirely.
   *
   * Call this once per requestAnimationFrame.
   */
  tick(budgetMs: number): void {
    // Collect cookable entries (visible + needs cook), sorted by priority
    const cookable: CookEntry[] = [];
    for (const entry of this.entries.values()) {
      if (!entry.visible) continue;
      if (!entry.engine.needsCook) continue;
      cookable.push(entry);
    }

    if (cookable.length === 0) return;

    cookable.sort((a, b) => a.priority - b.priority);

    // Distribute budget: highest priority gets 60%, rest share 40%
    const primaryBudget = budgetMs * 0.6;
    const sharedBudget = budgetMs * 0.4;
    const othersCount = Math.max(1, cookable.length - 1);

    for (let i = 0; i < cookable.length; i++) {
      const entry = cookable[i]!;
      const slice = i === 0 ? primaryBudget : sharedBudget / othersCount;
      const env = entry.getEnv();

      const result = entry.engine.cookIncremental(env, slice);
      if (result.done && entry.onComplete) {
        entry.onComplete();
      }
    }
  }
}
