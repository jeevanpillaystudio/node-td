/** Parameter definition for a tunable value on a node */
export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

/** Port definition — describes an input or output slot */
export interface PortDef {
  name: string;
  type: string;
}

/**
 * A generative node type: pure function with typed I/O and tunable parameters.
 *
 * `family` groups nodes by their output data currency (e.g. "sampler", "field",
 * "geometry", "render"). Nodes in the same family produce the same type of
 * output and can be swapped in a graph without rewiring downstream consumers.
 */
export interface GenNode<TInputs = any, TOutput = any> {
  id: string;
  family: string;
  inputs: PortDef[];
  output: PortDef;
  params: ParamDef[];
  evaluate(inputs: TInputs, params: Record<string, number>): TOutput;
}

/** A placed node in a graph — references a type by id with optional param overrides */
export interface NodeInstance {
  type: string;
  params?: Record<string, number>;
}

/** Continuous 2D scalar function — the currency of the sampler family */
export type Sampler2D = (x: number, y: number) => number;

/** A flow-field grid: angles stored in a flat array */
export interface FlowGrid {
  data: Float32Array;
  cols: number;
  rows: number;
  resolution: number;
}

export type Point = [number, number];
export type Path = Point[];
