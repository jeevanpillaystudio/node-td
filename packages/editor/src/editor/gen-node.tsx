import { ENV_SOURCE, type OperatorCategory, type PortDef } from "@node-td/kernel";
import { Handle, Position } from "@xyflow/react";
import { memo, type ReactNode } from "react";
import { type EnvNodeData, type GenNodeData, handleId } from "../graph-adapter";

/** Family colours, after TouchDesigner's; FIELD has no TD family, so it takes teal. */
const CATEGORY_DOT: Record<OperatorCategory, string> = {
  field: "bg-teal-400",
  top: "bg-purple-400",
  sop: "bg-blue-400",
  chop: "bg-green-400",
  mat: "bg-yellow-400",
  comp: "bg-zinc-400",
};

function InputPorts({ nodeKey, ports }: { nodeKey: string; ports: PortDef[] }) {
  return ports.map((port) => (
    <div key={port.name} className="relative flex items-center">
      <Handle
        type="target"
        position={Position.Left}
        id={handleId(nodeKey, "in", port.name)}
        className="!-left-[7px] !h-2.5 !w-2.5 !rounded-sm !border-border !bg-muted"
      />
      <span className="pl-1 font-mono text-xs text-muted-foreground">{port.name}</span>
    </div>
  ));
}

function OutputPorts({ nodeKey, ports }: { nodeKey: string; ports: PortDef[] }) {
  return ports.map((port) => (
    <div key={port.name} className="relative flex items-center">
      <span className="pr-1 font-mono text-xs text-muted-foreground">{port.name}</span>
      <Handle
        type="source"
        position={Position.Right}
        id={handleId(nodeKey, "out", port.name)}
        className="!-right-[7px] !h-2.5 !w-2.5 !rounded-sm !border-border !bg-muted"
      />
    </div>
  ));
}

function NodeCard({
  title,
  subtitle,
  dotColor,
  selected,
  inputs,
  outputs,
  footer,
}: {
  title: string;
  subtitle: string;
  dotColor: string;
  selected?: boolean;
  inputs: ReactNode;
  outputs: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      className={`min-w-[160px] rounded-md border border-border/50 bg-card/80 backdrop-blur-md ${
        selected ? "ring-1 ring-ring" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
        <div className={`h-2 w-2 rounded-full ${dotColor}`} />
        <span className="font-mono text-xs font-medium text-foreground">{title}</span>
        <span className="font-mono text-xs text-muted-foreground">{subtitle}</span>
      </div>

      {/* Ports */}
      <div className="flex justify-between gap-4 px-3 py-2">
        <div className="flex flex-col gap-1">{inputs}</div>
        <div className="flex flex-col items-end gap-1">{outputs}</div>
      </div>

      {footer}
    </div>
  );
}

function GenNodeComponent({ data, selected }: { data: GenNodeData; selected?: boolean }) {
  const { nodeType, instanceKey } = data;
  const paramCount = nodeType.params.length;

  return (
    <NodeCard
      title={instanceKey}
      subtitle={nodeType.id}
      dotColor={CATEGORY_DOT[nodeType.category]}
      selected={selected}
      inputs={<InputPorts nodeKey={instanceKey} ports={nodeType.inputs} />}
      outputs={<OutputPorts nodeKey={instanceKey} ports={nodeType.outputs} />}
      footer={
        paramCount > 0 && (
          <div className="border-t border-border/50 px-3 py-1.5">
            <span className="font-mono text-xs text-muted-foreground">
              {paramCount} param{paramCount > 1 ? "s" : ""}
            </span>
          </div>
        )
      }
    />
  );
}

/** The environment source: no inputs, one output per environment value the graph reads. */
function EnvNodeComponent({ data, selected }: { data: EnvNodeData; selected?: boolean }) {
  return (
    <NodeCard
      title={ENV_SOURCE}
      subtitle="environment"
      dotColor="bg-muted-foreground"
      selected={selected}
      inputs={null}
      outputs={<OutputPorts nodeKey={ENV_SOURCE} ports={data.outputs} />}
    />
  );
}

export const GenNode = memo(GenNodeComponent);
export const EnvNode = memo(EnvNodeComponent);
