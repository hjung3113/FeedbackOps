import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "subtle" | "destructive";
  children: ReactNode;
}

export function Button({ variant = "secondary", children, className = "", ...props }: ButtonProps) {
  return (
    <button className={`fo-button fo-button-${variant} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}

interface BadgeProps {
  tone?: "default" | "muted" | "urgent" | "blocked";
  children: ReactNode;
}

export function Badge({ tone = "default", children }: BadgeProps) {
  return (
    <span className="fo-badge" data-tone={tone}>
      {children}
    </span>
  );
}
