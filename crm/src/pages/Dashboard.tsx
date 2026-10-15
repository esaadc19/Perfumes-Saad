import { useState } from "react";
import MetricCard from "../components/MetricCard";
import EmptyState from "../components/EmptyState";
import Card from "../components/Card";

/**
 * Fase 1: el panel existe pero todavía no hay datos. Las cifras reales llegan
 * en la Fase 7, cuando estén `crm_deals`, `crm_conversations` y las métricas
 * de fiado.
 */
export default function Dashboard() {
  const [range, setRange] = useState("mes");

  const rangeFilter = {
    value: range,
    options: [
      { value: "hoy", label: "Hoy" },
      { value: "semana", label: "Esta semana" },
      { value: "mes", label: "Este mes" },
      { value: "todo", label: "Todo" },
    ],
    onChange: setRange,
  };

  const kind = "(Cambio de Estado)";

  return (
    <>
      <div className="crm-page-head">
        <div>
          <h1 className="crm-page-title">Panel</h1>
          <p className="crm-page-sub">
            Con menos de 100 conversaciones al mes el rango va en Hoy / Semana / Mes / Todo, sin selector
            de fechas.
          </p>
        </div>
      </div>

      <div className="crm-grid">
        <MetricCard
          title="Estado de oportunidad"
          kind={kind}
          filter={rangeFilter}
          value="—"
          caption="Llega en la Fase 7"
        />
        <MetricCard title="Ventas por etapa" kind={kind} filter={rangeFilter} value="—" caption="Llega en la Fase 7" />
        <MetricCard title="Tasa de conversión" kind={kind} filter={rangeFilter} value="—" caption="Llega en la Fase 7" />
        <MetricCard title="Fiado por cobrar" kind={kind} filter={rangeFilter} value="—" caption="Llega en la Fase 7" />
      </div>

      <div style={{ marginTop: 14 }}>
        <Card title="Embudo">
          <EmptyState
            title="No se han encontrado datos"
            hint="El embudo se arma con los deals del pipeline, disponible desde la Fase 4."
          />
        </Card>
      </div>
    </>
  );
}