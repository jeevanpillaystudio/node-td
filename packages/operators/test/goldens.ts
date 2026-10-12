import { opGoldens } from "@node-td/testing";
import { createDefaultRegistry } from "../src/index";

export { type FixtureGraph, type NodeInstance, type OpFixture, w } from "@node-td/testing";

/** The op golden helper, bound to the default operators. */
export const { opGolden } = opGoldens(createDefaultRegistry);
