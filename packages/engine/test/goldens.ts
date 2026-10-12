import { createDefaultRegistry } from "../src/index";
import { blitBuffer2D } from "../src/render/canvas-2d";
import { opGoldens, patchGoldens } from "./support";

export { type FixtureGraph, type NodeInstance, type OpFixture, w } from "./support";

/** The golden helpers, bound to the engine's operators and its blit. */
export const { opGolden } = opGoldens(createDefaultRegistry);
export const { renderGolden, nodesGolden } = patchGoldens({
  createRegistry: createDefaultRegistry,
  blit: blitBuffer2D,
});
