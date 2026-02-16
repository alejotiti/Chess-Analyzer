import type { SelectHTMLAttributes } from "react";

type SelectOption = {
  label: string;
  value: string | number;
};

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  options: SelectOption[];
};

export function Select({ options, className, ...props }: SelectProps): JSX.Element {
  const cls = `ui-select${className ? ` ${className}` : ""}`;
  return (
    <select className={cls} {...props}>
      {options.map((option) => (
        <option key={String(option.value)} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

