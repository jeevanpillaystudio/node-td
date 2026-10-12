import type { ReactNode } from "react";
import { FrameEditor } from "./editor/frame-editor";
import { FrameProvider, useFrameContext } from "./frame-provider";

interface FrameShellProps {
  /** Whether to mount the editor. Off, the children render alone and no Frame registers. */
  enabled: boolean;
  children: ReactNode;
}

/**
 * Wraps a page with the Frame selection context and editor overlay, when
 * enabled. The host decides when. `enabled` is read at run time, so it does
 * not take the editor out of a bundle: a host that wants it gone from
 * production renders FrameShell only behind a build-time constant (such as
 * import.meta.env.DEV under Vite).
 */
export function FrameShell({ enabled, children }: FrameShellProps) {
  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <FrameProvider>
      {children}
      <FrameShellOverlays />
    </FrameProvider>
  );
}

function FrameShellOverlays() {
  const { editingId, setEditing } = useFrameContext();

  if (!editingId) return null;

  return <FrameEditor onClose={() => setEditing(null)} />;
}
