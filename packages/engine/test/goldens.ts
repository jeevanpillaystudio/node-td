import { createDefaultRegistry } from "../src/index";
import { blitBuffer2D } from "@node-td/render-web";
import { patchGoldens } from "@node-td/testing";

/** The patch golden helpers, bound to the default operators and render-web's blit. */
export const { renderGolden, nodesGolden } = patchGoldens({
  createRegistry: createDefaultRegistry,
  blit: blitBuffer2D,
});
