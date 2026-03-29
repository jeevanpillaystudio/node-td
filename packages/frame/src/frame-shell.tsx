import { FrameProvider, useFrameContext } from "./frame-provider";
import { FrameEditor } from "./editor/frame-editor";

/**
 * Wraps a page with the Frame selection context and editor overlay.
 * In production, renders children directly (no overhead).
 */
export function FrameShell({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV !== "development") {
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
