import type { ReactNode } from "react";

// Mobile-appropriate action surface (bottom-anchored on phone, centered
// card on wider screens) — used for anything that would be a hover-icon
// row or window.prompt() on desktop but needs a real touch target and
// proper input on a phone (create/rename/delete).
export function BottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/60 border-0 rounded-none p-0 cursor-default"
        onClick={onClose}
      />
      <div className="relative w-full sm:max-w-sm bg-panel border border-border rounded-t-2xl sm:rounded-2xl p-4 shadow-lg" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        {children}
      </div>
    </div>
  );
}
