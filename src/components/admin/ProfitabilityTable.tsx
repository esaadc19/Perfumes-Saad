import type { ProductProfitability } from "../../services/admin";

const money = (value: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);

/** Sin costo conocido no se puede afirmar una utilidad, asi que no se muestra. */
const profit = (value: number | null) => (value === null ? "Sin costo" : money(value));

export default function ProfitabilityTable({
  data,
}: {
  data: ProductProfitability | null;
}) {
  if (!data) return null;

  const { products, totals } = data;
  const rows = [...products].sort((a, b) => {
    // Primero los que dejan mas, ignorando los que no tienen costo: esos
    // no se pueden comparar con nadie.
    const pa = a.utilidad ?? -1;
    const pb = b.utilidad ?? -1;
    if (pa !== pb) return pb - pa;
    return b.unidades - a.unidades;
  });

  return (
    <div className="profitability">
      <div className={`profitability-totals${totals.complete ? "" : " is-incomplete"}`}>
        <div>
          <span>Ventas del periodo</span>
          <strong>{money(totals.sales)}</strong>
        </div>
        <div>
          <span>Costo de productos</span>
          <strong>{money(totals.cost)}</strong>
        </div>
        <div>
          <span>Utilidad bruta</span>
          <strong>
            {totals.complete ? money(totals.profit) : "Incompleta"}
            {totals.complete && totals.margin_percent !== null && (
              <em> · margen {totals.margin_percent}%</em>
            )}
          </strong>
        </div>
      </div>

      {!totals.complete && (
        <p className="collect-warning" role="status">
          {totals.missing_cost_items} unidades vendidas no tienen costo registrado. La
          utilidad se calcula solo con las que sí lo tienen, así que el total no
          incluye esas ventas.
        </p>
      )}

      <div className="admin-table profitability-table">
        <div className="table-row profit-row header">
          <span>Producto</span>
          <span>Unidades</span>
          <span>Ventas</span>
          <span>Costo</span>
          <span>Utilidad</span>
          <span>Por unidad</span>
        </div>
        {rows.map((row) => (
          <div className="table-row profit-row" key={`${row.nombre}-${row.size_ml}`}>
            <span className="profit-name">
              {row.nombre}
              <small>{row.size_ml} ml</small>
            </span>
            <span>{row.unidades}</span>
            <span>{money(row.ventas)}</span>
            <span>{money(row.costo)}</span>
            <span className={row.utilidad === null ? "profit-unknown" : row.utilidad > 0 ? "profit-good" : "profit-loss"}>
              {profit(row.utilidad)}
            </span>
            <span>
              {row.utilidad === null || row.unidades === 0
                ? "—"
                : money(row.utilidad / row.unidades)}
            </span>
          </div>
        ))}
      </div>

      <p className="report-hint">
        Ordenado por utilidad, no por unidades: un perfume que se vende poco puede
        dejar más que uno que se vende mucho.
      </p>
    </div>
  );
}