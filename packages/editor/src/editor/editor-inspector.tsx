import type { FrameEntry } from "@node-td/frame";
import { isEnumParam } from "@node-td/kernel";
import { Label } from "../ui/label";
import { Slider } from "../ui/slider";

interface EditorInspectorProps {
  entry: FrameEntry;
  selectedNode: string;
  onClose: () => void;
}

export function EditorInspector({ entry, selectedNode, onClose }: EditorInspectorProps) {
  const nodeParams = entry.params.filter((p) => p.key.startsWith(`${selectedNode}.`));

  return (
    <div className="w-60 rounded-md border border-border/50 bg-card/80 shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <span className="font-mono text-xs font-medium text-foreground">{selectedNode}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="font-mono text-xs">&times;</span>
        </button>
      </div>

      <div className="p-3">
        {nodeParams.length === 0 ? (
          <span className="font-mono text-xs text-muted-foreground">No parameters</span>
        ) : (
          <div className="space-y-3">
            {nodeParams.map((p) => (
              <div key={p.key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="font-mono text-xs">{p.label.split(" / ").pop()}</Label>
                  <span className="font-mono text-xs text-muted-foreground">
                    {isEnumParam(p)
                      ? p.options.find((o) => o.value === entry.values[p.key])?.label
                      : entry.values[p.key]}
                  </span>
                </div>
                {isEnumParam(p) ? (
                  <select
                    value={entry.values[p.key]}
                    onChange={(e) => entry.set(p.key, Number(e.target.value))}
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
                    value={[entry.values[p.key]!]}
                    onValueChange={([v]) => entry.set(p.key, v!)}
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
