import { useState, useMemo } from "react";
import {
  Pencil,
  Search,
  Users,
  MessageCircle,
  Sparkles,
  Clock,
  Crown,
  Repeat,
  PhoneOff,
  Calendar,
  CheckCircle2,
  Package,
} from "lucide-react";
import AdminButton from "../../components/admin/AdminButton";
import EmptyState from "../../components/admin/EmptyState";
import Pagination from "../../components/admin/Pagination";
import type { AdminCustomer } from "../../services/admin";
import { money } from "../../lib/format";

interface CustomersPageProps {
  customers: AdminCustomer[];
  visibleCount: number;
  loading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  importFeedback: string | null;
  importError: string | null;
  onEdit: (customer: AdminCustomer) => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}

type CustomerViewTab = "opportunities" | "directory";

export default function CustomersPage({
  customers,
  visibleCount,
  loading,
  search,
  onSearchChange,
  importFeedback,
  importError,
  onEdit,
  page,
  pageCount,
  onPageChange,
}: CustomersPageProps) {
  const [activeTab, setActiveTab] = useState<CustomerViewTab>("opportunities");
  const [opportunityFilter, setOpportunityFilter] = useState<"all" | "followup" | "repurchase" | "vip">("all");

  // Procesar clientes con métricas de ciclo de vida
  const customerOpportunities = useMemo(() => {
    const now = Date.now();

    return customers.map((c) => {
      // Ordenar pedidos por fecha más reciente
      const sortedOrders = [...(c.orders || [])].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const lastOrder = sortedOrders[0] ?? null;
      const orderCount = sortedOrders.length;
      const totalSpent = sortedOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);

      let daysSinceLastOrder: number | null = null;
      let lastPerfumeName = "Perfume";

      if (lastOrder) {
        const orderTime = new Date(lastOrder.created_at).getTime();
        daysSinceLastOrder = Math.max(0, Math.floor((now - orderTime) / (1000 * 60 * 60 * 24)));

        if (lastOrder.order_items && lastOrder.order_items.length > 0) {
          const firstItem = lastOrder.order_items[0];
          lastPerfumeName = `${firstItem.product_name_snapshot} (${firstItem.size_ml} ml)`;
          if (lastOrder.order_items.length > 1) {
            lastPerfumeName += ` +${lastOrder.order_items.length - 1}`;
          }
        }
      }

      // Clasificación de oportunidad:
      // 1. Seguimiento post-venta: día 3 a 7 tras el pedido
      const isFollowup = daysSinceLastOrder !== null && daysSinceLastOrder >= 3 && daysSinceLastOrder <= 7;
      // 2. Recompra: día 30 a 60 tras el pedido
      const isRepurchase = daysSinceLastOrder !== null && daysSinceLastOrder >= 30 && daysSinceLastOrder <= 60;
      // 3. Cliente VIP: 2 o más pedidos
      const isVip = orderCount >= 2;

      return {
        customer: c,
        orderCount,
        totalSpent,
        lastOrder,
        daysSinceLastOrder,
        lastPerfumeName,
        isFollowup,
        isRepurchase,
        isVip,
      };
    });
  }, [customers]);

  // Grupos filtrados
  const followupList = useMemo(
    () => customerOpportunities.filter((item) => item.isFollowup),
    [customerOpportunities]
  );
  const repurchaseList = useMemo(
    () => customerOpportunities.filter((item) => item.isRepurchase),
    [customerOpportunities]
  );
  const vipList = useMemo(
    () => customerOpportunities.filter((item) => item.isVip),
    [customerOpportunities]
  );

  const totalActionable = followupList.length + repurchaseList.length;

  // Filtrado según sub-píldora
  const displayedOpportunities = useMemo(() => {
    switch (opportunityFilter) {
      case "followup":
        return followupList;
      case "repurchase":
        return repurchaseList;
      case "vip":
        return vipList;
      default:
        // Mostrar todos los que tienen alguna oportunidad activa o son VIP
        return customerOpportunities.filter(
          (item) => item.isFollowup || item.isRepurchase || item.isVip
        );
    }
  }, [opportunityFilter, followupList, repurchaseList, vipList, customerOpportunities]);

  // Generador de enlaces de WhatsApp personalizados
  const buildWhatsAppLink = (
    phone: string | null,
    firstName: string,
    perfume: string,
    type: "followup" | "repurchase" | "vip"
  ): string | null => {
    if (!phone) return null;
    const cleanPhone = phone.replace(/\D/g, "");
    const formattedPhone = cleanPhone.startsWith("57") ? cleanPhone : `57${cleanPhone}`;

    let text = "";
    if (type === "followup") {
      text = `Hola ${firstName}, te escribe Elías de Perfumes SAAD 👋 Quería preguntarte cómo te fue con tu fragancia de ${perfume}, ¿qué tal te pareció el aroma y la fijación? ¡Espero que lo estés disfrutando mucho! ✨`;
    } else if (type === "repurchase") {
      text = `Hola ${firstName}, ¿cómo estás? Te escribe Elías de Perfumes SAAD 👋 Quería saludarte y agradecerte por tu compra de ${perfume}. Como ya eres cliente de la casa, para tu próxima compra tienes un descuento especial VIP. ¿Te gustaría conocer las nuevas referencias que nos acaban de llegar? 🔥`;
    } else {
      text = `Hola ${firstName}, te escribe Elías de Perfumes SAAD 👋 Por ser uno de nuestros clientes VIP más fieles, tenemos un catálogo exclusivo con promociones especiales para ti esta semana. ¿Te gustaría revisarlo? 👑`;
    }

    return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`;
  };

  return (
    <section className="admin-card">
      {/* Navegación Superior entre Oportunidades y Directorio */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          paddingBottom: "1.25rem",
          borderBottom: "1px solid var(--border)",
          marginBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setActiveTab("opportunities")}
            style={{
              padding: "0.55rem 1rem",
              borderRadius: "0.6rem",
              fontSize: "0.82rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              border: "1px solid var(--border)",
              transition: "all 0.2s ease",
              background: activeTab === "opportunities" ? "#d4af37" : "var(--surface)",
              color: activeTab === "opportunities" ? "#0b0f17" : "var(--foreground)",
              boxShadow: activeTab === "opportunities" ? "0 2px 10px rgba(212, 175, 55, 0.25)" : "none",
            }}
          >
            <Sparkles size={16} />
            <span>Fidelización y Recompra</span>
            {totalActionable > 0 && (
              <span
                style={{
                  background: activeTab === "opportunities" ? "#0b0f17" : "#ef4444",
                  color: "#fff",
                  fontSize: "0.65rem",
                  padding: "1px 6px",
                  borderRadius: "9999px",
                  fontWeight: 800,
                }}
              >
                {totalActionable}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("directory")}
            style={{
              padding: "0.55rem 1rem",
              borderRadius: "0.6rem",
              fontSize: "0.82rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              border: "1px solid var(--border)",
              transition: "all 0.2s ease",
              background: activeTab === "directory" ? "#d4af37" : "var(--surface)",
              color: activeTab === "directory" ? "#0b0f17" : "var(--foreground)",
              boxShadow: activeTab === "directory" ? "0 2px 10px rgba(212, 175, 55, 0.25)" : "none",
            }}
          >
            <Users size={16} />
            <span>Directorio de Clientes ({customers.length})</span>
          </button>
        </div>

        {/* Buscador de clientes */}
        <label className="admin-search" style={{ margin: 0 }}>
          <Search size={16} />
          <input
            aria-label="Buscar clientes"
            placeholder="Buscar por nombre o teléfono"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
      </div>

      {/* ============================================================
          VISTA 1: OPORTUNIDADES DE RECOMPRA Y FIDELIZACIÓN (CRM ACTIVO)
         ============================================================ */}
      {activeTab === "opportunities" && (
        <div>
          {/* Métricas Resumen Superior */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "1rem",
              marginBottom: "1.5rem",
            }}
          >
            {/* Card Seguimiento Post-Venta */}
            <div
              onClick={() => setOpportunityFilter("followup")}
              style={{
                background: opportunityFilter === "followup" ? "rgba(59, 130, 246, 0.12)" : "var(--surface)",
                border: opportunityFilter === "followup" ? "1.5px solid #3b82f6" : "1px solid var(--border)",
                borderRadius: "0.75rem",
                padding: "1rem",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#3b82f6" }}>
                <Clock size={16} />
                <span style={{ fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase" }}>
                  Post-Venta (Día 3 a 7)
                </span>
              </div>
              <strong style={{ fontSize: "1.6rem", display: "block", marginTop: "0.4rem", color: "var(--foreground)" }}>
                {followupList.length}
              </strong>
              <small style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                Preguntar satisfacción y fijación
              </small>
            </div>

            {/* Card Ciclo de Recompra */}
            <div
              onClick={() => setOpportunityFilter("repurchase")}
              style={{
                background: opportunityFilter === "repurchase" ? "rgba(245, 158, 11, 0.12)" : "var(--surface)",
                border: opportunityFilter === "repurchase" ? "1.5px solid #f59e0b" : "1px solid var(--border)",
                borderRadius: "0.75rem",
                padding: "1rem",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#f59e0b" }}>
                <Repeat size={16} />
                <span style={{ fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase" }}>
                  Recompra (Día 30 a 60)
                </span>
              </div>
              <strong style={{ fontSize: "1.6rem", display: "block", marginTop: "0.4rem", color: "var(--foreground)" }}>
                {repurchaseList.length}
              </strong>
              <small style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                Perfume por terminarse · Ofrecer VIP
              </small>
            </div>

            {/* Card Clientes VIP */}
            <div
              onClick={() => setOpportunityFilter("vip")}
              style={{
                background: opportunityFilter === "vip" ? "rgba(234, 179, 8, 0.12)" : "var(--surface)",
                border: opportunityFilter === "vip" ? "1.5px solid #eab308" : "1px solid var(--border)",
                borderRadius: "0.75rem",
                padding: "1rem",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#eab308" }}>
                <Crown size={16} />
                <span style={{ fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase" }}>
                  Clientes VIP (2+ compras)
                </span>
              </div>
              <strong style={{ fontSize: "1.6rem", display: "block", marginTop: "0.4rem", color: "var(--foreground)" }}>
                {vipList.length}
              </strong>
              <small style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                Tus compradores más recurrentes
              </small>
            </div>
          </div>

          {/* Listado de Oportunidades */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {displayedOpportunities.map((item) => {
              const c = item.customer;
              const firstName = c.full_name.split(" ")[0];

              // Determinar tipo de mensaje preferido
              const type = item.isFollowup ? "followup" : item.isRepurchase ? "repurchase" : "vip";
              const link = buildWhatsAppLink(c.phone, firstName, item.lastPerfumeName, type);

              return (
                <div
                  key={c.id}
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.85rem",
                    padding: "1rem 1.25rem",
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "1rem",
                    transition: "all 0.2s ease",
                  }}
                >
                  <div style={{ minWidth: 260, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <strong style={{ fontSize: "0.95rem", color: "var(--foreground)" }}>{c.full_name}</strong>
                      {c.city && (
                        <span
                          style={{
                            fontSize: "0.7rem",
                            padding: "1px 6px",
                            borderRadius: "4px",
                            background: "rgba(255,255,255,0.06)",
                            color: "var(--muted)",
                          }}
                        >
                          {c.city}
                        </span>
                      )}

                      {/* Badges de Estado */}
                      {item.isFollowup && (
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: "#dbeafe",
                            color: "#1d4ed8",
                            border: "1px solid #bfdbfe",
                          }}
                        >
                          💬 Seguimiento (Hace {item.daysSinceLastOrder} días)
                        </span>
                      )}
                      {item.isRepurchase && (
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: "#fef3c7",
                            color: "#b45309",
                            border: "1px solid #fde68a",
                          }}
                        >
                          🔥 Recompra (Hace {item.daysSinceLastOrder} días)
                        </span>
                      )}
                      {item.isVip && (
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: "#fef9c3",
                            color: "#854d0e",
                            border: "1px solid #fef08a",
                          }}
                        >
                          👑 VIP ({item.orderCount} compras · {money(item.totalSpent)})
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.3rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <Package size={14} />
                      <span>
                        Último pedido: <strong style={{ color: "var(--foreground)" }}>{item.lastPerfumeName}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Acciones de Contacto */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {link ? (
                      <AdminButton
                        tone={item.isFollowup || item.isRepurchase ? "primary" : "secondary"}
                        compact
                        type="button"
                        onClick={() => window.open(link, "_blank", "noopener,noreferrer")}
                      >
                        <MessageCircle size={15} />
                        {item.isFollowup
                          ? "Preguntar satisfacción"
                          : item.isRepurchase
                            ? "Ofrecer recompra VIP"
                            : "Contactar WhatsApp"}
                      </AdminButton>
                    ) : (
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--muted)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                        }}
                      >
                        <PhoneOff size={14} /> Sin teléfono registrado
                      </span>
                    )}

                    <AdminButton
                      tone="secondary"
                      compact
                      type="button"
                      variant="ghost"
                      aria-label={`Editar ${c.full_name}`}
                      onClick={() => onEdit(c)}
                    >
                      <Pencil size={15} />
                    </AdminButton>
                  </div>
                </div>
              );
            })}

            {displayedOpportunities.length === 0 && (
              <EmptyState
                icon={<CheckCircle2 size={28} color="#10b981" />}
                title="¡Todo al día en fidelización!"
                hint="No hay clientes en este rango de días para seguimiento o recompra hoy. Cuando se entreguen más pedidos, aparecerán aquí automáticamente."
              />
            )}
          </div>
        </div>
      )}

      {/* ============================================================
          VISTA 2: DIRECTORIO GENERAL DE CLIENTES (TABLA ORIGINAL)
         ============================================================ */}
      {activeTab === "directory" && (
        <div>
          {importFeedback && <p className="import-feedback" role="status">{importFeedback}</p>}
          {importError && <p className="form-error" role="alert">{importError}</p>}
          <p className="customer-import-hint">
            Importa CSV o Excel (.xlsx) con las columnas <code>full_name</code> y, opcionalmente, <code>phone</code>, <code>email</code> y <code>city</code>. Se omiten coincidencias por correo o teléfono.
          </p>
          <div className="admin-table">
            <div className="table-row customer-row header">
              <span>Cliente</span>
              <span>WhatsApp</span>
              <span>Correo</span>
              <span>Ciudad</span>
              <span className="cell-center">Pedidos</span>
              <span></span>
            </div>
            {customers.map((customer) => (
              <div className="table-row customer-row" key={customer.id}>
                <strong>{customer.full_name}</strong>
                <span>{customer.phone || "—"}</span>
                <span>{customer.email || "—"}</span>
                <span>{customer.city || "—"}</span>
                <span className="cell-center">{customer.orders?.length ?? 0}</span>
                <AdminButton
                  tone="secondary"
                  compact
                  type="button"
                  aria-label={`Editar ${customer.full_name}`}
                  onClick={() => onEdit(customer)}
                >
                  <Pencil size={16} />
                </AdminButton>
              </div>
            ))}
            {!loading && visibleCount === 0 && (
              <EmptyState
                icon={<Users size={26} />}
                title="No hay clientes que coincidan con la búsqueda."
                hint="Prueba con otro nombre o teléfono."
              />
            )}
          </div>
          <Pagination
            page={page}
            pageCount={pageCount}
            total={visibleCount}
            noun="cliente"
            label="Paginación de clientes"
            onPageChange={onPageChange}
          />
        </div>
      )}
    </section>
  );
}
