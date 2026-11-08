import { useMemo, useState } from "react";
import {
  Award,
  DollarSign,
  Flame,
  Package,
  Percent,
  ReceiptText,
  Search,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { money } from "../../lib/format";
import {
  getDecantsAnalysis,
  type DecantsAnalysis,
  type DecantProductStats,
} from "../../lib/decants-metrics";
import type { AdminOrder } from "../../services/admin";

interface DecantsSectionProps {
  orders: AdminOrder[];
  period?: { from: string | null; to: string | null };
  periodDays?: number | null;
  titleSuffix?: string;
}

export default function DecantsSection({
  orders,
  period,
  periodDays,
  titleSuffix = "",
}: DecantsSectionProps) {
  const [activeTab, setActiveTab] = useState<"orders" | "products" | "customers">("orders");
  const [search, setSearch] = useState("");

  const periodLabel =
    periodDays === 7
      ? "Últimos 7 días"
      : periodDays === 30
      ? "Últimos 30 días"
      : periodDays === 90
      ? "Últimos 90 días"
      : periodDays === null
      ? "Todo el historial"
      : period?.from && period?.to
      ? `Del ${period.from} al ${period.to}`
      : "Todo el historial";

  const analysis: DecantsAnalysis = useMemo(
    () => getDecantsAnalysis(orders, period),
    [orders, period]
  );

  // Filtrado de pedidos de decants por búsqueda
  const filteredDecantOrders = useMemo(() => {
    if (!search.trim()) return analysis.decantOrders;
    const q = search.toLowerCase();
    return analysis.decantOrders.filter(
      (o) =>
        o.orderId.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        (o.customerPhone && o.customerPhone.includes(q)) ||
        o.items.some((i) => i.productName.toLowerCase().includes(q))
    );
  }, [analysis.decantOrders, search]);

  // Filtrado de productos decants
  const filteredProducts = useMemo(() => {
    if (!search.trim()) return analysis.topMovedDecants;
    const q = search.toLowerCase();
    return analysis.topMovedDecants.filter((p) =>
      p.name.toLowerCase().includes(q)
    );
  }, [analysis.topMovedDecants, search]);

  // Filtrado de clientes de decants
  const filteredCustomers = useMemo(() => {
    if (!search.trim()) return analysis.topCustomers;
    const q = search.toLowerCase();
    return analysis.topCustomers.filter(
      (c) =>
        c.customerName.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        c.favoriteDecant.toLowerCase().includes(q)
    );
  }, [analysis.topCustomers, search]);

  // Máximo para las barras del gráfico de decants
  const maxDecantUnits = Math.max(
    ...analysis.topMovedDecants.map((p) => p.units),
    1
  );

  return (
    <section className="decants-section admin-card" aria-labelledby="decants-section-title">
      {/* Encabezado */}
      <div className="card-title decants-header">
        <div>
          <div className="decants-badge">
            <Sparkles size={14} />
            <span>Perfumería Fraccionada (10 ml) · {periodLabel}</span>
          </div>
          <h2 id="decants-section-title">Sección de Decants {titleSuffix}</h2>
          <span>
            Control de productos de 10 ml, rentabilidad y fidelidad de clientes
          </span>
        </div>
        <div className="decants-summary-pill">
          <strong>{analysis.decantsTotalUnits}</strong>
          <span>unidades vendidas</span>
        </div>
      </div>

      {/* 3 Tarjetas de Resumen Clave Solicitadas */}
      <div className="decants-highlight-grid">
        {/* 1. Decant Más Movido */}
        <div className="decant-highlight-card">
          <div className="decant-highlight-icon decant-icon--flame">
            <Flame size={20} />
          </div>
          <div className="decant-highlight-body">
            <span className="decant-highlight-subtitle">Decant más vendido</span>
            <strong className="decant-highlight-title">
              {analysis.mostMovedDecant?.name ?? "Sin ventas registradas"}
            </strong>
            {analysis.mostMovedDecant ? (
              <div className="decant-highlight-meta">
                <span>
                  <strong>{analysis.mostMovedDecant.units}</strong> unidades
                </span>
                <span>·</span>
                <span>{money(analysis.mostMovedDecant.revenue)}</span>
              </div>
            ) : (
              <span className="decant-empty-hint">Aún no hay decants vendidos</span>
            )}
          </div>
        </div>

        {/* 2. Decant Más Rentable */}
        <div className="decant-highlight-card">
          <div className="decant-highlight-icon decant-icon--profit">
            <TrendingUp size={20} />
          </div>
          <div className="decant-highlight-body">
            <span className="decant-highlight-subtitle">Mayor rentabilidad</span>
            <strong className="decant-highlight-title">
              {analysis.mostProfitableDecant?.name ?? "Sin costos registrados"}
            </strong>
            {analysis.mostProfitableDecant ? (
              <div className="decant-highlight-meta">
                <span className="decant-profit-amount">
                  + {money(analysis.mostProfitableDecant.profit)}
                </span>
                <span>·</span>
                <span>{analysis.mostProfitableDecant.marginPercent}% margen</span>
              </div>
            ) : (
              <span className="decant-empty-hint">Sin datos de margen</span>
            )}
          </div>
        </div>

        {/* 3. Cliente que más compró decants */}
        <div className="decant-highlight-card">
          <div className="decant-highlight-icon decant-icon--customer">
            <Award size={20} />
          </div>
          <div className="decant-highlight-body">
            <span className="decant-highlight-subtitle">Cliente #1 en Decants</span>
            <strong className="decant-highlight-title">
              {analysis.topCustomer?.customerName ?? "Ningún cliente aún"}
            </strong>
            {analysis.topCustomer ? (
              <div className="decant-highlight-meta">
                <span>
                  <strong>{analysis.topCustomer.units}</strong> decants
                </span>
                <span>·</span>
                <span>{money(analysis.topCustomer.spent)} invertidos</span>
              </div>
            ) : (
              <span className="decant-empty-hint">Sin compras registradas</span>
            )}
          </div>
        </div>
      </div>

      {/* Métricas Globales de Decants */}
      <div className="decants-metrics-bar">
        <div className="decant-metric-stat">
          <span>Ingresos Decants</span>
          <strong>{money(analysis.decantsTotalRevenue)}</strong>
        </div>
        <div className="decant-metric-divider" />
        <div className="decant-metric-stat">
          <span>Costo Decants</span>
          <strong>{money(analysis.decantsTotalCost)}</strong>
        </div>
        <div className="decant-metric-divider" />
        <div className="decant-metric-stat">
          <span>Utilidad Decants</span>
          <strong className="decant-profit-amount">
            {money(analysis.decantsTotalProfit)}
          </strong>
        </div>
        <div className="decant-metric-divider" />
        <div className="decant-metric-stat">
          <span>Margen Promedio</span>
          <strong>{analysis.decantsMarginPercent}%</strong>
        </div>
        <div className="decant-metric-divider" />
        <div className="decant-metric-stat">
          <span>Pedidos con Decants</span>
          <strong>{analysis.decantsOrderCount}</strong>
        </div>
      </div>

      {/* CUADRO DE ROTACIÓN DE DECANTS (10 ML) */}
      <div className="decants-chart-panel decants-chart-panel--single">
        <div className="decants-chart-header">
          <div>
            <h3>Rotación de Decants (10 ml)</h3>
            <span>Fracciones y muestras solicitadas en el período</span>
          </div>
          <div className="decant-chart-badge decant-chart-badge--gold" title={periodLabel}>
            <span>{analysis.decantsTotalUnits} {analysis.decantsTotalUnits === 1 ? "und" : "unds"}</span>
          </div>
        </div>
        {analysis.topMovedDecants.length === 0 ? (
          <p className="chart-empty-state">No hay pedidos con decants de 10 ml en el periodo.</p>
        ) : (
          <div className="decant-bars-list">
            {analysis.topMovedDecants.slice(0, 8).map((item) => (
              <div key={item.name} className="decant-bar-row">
                <div className="decant-bar-info">
                  <span className="decant-bar-name decant-bar-name--gold">
                    {item.name} (10 ml)
                  </span>
                  <span className="decant-bar-figures">
                    {money(item.revenue)} · {item.units} unds · {item.marginPercent}% margen
                  </span>
                </div>
                <div className="decant-bar-track">
                  <div
                    className="decant-bar-fill decant-fill--decant"
                    style={{
                      width: `${Math.max((item.units / maxDecantUnits) * 100, 3)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECCIÓN DE DECANTS COMO PEDIDOS / TABLAS */}
      <div className="decants-subtable-section">
        <div className="decants-subtable-toolbar">
          <div className="decants-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "orders"}
              className={`decants-tab-btn${activeTab === "orders" ? " active" : ""}`}
              onClick={() => setActiveTab("orders")}
            >
              <ReceiptText size={16} />
              <span>Pedidos de Decants ({analysis.decantOrders.length})</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "products"}
              className={`decants-tab-btn${activeTab === "products" ? " active" : ""}`}
              onClick={() => setActiveTab("products")}
            >
              <Package size={16} />
              <span>Ranking de Decants ({analysis.topMovedDecants.length})</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "customers"}
              className={`decants-tab-btn${activeTab === "customers" ? " active" : ""}`}
              onClick={() => setActiveTab("customers")}
            >
              <Users size={16} />
              <span>Clientes de Decants ({analysis.topCustomers.length})</span>
            </button>
          </div>

          <div className="decants-search-box">
            <Search size={15} />
            <input
              type="search"
              placeholder="Buscar en decants..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar en decants"
            />
          </div>
        </div>

        {/* TAB 1: LISTA DE PEDIDOS DE DECANTS ("COMO PEDIDOS") */}
        {activeTab === "orders" && (
          <div className="decants-table-wrapper">
            {filteredDecantOrders.length === 0 ? (
              <p className="chart-empty-state">No se encontraron pedidos de decants.</p>
            ) : (
              <table className="decants-table">
                <thead>
                  <tr>
                    <th>Pedido / Fecha</th>
                    <th>Cliente</th>
                    <th>Decants (10ml) en el pedido</th>
                    <th style={{ textAlign: "right" }}>Unidades</th>
                    <th style={{ textAlign: "right" }}>Total Decants</th>
                    <th style={{ textAlign: "right" }}>Utilidad</th>
                    <th style={{ textAlign: "center" }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDecantOrders.map((order) => (
                    <tr key={order.orderId}>
                      <td>
                        <strong>#{order.orderId.slice(0, 8)}</strong>
                        <div className="decants-cell-sub">{order.dateStr || "Sin fecha"}</div>
                      </td>
                      <td>
                        <strong>{order.customerName}</strong>
                        {order.customerPhone && (
                          <div className="decants-cell-sub">{order.customerPhone}</div>
                        )}
                      </td>
                      <td>
                        <div className="decants-order-items-list">
                          {order.items.map((it, idx) => (
                            <span key={idx} className="decant-item-tag">
                              {it.quantity}x {it.productName} (10ml)
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <strong>{order.decantUnits}</strong>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <strong>{money(order.decantRevenue)}</strong>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span className="decant-profit-amount">
                          +{money(order.decantProfit)}
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span
                          className={`decant-status-badge ${
                            order.paymentStatus === "paid" ? "is-paid" : "is-partial"
                          }`}
                        >
                          {order.paymentStatus === "paid" ? "Pagado" : "Pendiente/Abono"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 2: RANKING DE DECANTS */}
        {activeTab === "products" && (
          <div className="decants-table-wrapper">
            {filteredProducts.length === 0 ? (
              <p className="chart-empty-state">No se encontraron decants.</p>
            ) : (
              <table className="decants-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Perfume (10 ml)</th>
                    <th style={{ textAlign: "right" }}>Unidades Vendidas</th>
                    <th style={{ textAlign: "right" }}>Ingresos Totales</th>
                    <th style={{ textAlign: "right" }}>Costo Total</th>
                    <th style={{ textAlign: "right" }}>Utilidad Neta</th>
                    <th style={{ textAlign: "right" }}>Margen %</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p, idx) => (
                    <tr key={p.name}>
                      <td>
                        <span className="decant-rank-badge">#{idx + 1}</span>
                      </td>
                      <td>
                        <strong>{p.name}</strong>
                        <div className="decants-cell-sub">Presentación 10 ml</div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <strong>{p.units}</strong>
                      </td>
                      <td style={{ textAlign: "right" }}>{money(p.revenue)}</td>
                      <td style={{ textAlign: "right" }}>{money(p.cost)}</td>
                      <td style={{ textAlign: "right" }}>
                        <strong className="decant-profit-amount">
                          +{money(p.profit)}
                        </strong>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span className="decant-margin-pill">
                          {p.marginPercent}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 3: CLIENTES DE DECANTS */}
        {activeTab === "customers" && (
          <div className="decants-table-wrapper">
            {filteredCustomers.length === 0 ? (
              <p className="chart-empty-state">No se encontraron clientes de decants.</p>
            ) : (
              <table className="decants-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Cliente</th>
                    <th>Contacto</th>
                    <th>Decant Favorito</th>
                    <th style={{ textAlign: "right" }}>Decants Comprados</th>
                    <th style={{ textAlign: "right" }}>Pedidos Realizados</th>
                    <th style={{ textAlign: "right" }}>Total Invertido</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((c, idx) => (
                    <tr key={`${c.customerName}-${idx}`}>
                      <td>
                        <span className={`decant-rank-badge ${idx === 0 ? "decant-rank-first" : ""}`}>
                          {idx === 0 ? "👑 #1" : `#${idx + 1}`}
                        </span>
                      </td>
                      <td>
                        <strong>{c.customerName}</strong>
                      </td>
                      <td>
                        <span>{c.phone || c.email || "—"}</span>
                      </td>
                      <td>
                        <span className="decant-item-tag">{c.favoriteDecant}</span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <strong>{c.units}</strong>
                      </td>
                      <td style={{ textAlign: "right" }}>{c.orderCount}</td>
                      <td style={{ textAlign: "right" }}>
                        <strong>{money(c.spent)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
