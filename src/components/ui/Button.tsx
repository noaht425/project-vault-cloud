import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "default" | "primary" | "ghost" | "danger";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // Plain <button> is already themed via globals.css's @layer base — this
  // variant adds nothing on top, it's just the default look spelled out
  // for callers that want to be explicit.
  default: "",
  primary: "bg-accent border-accent text-white hover:bg-accent hover:opacity-90",
  // Borderless icon/text action — same "ghost" look already established in
  // the Electron app's icon-only buttons.
  ghost: "bg-transparent border-transparent hover:bg-hover",
  danger: "bg-danger border-danger text-white hover:bg-danger hover:opacity-90",
};

export function Button({
  variant = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={`${VARIANT_CLASSES[variant]} ${className}`} {...props} />;
}
