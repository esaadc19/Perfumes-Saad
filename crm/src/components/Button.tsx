import type { ButtonHTMLAttributes, ReactNode } from "react";

type Tone = "primary" | "secondary" | "ghost" | "danger";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  tone?: Tone;
  small?: boolean;
  type?: ButtonHTMLAttributes<HTMLButtonElement>["type"];
  children: ReactNode;
};

/**
 * Botón base del CRM. Dentro de un `<form>` siempre es `type="button"` salvo
 * que se indique lo contrario, para no disparar el submit por accidente.
 */
export default function Button({ tone = "primary", small, type = "button", className, ...rest }: Props) {
  const classes = ["crm-btn", tone !== "primary" && `crm-btn--${tone}`, small && "crm-btn--sm", className]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={classes} {...rest} />;
}