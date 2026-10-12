import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  type NodeChange,
  type NodeTypes,
  type OnEdgesChange,
  type OnNodesChange,
  type OnSelectionChangeFunc,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { type Graph, isEnvSource, type OperatorRegistry } from "@node-td/kernel";
import { toReactFlowElements } from "../graph-adapter";
import { GenNode, EnvNode } from "./gen-node";

const nodeTypes: NodeTypes = {
  gen: GenNode,
  env: EnvNode,
};

type FlowNode = ReturnType<typeof toReactFlowElements>["nodes"][number];
type FlowEdge = ReturnType<typeof toReactFlowElements>["edges"][number];

/**
 * The canvas is a read-only view of the Graph until graph editing exists.
 * It applies selection and moves, and the "dimensions" changes through
 * which React Flow keeps each node's measured size on the nodes it is
 * given, but never an add, remove or replace, which would leave the view
 * showing something other than the Graph that cooks.
 */
const VIEW_NODE_CHANGES = new Set<NodeChange["type"]>(["select", "position", "dimensions"]);

interface EditorCanvasProps {
  graph: Graph;
  registry: OperatorRegistry;
  onNodeSelect: (instanceKey: string | null) => void;
}

export function EditorCanvas({ graph, registry, onNodeSelect }: EditorCanvasProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => toReactFlowElements(graph, registry),
    [graph, registry],
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const onViewNodesChange: OnNodesChange<FlowNode> = useCallback(
    (changes) => onNodesChange(changes.filter((c) => VIEW_NODE_CHANGES.has(c.type))),
    [onNodesChange],
  );
  const onViewEdgesChange: OnEdgesChange<FlowEdge> = useCallback(
    (changes) => onEdgesChange(changes.filter((c) => c.type === "select")),
    [onEdgesChange],
  );

  const onSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selectedNodes }) => {
      if (selectedNodes.length === 1 && !isEnvSource(selectedNodes[0]!.id)) {
        onNodeSelect(selectedNodes[0]!.id);
      } else {
        onNodeSelect(null);
      }
    },
    [onNodeSelect],
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onViewNodesChange}
        onEdgesChange={onViewEdgesChange}
        onSelectionChange={onSelectionChange}
        deleteKeyCode={null}
        nodesConnectable={false}
        edgesReconnectable={false}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          style: { stroke: "var(--color-border)", strokeWidth: 1.5 },
          animated: true,
        }}
        className="!bg-transparent"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="oklch(0.329 0 0 / 0.5)"
        />
        <Controls
          showInteractive={false}
          className="!rounded-md !border !border-border !bg-card !shadow-xs [&>button]:!border-border/50 [&>button]:!bg-transparent [&>button]:!text-muted-foreground [&>button:hover]:!bg-card/60"
        />
      </ReactFlow>
    </div>
  );
}
