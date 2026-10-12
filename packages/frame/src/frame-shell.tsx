import { FrameProvider, useFrameContext } from "./frame-provider";
import { FrameEditor } from "./editor/frame-editor";

interface FrameShellProps {
  /** Whether to mount the editor. Off, the children render alone and no Frame registers. */
  enabled: boolean;
  children: React.ReactNode;
}

/**
 * Wraps a page with the Frame selection context and editor overlay, when
 * enabled. The host decides when, e.g. with import.meta.env.DEV under Vite.
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
