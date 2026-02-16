import type { HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
};

export function Card({ children, className, ...props }: CardProps): JSX.Element {
  const cls = `ui-card${className ? ` ${className}` : ""}`;
  return (
    <section className={cls} {...props}>
      {children}
    </section>
  );
}

