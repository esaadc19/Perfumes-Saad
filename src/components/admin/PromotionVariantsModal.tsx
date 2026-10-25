import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCheck, Search, X } from "lucide-react";
import AdminButton from "./AdminButton";
import { money } from "../../lib/format";
import {
  getPromotionMaxUnitCost,
  getPromotionUnitMargin,
  getPromotionVariantOptions,
  setPromotionVariants,
  type Promotion,
  type PromotionVariantOption,
} from "../../services/promotions";

function normalizeSearch(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function PromotionVariantsModal({
  promotion,
  onClose,
  onSaved,
}: {
  promotion: Promotion;
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  const [options, setOptions] = useState<PromotionVariantOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [onlyEligible, setOnlyEligible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const maxUnitCost = getPromotionMaxUnitCost(promotion);

  const isSelectable = (option: PromotionVariantOption) =>
    option.variantActive &&
    !option.archived &&
    (maxUnitCost == null || (option.cost != null && option.cost <= maxUnitCost));

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void getPromotionVariantOptions(promotion.id)
      .then((loaded) => {
        if (!active) return;
        setOptions(loaded);
        setSelectedIds(new Set(loaded.filter((option) => option.selected).map((option) => option.variantId)));
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar las presentaciones de la promoción.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [promotion.id, reloadToken]);

  const eligibleOptions = useMemo(
    () => options.filter((option) => isSelectable(option)),
    [options, maxUnitCost]
  );

  const selectedInvalid = useMemo(
    () => options.filter((option) => selectedIds.has(option.variantId) && !isSelectable(option)),
    [options, selectedIds, maxUnitCost]
  );

  const searchTerm = normalizeSearch(search);
  const visibleOptions = useMemo(
    () => options
      .filter((option) =>
        normalizeSearch(`${option.brand} ${option.name} ${option.size} ml`).includes(searchTerm)
      )
      .filter((option) =>
        !onlyEligible || isSelectable(option) || selectedIds.has(option.variantId)
      ),
    [options, searchTerm, onlyEligible, selectedIds, maxUnitCost]
  );

  const toggleOption = (option: PromotionVariantOption) => {
    if (!selectedIds.has(option.variantId) && !isSelectable(option)) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(option.variantId)) next.delete(option.variantId);
      else next.add(option.variantId);
      return next;
    });
    setError(null);
  };

  const selectEligible = () => {
    setSelectedIds(new Set(eligibleOptions.map((option) => option.variantId)));
    setError(null);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setError(null);
  };

  const save = async () => {
    if (selectedInvalid.length > 0) {
      setError("Quita las presentaciones marcadas con «Revisar» antes de guardar.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const count = await setPromotionVariants(promotion.id, [...selectedIds]);
      onSaved(count);
    } catch (saveError) {
      setError(saveError instanceof Error
        ? saveError.message
        : "No se pudieron guardar las presentaciones de la promoción.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        className="add-modal promotion-variants-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="promotion-variants-title"
      >
        <button className="close" type="button" onClick={onClose} disabled={saving} aria-label="Cerrar">
          <X />
        </button>
        <p className="eyebrow">PROMOCIÓN · PRESENTACIONES</p>
        <h2 id="promotion-variants-title">{promotion.name}</h2>
        <p className="order-editor-note">
          Solo las presentaciones marcadas aplican a esta promoción. Una presentación por encima del costo máximo no se puede seleccionar. El margen se calcula sin IVA y descuenta el IVA del costo cuando está configurado en la promoción.
        </p>

        <div className="promotion-variants-summary">
          <div>
            <span>Margen mínimo del paquete</span>
            <strong>{promotion.minimum_profit == null ? "Sin definir" : money(promotion.minimum_profit)}</strong>
          </div>
          <div>
            <span>Costo máximo por presentación</span>
            <strong>{maxUnitCost == null ? "Sin tope" : money(maxUnitCost)}</strong>
          </div>
          <div>
            <span>Seleccionadas</span>
            <strong>{selectedIds.size}</strong>
          </div>
        </div>

        <div className="promotion-variants-toolbar">
          <label className="promotion-variants-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar marca, nombre o tamaño"
              disabled={loading || saving}
            />
          </label>
          <label className="promotion-checkbox promotion-variants-filter">
            <input
              type="checkbox"
              checked={onlyEligible}
              onChange={(event) => setOnlyEligible(event.target.checked)}
              disabled={loading || saving}
            />
            <span>Solo las que cumplen</span>
          </label>
          <div className="promotion-variants-toolbar-actions">
            <AdminButton tone="secondary" compact type="button" onClick={selectEligible} disabled={loading || saving || eligibleOptions.length === 0}>
              <CheckCheck size={15} /> Seleccionar las que cumplen
            </AdminButton>
            <AdminButton tone="secondary" compact type="button" onClick={clearSelection} disabled={loading || saving || selectedIds.size === 0}>
              Quitar todas
            </AdminButton>
          </div>
        </div>

        {loading ? (
          <div className="loading-state" role="status">
            <span className="loading-spinner" aria-hidden="true" />
            <span>Cargando presentaciones…</span>
          </div>
        ) : error && options.length === 0 ? (
          <div className="promotion-variants-empty" role="alert">
            <AlertTriangle size={22} />
            <p>{error}</p>
            <AdminButton tone="secondary" compact type="button" onClick={() => setReloadToken((token) => token + 1)}>
              Reintentar
            </AdminButton>
          </div>
        ) : options.length === 0 ? (
          <div className="promotion-variants-empty">
            <p>No hay presentaciones creadas. Crea productos con sus presentaciones primero.</p>
          </div>
        ) : visibleOptions.length === 0 ? (
          <div className="promotion-variants-empty">
            <p>No hay presentaciones que coincidan con la búsqueda.</p>
          </div>
        ) : (
          <div className="promotion-variants-list">
            {visibleOptions.map((option) => {
              const selected = selectedIds.has(option.variantId);
              const selectable = isSelectable(option);
              const margin = getPromotionUnitMargin(promotion, option.cost);
              const needsReview = selected && !selectable;
              return (
                <label
                  key={option.variantId}
                  className={[
                    "promotion-variant-option",
                    selected ? "selected" : "",
                    !selectable ? "ineligible" : "",
                    needsReview ? "needs-review" : "",
                  ].filter(Boolean).join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={saving || (!selected && !selectable)}
                    onChange={() => toggleOption(option)}
                  />
                  <span className="promotion-variant-main">
                    <strong>{option.brand} · {option.name}</strong>
                    <small>
                      {option.size} ml · stock {option.stock} · precio {money(option.price)}
                      {!option.productActive ? " · producto inactivo" : ""}
                    </small>
                  </span>
                  <span className="promotion-variant-metrics">
                    <span>
                      <small>Costo {promotion.cost_includes_tax ? "(con IVA)" : "(sin IVA)"}</small>
                      <strong>{option.cost == null ? "Sin costo" : money(option.cost)}</strong>
                    </span>
                    <span>
                      <small>Margen/u</small>
                      <strong className={margin != null && margin < 0 ? "negative" : ""}>
                        {margin == null ? "—" : money(margin)}
                      </strong>
                    </span>
                  </span>
                  <span
                    className={[
                      "promotion-variant-state",
                      needsReview ? "review" : selectable ? "eligible" : "blocked",
                    ].join(" ")}
                  >
                    {needsReview
                      ? "Revisar"
                      : !option.variantActive
                        ? "Inactiva"
                        : option.archived
                          ? "Archivada"
                          : selectable
                            ? "Cumple"
                            : "No cumple"}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {selectedInvalid.length > 0 && (
          <p className="form-error" role="alert">
            Hay {selectedInvalid.length} presentación{selectedInvalid.length === 1 ? "" : "es"} seleccionada{selectedInvalid.length === 1 ? "" : "s"} que ya no cumple{selectedInvalid.length === 1 ? "" : "n"} el margen. Quítala{selectedInvalid.length === 1 ? "" : "s"} para guardar.
          </p>
        )}
        {error && options.length > 0 && <p className="form-error" role="alert">{error}</p>}

        <div className="edit-product-actions">
          <AdminButton tone="secondary" compact type="button" onClick={onClose} disabled={saving}>
            Cancelar
          </AdminButton>
          <AdminButton
            type="button"
            onClick={() => void save()}
            disabled={loading || saving || selectedInvalid.length > 0}
          >
            {saving ? "Guardando…" : "Guardar presentaciones"}
          </AdminButton>
        </div>
      </div>
    </div>
  );
}
