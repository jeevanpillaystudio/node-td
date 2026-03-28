"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ParamDef, Composition, BlendMode } from "@repo/generative";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface FrameEntry {
  id: string;
  name: string;
  composition: Composition;
  activePatchId: string;
  patchParams: Record<string, ParamDef[]>;
  patchValues: Record<string, Record<string, number>>;
  setParam: (patchId: string, key: string, value: number) => void;
  updatePatch: (patchId: string, updates: { blend?: BlendMode; opacity?: number; visible?: boolean }) => void;
  setActivePatch: (patchId: string) => void;
}

interface FrameContextValue {
  frames: Map<string, FrameEntry>;
  activeId: string | null;
  editingId: string | null;
  register: (entry: FrameEntry) => void;
  unregister: (id: string) => void;
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

/** Returns null when no FrameProvider is mounted (production). */
export function useOptionalFrameContext() {
  return useContext(FrameContext);
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

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

  // revision included so consumers re-render when frame entries update
  const value = useMemo<FrameContextValue>(
    () => ({
      frames: framesRef.current,
      activeId,
      editingId,
      register,
      unregister,
      setActive,
      setEditing,
    }),
    // biome-ignore lint/correctness/useExhaustiveDependencies: revision forces consumer re-render on frame updates
    [activeId, editingId, revision, register, unregister, setActive, setEditing],
  );

  return (
    <FrameContext.Provider value={value}>{children}</FrameContext.Provider>
  );
}
