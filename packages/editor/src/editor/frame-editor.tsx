import { useCallback, useEffect, useState } from "react";
import { useFrameContext } from "../frame-provider";
import { Button } from "../ui/button";
import { EditorCanvas } from "./editor-canvas";
import { EditorInspector } from "./editor-inspector";
import { EditorPreview } from "./editor-preview";
import { EditorSidebar } from "./editor-sidebar";

interface FrameEditorProps {
  onClose: () => void;
}

export function FrameEditor({ onClose }: FrameEditorProps) {
  const { frames, editingId } = useFrameContext();
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const entry = editingId ? frames.get(editingId) : undefined;

  const onNodeSelect = useCallback((key: string | null) => {
    setSelectedNode(key);
  }, []);

  // Escape closes the editor
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!entry) return null;

  const graph = entry.graph;

  return (
    <div className="fixed inset-0 z-50 flex bg-background/95 backdrop-blur-sm">
      {/* Left sidebar — frame list */}
      <EditorSidebar editingId={editingId!} />

      {/* Center — React Flow canvas */}
      <div className="flex flex-1 flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-2">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-medium text-foreground">{entry.name}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {Object.keys(graph.nodes).length} nodes
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="font-mono text-xs">
            Close
          </Button>
        </div>

        {/* Canvas area */}
        <div className="relative flex-1">
          <EditorCanvas
            key={graph.id}
            graph={graph}
            registry={entry.registry}
            onNodeSelect={onNodeSelect}
          />

          {/* Floating inspector — top right */}
          {selectedNode && (
            <div className="absolute top-4 right-4">
              <EditorInspector
                entry={entry}
                selectedNode={selectedNode}
                onClose={() => setSelectedNode(null)}
              />
            </div>
          )}

          {/* Output preview — bottom right */}
          <div className="absolute right-4 bottom-4 h-40 w-64 overflow-hidden rounded-md shadow-lg">
            <EditorPreview
              key={graph.id}
              graph={graph}
              registry={entry.registry}
              seed={entry.seed}
              values={entry.values}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
