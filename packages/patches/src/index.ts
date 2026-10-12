import type { Graph } from "@node-td/kernel";
import { flowFieldGraph } from "./flow-field";
import { meridianGraph } from "./meridian";
import { simplexFieldGraph } from "./simplex-field";
import { subscapesTerrain3dGraph } from "./subscapes-terrain-3d";
import { terrainHeightmapGraph } from "./terrain-heightmap";

export {
  flowFieldGraph,
  meridianGraph,
  simplexFieldGraph,
  subscapesTerrain3dGraph,
  terrainHeightmapGraph,
};

/** An artwork recreates a finished piece; a study exercises a few operators on their own. */
export type PatchKind = "artwork" | "study";

/** One gallery patch: its graph, with the graph's id and name. */
export interface PatchEntry {
  readonly id: string;
  readonly name: string;
  readonly kind: PatchKind;
  readonly graph: Graph;
}

function entry(graph: Graph, kind: PatchKind): PatchEntry {
  return { id: graph.id, name: graph.name, kind, graph };
}

/** Every gallery patch, in gallery order. */
export const patches: readonly PatchEntry[] = [
  entry(subscapesTerrain3dGraph, "artwork"),
  entry(terrainHeightmapGraph, "study"),
  entry(meridianGraph, "artwork"),
  entry(simplexFieldGraph, "study"),
  entry(flowFieldGraph, "study"),
];
