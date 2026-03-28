"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { GenNodeData } from "@repo/generative/editor";

const CATEGORY_DOT: Record<string, string> = {
  top: "bg-cyan-400",
  sop: "bg-amber-400",
  mat: "bg-violet-400",
  chop: "bg-emerald-400",
  env: "bg-muted-foreground",
};

function GenNodeComponent({ data, selected }: { data: GenNodeData; selected?: boolean }) {
  const { nodeType, instanceKey, isEnv, envPorts } = data;
  const category = isEnv ? "env" : nodeType.category;
  const dotColor = CATEGORY_DOT[category] ?? "bg-muted-foreground";

  return (
    <div
      className={`min-w-[160px] rounded-md border border-border/50 bg-card/80 backdrop-blur-md ${
        selected ? "ring-1 ring-ring" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
        <div className={`h-2 w-2 rounded-full ${dotColor}`} />
        <span className="font-mono text-xs font-medium text-foreground">
          {instanceKey}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {isEnv ? "environment" : nodeType.id}
        </span>
      </div>

      {/* Ports */}
      <div className="flex justify-between gap-4 px-3 py-2">
        {/* Inputs */}
        <div className="flex flex-col gap-1">
          {isEnv
            ? null
            : nodeType.inputs.map((port) => (
                <div key={port.name} className="relative flex items-center">
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`${instanceKey}-in-${port.name}`}
                    className="!-left-[7px] !h-2.5 !w-2.5 !rounded-sm !border-border !bg-muted"
                  />
                  <span className="pl-1 font-mono text-xs text-muted-foreground">
                    {port.name}
                  </span>
                </div>
              ))}
        </div>

        {/* Output */}
        <div className="flex flex-col items-end gap-1">
          {isEnv && envPorts ? (
            envPorts.map((port) => (
              <div key={port.name} className="relative flex items-center">
                <span className="pr-1 font-mono text-xs text-muted-foreground">
                  {port.name}
                </span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`$env-out-${port.name}`}
                  className="!-right-[7px] !h-2.5 !w-2.5 !rounded-sm !border-border !bg-muted"
                />
              </div>
            ))
          ) : !isEnv ? (
            nodeType.outputs.map((port) => (
              <div key={port.name} className="relative flex items-center">
                <span className="pr-1 font-mono text-xs text-muted-foreground">
                  {port.name}
                </span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`${instanceKey}-out-${port.name}`}
                  className="!-right-[7px] !h-2.5 !w-2.5 !rounded-sm !border-border !bg-muted"
                />
              </div>
            ))
          ) : null}
        </div>
      </div>

      {/* Param count badge */}
      {!isEnv && nodeType.params.length > 0 && (
        <div className="border-t border-border/50 px-3 py-1.5">
          <span className="font-mono text-xs text-muted-foreground">
            {nodeType.params.length} param{nodeType.params.length > 1 ? "s" : ""}
          </span>
        </div>
      )}
    </div>
  );
}

export const GenNode = memo(GenNodeComponent);
export const EnvNode = memo(GenNodeComponent);
