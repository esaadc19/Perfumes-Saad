import type { ComponentPropsWithRef } from "react";

type Tone = "primary" | "secondary" | "success" | "danger" | "warning" | "info" | "light" | "dark" | "link";

/**
 * Botón del panel de administración.
 *
 * Jerarquía por defecto:
 *  - `primary`   → sólido, la acción principal de la pantalla
 *  - `secondary` → contorno, acciones secundarias
 *  - `danger`    → sólido rojo, acciones destructivas
 *
 * Es un `<button>` común con la paleta que CoreUI usaba antes: se ve igual y
 * sin la librería el CSS del panel pesa una fracción de lo que pesaba.
 */
export type AdminButtonProps = ComponentPropsWithRef<"button"> & {
  tone?: Tone;
  fullWidth?: boolean;
  compact?: boolean;
  variant?: "outline" | "ghost";
};

export default function AdminButton({
  tone = "primary",
  fullWidth,
  compact,
  variant,
  className,
  type = "button",
  children,
  ...rest
}: AdminButtonProps) {
  // El secundario y el info salen por defecto como contorno para que el
  // botón primario sea siempre el más destacado de la pantalla.
  const resolvedVariant = variant ?? (tone === "secondary" || tone === "info" ? "outline" : undefined);

  const classes = [
    "admin-button",
    `admin-button--${tone}`,
    resolvedVariant ? `admin-button--${resolvedVariant}` : null,
    compact ? "admin-button--sm" : "admin-button--lg",
    fullWidth ? "full" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
