import type { HTMLAttributes } from "react";

export function Panel({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-panel border border-border rounded-xl p-4 ${className}`}
      {...props}
    />
  );
}
