import type { ReactNode } from "react";
import {
  LayoutDashboard,
  KanbanSquare,
  MessageSquare,
  Contact,
  ListChecks,
  Bot,
  MessageCircleQuestion,
  BarChart3,
  Settings,
} from "lucide-react";

export type SectionId =
  | "dashboard"
  | "tablero"
  | "conversaciones"
  | "contactos"
  | "tareas"
  | "agente-ia"
  | "preguntar-ia"
  | "informes"
  | "configuracion";

export type NavItem = {
  id: SectionId;
  label: string;
  icon: ReactNode;
  /** Reserved for Fase 3 onwards (unread conversations, pending tasks). */
  badge?: number;
};

export type NavGroup = { label: string; items: NavItem[] };

/**
 * Sidebar menu. Only the modules decided for Perfumes SAAD: no payments, no
 * marketing, no reputation, no sites, no subscriptions.
 */
export const NAV: NavGroup[] = [
  {
    label: "Operación",
    items: [
      { id: "dashboard", label: "Panel", icon: <LayoutDashboard size={16} /> },
      { id: "tablero", label: "Tablero", icon: <KanbanSquare size={16} /> },
      { id: "conversaciones", label: "Conversaciones", icon: <MessageSquare size={16} /> },
      { id: "contactos", label: "Contactos", icon: <Contact size={16} /> },
      { id: "tareas", label: "Tareas", icon: <ListChecks size={16} /> },
    ],
  },
  {
    label: "Inteligencia",
    items: [
      { id: "agente-ia", label: "Agente IA", icon: <Bot size={16} /> },
      { id: "preguntar-ia", label: "Preguntar a la IA", icon: <MessageCircleQuestion size={16} /> },
    ],
  },
  {
    label: "Negocio",
    items: [{ id: "informes", label: "Informes", icon: <BarChart3 size={16} /> }],
  },
];

export const FOOTER_NAV: NavItem[] = [
  { id: "configuracion", label: "Configuración", icon: <Settings size={16} /> },
];

/** Sections an `asesor` cannot open: Reports and Settings. */
export const ADMIN_ONLY: SectionId[] = ["informes", "configuracion"];

export function isAllowed(section: SectionId, role: "admin" | "asesor" | null): boolean {
  if (!role) return false;
  return role === "admin" || !ADMIN_ONLY.includes(section);
}