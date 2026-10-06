import { useRef, useState } from "react";
import type { AdminOrder, AdminDashboardMetrics } from "../../services/admin";

type PeriodDays = 7 | 30 | 90;

type DailySales = {
  date: string;
  revenue: number;
  orders: number;
  units: number;
};

const BOGOTA_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const FULL_DATE = new Intl.DateTimeFormat("es-CO", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const SHORT_DATE = new Intl.DateTimeFormat("es-CO", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});

const FULL_CURRENCY = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const AXIS_CURRENCY = new Intl.NumberFormat("es-CO", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function money(value: number) {
  return FULL_CURRENCY.format(value);
}

function dateKey(date: Date) {
  const { year, month, day } = Object.fromEntries(
    BOGOTA_DATE.formatToParts(date).map(({ type, value }) => [type, value])
  );
  return `${year}-${month}-${day}`;
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function buildDailySales(orders: AdminOrder[], days: PeriodDays) {
  const todayKey = dateKey(new Date());
  const [year, month, day] = todayKey.split("-").map(Number);
  const todayUtc = Date.UTC(year, month - 1, day);
  const startUtc = todayUtc - (days - 1) * 24 * 60 * 60 * 1000;
  const salesByDate = new Map<string, DailySales>();

  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(startUtc + offset * 24 * 60 * 60 * 1000);
    const key = date.toISOString().slice(0, 10);
    salesByDate.set(key, { date: key, revenue: 0, orders: 0, units: 0 });
  }

  let missingPaymentDates = 0;
  for (const order of orders) {
    if (order.payment_status !== "paid") continue;
    if (!order.paid_at) {
      missingPaymentDates += 1;
      continue;
    }

    const key = dateKey(new Date(order.paid_at));
    const daySales = salesByDate.get(key);
    if (!daySales) continue;

    daySales.revenue += Number(order.total);
    daySales.orders += 1;
    daySales.units += order.order_items.reduce((sum, item) => sum + item.quantity, 0);
  }

  return {
    days: [...salesByDate.values()],
    missingPaymentDates,
    hasSales: [...salesByDate.values()].some((daySales) => daySales.orders > 0),
  };
}

export function SalesTrendChart({ orders }: { orders: AdminOrder[] }) {
  const [period, setPeriod] = useState<PeriodDays>(30);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const pointRefs = useRef<(SVGCircleElement | null)[]>([]);
  const sales = buildDailySales(orders, period);

  const width = 840;
  const height = 300;
  const left = 72;
  const right = 22;
  const top = 20;
  const bottom = 238;
  const plotWidth = width - left - right;
  const plotHeight = bottom - top;
  const maxRevenue = Math.max(...sales.days.map((daySales) => daySales.revenue), 0);
  const scaleMax = maxRevenue === 0 ? 1 : maxRevenue * 1.15;
  const xFor = (index: number) => left + (sales.days.length === 1
    ? plotWidth / 2
    : (index / (sales.days.length - 1)) * plotWidth);
  const yFor = (revenue: number) => bottom - (revenue / scaleMax) * plotHeight;
  const linePath = sales.days.map((daySales, index) =>
    `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(daySales.revenue)}`
  ).join(" ");
  const areaPath = `${linePath} L ${xFor(sales.days.length - 1)} ${bottom} L ${xFor(0)} ${bottom} Z`;
  const activePoint = activeIndex === null ? null : sales.days[activeIndex] ?? null;
  const activeX = activeIndex === null ? left : xFor(activeIndex);
  const activeY = activePoint ? yFor(activePoint.revenue) : top;
  const tooltipWidth = 230;
  const tooltipHeight = 112;
  const tooltipX = Math.max(left, Math.min(activeX - tooltipWidth / 2, width - right - tooltipWidth));
  const tooltipY = activeY < top + 130
    ? Math.min(bottom - tooltipHeight, activeY + 16)
    : Math.max(top + 8, activeY - tooltipHeight - 16);
  const yTicks = [0, 1, 2, 3, 4];
  const xTickIndexes = Array.from(new Set(
    [0, Math.round((sales.days.length - 1) / 4), Math.round((sales.days.length - 1) / 2),
      Math.round(((sales.days.length - 1) * 3) / 4), sales.days.length - 1]
  ));

  return (
    <section className="admin-card dashboard-chart-card" aria-labelledby="sales-chart-title">
      <div className="card-title">
        <div>
          <h2 id="sales-chart-title">Ventas pagadas</h2>
          <span>Por fecha real de pago · hora de Colombia</span>
        </div>
        <div className="chart-period-switch" aria-label="Periodo del gráfico">
          {([7, 30, 90] as const).map((days) => (
            <button
              key={days}
              type="button"
              aria-pressed={period === days}
              className={period === days ? "selected" : ""}
              onClick={() => {
                setPeriod(days);
                setActiveIndex(null);
              }}
            >
              {days} días
            </button>
          ))}
        </div>
      </div>
      {!sales.hasSales ? (
        <p className="chart-empty-state">
          No hay ventas pagadas en los últimos {period} días para mostrar.
        </p>
      ) : (
        <>
          <p className="chart-interaction-hint">Pasa el cursor o enfoca un punto para ver el detalle. En móvil, tócalo.</p>
          <div className="sales-chart-scroll">
            <svg
              className="sales-chart"
              viewBox={`0 0 ${width} ${height}`}
              role="group"
              aria-labelledby="sales-chart-title"
              aria-describedby="sales-chart-description"
            >
              <desc id="sales-chart-description">
                Gráfico de ventas pagadas por día para los últimos {period} días. Cada punto se puede enfocar para consultar su fecha, valor vendido, pedidos y unidades.
              </desc>
              <defs>
                <linearGradient id="sales-area-gradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#a56f50" stopOpacity=".22" />
                  <stop offset="100%" stopColor="#a56f50" stopOpacity=".015" />
                </linearGradient>
              </defs>
              {yTicks.map((tick) => {
                const y = top + (tick / 4) * plotHeight;
                const amount = scaleMax * (1 - tick / 4);
                return (
                  <g key={tick} className="chart-grid-line">
                    <line x1={left} x2={width - right} y1={y} y2={y} />
                    <text x={left - 10} y={y + 4} textAnchor="end">{AXIS_CURRENCY.format(amount)}</text>
                  </g>
                );
              })}
              <path className="sales-chart-area" d={areaPath} />
              <path className="sales-chart-line" d={linePath} />
              {sales.days.map((daySales, index) => {
                const dateLabel = FULL_DATE.format(dateFromKey(daySales.date));
                return (
                  <circle
                    key={daySales.date}
                    ref={(element) => { pointRefs.current[index] = element; }}
                    className={`sales-chart-point${activeIndex === index ? " is-active" : ""}`}
                    cx={xFor(index)}
                    cy={yFor(daySales.revenue)}
                    r={activeIndex === index ? 7 : 5}
                    tabIndex={0}
                    role="button"
                    aria-label={`${dateLabel}: ${money(daySales.revenue)}, ${daySales.orders} pedidos pagados, ${daySales.units} unidades`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseLeave={(event) => {
                      if (document.activeElement !== event.currentTarget) setActiveIndex(null);
                    }}
                    onFocus={() => setActiveIndex(index)}
                    onBlur={() => setActiveIndex(null)}
                    onClick={() => setActiveIndex(index)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                        event.preventDefault();
                        const nextIndex = Math.max(0, Math.min(
                          sales.days.length - 1,
                          index + (event.key === "ArrowRight" ? 1 : -1)
                        ));
                        pointRefs.current[nextIndex]?.focus();
                      } else if (event.key === "Escape") {
                        setActiveIndex(null);
                      }
                    }}
                  />
                );
              })}
              {xTickIndexes.map((index) => (
                <text
                  key={index}
                  className="chart-x-label"
                  x={xFor(index)}
                  y={bottom + 25}
                  textAnchor={index === 0 ? "start" : index === sales.days.length - 1 ? "end" : "middle"}
                >
                  {SHORT_DATE.format(dateFromKey(sales.days[index].date))}
                </text>
              ))}
              {activePoint && (
                <g className="sales-chart-tooltip" aria-hidden="true">
                  <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx="8" />
                  <text className="chart-tooltip-title" x={tooltipX + 12} y={tooltipY + 21}>
                    {FULL_DATE.format(dateFromKey(activePoint.date))}
                  </text>
                  <text className="chart-tooltip-label" x={tooltipX + 12} y={tooltipY + 46}>Vendido</text>
                  <text className="chart-tooltip-value" x={tooltipX + tooltipWidth - 12} y={tooltipY + 46} textAnchor="end">{money(activePoint.revenue)}</text>
                  <text className="chart-tooltip-label" x={tooltipX + 12} y={tooltipY + 69}>Pedidos pagados</text>
                  <text className="chart-tooltip-value" x={tooltipX + tooltipWidth - 12} y={tooltipY + 69} textAnchor="end">{activePoint.orders}</text>
                  <text className="chart-tooltip-label" x={tooltipX + 12} y={tooltipY + 92}>Unidades</text>
                  <text className="chart-tooltip-value" x={tooltipX + tooltipWidth - 12} y={tooltipY + 92} textAnchor="end">{activePoint.units}</text>
                </g>
              )}
            </svg>
          </div>
          {sales.missingPaymentDates > 0 && (
            <p className="chart-data-note" role="status">
              {sales.missingPaymentDates} pedido(s) pagado(s) sin fecha de pago no aparecen en este gráfico.
            </p>
          )}
        </>
      )}
    </section>
  );
}

