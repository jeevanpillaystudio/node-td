"use client";

import { Slider } from "@repo/ui/components/ui/slider";
import { Label } from "@repo/ui/components/ui/label";
import { isEnumParam } from "@repo/generative";
import type { ParamDef } from "@repo/generative";

interface EditorInspectorProps {
  params: ParamDef[];
  values: Record<string, number>;
  setParam: (key: string, value: number) => void;
  selectedNode: string;
  onClose: () => void;
}

export function EditorInspector({ params, values, setParam, selectedNode, onClose }: EditorInspectorProps) {
  const nodeParams = params.filter((p) =>
    p.key.startsWith(`${selectedNode}.`),
  );

  return (
    <div className="w-60 rounded-md border border-border/50 bg-card/80 shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <span className="font-mono text-xs font-medium text-foreground">
          {selectedNode}
        </span>
        <button
          onClick={onClose}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="font-mono text-xs">&times;</span>
        </button>
      </div>

      <div className="p-3">
        {nodeParams.length === 0 ? (
          <span className="font-mono text-xs text-muted-foreground">
            No parameters
          </span>
        ) : (
          <div className="space-y-3">
            {nodeParams.map((p) => (
              <div key={p.key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="font-mono text-xs">
                    {p.label.split(" / ").pop()}
                  </Label>
                  <span className="font-mono text-xs text-muted-foreground">
                    {isEnumParam(p)
                      ? p.options.find((o) => o.value === values[p.key])?.label
                      : values[p.key]}
                  </span>
                </div>
                {isEnumParam(p) ? (
                  <select
                    value={values[p.key]}
                    onChange={(e) => setParam(p.key, Number(e.target.value))}
                    className="w-full rounded-md border border-border/50 bg-background px-2 py-1 font-mono text-xs text-foreground"
                  >
                    {p.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Slider
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    value={[values[p.key]!]}
                    onValueChange={([v]) => setParam(p.key, v!)}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
