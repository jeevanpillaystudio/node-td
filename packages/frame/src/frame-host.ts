import type { Graph, OperatorRegistry, ParamDef } from "@node-td/kernel";
import { createContext, type ReactNode } from "react";

/** What a mounted Frame tells its host: enough to list, inspect and re-cook it. */
export interface FrameEntry {
  id: string;
  name: string;
  graph: Graph;
  registry: OperatorRegistry;
  seed: number | string;
  params: ParamDef[];
  values: Record<string, number>;
  set: (key: string, value: number) => void;
}

/**
 * A host that Frames register with, such as the dev editor. Frame only calls
 * this interface and never imports the host; with no host mounted, a Frame
 * renders on its own.
 */
export interface FrameHost {
  register(entry: FrameEntry): void;
  unregister(id: string): void;
  /** UI the host draws over the Frame with this id, such as a selection outline. */
  renderOverlay?(id: string): ReactNode;
}

export const FrameHostContext = createContext<FrameHost | null>(null);
