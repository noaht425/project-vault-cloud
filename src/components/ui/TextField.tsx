import { useId, type InputHTMLAttributes } from "react";

export function TextField({
  label,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-sm text-muted">{label}</span>
      <input id={id} className={`w-full ${className}`} {...props} />
    </label>
  );
}
