import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Frame } from "@node-td/frame";
import { FrameShell } from "@node-td/frame/shell";
import {
  meridianGraph,
  terrainHeightmapGraph,
  subscapesTerrain3dGraph,
  simplexFieldGraph,
  flowFieldGraph,
} from "../patches";

const patches = [
  { name: "Subscapes Terrain 3D", graph: subscapesTerrain3dGraph },
  { name: "Terrain Heightmap", graph: terrainHeightmapGraph },
  { name: "Meridian", graph: meridianGraph },
  { name: "Simplex Field", graph: simplexFieldGraph },
  { name: "Flow Field", graph: flowFieldGraph },
];

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = patches[activeIndex]!;

  return (
    <FrameShell>
      <div className="mx-auto max-w-7xl px-6 py-12">
        <header className="mb-12">
          <h1 className="font-mono text-2xl font-medium text-foreground">
            node-td
          </h1>
          <p className="mt-2 font-mono text-sm text-muted-foreground">
            Generative node protocol — patches gallery
          </p>
        </header>

        {/* Active patch — single instance */}
        <div className="mb-8 space-y-3">
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-md border border-border/50">
            <Frame
              key={active.name}
              graph={active.graph}
              className="absolute inset-0"
            />
          </div>
          <span className="block font-mono text-sm text-muted-foreground">
            {active.name}
          </span>
        </div>

        {/* Patch selector */}
        <div className="flex flex-wrap gap-2">
          {patches.map((patch, i) => (
            <button
              key={patch.name}
              onClick={() => setActiveIndex(i)}
              className={`rounded-md border px-3 py-1.5 font-mono text-xs transition-colors ${
                i === activeIndex
                  ? "border-foreground/30 bg-foreground/10 text-foreground"
                  : "border-border/50 text-muted-foreground hover:border-foreground/20 hover:text-foreground"
              }`}
            >
              {patch.name}
            </button>
          ))}
        </div>
      </div>
    </FrameShell>
  );
}
