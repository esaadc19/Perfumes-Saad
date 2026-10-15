import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, LogOut, Menu, Plus, Search, Sparkles } from "lucide-react";
import { FOOTER_NAV, NAV } from "./nav";
import type { NavItem, SectionId } from "./nav";
import type { CrmRole } from "../lib/auth";

type Props = {
  section: SectionId;
  onSection: (section: SectionId) => void;
  role: CrmRole;
  displayName: string;
  email: string | null;
  onSignOut: () => void;
  children: ReactNode;
};

function initials(name: string, email: string | null) {
  const source = name.trim() || (email ?? "");
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "S") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function NavButton({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={["crm-side__link", active && "is-active"].filter(Boolean).join(" ")}
      aria-current={active ? "page" : undefined}
    >
      {item.icon}
      <span>{item.label}</span>
      {item.badge ? <span className="crm-side__count">{item.badge}</span> : null}
    </button>
  );
}

export default function Shell({
  section,
  onSection,
  role,
  displayName,
  email,
  onSignOut,
  children,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const go = (next: SectionId) => {
    onSection(next);
    setDrawerOpen(false);
  };

  return (
    <div className={["crm-shell", drawerOpen && "is-drawer-open"].filter(Boolean).join(" ")}>
      <button
        type="button"
        className="crm-scrim"
        aria-label="Cerrar menú"
        onClick={() => setDrawerOpen(false)}
      />

      <aside className="crm-side">
        <div className="crm-side__brand">
          <img className="crm-side__logo" src="/crm/mark.png" alt="" />
          <span className="crm-side__brand-text">
            <span className="crm-side__brand-name">Perfumes SAAD</span>
            <span className="crm-side__brand-role">CRM</span>
          </span>
        </div>

        <div className="crm-side__search">
          <div className="crm-side__search-row">
            <Search size={14} aria-hidden />
            <span>Buscar</span>
            <kbd>Ctrl K</kbd>
          </div>
          <button type="button" className="crm-side__new">
            <Plus size={14} aria-hidden /> Nuevo
          </button>
        </div>

        <nav className="crm-side__nav">
          {NAV.map((group) => (
            <div key={group.label}>
              <div className="crm-side__group-label">{group.label}</div>
              {group.items
                .filter((item) => role === "admin" || !["informes", "configuracion"].includes(item.id))
                .map((item) => (
                  <NavButton
                    key={item.id}
                    item={item}
                    active={item.id === section}
                    onClick={() => go(item.id)}
                  />
                ))}
            </div>
          ))}
        </nav>

        <div className="crm-side__foot">
          {role === "admin" &&
            FOOTER_NAV.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                active={item.id === section}
                onClick={() => go(item.id)}
              />
            ))}
          <div className="crm-side__user">
            <span className="crm-side__user-avatar">{initials(displayName, email)}</span>
            <span className="crm-side__user-text" title={email ?? undefined}>
              {displayName || email}
            </span>
          </div>
          <button type="button" className="crm-side__link" onClick={onSignOut}>
            <LogOut size={16} aria-hidden />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <div className="crm-main">
        <header className="crm-topbar">
          <button
            type="button"
            className="crm-drawer-toggle"
            aria-label="Abrir menú"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu size={17} />
          </button>
          <button type="button" className="crm-topbar__view">
            {NAV.flatMap((g) => g.items).find((i) => i.id === section)?.label ?? "Panel"}
            <ChevronDown size={14} aria-hidden />
          </button>
          <span className="crm-topbar__spacer" />
          <div className="crm-topbar__actions">
            <button type="button" className="crm-topbar__view" title="Automatizaciones">
              <Sparkles size={14} aria-hidden />
            </button>
          </div>
        </header>

        <main className="crm-content">{children}</main>
      </div>
    </div>
  );
}