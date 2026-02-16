import type { HTMLAttributes, ReactNode } from "react";

type BadgeTone = "neutral" | "success" | "danger";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  tone?: BadgeTone;
};

export function Badge({ children, tone = "neutral", className, ...props }: BadgeProps): JSX.Element {
  const cls = `ui-badge ui-badge-${tone}${className ? ` ${className}` : ""}`;
  return (
    <span className={cls} {...props}>
      {children}
    </span>
  );
}

