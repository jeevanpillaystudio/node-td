import { describe, expect, test } from "bun:test";
import { type Graph, type Operator, OperatorRegistry } from "@node-td/kernel";
import { autoLayout, envPorts, handleId, toReactFlowElements } from "./graph-adapter";

function op(id: string, inputs: string[], outputs: string[]): Operator {
  return {
    id,
    category: "sop",
    label: id,
    inputs: inputs.map((name) => ({ name, type: "geometry" })),
    outputs: outputs.map((name) => ({ name, type: "geometry" })),
    params: [],
    evaluate: () => ({}),
  };
}

const registry = new OperatorRegistry()
  .register(op("source", ["width", "height"], ["geometry"]))
  .register(op("filter", ["geometry"], ["geometry"]))
  .register(op("merge", ["a", "b"], ["geometry"]));

/** $env → src → (left, right) → out, with its wires listed in topological order. */
const graph: Graph = {
  id: "test",
  name: "Test",
  nodes: {
    src: { type: "source" },
    left: { type: "filter" },
    right: { type: "filter" },
    out: { type: "merge" },
  },
  wires: [
    { from: "$env", output: "width", to: "src", input: "width" },
    { from: "$env", output: "height", to: "src", input: "height" },
    { from: "src", output: "geometry", to: "left", input: "geometry" },
    { from: "src", output: "geometry", to: "right", input: "geometry" },
    { from: "left", output: "geometry", to: "out", input: "a" },
    { from: "right", output: "geometry", to: "out", input: "b" },
  ],
};

/** The handle ids gen-node.tsx renders for a node: one per port it draws, named by handleId. */
function renderedHandles(node: ReturnType<typeof toReactFlowElements>["nodes"][number]) {
  if (node.type === "env") return node.data.outputs.map((p) => handleId(node.id, "out", p.name));
  const { instanceKey, nodeType } = node.data;
  return [
    ...nodeType.inputs.map((p) => handleId(instanceKey, "in", p.name)),
    ...nodeType.outputs.map((p) => handleId(instanceKey, "out", p.name)),
  ];
}

describe("envPorts", () => {
  test("lists each $env output once, with its declared type", () => {
    const twice: Graph = {
      ...graph,
      nodes: { ...graph.nodes, other: { type: "source" } },
      wires: [
        ...graph.wires,
        { from: "$env", output: "width", to: "other", input: "width" },
        { from: "$env", output: "height", to: "other", input: "height" },
      ],
    };
    expect(envPorts(twice)).toEqual([
      { name: "width", type: "number" },
      { name: "height", type: "number" },
    ]);
  });

  test("lists only the outputs the graph reads, in declaration order", () => {
    const flipped: Graph = {
      ...graph,
      wires: [
        { from: "$env", output: "height", to: "src", input: "height" },
        { from: "$env", output: "height", to: "src", input: "width" },
      ],
    };
    expect(envPorts(flipped)).toEqual([{ name: "height", type: "number" }]);
    expect(envPorts({ ...graph, wires: [...graph.wires].reverse() })).toEqual(envPorts(graph));
  });
});

describe("toReactFlowElements", () => {
  const { nodes, edges } = toReactFlowElements(graph, registry);

  test("adds an $env node for a graph that reads $env", () => {
    expect(nodes.map((n) => n.id)).toEqual(["$env", "src", "left", "right", "out"]);
    expect(nodes[0]).toMatchObject({ type: "env", data: { outputs: envPorts(graph) } });
  });

  test("adds no $env node for a graph that does not", () => {
    const local: Graph = { ...graph, wires: graph.wires.filter((w) => w.from !== "$env") };
    expect(toReactFlowElements(local, registry).nodes.map((n) => n.id)).toEqual([
      "src",
      "left",
      "right",
      "out",
    ]);
  });

  test("makes one edge per wire", () => {
    expect(edges).toHaveLength(graph.wires.length);
    expect(new Set(edges.map((e) => e.id)).size).toBe(edges.length);
  });

  test("every edge connects handles that its nodes render", () => {
    const handles = new Map(nodes.map((n) => [n.id, new Set(renderedHandles(n))]));
    for (const edge of edges) {
      expect(handles.get(edge.source)?.has(edge.sourceHandle)).toBe(true);
      expect(handles.get(edge.target)?.has(edge.targetHandle)).toBe(true);
    }
  });
});

describe("autoLayout", () => {
  const layout = autoLayout(graph);

  test("puts $env in the first column and each node one column right of its input", () => {
    expect(layout.$env?.x).toBe(0);
    expect(layout.src?.x).toBe(280);
    expect(layout.left?.x).toBe(560);
    expect(layout.right?.x).toBe(560);
    expect(layout.out?.x).toBe(840);
  });

  test("spreads a column's nodes 120 apart around the same centre as a lone node", () => {
    expect(layout.left?.y).toBe(180);
    expect(layout.right?.y).toBe(300);
    expect(layout.src?.y).toBe(240);
    expect(layout.out?.y).toBe(240);
  });

  test("puts a node right of its source when the wires are listed out of order", () => {
    const chain: Graph = {
      id: "chain",
      name: "Chain",
      nodes: { a: { type: "filter" }, b: { type: "filter" }, c: { type: "filter" } },
      wires: [
        { from: "b", output: "geometry", to: "c", input: "geometry" },
        { from: "a", output: "geometry", to: "b", input: "geometry" },
      ],
    };
    const x = autoLayout(chain);
    expect(x.a?.x).toBe(0);
    expect(x.b?.x).toBe(280);
    expect(x.c?.x).toBe(560);
  });

  test("starts at column 0 without $env", () => {
    const local: Graph = { ...graph, wires: graph.wires.filter((w) => w.from !== "$env") };
    const x = autoLayout(local);
    expect(x.$env).toBeUndefined();
    expect(x.src?.x).toBe(0);
    expect(x.out?.x).toBe(560);
  });
});
