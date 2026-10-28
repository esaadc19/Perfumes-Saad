import { useEffect, useState } from "react";
import { Check, Package, Pencil, Search, Trash2 } from "lucide-react";
import AdminButton from "../../components/admin/AdminButton";
import { money } from "../../lib/format";
import type { Product, ProductVariant } from "../../services/products";
import type { Promotion } from "../../services/promotions";
import type { ProductPriceFilterState, ProductStockFilter } from "./types";

const PRODUCT_BATCH_SIZE = 12;

interface ProductsPageProps {
  visibleProducts: Product[];
  loading: boolean;
  promotions: Promotion[];
  archivedProductsCount: number;
  showArchivedProducts: boolean;
  onToggleArchived: () => void;
  productSearch: string;
  onProductSearchChange: (value: string) => void;
  productStockFilter: ProductStockFilter;
  onProductStockFilterChange: (value: ProductStockFilter) => void;
  productPriceFilter: ProductPriceFilterState;
  onProductPriceFilterChange: (field: keyof ProductPriceFilterState, value: string) => void;
  hasProductPriceFilter: boolean;
  onClearProductPriceFilter: () => void;
  costDrafts: Record<string, string>;
  onCostDraftChange: (variantId: string, value: string) => void;
  onCostDraftClear: (variantId: string) => void;
  stockDrafts: Record<string, string>;
  onStockDraftChange: (variantId: string, value: string) => void;
  onStockDraftClear: (variantId: string) => void;
  onVariantCostChange: (variantId: string, cost: number) => Promise<void>;
  savingCostVariantId: string | null;
  onVariantStockChange: (variantId: string, stock: number) => Promise<void>;
  savingStockVariantId: string | null;
  onOpenMovement: (productId: string, variant: ProductVariant) => void;
  onProductActiveChange: (product: Product) => void;
  updatingProductId: string | null;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  deletingProductId: string | null;
  error: string | null;
  importFeedback: string | null;
  importError: string | null;
  productActionFeedback: string | null;
  productActionError: string | null;
}

