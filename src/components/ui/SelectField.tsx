import { useId, type SelectHTMLAttributes } from "react";

export function SelectField({
  label,
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-sm text-muted">{label}</span>
      <select id={id} className={`w-full ${className}`} {...props}>
        {children}
      </select>
    </label>
  );
}
