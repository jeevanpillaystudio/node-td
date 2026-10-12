import { describe, expect, test } from "bun:test";
import {
  type Graph,
  GraphValidationError,
  type OperatorCategory,
  type PortType,
  validateGraph,
  type Wire,
} from "@node-td/kernel";
import { w } from "@node-td/testing";
import { allOperators, createDefaultRegistry } from "./index";

/** The family an operator belongs to by the type of its primary (first) output. */
const FAMILY: Record<PortType, OperatorCategory | undefined> = {
  field: "field",
  image: "top",
  grid: "top",
  geo2: "sop",
  geo3: "sop",
  palette: "chop",
  camera2d: "comp",
  camera3d: "comp",
  number: undefined,
};

describe("taxonomy", () => {
  test("every operator's category is the family of its primary output", () => {
    const mismatched: string[] = [];
    for (const op of allOperators) {
      const primary = op.outputs[0];
      const family = primary ? FAMILY[primary.type] : undefined;
      if (op.category !== family)
        mismatched.push(`${op.id}: ${op.category}, primary output ${primary?.type}`);
    }
    expect(mismatched).toEqual([]);
  });
});

// ─── Wrong wiring fails validation ───────────────────────────────

/** The type mismatches validateGraph reports for a graph, against the default operators. */
function typeMismatches(nodes: Graph["nodes"], wires: Wire[]): string[] {
  try {
    validateGraph({ id: "wiring", name: "Wiring", nodes, wires }, createDefaultRegistry());
  } catch (err) {
    if (!(err instanceof GraphValidationError)) throw err;
    return err.issues.filter((issue) => issue.includes("type mismatch"));
  }
  return [];
}

const size = (key: string) => [w("$env.width", `${key}.width`), w("$env.height", `${key}.height`)];

describe("wiring across families and dimensions", () => {
  test("2D geometry into a 3D operator", () => {
    const issues = typeMismatches(
      {
        seeds: { type: "circle-pack" },
        cam3d: { type: "camera-3d" },
        proj: { type: "project-3d" },
      },
      [
        ...size("seeds"),
        ...size("cam3d"),
        w("seeds.geometry", "proj.geometry"),
        w("cam3d.camera3d", "proj.camera3d"),
      ],
    );
    expect(issues).toEqual([
      'Wire: type mismatch — "seeds.geometry" (geo2) → "proj.geometry" (geo3)',
    ]);
  });

  test("3D geometry into a 2D renderer", () => {
    const issues = typeMismatches(
      {
        noise: { type: "simplex-noise" },
        mesh: { type: "parametric-surface" },
        lift: { type: "surface-lift" },
        camera: { type: "camera-2d" },
        render: { type: "stroke-renderer" },
      },
      [
        ...size("mesh"),
        ...size("camera"),
        w("mesh.geometry", "lift.geometry"),
        w("noise.field", "lift.field"),
        w("lift.geometry", "render.geometry"),
        w("camera.camera", "render.camera"),
      ],
    );
    expect(issues).toEqual([
      'Wire: type mismatch — "lift.geometry" (geo3) → "render.geometry" (geo2)',
    ]);
  });

  test("a rendered image into flow-tracer's angle grid", () => {
    const issues = typeMismatches(
      {
        seeds: { type: "circle-pack" },
        camera: { type: "camera-2d" },
        render: { type: "stroke-renderer" },
        trace: { type: "flow-tracer" },
      },
      [
        ...size("seeds"),
        ...size("camera"),
        ...size("trace"),
        w("seeds.geometry", "render.geometry"),
        w("camera.camera", "render.camera"),
        w("render.buffer", "trace.buffer"),
        w("seeds.geometry", "trace.geometry"),
      ],
    );
    expect(issues).toEqual([
      'Wire: type mismatch — "render.buffer" (image) → "trace.buffer" (grid)',
    ]);
  });
});