export default function ProductsPage({
  visibleProducts,
  loading,
  promotions,
  archivedProductsCount,
  showArchivedProducts,
  onToggleArchived,
  productSearch,
  onProductSearchChange,
  productStockFilter,
  onProductStockFilterChange,
  productPriceFilter,
  onProductPriceFilterChange,
  hasProductPriceFilter,
  onClearProductPriceFilter,
  costDrafts,
  onCostDraftChange,
  onCostDraftClear,
  stockDrafts,
  onStockDraftChange,
  onStockDraftClear,
  onVariantCostChange,
  savingCostVariantId,
  onVariantStockChange,
  savingStockVariantId,
  onOpenMovement,
  onProductActiveChange,
  updatingProductId,
  onEdit,
  onDelete,
  deletingProductId,
  error,
  importFeedback,
  importError,
  productActionFeedback,
  productActionError,
}: ProductsPageProps) {
  const initialLoading = loading && visibleProducts.length === 0;
  const [visibleLimit, setVisibleLimit] = useState(PRODUCT_BATCH_SIZE);
  const displayedProducts = visibleProducts.slice(0, visibleLimit);
  const remainingProducts = visibleProducts.length - displayedProducts.length;

  // Al cambiar la busqueda o un filtro volvemos al primer lote: el usuario
  // esta mirando un conjunto nuevo, no la posicion anterior.
  useEffect(() => {
    setVisibleLimit(PRODUCT_BATCH_SIZE);
  }, [
    productSearch,
    showArchivedProducts,
    productStockFilter,
    productPriceFilter.costMin,
    productPriceFilter.costMax,
    productPriceFilter.priceMin,
    productPriceFilter.priceMax,
  ]);

  return (
    <>
      {error && <p className="form-error" role="alert">{error}</p>}
      {importFeedback && <p className="import-feedback" role="status">{importFeedback}</p>}
      {importError && <p className="form-error" role="alert">{importError}</p>}
      <p className="customer-import-hint products-import-hint">
        Descarga la plantilla y luego importa ese archivo desde aquí. No importes este CSV directamente en la tabla
        <code> products</code> de Supabase: la tienda también crea las presentaciones en <code>product_variants</code>.
      </p>
      <section className="admin-card">
        <div className="card-title product-toolbar">
          <div className="product-list-tools">
            <button
              className="secondary archived-products-toggle"
              type="button"
              onClick={onToggleArchived}
              disabled={archivedProductsCount === 0 && !showArchivedProducts}
            >
              {showArchivedProducts ? "Volver a productos" : `Archivados (${archivedProductsCount})`}
            </button>
            {!showArchivedProducts && (
              <>
                <label className="product-filter-select">
                  <span>Disponibilidad</span>
                  <select
                    value={productStockFilter}
                    onChange={(event) => onProductStockFilterChange(event.target.value as ProductStockFilter)}
                    aria-label="Filtrar productos por disponibilidad"
                  >
                    <option value="all">Todos</option>
                    <option value="available">Disponibles</option>
                    <option value="sold-out">Agotados</option>
                  </select>
                </label>
                <details className="product-price-filter">
                  <summary>
                    Costo y precio
                    {hasProductPriceFilter && <span className="filter-active-dot" aria-label="Filtro activo" />}
                  </summary>
                  <div className="product-price-filter-panel">
                    <p className="product-price-filter-heading">Rango por presentación</p>
                    <div className="product-price-filter-grid">
                      <label>Costo mín.
                        <input type="number" min="0" step="1000" inputMode="numeric" placeholder="0" value={productPriceFilter.costMin} onChange={(event) => onProductPriceFilterChange("costMin", event.target.value)} />
                      </label>
                      <label>Costo máx.
                        <input type="number" min="0" step="1000" inputMode="numeric" placeholder="Sin límite" value={productPriceFilter.costMax} onChange={(event) => onProductPriceFilterChange("costMax", event.target.value)} />
                      </label>
                      <label>Precio mín.
                        <input type="number" min="0" step="1000" inputMode="numeric" placeholder="0" value={productPriceFilter.priceMin} onChange={(event) => onProductPriceFilterChange("priceMin", event.target.value)} />
                      </label>
                      <label>Precio máx.
                        <input type="number" min="0" step="1000" inputMode="numeric" placeholder="Sin límite" value={productPriceFilter.priceMax} onChange={(event) => onProductPriceFilterChange("priceMax", event.target.value)} />
                      </label>
                    </div>
                    <div className="product-price-filter-actions">
                      <button type="button" onClick={onClearProductPriceFilter} disabled={!hasProductPriceFilter}>Limpiar</button>
                      <span>{visibleProducts.length} productos</span>
                    </div>
                  </div>
                </details>
              </>
            )}
            <label className="admin-search">
              <Search size={16} />
              <input
                aria-label={showArchivedProducts ? "Buscar productos archivados por marca, nombre o SKU" : "Buscar productos por marca, nombre o SKU"}
                placeholder="Buscar marca, nombre o SKU"
                value={productSearch}
                onChange={(event) => onProductSearchChange(event.target.value)}
              />
            </label>
          </div>
        </div>
        {showArchivedProducts && (
          <p className="customer-import-hint">
            Estos productos se quitaron de la tienda, pero se conservan porque tienen pedidos o movimientos de inventario asociados.
          </p>
        )}
        {initialLoading && (
          <div className="section-loading" role="status">
            <span className="loading-spinner" aria-hidden="true" />
            <div>
              <strong>Cargando productos…</strong>
              <span>Estamos reuniendo el catálogo, las presentaciones y el stock.</span>
            </div>
          </div>
        )}

        <div className="admin-table" hidden={initialLoading}>
          <div className="table-row product-row header">
            <span>Producto</span><span>Presentación y costo unitario</span><span className="cell-center">Stock total</span><span className="cell-center">Disponibilidad</span><span className="cell-center">Acciones</span>
          </div>
          {displayedProducts.map((product) => {
            const stock = product.variants.reduce((s, v) => s + v.stock, 0);
            const available = !product.archived && product.active !== false && stock > 0;
            return (
              <div className="table-row product-row" key={product.id}>
                <div className="product-cell">
                  <img src={product.image} alt="" loading="lazy" decoding="async" />
                  <div className="product-cell-copy">
                    <b>{product.brand}</b>
                    <span>{product.name}</span>
                    <span className="product-cell-meta">
                      {product.sku
                        ? <code title={product.sku}>{product.sku}</code>
                        : <em className="sku-missing">Sin SKU</em>}
                      <span className="product-meta-sep" aria-hidden="true">·</span>
                      <span>{product.category}</span>
                      {product.promotion_id && (
                        <small>{promotions.find((promotion) => promotion.id === product.promotion_id)?.name ?? "Promoción no disponible"}</small>
                      )}
                    </span>
                  </div>
                </div>
                <div className="variant-cost-list">
                  {product.variants.map((variant) => (
                    <label key={variant.id}>
                      <span>
                        {variant.size} ml · precio {money(variant.price)}
                        {variant.active === false && <small className="variant-hidden-label">Oculta en tienda</small>}
                      </span>
                      <span className="cost-input-wrap">
                        <span>Costo</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          aria-label={`Costo unitario de ${product.name} ${variant.size} ml`}
                          value={costDrafts[variant.id] ?? (variant.cost == null ? "" : String(variant.cost))}
                          placeholder="Sin costo"
                          disabled={savingCostVariantId === variant.id}
                          onChange={(event) => onCostDraftChange(variant.id, event.target.value)}
                          onBlur={(event) => {
                            const rawCost = event.target.value.trim();
                            if (!rawCost) return;
                            const cost = Number(rawCost);
                            if (!Number.isFinite(cost) || cost < 0) return;
                            void onVariantCostChange(variant.id, cost)
                              .then(() => onCostDraftClear(variant.id))
                              .catch(() => {});
                          }}
                        />
                      </span>
                      {savingCostVariantId === variant.id && <small>Guardando…</small>}
                    </label>
                  ))}
                  {product.variants.map((variant) => (
                    <div className="stock-control-group" key={`stock-${variant.id}`}>
                    <label className="stock-control">
                      <span>Stock disponible · {variant.size} ml</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        aria-label={`Stock de ${product.name} ${variant.size} ml`}
                        value={stockDrafts[variant.id] ?? String(variant.stock)}
                        disabled={savingStockVariantId === variant.id}
                        onChange={(event) => onStockDraftChange(variant.id, event.target.value)}
                        onBlur={(event) => {
                          const rawStock = event.target.value.trim();
                          if (!rawStock) {
                            onStockDraftClear(variant.id);
                            return;
                          }
                          const stock = Number(rawStock);
                          if (stock === variant.stock) {
                            onStockDraftClear(variant.id);
                            return;
                          }
                          void onVariantStockChange(variant.id, stock)
                            .then(() => onStockDraftClear(variant.id))
                            .catch(() => {});
                        }}
                      />
                      {savingStockVariantId === variant.id && <small>Guardando…</small>}
                    </label>
                    {/* Escribir el stock a mano borra el rastro de por que
                        bajo. Este boton deja el motivo registrado. */}
                    <AdminButton
                      tone="secondary"
                      compact
                      variant="ghost"
                      type="button"
                      onClick={() => onOpenMovement(product.id, variant)}
                    >
                      <Package size={14} /> Merma o ingreso
                    </AdminButton>
                    </div>
                  ))}
                </div>
                <span className="cell-center">{stock}</span>
                <div className="product-status-cell">
                  {product.archived ? (
                    <span className="status sold archived-status">Archivado</span>
                  ) : (
                    <button
                      className={available ? "status available" : "status sold"}
                      disabled={updatingProductId === product.id}
                      onClick={() => onProductActiveChange(product)}
                    >
                      {updatingProductId === product.id
                        ? "Guardando..."
                        : product.active === false
                          ? <>Oculto · mostrar</>
                          : available ? <><Check size={13}/> Disponible · ocultar</> : <>Agotado · ocultar</>}
                    </button>
                  )}
                </div>
                {product.archived ? (
                  <span className="archived-history-note">Se conserva por su historial de ventas o inventario.</span>
                ) : (
                  <div className="product-actions">
                    <AdminButton tone="secondary" compact type="button" onClick={() => onEdit(product)}>
                        <Pencil size={14}/> Editar
                    </AdminButton>
                    <AdminButton
                        tone="danger"
                        variant="outline"
                        compact
                        type="button"
                        disabled={deletingProductId === product.id}
                        onClick={() => onDelete(product)}
                    >
                        <Trash2 size={14}/>{deletingProductId === product.id ? "Eliminando..." : "Eliminar"}
                    </AdminButton>
                  </div>
                )}
              </div>
            );
          })}
          {visibleProducts.length === 0 && (
            <p className="insight">
              {showArchivedProducts
                ? "No hay productos archivados que coincidan con la búsqueda."
                : "No hay productos activos que coincidan con la búsqueda."}
            </p>
          )}
        </div>
        {remainingProducts > 0 && (
          <div className="products-load-more">
            <span>Mostrando {displayedProducts.length} de {visibleProducts.length} productos</span>
            <AdminButton
              tone="secondary"
              compact
              type="button"
              onClick={() => setVisibleLimit((current) => current + PRODUCT_BATCH_SIZE)}
            >
              Mostrar {Math.min(PRODUCT_BATCH_SIZE, remainingProducts)} más
            </AdminButton>
          </div>
        )}
        {productActionFeedback && <p className="import-feedback" role="status">{productActionFeedback}</p>}
        {productActionError && <p className="form-error" role="alert">{productActionError}</p>}
      </section>
    </>
  );
}
