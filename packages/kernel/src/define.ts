import type {
  Buffer2D,
  Camera2D,
  Camera3D,
  Field2D,
  Geometry,
  NodeEnv,
  Operator,
  Palette,
  ParamDef,
  PortDef,
  PortType,
} from "./types";

// ─── Port values ─────────────────────────────────────────────────

/** The value a wire of each port type carries. */
export interface PortValues {
  field: Field2D;
  image: Buffer2D;
  grid: Buffer2D;
  geo2: Geometry<2>;
  geo3: Geometry<3>;
  palette: Palette;
  camera2d: Camera2D;
  camera3d: Camera3D;
  number: number;
}

/** The value a port of type T carries. Indexing by PortType keeps PortValues complete. */
export type PortValue<T extends PortType> = PortValues[T];

// ─── Typed evaluate arguments ────────────────────────────────────

/**
 * What evaluate receives on one input port. The cook hands a variadic
 * port an array of its wires' values in wire order, [] when none is
 * wired, and an optional port left unwired undefined.
 */
export type InputValue<P extends PortDef> = P extends { variadic: true }
  ? PortValue<P["type"]>[]
  : P extends { optional: true }
    ? PortValue<P["type"]> | undefined
    : PortValue<P["type"]>;

/** The inputs record evaluate receives, keyed by input port name. */
export type InputsOf<Ports extends readonly PortDef[]> = {
  [P in Ports[number] as P["name"]]: InputValue<P>;
};

/**
 * The outputs record evaluate returns, keyed by output port name.
 *
 * The conditional is always true. It makes the type one that TypeScript
 * instantiates while it still infers defineOperator's type parameters, so
 * evaluate's return value is contextually typed: `dim: 2` stays the
 * literal 2 instead of widening to number.
 */
export type OutputsOf<Ports extends readonly PortDef[]> = Ports extends readonly PortDef[]
  ? { [P in Ports[number] as P["name"]]: PortValue<P["type"]> }
  : never;

/**
 * The params record evaluate receives. The cook resolves every declared
 * key (default, then instance value, then external value), so none is
 * missing.
 */
export type ParamsOf<Defs extends readonly ParamDef[]> = {
  [K in Defs[number]["key"]]: number;
};

// ─── defineOperator ──────────────────────────────────────────────

/**
 * An operator whose evaluate is typed by its own declarations: its inputs
 * and outputs by its port defs, its params by its param keys. It is an
 * Operator, so allOperators and the registry take it as it is; that is
 * the boundary where these types are erased.
 */
export interface TypedOperator<I extends PortDef[], O extends PortDef[], P extends ParamDef[]>
  extends Pick<Operator, "id" | "category" | "label" | "envReads"> {
  inputs: I;
  outputs: O;
  params: P;
  evaluate(inputs: InputsOf<I>, params: ParamsOf<P>, env: NodeEnv): OutputsOf<O>;
}

/**
 * Define an operator with a typed evaluate. Declare the ports and params
 * inline: their names, types and keys are inferred as literals, so
 * evaluate's inputs, params and return value are checked against them.
 * Returns the operator it is given.
 */
export function defineOperator<
  const I extends PortDef[],
  const O extends PortDef[],
  const P extends ParamDef[],
>(op: TypedOperator<I, O, P>): TypedOperator<I, O, P> {
  return op;
}
