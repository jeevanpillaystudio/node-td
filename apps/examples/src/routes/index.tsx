import { FrameShell } from "@node-td/editor";
import { Frame } from "@node-td/frame";
import { patches } from "@node-td/patches";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  // import.meta.env.DEV is a build-time constant. A production build keeps
  // only the second branch, which leaves the editor (React Flow included)
  // out of the client bundle; FrameShell's enabled prop alone could not,
  // since the bundler cannot see through a prop.
  return import.meta.env.DEV ? (
    <FrameShell enabled>
      <Gallery />
    </FrameShell>
  ) : (
    <Gallery />
  );
}

function Gallery() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <header className="mb-12">
        <h1 className="font-mono text-2xl font-medium text-foreground">node-td</h1>
        <p className="mt-2 font-mono text-sm text-muted-foreground">
          Generative node protocol — patches gallery
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {patches.map((patch) => (
          <div key={patch.id} className="space-y-2">
            <Frame
              graph={patch.graph}
              className="aspect-square overflow-hidden rounded-md border border-border/50"
            />
            <span className="block font-mono text-xs text-muted-foreground">{patch.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
