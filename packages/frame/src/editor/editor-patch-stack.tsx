"use client";

import { Slider } from "@repo/ui/components/ui/slider";
import type { BlendMode } from "@repo/generative";
import type { FrameEntry } from "../frame-provider";

const BLEND_OPTIONS: { label: string; value: BlendMode }[] = [
  { label: "Over", value: "over" },
  { label: "Add", value: "add" },
  { label: "Multiply", value: "multiply" },
  { label: "Screen", value: "screen" },
];

interface EditorPatchStackProps {
  entry: FrameEntry;
}

export function EditorPatchStack({ entry }: EditorPatchStackProps) {
  const { composition, activePatchId } = entry;

  return (
    <div className="flex h-full w-48 flex-col border-r border-border/50 bg-card">
      <div className="border-b border-border/50 px-4 py-3">
        <span className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Patches
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {composition.patches.map((patch) => {
          const isActive = patch.id === activePatchId;
          return (
            <div key={patch.id} className="mb-1">
              {/* Patch row: visibility toggle + name */}
              <div
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${
                  isActive ? "bg-accent/10" : "hover:bg-accent/5"
                }`}
              >
                <button
                  onClick={() =>
                    entry.updatePatch(patch.id, { visible: !patch.visible })
                  }
                  className={`shrink-0 transition-opacity ${
                    patch.visible ? "opacity-100" : "opacity-30"
                  }`}
                  aria-label={patch.visible ? "Hide patch" : "Show patch"}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    className="text-muted-foreground"
                  >
                    <circle
                      cx="7"
                      cy="7"
                      r="4"
                      fill="currentColor"
                      opacity={patch.visible ? 1 : 0.3}
                    />
                  </svg>
                </button>
                <button
                  onClick={() => entry.setActivePatch(patch.id)}
                  className={`flex-1 truncate text-left font-mono text-xs ${
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {patch.name}
                </button>
              </div>

              {/* Expanded controls for active patch */}
              {isActive && (
                <div className="mt-1 space-y-2 rounded-md border border-border/30 bg-background/50 px-3 py-2">
                  {/* Blend mode */}
                  <div>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      Blend
                    </span>
                    <select
                      value={patch.blend}
                      onChange={(e) =>
                        entry.updatePatch(patch.id, {
                          blend: e.target.value as BlendMode,
                        })
                      }
                      className="mt-0.5 w-full rounded-sm border border-border/50 bg-background px-1.5 py-0.5 font-mono text-xs text-foreground"
                    >
                      {BLEND_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {/* Opacity */}
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        Opacity
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {Math.round(patch.opacity * 100)}%
                      </span>
                    </div>
                    <Slider
                      min={0}
                      max={1}
                      step={0.01}
                      value={[patch.opacity]}
                      onValueChange={([v]) =>
                        entry.updatePatch(patch.id, { opacity: v! })
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
