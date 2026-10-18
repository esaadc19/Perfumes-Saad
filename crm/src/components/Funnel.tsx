import { formatMoney, percent } from "../services/dashboard";
import type { FunnelRow } from "../services/dashboard";
import EmptyState from "./EmptyState";

/**
 * Embudo por etapas, como en la referencia: una barra por etapa con el monto
 * encima, la cantidad al lado y dos columnas de apoyo —acumulado y
 * conversión hacia el siguiente paso— que son las que dicen en qué etapa se
 * están trabando los clientes.
 *
 * El cian se escala por opacidad: más Deals, más intenso.
 */
export default function Funnel({ rows }: { rows: FunnelRow[] }) {
  if (rows.length === 0 || rows.every((r) => r.count === 0)) {
    return (
      <EmptyState
        title="No se han encontrado datos"
        hint="El embudo se arma con los deals del Tablero. Todavía no hay ninguno."
      />
    );
  }

  const max = Math.max(...rows.map((r) => r.count), 1);
  let running = 0;
  const total = rows[0].count;

  return (
    <div className="crm-table-wrap">
      <table className="crm-table crm-funnel">
        <thead>
          <tr>
            <th>Etapa</th>
            <th>Deals</th>
            <th>Valor</th>
            <th>Acumulado</th>
            <th>Conversión al siguiente</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            running += row.count;
            // El mínimo se calcula acá y no en CSS: con `width: 0%` en línea
            // el `min-width` de la hoja no llega a ganar en todos los navegadores
            // y las etapas vacías quedan con el nombre cortado a una letra.
            const width = Math.max((row.count / max) * 100, 24);
            const depth = rows.length > 1 ? index / (rows.length - 1) : 0;
            return (
              <tr key={row.stage.id}>
                <td>
                  <span
                    className="crm-funnel__bar"
                    style={{ width: `${width}%`, background: "#00BCD4", opacity: 1 - depth * 0.75 }}
                  >
                    {row.stage.name}
                  </span>
                </td>
                <td>
                  <span>{row.count}</span>
                </td>
                <td>
                  <span>{formatMoney(row.amount)}</span>
                </td>
                <td>
                  <span>{total === 0 ? "0,0%" : percent((running / total) * 100)}</span>
                </td>
                <td>
                  <span>{row.stepConversion === null ? "—" : percent(row.stepConversion)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}