import type { EnvKey, PortType } from "./types";

// ─── The environment source ──────────────────────────────────────

/**
 * The reserved source key wires use to read the environment the host
 * cooks with: `{ from: ENV_SOURCE, output: "width", to, input }`.
 * It is not a node: no node key may start with "$", and no wire may
 * target it.
 */
export const ENV_SOURCE = "$env";

/**
 * The outputs the environment source declares, with their port types.
 * Each is an env value (EnvValues), so the engine diffs it in setEnv.
 */
export const ENV_OUTPUTS = {
  width: "number",
  height: "number",
} as const satisfies Partial<Record<EnvKey, PortType>>;

export type EnvOutput = keyof typeof ENV_OUTPUTS;

/** True when a wire's source is the environment rather than a node. */
export function isEnvSource(key: string): boolean {
  return key === ENV_SOURCE;
}

/** The port type of an environment output, or undefined if it declares no such output. */
export function envOutputType(output: string): PortType | undefined {
  return Object.hasOwn(ENV_OUTPUTS, output) ? ENV_OUTPUTS[output as EnvOutput] : undefined;
}
