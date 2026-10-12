import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { FrameHostContext, type FrameEntry, type FrameHost } from "./frame-host";
import { cn } from "./ui/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FrameContextValue {
  frames: Map<string, FrameEntry>;
  activeId: string | null;
  editingId: string | null;
  setActive: (id: string | null) => void;
  setEditing: (id: string | null) => void;
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

const FrameContext = createContext<FrameContextValue | null>(null);

export function useFrameContext() {
  const ctx = useContext(FrameContext);
  if (!ctx) throw new Error("useFrameContext must be used within <FrameProvider>");
  return ctx;
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

/**
 * Hosts the Frames inside it: each registers through FrameHostContext, and
 * gets a selection outline and an Edit Graph button drawn over it.
 */
export function FrameProvider({ children }: { children: React.ReactNode }) {
  const framesRef = useRef(new Map<string, FrameEntry>());
  const [revision, bump] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const register = useCallback((entry: FrameEntry) => {
    framesRef.current.set(entry.id, entry);
    bump((n) => n + 1);
  }, []);

  const unregister = useCallback(
    (id: string) => {
      framesRef.current.delete(id);
      setActiveId((prev) => (prev === id ? null : prev));
      setEditingId((prev) => (prev === id ? null : prev));
      bump((n) => n + 1);
    },
    [],
  );

  const setActive = useCallback((id: string | null) => {
    setActiveId(id);
  }, []);

  const setEditing = useCallback((id: string | null) => {
    setEditingId(id);
    if (id) setActiveId(id);
  }, []);

  // Stable, so Frames do not re-render when the selection changes; only
  // their overlays, which read FrameContext, do.
  const host = useMemo<FrameHost>(
    () => ({ register, unregister, renderOverlay: (id) => <FrameOverlay id={id} /> }),
    [register, unregister],
  );

  // revision included so consumers re-render when frame entries update
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision is read through framesRef; dropping it would stop consumers seeing register/unregister
  const value = useMemo<FrameContextValue>(
    () => ({
      frames: framesRef.current,
      activeId,
      editingId,
      setActive,
      setEditing,
    }),
    [activeId, editingId, revision, setActive, setEditing],
  );

  return (
    <FrameHostContext.Provider value={host}>
      <FrameContext.Provider value={value}>{children}</FrameContext.Provider>
    </FrameHostContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  Overlay                                                            */
/* ------------------------------------------------------------------ */

/**
 * Drawn over each Frame: a full-size button that selects it, and once it is
 * selected an Edit Graph button beside (not inside) that one.
 */
function FrameOverlay({ id }: { id: string }) {
  const { frames, activeId, setActive, setEditing } = useFrameContext();
  const isActive = activeId === id;
  const name = frames.get(id)?.name ?? id;

  return (
    <>
      <button
        type="button"
        aria-label={`Select ${name}`}
        aria-pressed={isActive}
        onClick={() => setActive(id)}
        className={cn(
          "absolute inset-0 z-10 cursor-pointer outline-2 -outline-offset-2 outline-dashed outline-transparent transition-[outline-color] focus-visible:outline-ring",
          isActive ? "outline-ring" : "hover:outline-ring/50",
        )}
      />
      {isActive && (
        <button
          type="button"
          onClick={() => setEditing(id)}
          className="absolute top-2 right-2 z-20 rounded-md border border-border/50 bg-card/80 px-2.5 py-1 font-mono text-xs text-muted-foreground backdrop-blur-md transition-colors hover:text-foreground"
        >
          Edit Graph
        </button>
      )}
    </>
  );
}
