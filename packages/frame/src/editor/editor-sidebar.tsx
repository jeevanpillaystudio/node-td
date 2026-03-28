"use client";

import { useFrameContext, type FrameEntry } from "../frame-provider";

interface EditorSidebarProps {
  editingId: string;
}

export function EditorSidebar({ editingId }: EditorSidebarProps) {
  const { frames, setEditing } = useFrameContext();
  const entries = [...frames.values()];

  return (
    <div className="flex h-full w-56 flex-col border-r border-border/50 bg-card">
      <div className="border-b border-border/50 px-4 py-3">
        <span className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Frames
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {entries.map((entry: FrameEntry) => (
          <button
            key={entry.id}
            onClick={() => setEditing(entry.id)}
            className={`w-full rounded-md px-3 py-2 text-left transition-colors ${
              entry.id === editingId
                ? "bg-card/60 text-foreground"
                : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
            }`}
          >
            <span className="block font-mono text-xs">{entry.name}</span>
            <span className="block font-mono text-xs text-muted-foreground">
              {entry.composition.patches.length} patch{entry.composition.patches.length !== 1 ? "es" : ""}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
