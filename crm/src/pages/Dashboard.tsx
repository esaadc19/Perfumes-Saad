import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, MessageCircle, PackageCheck, Timer } from "lucide-react";
import Card from "../components/Card";
import MetricCard from "../components/MetricCard";
import Donut from "../components/Donut";
import Funnel from "../components/Funnel";
import EmptyState from "../components/EmptyState";
import Badge from "../components/Badge";
import { formatMoney, loadDashboard, percent } from "../services/dashboard";
import type { DashboardData, Range } from "../services/dashboard";

const RANGES: { id: Range; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "semana", label: "Esta semana" },
  { id: "mes", label: "Este mes" },
  { id: "todo", label: "Todo" },
];

/**
 * Panel del CRM.
 *
 * Mitad Deal (embudo, conversión, valores) y mitad tienda (ventas, utilidad,
 * cartera), porque las dos cosas se miran el mismo lunes por la mañana. Las
 * cifras de la tienda salen de `admin_dashboard_metrics`, la función que ya
 * usa el admin de Perfumes SAAD: no se reimplementa la contabilidad.
 */
export default function Dashboard() {
  const [range, setRange] = useState<Range>("mes");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await loadDashboard(range));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el panel.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const filter = {
    value: range,
    options: RANGES.map((r) => ({ value: r.id, label: r.label })),
    onChange: (value: string) => setRange(value as Range),
  };

  if (loading) {
    return (
      <Card title="Panel">
        <p role="status" style={{ color: "var(--crm-text-soft)" }}>
          Cargando...
        </p>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card title="Panel">
        <EmptyState title="No se pudo cargar el panel" hint={error ?? undefined} />
      </Card>
    );
  }

  const totalDecided = data.wonDeals + data.lostDeals;
  const hasDeals = data.funnel.some((r) => r.count > 0);

  return (
    <>
      <div className="crm-page-head">
        <div>
          <h1 className="crm-page-title">Panel</h1>
          <p className="crm-page-sub">
            Menos de 100 conversaciones al mes: el rango va de Hoy a Todo, sin selector de fechas.
          </p>
        </div>
      </div>

      <div className="crm-grid">
        <MetricCard
          title="Estado de oportunidad"
          kind="(Cambio de Estado)"
          filter={filter}
          value={data.openDeals}
          caption={`${formatMoney(data.openAmount)} en juego`}
        >
          <Donut
            total={data.openDeals + data.wonDeals + data.lostDeals}
            centerLabel={String(data.openDeals + data.wonDeals + data.lostDeals)}
            centerCaption="deals"
            segments={[
              { label: "En curso", value: data.openDeals, weight: 0.15 },
              { label: "Ganados", value: data.wonDeals, weight: 1 },
              { label: "Perdidos", value: data.lostDeals, weight: 0.45 },
            ]}
          />
        </MetricCard>

        <MetricCard
          title="Tasa de conversión"
          kind="(Cambio de Estado)"
          filter={filter}
          value={percent(data.conversionRate)}
          caption={`${data.wonDeals} ganados de ${totalDecided} decididos`}
        >
          <Donut
            total={totalDecided}
            centerLabel={percent(data.conversionRate)}
            centerCaption="de lo decidido"
            segments={[
              { label: "Ganados", value: data.wonDeals, weight: 1 },
              { label: "Perdidos", value: data.lostDeals, weight: 0.45 },
            ]}
          />
        </MetricCard>

        <MetricCard
          title="Ventas cobradas"
          kind="Tienda"
          filter={filter}
          value={data.store ? formatMoney(data.store.salesRevenue) : "—"}
          caption={
            data.store
              ? `Utilidad: ${formatMoney(data.store.salesProfit)}`
              : "Solo el administrador ve las cifras de la tienda."
          }
        />
      </div>

      <div className="crm-grid" style={{ marginTop: 14 }}>
        <MetricCard
          title="Fiado por cobrar"
          kind="Tienda · instantánea"
          filter={filter}
          value={data.store ? formatMoney(data.store.creditOutstanding) : "—"}
          caption={
            data.storeError
              ? "Las cifras de la tienda necesitan rol de administrador."
              : "No depende del periodo: es lo que te deben ahora."
          }
        />

        <Card
          title="Para atender hoy"
          caption="Lo que se te está yendo de las manos"
          actions={
            data.stuckDeals > 0 ? (
              <Badge tone="danger">
                <AlertTriangle size={12} /> {data.stuckDeals} parados
              </Badge>
            ) : null
          }
        >
          <ul className="crm-todo-list">
            <li>
              <MessageCircle size={15} />
              <span>
                <strong>{data.unanswered}</strong> conversaciones esperando respuesta
              </span>
              <span className="crm-todo-list__aside">de {data.openConversations} abiertas</span>
            </li>
            <li>
              <Timer size={15} />
              <span>
                <strong>{data.tasksToday}</strong> tareas para hoy
              </span>
              <span className="crm-todo-list__aside">
                {data.tasksOverdue > 0 ? `${data.tasksOverdue} vencidas` : "ninguna vencida"}
              </span>
            </li>
            <li>
              <PackageCheck size={15} />
              <span>
                <strong>{data.stuckDeals}</strong> deals sin cerrar hace 3+ días
              </span>
              <span className="crm-todo-list__aside">sin ganada ni perdida</span>
            </li>
          </ul>
        </Card>
      </div>

      <div style={{ marginTop: 14 }}>
        <Card title="Embudo" caption="Dónde se traban los clientes">
          <Funnel rows={data.funnel} />
        </Card>
      </div>

      {!hasDeals && (
        <p style={{ marginTop: 12, fontSize: 12.5, color: "var(--crm-text-soft)" }}>
          Todavía no hay deals. Creá uno desde el <strong>Tablero</strong> y estas cifras se mueven.
        </p>
      )}
    </>
  );
}