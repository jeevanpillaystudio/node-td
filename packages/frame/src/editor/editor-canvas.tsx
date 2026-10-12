import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  type NodeTypes,
  type OnSelectionChangeFunc,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Graph } from "@node-td/kernel";
import { createDefaultRegistry } from "@node-td/operators";
import { toReactFlowElements } from "./graph-adapter";
import { GenNode, EnvNode } from "./gen-node";

const registry = createDefaultRegistry();

const nodeTypes: NodeTypes = {
  gen: GenNode,
  env: EnvNode,
};

interface EditorCanvasProps {
  graph: Graph;
  onNodeSelect: (instanceKey: string | null) => void;
}

export function EditorCanvas({ graph, onNodeSelect }: EditorCanvasProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => toReactFlowElements(graph, registry),
    [graph],
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const onSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selectedNodes }) => {
      if (selectedNodes.length === 1 && selectedNodes[0]!.id !== "$env") {
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
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          style: { stroke: "var(--border)", strokeWidth: 1.5 },
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