type TopProduct = AdminDashboardMetrics["top_products"][number];

export function TopProductsChart({ products }: { products: TopProduct[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const maxUnits = Math.max(...products.map((product) => product.units), 1);
  const activeProduct = activeIndex === null ? null : products[activeIndex] ?? null;

  return (
    <section className="admin-card top-products-chart-card" aria-labelledby="top-products-chart-title">
      <div className="card-title">
        <div>
          <h2 id="top-products-chart-title">Perfumes más solicitados</h2>
          <span>Unidades incluidas en pedidos pagados</span>
        </div>
      </div>
      {products.length === 0 ? (
        <p className="chart-empty-state">Aún no hay pedidos registrados para generar este gráfico.</p>
      ) : (
        <>
          <p className="chart-interaction-hint">Pasa el cursor o enfoca una barra para ver los datos.</p>
          <div className="top-products-chart" role="group" aria-labelledby="top-products-chart-title">
            {products.map((product, index) => (
              <button
                key={`${product.name}-${product.size_ml}`}
                type="button"
                className={`top-product-bar${activeIndex === index ? " is-active" : ""}`}
                aria-label={`${product.name}, ${product.size_ml} mililitros, ${product.units} unidades en pedidos pagados`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={(event) => {
                  if (document.activeElement !== event.currentTarget) setActiveIndex(null);
                }}
                onFocus={() => setActiveIndex(index)}
                onBlur={() => setActiveIndex(null)}
                onClick={() => setActiveIndex(index)}
              >
                <span className="top-product-bar-label">{product.name} · {product.size_ml} ml</span>
                <span className="top-product-bar-track" aria-hidden="true">
                  <span style={{ width: `${Math.max((product.units / maxUnits) * 100, 2)}%` }} />
                </span>
                <strong>{product.units}</strong>
              </button>
            ))}
            {activeProduct && (
              <div className="top-product-tooltip" role="status">
                <strong>{activeProduct.name} · {activeProduct.size_ml} ml</strong>
                <span>{activeProduct.units} unidades · Ingreso: {money(Number(activeProduct.revenue))}</span>
                <span>Costo: {activeProduct.cost === null ? "Falta costo" : money(Number(activeProduct.cost))}</span>
                <span>Margen de producto: {activeProduct.profit === null ? "Incompleto" : money(Number(activeProduct.profit))}</span>
              </div>
            )}
          </div>
          <details className="chart-data-details">
            <summary>Ver datos detallados</summary>
            <div className="admin-table">
              <div className="table-row top-product-row header">
                <span>Perfume</span><span>Presentación</span><span>Unidades</span>
                <span>Ingreso</span><span>Costo</span><span>Margen producto</span>
              </div>
              {products.map((product) => (
                <div className="table-row top-product-row" key={`${product.name}-${product.size_ml}`}>
                  <strong>{product.name}</strong>
                  <span>{product.size_ml} ml</span>
                  <span>{product.units}</span>
                  <span>{money(Number(product.revenue))}</span>
                  <span>{product.cost === null ? "Falta costo" : money(Number(product.cost))}</span>
                  <span>{product.profit === null ? "Incompleta" : money(Number(product.profit))}</span>
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </section>
  );
}
