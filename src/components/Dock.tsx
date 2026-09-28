import { useRef, type ReactNode } from "react";
import { motion, useMotionValue, useSpring, useTransform, type SpringOptions } from "motion/react";

export type DockItemData = {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  selected?: boolean;
};

type DockProps = {
  items: DockItemData[];
  className?: string;
  distance?: number;
  baseItemSize?: number;
  magnification?: number;
  spring?: SpringOptions;
  collapsed?: boolean;
};

function DockItem({
  item,
  mouseY,
  spring,
  distance,
  baseItemSize,
  magnification,
  collapsed,
}: {
  item: DockItemData;
  mouseY: ReturnType<typeof useMotionValue<number>>;
  spring: SpringOptions;
  distance: number;
  baseItemSize: number;
  magnification: number;
  collapsed: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const mouseDistance = useTransform(mouseY, (position) => {
    const rect = ref.current?.getBoundingClientRect();
    return position - (rect?.top ?? 0) - baseItemSize / 2;
  });
  const targetSize = useTransform(
    mouseDistance,
    [-distance, 0, distance],
    [baseItemSize, magnification, baseItemSize]
  );
  const iconSize = useSpring(targetSize, spring);
  const iconScale = useTransform(iconSize, (size) => size / baseItemSize);

  return (
    <button
      ref={ref}
      type="button"
      className={`dock-item${item.selected ? " selected" : ""}`}
      data-label={item.label}
      aria-label={item.label}
      aria-current={item.selected ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      onClick={item.onClick}
    >
      <motion.span
        className="dock-item-icon"
        style={{ width: baseItemSize, height: baseItemSize, scale: iconScale }}
      >
        {item.icon}
      </motion.span>
      <span className="dock-item-label">{item.label}</span>
    </button>
  );
}

export default function Dock({
  items,
  className = "",
  distance = 150,
  baseItemSize = 44,
  magnification = 52,
  spring = { mass: 0.1, stiffness: 150, damping: 12 },
  collapsed = false,
}: DockProps) {
  const mouseY = useMotionValue(Number.POSITIVE_INFINITY);

  return (
    <nav
      className={`dock-outer ${className}${collapsed ? " is-collapsed" : ""}`}
      aria-label="Navegación de administración"
      onMouseMove={(event) => mouseY.set(event.clientY)}
      onMouseLeave={() => mouseY.set(Number.POSITIVE_INFINITY)}
    >
      {items.map((item) => (
        <DockItem
          key={item.label}
          item={item}
          mouseY={mouseY}
          spring={spring}
          distance={distance}
          baseItemSize={baseItemSize}
          magnification={magnification}
          collapsed={collapsed}
        />
      ))}
    </nav>
  );
}
