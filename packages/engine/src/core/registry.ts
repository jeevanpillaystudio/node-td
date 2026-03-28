import type { Operator, OperatorCategory } from "./types";

export class OperatorRegistry {
  private map = new Map<string, Operator>();

  register(op: Operator): this {
    if (this.map.has(op.id)) {
      throw new Error(`Duplicate operator id: "${op.id}"`);
    }
    this.map.set(op.id, op);
    return this;
  }

  get(id: string): Operator | undefined {
    return this.map.get(id);
  }

  resolve(id: string): Operator {
    const op = this.map.get(id);
    if (!op) throw new Error(`Unknown operator type: "${id}"`);
    return op;
  }

  has(id: string): boolean {
    return this.map.has(id);
  }

  list(): Operator[] {
    return [...this.map.values()];
  }

  listByCategory(category: OperatorCategory): Operator[] {
    return this.list().filter((op) => op.category === category);
  }
}
