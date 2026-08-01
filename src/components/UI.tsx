import { type ReactNode } from "react";

/* ══════════════════════════════════════════
   Retro Card — thick borders, chunky shadows
   ══════════════════════════════════════════ */
interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}
export function Card({ children, className = "", onClick, style }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`retro-card p-4 ${onClick ? "cursor-pointer" : ""} ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

/* ══════════════════════════════════════════
   Retro Button — chunky, pressable
   ══════════════════════════════════════════ */
interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}
export function Button({
  children,
  onClick,
  variant = "primary",
  size = "md",
  className = "",
  disabled = false,
  type = "button",
}: ButtonProps) {
  const variantClass = {
    primary: "retro-btn retro-btn-orange",
    secondary: "retro-btn retro-btn-outline",
    ghost:
      "bg-transparent border-2 border-transparent",
    danger: "retro-btn retro-btn-pink",
  };

  const sizeClass = {
    sm: "text-[0.45rem] px-3 py-1.5 rounded-md",
    md: "text-[0.55rem] px-4 py-2",
    lg: "text-[0.65rem] px-6 py-3",
  };

  // Ghost variant uses CSS variable colors for theme compatibility
  const ghostStyle: React.CSSProperties | undefined =
    variant === "ghost"
      ? {
          color: "var(--color-text-muted, #b0d0b0)",
        }
      : undefined;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${variantClass[variant]} ${sizeClass[size]} ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`}
      style={ghostStyle}
      onMouseEnter={variant === "ghost" ? (e) => {
        (e.currentTarget as HTMLElement).style.color = "var(--color-text, #e0ffe0)";
        (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--color-primary, #00ff41) 5%, transparent)";
      } : undefined}
      onMouseLeave={variant === "ghost" ? (e) => {
        (e.currentTarget as HTMLElement).style.color = "var(--color-text-muted, #b0d0b0)";
        (e.currentTarget as HTMLElement).style.background = "transparent";
      } : undefined}
    >
      {children}
    </button>
  );
}

/* ══════════════════════════════════════════
   Retro Input — thick bordered
   ══════════════════════════════════════════ */
interface InputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  type?: string;
  maxLength?: number;
}
export function Input({
  value,
  onChange,
  placeholder = "",
  className = "",
  type = "text",
  maxLength,
}: InputProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      className={`retro-input ${className}`}
    />
  );
}

/* ══════════════════════════════════════════
   Retro Textarea
   ══════════════════════════════════════════ */
interface TextareaProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
}
export function Textarea({
  value,
  onChange,
  placeholder = "",
  className = "",
  rows = 3,
}: TextareaProps) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={`retro-textarea ${className}`}
    />
  );
}

/* ══════════════════════════════════════════
   Retro Badge
   ══════════════════════════════════════════ */
interface BadgeProps {
  children: ReactNode;
  variant?: "green" | "red" | "neutral" | "yellow";
  className?: string;
}
export function Badge({ children, variant = "neutral", className = "" }: BadgeProps) {
  const variants: Record<string, string> = {
    green: "retro-badge-green",
    red: "retro-badge-red",
    yellow: "retro-badge-yellow",
    neutral:
      "retro-badge-neutral",
  };

  return <span className={`inline-flex items-center ${variants[variant] || variants.neutral} ${className}`}>{children}</span>;
}
