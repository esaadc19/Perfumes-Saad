import { CButton } from "@coreui/react";
import type { ComponentProps } from "react";

type Tone = "primary" | "secondary" | "success" | "danger" | "warning" | "info" | "light" | "dark" | "link";

type CButtonProps = ComponentProps<typeof CButton>;

/**
 * Botón del panel de administración: CoreUI `CButton` con forma pill.
 *
 * Jerarquía por defecto:
 *  - `primary`   → sólido, la acción principal de la pantalla
 *  - `secondary` → contorno, acciones secundarias
 *  - `danger`    → sólido rojo, acciones destructivas
 */
export type AdminButtonProps = Omit<CButtonProps, "color" | "shape" | "size" | "variant"> & {
  tone?: Tone;
  fullWidth?: boolean;
  compact?: boolean;
  variant?: CButtonProps["variant"];
};

export default function AdminButton({
  tone = "primary",
  fullWidth,
  compact,
  variant,
  className,
  ...rest
}: AdminButtonProps) {
  // El secundario y el info salen por defecto como contorno para que el
  // botón primario sea siempre el más destacado de la pantalla.
  const resolvedVariant = variant ?? (tone === "secondary" || tone === "info" ? "outline" : undefined);

  const classes = ["admin-button", fullWidth ? "full" : null, compact ? "compact" : null, className]
    .filter(Boolean)
    .join(" ");

  return (
    <CButton
      shape="rounded-pill"
      size={compact ? "sm" : "lg"}
      color={tone}
      variant={resolvedVariant}
      className={classes}
      {...rest}
    />
  );
}