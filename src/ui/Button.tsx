import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
};

export function Button({ children, variant = "primary", className, ...props }: ButtonProps): JSX.Element {
  const cls = `ui-button ui-button-${variant}${className ? ` ${className}` : ""}`;
  return (
    <button className={cls} {...props}>
      {children}
    </button>
  );
}

