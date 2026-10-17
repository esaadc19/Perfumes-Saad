import { useState } from "react";
import { Package, X, History } from "lucide-react";
import {
  registerStockMovement,
  getVariantMovements,
  STOCK_MOVEMENTS,
  type StockMovementType,
  type VariantMovement,
} from "../../services/credits";
import AdminButton from "./AdminButton";

const money = (value: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);

const MOVEMENT_LABEL: Record<string, string> = {
  sale: "Venta",
  adjustment_in: "Ajuste manual",
  adjustment_out: "Ajuste manual",
  merma: "Merma",
  ingreso: "Ingreso",
  devolucion_proveedor: "Devolucion al proveedor",
  rotura: "Rotura",
  robo: "Robo",
  vencimiento: "Vencimiento",
};

/**
 * Registrar por que bajo el stock.
 *
 * Escribir el numero de stock a mano funciona pero borra el motivo: al mes
 * siguiente el stock no cuadra y no hay forma de saber si fue una caja
 * mojada o un robo. Este modal deja el motivo escrito.
 */
export default function MovementModal({
  variantId,
  productName,
  sizeMl,
  currentStock,
  onClose,
  onSaved,
}: {
  variantId: string;
  productName: string;
  sizeMl: number;
  currentStock: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<StockMovementType>("merma");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [history, setHistory] = useState<VariantMovement[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const selected = STOCK_MOVEMENTS.find((m) => m.value === type);
  const parsed = Number(quantity);
  const isValid = Number.isInteger(parsed) && parsed > 0;
  const projected = selected?.adds
    ? currentStock + (isValid ? parsed : 0)
    : currentStock - (isValid ? parsed : 0);

  const handleSave = async () => {
    if (!isValid) {
      setError("Escribe una cantidad entera mayor que cero.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await registerStockMovement(variantId, type, parsed, reason);
      setSaved(`Stock: ${result.previous_stock} → ${result.new_stock}`);
      onSaved();
      if (showHistory) void loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar el movimiento.");
    } finally {
      setSaving(false);
    }
  };

  const loadHistory = async () => {
    setShowHistory(true);
    if (history) return;
    try {
      setHistory(await getVariantMovements(variantId));
    } catch {
      setHistory([]);
    }
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="movement-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="movement-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="movement-head">
          <div>
            <h3 id="movement-title">
              <Package size={18} /> Merma o ingreso
            </h3>
            <p>
              {productName} · {sizeMl} ml · stock actual {currentStock}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <label className="movement-field">
          Motivo
          <select value={type} onChange={(event) => setType(event.target.value as StockMovementType)}>
            {STOCK_MOVEMENTS.map((movement) => (
              <option key={movement.value} value={movement.value}>
                {movement.label}
              </option>
            ))}
          </select>
        </label>

        <label className="movement-field">
          Cantidad
          <input
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>

        {isValid && (
          <p className={`movement-preview${projected < 0 ? " is-bad" : ""}`}>
            {selected?.adds ? "Suma" : "Resta"} {parsed} → el stock queda en{" "}
            <strong>{projected}</strong>
            {projected < 0 && " · no hay stock suficiente"}
          </p>
        )}

        <label className="movement-field">
          Nota <span className="movement-optional">opcional</span>
          <input
            type="text"
            placeholder={selected?.adds ? "Compra a proveedor" : "Ej: caja mojada"}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>

        {error && <p className="form-error" role="alert">{error}</p>}
        {saved && <p className="form-success" role="status">{saved}</p>}

        <div className="movement-actions">
          <AdminButton
            tone="secondary"
            compact
            type="button"
            onClick={() => void loadHistory()}
          >
            <History size={15} /> Ver historial
          </AdminButton>
          <AdminButton
            tone="primary"
            compact
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !isValid}
          >
            {saving ? "Guardando…" : "Registrar"}
          </AdminButton>
        </div>

        {showHistory && (
          <div className="movement-history">
            <h4>Historial</h4>
            {!history && <p className="movement-optional">Cargando…</p>}
            {history && history.length === 0 && (
              <p className="movement-optional">Esta presentación todavía no tiene movimientos.</p>
            )}
            <ul>
              {(history ?? []).map((movement) => (
                <li key={movement.movement_id}>
                  <span>
                    {MOVEMENT_LABEL[movement.movement_type] ?? movement.movement_type}
                    {movement.reason && movement.reason !== movement.movement_type && (
                      <small> · {movement.reason}</small>
                    )}
                  </span>
                  <span className={movement.quantity > 0 ? "is-in" : "is-out"}>
                    {movement.quantity > 0 ? "+" : ""}
                    {movement.quantity}
                  </span>
                  <time dateTime={movement.created_at}>
                    {new Date(movement.created_at).toLocaleDateString("es-CO")}
                  </time>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}