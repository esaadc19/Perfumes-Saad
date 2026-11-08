import { useMemo, useState } from "react";
import {
  Award,
  Crown,
  DollarSign,
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
  getFullBottlesAnalysis,
  type FullBottlesAnalysis,
} from "../../lib/full-bottles-metrics";
import type { AdminOrder } from "../../services/admin";

interface FullBottlesSectionProps {
  orders: AdminOrder[];
  period?: { from: string | null; to: string | null };
  periodDays?: number | null;
  titleSuffix?: string;
}

export default function FullBottlesSection({
  orders,
  period,
  periodDays,
  titleSuffix = "",
}: FullBottlesSectionProps) {
  const [activeTab, setActiveTab] = useState<"products" | "orders" | "customers">("products");
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

  const analysis: FullBottlesAnalysis = useMemo(
    () => getFullBottlesAnalysis(orders, period),
    [orders, period]
  );

  // Filtrado de productos por búsqueda
  const filteredProducts = useMemo(() => {
    if (!search.trim()) return analysis.topProducts;
    const q = search.toLowerCase();
    return analysis.topProducts.filter((p) =>
      p.name.toLowerCase().includes(q)
    );
  }, [analysis.topProducts, search]);

  // Filtrado de pedidos
  const filteredOrders = useMemo(() => {
    if (!search.trim()) return analysis.orders;
    const q = search.toLowerCase();
    return analysis.orders.filter(
      (o) =>
        o.orderId.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        (o.customerPhone && o.customerPhone.includes(q)) ||
        o.items.some((i) => i.productName.toLowerCase().includes(q))
    );
  }, [analysis.orders, search]);

  // Filtrado de clientes
  const filteredCustomers = useMemo(() => {
    if (!search.trim()) return analysis.topCustomers;
    const q = search.toLowerCase();
    return analysis.topCustomers.filter(
      (c) =>
        c.customerName.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        c.favoriteProduct.toLowerCase().includes(q)
    );
  }, [analysis.topCustomers, search]);

  const maxUnits = Math.max(...analysis.topProducts.map((p) => p.units), 1);

  return (
    <section className="full-bottles-section admin-card" aria-labelledby="full-bottles-title">
      {/* Encabezado */}
      <div className="card-title full-bottles-header">
        <div>
          <div className="full-bottles-badge">
            <Package size={14} />
            <span>Perfumería Completa (Frascos &gt; 10 ml) · {periodLabel}</span>
          </div>
          <h2 id="full-bottles-title">Perfumes Completos {titleSuffix}</h2>
          <span>
            Control exclusivo de botellas cerradas (30ml, 50ml, 100ml, 200ml), rentabilidad y rotación
          </span>
        </div>
        <div className="full-bottles-summary-pill">
          <strong>{analysis.totalUnits}</strong>
          <span>frascos vendidos</span>
        </div>
      </div>

      {/* 3 Tarjetas de Resumen Clave */}
      <div className="full-bottles-highlight-grid">
        {/* 1. Frasco Más Vendido */}
        <div className="full-bottle-card">
          <div className="full-bottle-icon full-bottle-icon--crown">
            <Crown size={20} />
          </div>
          <div className="full-bottle-body">
            <span className="full-bottle-subtitle">Perfume entero más vendido</span>
            <strong className="full-bottle-title">
              {analysis.mostSoldProduct ? `${analysis.mostSoldProduct.name} (${analysis.mostSoldProduct.size_ml} ml)` : "Sin ventas registradas"}
            </strong>
            {analysis.mostSoldProduct ? (
              <div className="full-bottle-meta">
                <span>
                  <strong>{analysis.mostSoldProduct.units}</strong> frascos
                </span>
                <span>·</span>
                <span>{money(analysis.mostSoldProduct.revenue)}</span>
              </div>
            ) : (
              <span className="full-bottle-empty-hint">Aún no hay frascos enteros vendidos</span>
            )}
          </div>
        </div>

        {/* 2. Mayor Rentabilidad */}
        <div className="full-bottle-card">
          <div className="full-bottle-icon full-bottle-icon--profit">
            <TrendingUp size={20} />
          </div>
          <div className="full-bottle-body">
            <span className="full-bottle-subtitle">Mayor utilidad en frascos</span>
            <strong className="full-bottle-title">
              {analysis.mostProfitableProduct ? `${analysis.mostProfitableProduct.name} (${analysis.mostProfitableProduct.size_ml} ml)` : "Sin costos registrados"}
            </strong>
            {analysis.mostProfitableProduct ? (
              <div className="full-bottle-meta">
                <span className="full-bottle-profit-amount">
                  + {money(analysis.mostProfitableProduct.profit)}
                </span>
                <span>·</span>
                <span>{analysis.mostProfitableProduct.marginPercent}% margen</span>
              </div>
            ) : (
              <span className="full-bottle-empty-hint">Sin datos de margen</span>
            )}
          </div>
        </div>

        {/* 3. Cliente Top en Frascos */}
        <div className="full-bottle-card">
          <div className="full-bottle-icon full-bottle-icon--customer">
            <Award size={20} />
          </div>
          <div className="full-bottle-body">
            <span className="full-bottle-subtitle">Cliente #1 en Perfumes Enteros</span>
            <strong className="full-bottle-title">
              {analysis.topCustomer?.customerName ?? "Ningún cliente aún"}
            </strong>
            {analysis.topCustomer ? (
              <div className="full-bottle-meta">
                <span>
                  <strong>{analysis.topCustomer.units}</strong> botellas
                </span>
                <span>·</span>
                <span>{money(analysis.topCustomer.spent)} invertidos</span>
              </div>
            ) : (
              <span className="full-bottle-empty-hint">Sin compras registradas</span>
            )}
          </div>
        </div>
      </div>

      {/* Métricas Globales de Frascos Completos */}
      <div className="full-bottles-metrics-bar">
        <div className="full-bottle-metric-stat">
          <span>Ingresos Frascos Enteros</span>
          <strong>{money(analysis.totalRevenue)}</strong>
        </div>
        <div className="full-bottle-metric-divider" />
        <div className="full-bottle-metric-stat">
          <span>Costo Mayorista</span>
          <strong>{money(analysis.totalCost)}</strong>
        </div>
        <div className="full-bottle-metric-divider" />
        <div className="full-bottle-metric-stat">
          <span>Utilidad Frascos</span>
          <strong className="full-bottle-profit-amount">
            {money(analysis.totalProfit)}
          </strong>
        </div>
        <div className="full-bottle-metric-divider" />
        <div className="full-bottle-metric-stat">
          <span>Margen Promedio</span>
          <strong>{analysis.marginPercent}%</strong>
        </div>
        <div className="full-bottle-metric-divider" />
        <div className="full-bottle-metric-stat">
          <span>Pedidos con Frascos</span>
          <strong>{analysis.orderCount}</strong>
        </div>
      </div>

      {/* Ranking Visual con Barras de Progreso */}
      <div className="full-bottles-ranking-panel">
        <div className="full-bottles-ranking-header">
          <div>
            <h3>Rotación de Perfumes Completos</h3>
            <span>Frascos estándar ordenados por volumen de venta</span>
          </div>
          <div className="full-bottle-ranking-badge">
            <span>{periodLabel}: {analysis.totalUnits} botellas</span>
          </div>
        </div>

        {analysis.topProducts.length === 0 ? (
          <p className="chart-empty-state">No hay ventas de perfumes enteros en este periodo.</p>
        ) : (
          <div className="full-bottle-bars-list">
            {analysis.topProducts.slice(0, 8).map((item) => (
              <div key={`${item.name}-${item.size_ml}`} className="full-bottle-bar-row">
                <div className="full-bottle-bar-info">
                  <span className="full-bottle-bar-name">
                    <strong>{item.name}</strong> ({item.size_ml} ml)
                  </span>
                  <span className="full-bottle-bar-figures">
                    <strong>{money(item.revenue)}</strong> · {item.units} {item.units === 1 ? "und" : "unds"} · {item.marginPercent}% mg
                  </span>
                </div>
                <div className="full-bottle-bar-track">
                  <div
                    className="full-bottle-bar-fill"
                    style={{
                      width: `${Math.max((item.units / maxUnits) * 100, 4)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pestañas Interactivas (Ranking completo, Pedidos y Clientes) */}
      <div className="full-bottles-subtable-section">
        <div className="full-bottles-subtable-toolbar">
          <div className="full-bottles-tabs">
            <button
              type="button"
              className={`full-bottles-tab-btn ${activeTab === "products" ? "is-active" : ""}`}
              onClick={() => setActiveTab("products")}
            >
              <Package size={15} />
              <span>Todos los perfumes ({analysis.topProducts.length})</span>
            </button>
            <button
              type="button"
              className={`full-bottles-tab-btn ${activeTab === "orders" ? "is-active" : ""}`}
              onClick={() => setActiveTab("orders")}
            >
              <ReceiptText size={15} />
              <span>Pedidos de frascos ({analysis.orders.length})</span>
            </button>
            <button
              type="button"
              className={`full-bottles-tab-btn ${activeTab === "customers" ? "is-active" : ""}`}
              onClick={() => setActiveTab("customers")}
            >
              <Users size={15} />
              <span>Clientes ({analysis.topCustomers.length})</span>
            </button>
          </div>

          <div className="full-bottles-search-box">
            <Search size={14} />
            <input
              type="text"
              placeholder={
                activeTab === "products"
                  ? "Buscar perfume entero…"
                  : activeTab === "orders"
                  ? "Buscar pedido o cliente…"
                  : "Buscar cliente…"
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* TAB 1: PRODUCTOS / RANKING */}
        {activeTab === "products" && (
          <div className="full-bottles-table-wrapper">
            <table className="full-bottles-table">
              <thead>
                <tr>
                  <th>Perfume</th>
                  <th>Presentación</th>
                  <th>Unidades</th>
                  <th>Ingresos</th>
                  <th>Costo Mayorista</th>
                  <th>Utilidad</th>
                  <th>Margen</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="table-empty">
                      No se encontraron perfumes completos con ese término.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => (
                    <tr key={`${p.name}-${p.size_ml}`}>
                      <td>
                        <strong>{p.name}</strong>
                      </td>
                      <td>
                        <span className="full-bottle-size-pill">{p.size_ml} ml</span>
                      </td>
                      <td>
                        <strong>{p.units}</strong> unds
                      </td>
                      <td>{money(p.revenue)}</td>
                      <td>{p.cost > 0 ? money(p.cost) : "—"}</td>
                      <td className="full-bottle-profit-amount">
                        {p.profit > 0 ? `+ ${money(p.profit)}` : "—"}
                      </td>
                      <td>
                        <span
                          className={`full-bottle-margin-badge ${
                            p.marginPercent >= 35
                              ? "margin--high"
                              : p.marginPercent >= 20
                              ? "margin--mid"
                              : "margin--low"
                          }`}
                        >
                          {p.marginPercent}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 2: PEDIDOS */}
        {activeTab === "orders" && (
          <div className="full-bottles-table-wrapper">
            <table className="full-bottles-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Botellas</th>
                  <th>Ingreso Frascos</th>
                  <th>Utilidad</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="table-empty">
                      No se encontraron pedidos de frascos con ese término.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((o) => (
                    <tr key={o.orderId}>
                      <td>{o.dateStr}</td>
                      <td>
                        <code>#{o.orderId.slice(0, 8)}</code>
                      </td>
                      <td>
                        <strong>{o.customerName}</strong>
                        {o.customerPhone && (
                          <small className="full-bottle-subtext">{o.customerPhone}</small>
                        )}
                      </td>
                      <td>
                        <strong>{o.bottleUnits}</strong>
                        <div className="full-bottle-items-summary">
                          {o.items.map((i, idx) => (
                            <span key={idx}>
                              {i.quantity}x {i.productName} ({i.size_ml}ml)
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>{money(o.bottleRevenue)}</td>
                      <td className="full-bottle-profit-amount">
                        {o.bottleProfit > 0 ? `+ ${money(o.bottleProfit)}` : "—"}
                      </td>
                      <td>
                        <span className={`full-bottle-status-pill status--${o.paymentStatus}`}>
                          {o.paymentStatus === "paid"
                            ? "Pagado"
                            : o.paymentStatus === "credit"
                            ? "Crédito"
                            : o.paymentStatus === "partial"
                            ? "Abono parcial"
                            : "Pendiente"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 3: CLIENTES */}
        {activeTab === "customers" && (
          <div className="full-bottles-table-wrapper">
            <table className="full-bottles-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Contacto</th>
                  <th>Frascos Comprados</th>
                  <th>Total Invertido</th>
                  <th>Perfume Preferido</th>
                  <th>Pedidos</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="table-empty">
                      No se encontraron clientes con ese término.
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((c, idx) => (
                    <tr key={idx}>
                      <td>
                        <strong>{c.customerName}</strong>
                      </td>
                      <td>
                        <span>{c.phone || c.email || "—"}</span>
                      </td>
                      <td>
                        <strong>{c.units}</strong> botellas
                      </td>
                      <td>
                        <strong>{money(c.spent)}</strong>
                      </td>
                      <td>
                        <span className="full-bottle-fav-pill">{c.favoriteProduct}</span>
                      </td>
                      <td>{c.orderCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
