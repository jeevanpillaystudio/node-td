import type { GenNode } from "./types";
import { perlinNoise } from "./nodes/perlin-noise";
import { simplexNoise } from "./nodes/simplex-noise";
import { gridSampler } from "./nodes/grid-sampler";
import { circlePackSeeds } from "./nodes/circle-pack-seeds";
import { poissonDiscSeeds } from "./nodes/poisson-disc-seeds";
import { flowTracer } from "./nodes/flow-tracer";
import { dashStroke } from "./nodes/dash-stroke";
import { continuousStroke } from "./nodes/continuous-stroke";
import { canvasRenderer } from "./nodes/canvas-renderer";

/** Catalog of available node types. Graphs reference types by id. */
export class NodeRegistry {
  private types = new Map<string, GenNode>();

  register(node: GenNode): this {
    if (this.types.has(node.id)) {
      throw new Error(`NodeRegistry: duplicate type "${node.id}"`);
    }
    this.types.set(node.id, node);
    return this;
  }

  get(id: string): GenNode | undefined {
    return this.types.get(id);
  }

  resolve(id: string): GenNode {
    const t = this.types.get(id);
    if (!t) throw new Error(`NodeRegistry: unknown type "${id}"`);
    return t;
  }

  has(id: string): boolean {
    return this.types.has(id);
  }

  list(): GenNode[] {
    return [...this.types.values()];
  }

  listByFamily(family: string): GenNode[] {
    return [...this.types.values()].filter((n) => n.family === family);
  }
}

/** All built-in node types, for composing custom registries. */
export const allNodes: GenNode[] = [
  perlinNoise,
  simplexNoise,
  gridSampler,
  circlePackSeeds,
  poissonDiscSeeds,
  flowTracer,
  dashStroke,
  continuousStroke,
  canvasRenderer,
];

/** Create a registry pre-loaded with all built-in node types. */
export function createDefaultRegistry(): NodeRegistry {
  const reg = new NodeRegistry();
  for (const node of allNodes) reg.register(node);
  return reg;
}
