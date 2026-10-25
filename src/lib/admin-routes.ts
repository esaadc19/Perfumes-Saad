/**
 * Rutas públicas del panel de administración.
 *
 * La URL es la fuente de verdad de la sección activa. Así se puede abrir
 * `/productos` directamente, recargar la página o compartir el enlace sin
 * perder la sección. El CRM queda fuera porque es otra aplicación.
 */
export const ADMIN_SECTIONS = [
  "overview",
  "products",
  "promotions",
  "transactions",
  "collect",
  "credit",
  "customers",
  "expenses",
  "advisors",
  "reports",
  "profiles",
  "settings",
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];

export const ADMIN_SECTION_PATHS: Record<AdminSection, string> = {
  overview: "/dashboard",
  products: "/productos",
  promotions: "/promociones",
  transactions: "/pedidos",
  collect: "/cobrar",
  credit: "/cartera",
  customers: "/clientes",
  expenses: "/gastos",
  advisors: "/asesores",
  reports: "/reportes",
  profiles: "/perfiles",
  settings: "/configuracion",
};

export const ADMIN_SECTION_TITLES: Record<AdminSection, string> = {
  overview: "Dashboard",
  products: "Productos",
  promotions: "Promociones",
  transactions: "Pedidos",
  collect: "Cobrar",
  credit: "Cartera",
  customers: "Clientes",
  expenses: "Gastos",
  advisors: "Asesores",
  reports: "Reportes",
  profiles: "Perfiles",
  settings: "Configuración",
};

const PATH_TO_SECTION = new Map<string, AdminSection>(
  ADMIN_SECTIONS.map((section) => [ADMIN_SECTION_PATHS[section], section])
);

const normalizePath = (pathname: string) => {
  const withoutTrailingSlash = pathname.replace(/\/+$/, "");
  return withoutTrailingSlash || "/";
};

/** Devuelve la sección del panel para una ruta, o `null` si es la tienda. */
export function getAdminSectionFromPath(pathname: string): AdminSection | null {
  return PATH_TO_SECTION.get(normalizePath(pathname)) ?? null;
}

export function getAdminPath(section: AdminSection): string {
  return ADMIN_SECTION_PATHS[section];
}

/** Cambia la URL sin recargar y avisa a la aplicación. */
export function pushAdminPath(section: AdminSection): void {
  const path = getAdminPath(section);
  if (window.location.pathname === path) return;
  window.history.pushState({ section }, "", path);
  window.dispatchEvent(new CustomEvent("saad:navigate", { detail: { section } }));
}

export function pushStorePath(): void {
  if (window.location.pathname === "/") return;
  window.history.pushState({}, "", "/");
  window.dispatchEvent(new CustomEvent("saad:navigate", { detail: { section: null } }));
}
