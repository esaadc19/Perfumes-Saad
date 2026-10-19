import { useState } from "react";
import {
  LayoutDashboard,
  ReceiptText,
  MessageCircle,
  Package,
  Menu,
  X,
  DollarSign,
  Users,
  Wallet,
  UserCheck,
  BarChart3,
  ShieldCheck,
  Settings,
  Tag,
  ExternalLink,
  Store,
  type LucideIcon,
} from "lucide-react";

export interface DockSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  /** El CRM abre en otra pestaña. */
  external?: boolean;
}

/**
 * Las cinco secciones del dia a dia. El resto vive en "Más": con trece
 * secciones, un dock con todas seria ilegible a 390px.
 */
const PRIMARY_IDS = ["overview", "transactions", "collect", "products"] as const;

interface Group {
  title: string;
  ids: string[];
}

const GROUPS: Group[] = [
  { title: "Ventas", ids: ["credit", "reports"] },
  { title: "Negocio", ids: ["promotions", "expenses"] },
  { title: "Personas", ids: ["customers", "advisors", "profiles"] },
  { title: "Sistema", ids: ["crm", "settings"] },
];

const ICONS: Record<string, LucideIcon> = {
  credit: DollarSign,
  reports: BarChart3,
  promotions: Tag,
  expenses: Wallet,
  customers: Users,
  advisors: UserCheck,
  profiles: ShieldCheck,
  crm: ExternalLink,
  settings: Settings,
};

/**
 * Navegación principal en móvil, fija al pie.
 *
 * Antes no había nada visible: los tabs de sección están en `display: none`
 * por debajo de 900px y quedaba solo el menú hamburguesa, que esconde
 * trece secciones detrás de dos toques. Un dock de cinco resuelve lo
 * frecuente en un toque y deja lo demás a un solo paso desde "Más".
 */
export default function AdminDock({
  sections,
  current,
  onSelect,
  onGoToStore,
}: {
  // `sections` en App es un array readonly, asi que se acepta como tal.
sections: readonly DockSection[];
  current: string;
  onSelect: (id: string) => void;
  /** Vuelve a la tienda pública, para revisar el catálogo desde el panel. */
  onGoToStore: () => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const primary = sections.filter((s) => (PRIMARY_IDS as readonly string[]).includes(s.id));
  const rest = sections.filter((s) => !(PRIMARY_IDS as readonly string[]).includes(s.id));
  const moreActive = rest.some((s) => s.id === current);

  const closeSheet = () => setSheetOpen(false);

  return (
    <>
      <nav className="admin-navdock" aria-label="Navegación principal">
        {primary.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`admin-navdock-item${current === section.id ? " is-active" : ""}`}
            aria-current={current === section.id ? "page" : undefined}
            onClick={() => onSelect(section.id)}
          >
            <span className="admin-navdock-icon">{section.icon}</span>
            <span className="admin-navdock-label">{section.title}</span>
          </button>
        ))}
        <button
          type="button"
          className={`admin-navdock-item${moreActive ? " is-active" : ""}`}
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen((open) => !open)}
        >
          <span className="admin-navdock-icon"><Menu size={20} /></span>
          <span className="admin-navdock-label">Más</span>
        </button>
      </nav>

      {sheetOpen && (
        <>
          <div className="admin-navsheet-backdrop" onClick={closeSheet} />
          <div className="admin-navsheet" role="dialog" aria-modal="true" aria-label="Todas las secciones">
            <div className="admin-navsheet-head">
              <h2>Todas las secciones</h2>
              <button type="button" className="admin-navsheet-close" onClick={closeSheet} aria-label="Cerrar">
                <X size={19} />
              </button>
            </div>

            {GROUPS.map((group) => {
              const items = group.ids
                .map((id) => rest.find((s) => s.id === id))
                .filter((s): s is DockSection => Boolean(s));
              if (items.length === 0) return null;
              return (
                <section key={group.title} className="admin-navsheet-group">
                  <h3>{group.title}</h3>
                  <div className="admin-navsheet-grid">
                    {items.map((section) => {
                      const Icon = ICONS[section.id];
                      return (
                        <button
                          key={section.id}
                          type="button"
                          className={`admin-navsheet-tile${current === section.id ? " is-active" : ""}`}
                          aria-current={current === section.id ? "page" : undefined}
                          onClick={() => {
                            closeSheet();
                            onSelect(section.id);
                          }}
                        >
                          <span className="admin-navdock-icon">{Icon ? <Icon size={19} /> : section.icon}</span>
                          <span>{section.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            {/* Catálogo: es la tienda pública, no una sección del panel. Va
                aparte de los grupos porque no es administración, es salir a
                ver lo que el cliente ve. */}
            <section className="admin-navsheet-group">
              <h3>Tienda</h3>
              <div className="admin-navsheet-grid">
                <button
                  type="button"
                  className="admin-navsheet-tile"
                  onClick={() => {
                    closeSheet();
                    onGoToStore();
                  }}
                >
                  <span className="admin-navdock-icon"><Store size={19} /></span>
                  <span>Ver catálogo</span>
                </button>
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}