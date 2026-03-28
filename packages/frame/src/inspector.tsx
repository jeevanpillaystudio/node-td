"use client";

import { useCallback, useState } from "react";
import { Slider } from "@repo/ui/components/ui/slider";
import { Label } from "@repo/ui/components/ui/label";
import { Button } from "@repo/ui/components/ui/button";
import { useFrameContext } from "./frame-provider";

export function Inspector() {
  const { frames, activeId, setActive } = useFrameContext();
  const [copied, setCopied] = useState(false);

  const entry = activeId ? frames.get(activeId) : undefined;

  const copyConfig = useCallback(async () => {
    if (!entry) return;
    const lines = entry.params.map((p) => `  ${p.key}: ${entry.values[p.key]},`);
    const text = `// ${entry.name} config\nconst CONFIG = {\n${lines.join("\n")}\n} as const;`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [entry]);

  if (!entry) return null;

  return (
    <div className="fixed right-4 bottom-4 z-50 w-72 rounded-lg border bg-popover p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-xs text-muted-foreground">{entry.name}</p>
        <button
          onClick={() => setActive(null)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          &times;
        </button>
      </div>

      <div className="space-y-4">
        {entry.params.map((p) => (
          <div key={p.key} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">{p.label}</Label>
              <span className="font-mono text-xs text-muted-foreground">
                {entry.values[p.key]}
              </span>
            </div>
            <Slider
              min={p.min}
              max={p.max}
              step={p.step}
              value={[entry.values[p.key]!]}
              onValueChange={([v]) => entry.set(p.key, v!)}
            />
          </div>
        ))}

        <Button
          variant="outline"
          size="sm"
          className="w-full font-mono text-xs"
          onClick={copyConfig}
        >
          {copied ? "Copied!" : "Copy Config"}
        </Button>
      </div>
    </div>
  );
}
