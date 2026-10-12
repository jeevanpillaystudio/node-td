import { createDefaultRegistry } from "../src/index";
import { blitBuffer2D } from "../src/render/canvas-2d";
import { patchGoldens } from "@node-td/testing";

/** The patch golden helpers, bound to the default operators and the engine's blit. */
export const { renderGolden, nodesGolden } = patchGoldens({
  createRegistry: createDefaultRegistry,
  blit: blitBuffer2D,
});
