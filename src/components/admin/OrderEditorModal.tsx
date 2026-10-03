import { useState } from "react";
import { Plus, Search, Trash2, X } from "lucide-react";
import type { Promotion } from "../../services/promotions";
import type { Product } from "../../services/products";
import type { AdminCustomer, AdminOrder } from "../../services/admin";
import { calculatePromotionPrice } from "../../services/promotions";

function money(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

const productCollator = new Intl.Collator("es", { sensitivity: "base" });

type ManualCustomer = {
  full_name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  delivery_address: string | null;
};

export default function OrderEditorModal({
  order,
  customers,
  products,
  promotions,
  saving,
  error,
  onClose,
  onSave,
}: {
  order: AdminOrder | null;
  customers: AdminCustomer[];
  products: Product[];
  promotions: Promotion[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (
    customerId: string | null,
    customer: ManualCustomer | null,
    items: { variant_id: string; quantity: number }[],
    orderDate: string,
    deliveryCost: number
  ) => void;
}) {
  const [customerId, setCustomerId] = useState(order?.customer_id ?? "");
  const [customerMode, setCustomerMode] = useState<"registered" | "manual">(
    order || customers.length > 0 ? "registered" : "manual"
  );
  const [manualCustomer, setManualCustomer] = useState({
    full_name: "",
    phone: "",
    email: "",
    city: "",
    delivery_address: "",
  });
  const localToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [orderDate, setOrderDate] = useState(
    order
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Bogota",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(order.created_at))
      : localToday
  );
  const [deliveryCost, setDeliveryCost] = useState(String(order?.delivery_cost ?? 0));
  const [productSearch, setProductSearch] = useState("");
  const [items, setItems] = useState(
    order?.order_items.map((item) => ({ variantId: item.variant_id, quantity: String(item.quantity) })) ?? []
  );
  const selectableVariants = products
    .filter((product) => product.active !== false)
    .flatMap((product) => product.variants.filter((variant) => variant.active !== false).map((variant) => ({
      ...variant,
      productName: `${product.brand} ${product.name}`,
      productSortName: product.name,
      productId: product.id,
      promotionId: product.promotion_id ?? null,
      promotion: promotions.find((promotion) => promotion.id === product.promotion_id) ?? null,
    })));
  const searchTerm = productSearch.trim().toLocaleLowerCase("es");
  const matchingVariants = selectableVariants.filter((variant) =>
    `${variant.productName} ${variant.size} ml`.toLocaleLowerCase("es").includes(searchTerm)
  ).sort((left, right) =>
    productCollator.compare(left.productSortName, right.productSortName) ||
    productCollator.compare(left.productName, right.productName) ||
    left.size - right.size
  );
  const orderPrice = calculatePromotionPrice(items.flatMap((item) => {
    const variant = selectableVariants.find((candidate) => candidate.id === item.variantId);
    const quantity = Number(item.quantity);
    return variant && Number.isInteger(quantity) && quantity > 0
      ? [{
          productId: variant.productId,
          promotionId: variant.promotionId,
          promotion: variant.promotion,
          variantId: variant.id,
          unitPrice: variant.price,
          quantity,
        }]
      : [];
  }));
  const validItems = items.length > 0 && items.every((item, index) => {
    const variant = selectableVariants.find((candidate) => candidate.id === item.variantId);
    const quantity = Number(item.quantity);
    return Boolean(
      variant &&
      Number.isInteger(quantity) &&
      quantity > 0 &&
      quantity <= variant.stock &&
      items.findIndex((other) => other.variantId === item.variantId) === index
    );
  });
  const parsedDeliveryCost = Number(deliveryCost);
  const validDeliveryCost = Number.isFinite(parsedDeliveryCost) && parsedDeliveryCost >= 0;
  const canAddItem = matchingVariants.some((variant) =>
    variant.stock > 0 && !items.some((item) => item.variantId === variant.id)
  );
  const addItem = () => {
    const variant = matchingVariants.find((candidate) =>
      candidate.stock > 0 && !items.some((item) => item.variantId === candidate.id)
    );
    if (!variant) return;
    setItems((current) => [...current, { variantId: variant.id, quantity: "1" }]);
  };

  return (
    <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <form
        className="add-modal order-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-editor-title"
        onSubmit={(event) => {
          event.preventDefault();
          if ((customerMode === "registered" && !customerId) ||
            (customerMode === "manual" && !manualCustomer.full_name.trim()) ||
            !orderDate || !validItems || !validDeliveryCost) return;
          onSave(
            customerMode === "registered" ? customerId : null,
            customerMode === "manual" ? {
              full_name: manualCustomer.full_name.trim(),
              phone: manualCustomer.phone.trim() || null,
              email: manualCustomer.email.trim() || null,
              city: manualCustomer.city.trim() || null,
              delivery_address: manualCustomer.delivery_address.trim() || null,
            } : null,
            items.map((item) => ({
              variant_id: item.variantId,
              quantity: Number(item.quantity),
            })),
            orderDate,
            parsedDeliveryCost
          );
        }}
      >
        <button className="close" type="button" onClick={onClose} aria-label="Cerrar"><X /></button>
        <p className="eyebrow">GESTIÓN DE PEDIDOS</p>
        <h2 id="order-editor-title">{order ? "Editar pedido" : "Crear pedido"}</h2>
        <div className="order-entry-fields">
          <div className="order-client-entry">
            <span>Cliente</span>
            <div className="order-client-mode">
              <button
                type="button"
                className={customerMode === "registered" ? "secondary selected" : "secondary"}
                onClick={() => setCustomerMode("registered")}
                disabled={customers.length === 0 || saving}
              >
                Cliente registrado
              </button>
              <button
                type="button"
                className={customerMode === "manual" ? "secondary selected" : "secondary"}
                onClick={() => setCustomerMode("manual")}
                disabled={saving}
              >
                Ingresar manualmente
              </button>
            </div>
          </div>
          <label className="auth-label order-date-field">
            Fecha del pedido
            <input
              type="date"
              value={orderDate}
              max={localToday}
              disabled={saving}
              onChange={(event) => setOrderDate(event.target.value)}
              required
            />
          </label>
        </div>
        {customerMode === "registered" ? (
          <label className="auth-label">
            Seleccionar cliente
            <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} required disabled={saving}>
              <option value="">Selecciona un cliente</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.full_name}{customer.phone ? ` · ${customer.phone}` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="form-grid order-manual-customer">
            <label>Nombre del cliente
              <input
                value={manualCustomer.full_name}
                onChange={(event) => setManualCustomer((current) => ({ ...current, full_name: event.target.value }))}
                autoComplete="name"
                disabled={saving}
                required
              />
            </label>
            <label>WhatsApp / teléfono
              <input
                type="tel"
                value={manualCustomer.phone}
                onChange={(event) => setManualCustomer((current) => ({ ...current, phone: event.target.value }))}
                autoComplete="tel"
                disabled={saving}
              />
            </label>
            <label>Correo (opcional)
              <input
                type="email"
                value={manualCustomer.email}
                onChange={(event) => setManualCustomer((current) => ({ ...current, email: event.target.value }))}
                autoComplete="email"
                disabled={saving}
              />
            </label>
            <label>Ciudad (opcional)
              <input
                value={manualCustomer.city}
                onChange={(event) => setManualCustomer((current) => ({ ...current, city: event.target.value }))}
                autoComplete="address-level2"
                disabled={saving}
              />
            </label>
            <label className="form-wide">Dirección (opcional)
              <input
                value={manualCustomer.delivery_address}
                onChange={(event) => setManualCustomer((current) => ({ ...current, delivery_address: event.target.value }))}
                autoComplete="street-address"
                disabled={saving}
              />
            </label>
          </div>
        )}
        <div className="order-editor-lines">
          <div className="order-editor-heading">
            <strong>Productos del pedido</strong>
            <button type="button" className="text-button" onClick={addItem} disabled={!canAddItem || saving}>
              <Plus size={15} /> Añadir presentación
            </button>
          </div>
          <label className="admin-search order-product-search">
            <Search size={16} />
            <input
              type="search"
              aria-label="Buscar perfume o presentación"
              placeholder="Buscar por marca, perfume o tamaño"
              value={productSearch}
              disabled={saving}
              onChange={(event) => setProductSearch(event.target.value)}
            />
          </label>
          {items.map((item, index) => {
            const selectedVariant = selectableVariants.find((variant) => variant.id === item.variantId);
            const rowVariants = selectedVariant && !matchingVariants.some((variant) => variant.id === selectedVariant.id)
              ? [selectedVariant, ...matchingVariants].sort((left, right) =>
                  productCollator.compare(left.productSortName, right.productSortName) ||
                  productCollator.compare(left.productName, right.productName) ||
                  left.size - right.size
                )
              : matchingVariants;
            return (
              <div className="order-editor-line" key={`${index}-${item.variantId}`}>
                <label>
                  Producto y presentación
                  <select
                    value={item.variantId}
                    disabled={saving}
                    onChange={(event) => setItems((current) => current.map((line, lineIndex) =>
                      lineIndex === index ? { ...line, variantId: event.target.value } : line
                    ))}
                    required
                  >
                    {!item.variantId && <option value="">Selecciona una presentación</option>}
                    {rowVariants.map((variant) => (
                      <option
                        key={variant.id}
                        value={variant.id}
                        disabled={
                          (variant.stock <= 0 && variant.id !== item.variantId) ||
                          items.some((other, otherIndex) => otherIndex !== index && other.variantId === variant.id)
                        }
                      >
                        {variant.productName} · {variant.size} ml · {money(variant.price)} · stock {variant.stock}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Cantidad
                  <input
                    type="number"
                    min="1"
                    max={selectableVariants.find((variant) => variant.id === item.variantId)?.stock}
                    step="1"
                    inputMode="numeric"
                    value={item.quantity}
                    disabled={saving}
                    onChange={(event) => setItems((current) => current.map((line, lineIndex) =>
                      lineIndex === index ? { ...line, quantity: event.target.value } : line
                    ))}
                    required
                  />
                </label>
                <button type="button" className="icon-button" aria-label="Quitar producto" disabled={saving} onClick={() => setItems((current) => current.filter((_, lineIndex) => lineIndex !== index))}>
                  <Trash2 size={17} />
                </button>
              </div>
            );
          })}
          {matchingVariants.length === 0 && <p className="insight">No hay presentaciones que coincidan con la búsqueda.</p>}
          {items.length === 0 && matchingVariants.length > 0 && <p className="insight">Añade al menos un producto con stock disponible.</p>}
        </div>
        <label className="auth-label order-delivery-cost">
          Costo de domicilio pagado
          <input
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={deliveryCost}
            disabled={saving}
            onChange={(event) => setDeliveryCost(event.target.value)}
            required
          />
          <small>Es el costo asumido por la tienda; se descontará de la ganancia al completar la venta.</small>
        </label>
        <p className="order-editor-note">El total cobrado y el costo de domicilio se registran por separado. El inventario se descuenta cuando marques el pedido como pagado.</p>
        {orderPrice.discount > 0 && <p className="cart-discount">Ahorro en promociones: -{money(orderPrice.discount)}</p>}
        <div className="order-editor-total"><span>Total del pedido</span><strong>{money(orderPrice.total)}</strong></div>
        {items.length > 0 && !validItems && <p className="form-error">Revisa productos, cantidades disponibles y evita repetir presentaciones.</p>}
        {!validDeliveryCost && <p className="form-error">El costo de domicilio debe ser un valor igual o mayor que cero.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button
          className="primary full"
          type="submit"
          disabled={saving ||
            (customerMode === "registered" && !customerId) ||
            (customerMode === "manual" && !manualCustomer.full_name.trim()) ||
            !orderDate || !validItems || !validDeliveryCost}
        >
          {saving ? "Guardando…" : order ? "Guardar cambios" : "Crear pedido"}
        </button>
      </form>
    </div>
  );
}
