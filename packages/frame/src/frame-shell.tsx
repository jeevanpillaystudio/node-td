"use client";

import { FrameProvider } from "./frame-provider";
import { Inspector } from "./inspector";

/**
 * Wraps a page with the Frame selection context and Inspector panel.
 * In production, renders children directly (no overhead).
 */
export function FrameShell({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV !== "development") {
    return <>{children}</>;
  }

  return (
    <FrameProvider>
      {children}
      <Inspector />
    </FrameProvider>
  );
}
