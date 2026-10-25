import { supabase } from "../lib/supabase";
import type { Product, ProductVariant } from "./products";

export interface Promotion {
  id: string;
  name: string;
  required_quantity: number;
  bundle_price: number;
  allow_mixed: boolean;
  active: boolean;
  minimum_profit: number | null;
  tax_rate: number;
  price_includes_tax: boolean;
  cost_includes_tax: boolean;
  max_unit_cost: number | null;
  created_at?: string;
}

export interface PromotionInput {
  name: string;
  required_quantity: number;
  bundle_price: number;
  allow_mixed: boolean;
  active: boolean;
  minimum_profit: number | null;
  tax_rate: number;
  price_includes_tax: boolean;
  cost_includes_tax: boolean;
}

export interface PromotionVariantOption {
  variantId: string;
  productId: string;
  brand: string;
  name: string;
  size: number;
  price: number;
  cost: number | null;
  stock: number;
  variantActive: boolean;
  productActive: boolean;
  archived: boolean;
  selected: boolean;
}

type PromotionMarginInput = Pick<
  Promotion,
  "bundle_price" | "required_quantity" | "minimum_profit" | "tax_rate" | "price_includes_tax" | "cost_includes_tax"
>;

function requireSupabase() {
  if (!supabase) throw new Error("Supabase no está configurado.");
  return supabase;
}

function getErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function promotionVariantsError(error: unknown): Error {
  const code = getErrorCode(error);
  if (code === "PGRST202" || code === "42883") {
    return new Error(
      "Supabase no encuentra las funciones de presentaciones en promoción. Aplica la migración 20261025120000_promotion_margin_and_variants.sql."
    );
  }
  if (code === "42501") {
    return new Error("No tienes permiso para administrar las presentaciones de esta promoción.");
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return new Error(message);
  }
  return new Error("No se pudieron guardar las presentaciones de la promoción.");
}

export function getPromotionNetBundle(promotion: Pick<Promotion, "bundle_price" | "tax_rate" | "price_includes_tax">): number {
  const taxRate = Number.isFinite(promotion.tax_rate) ? promotion.tax_rate : 0.19;
  return promotion.price_includes_tax === false
    ? promotion.bundle_price
    : promotion.bundle_price / (1 + taxRate);
}

export function getPromotionUnitRevenue(promotion: PromotionMarginInput): number {
  const quantity = promotion.required_quantity > 0 ? promotion.required_quantity : 1;
  return getPromotionNetBundle(promotion) / quantity;
}

export function getPromotionNetUnitCost(
  promotion: Pick<Promotion, "tax_rate" | "cost_includes_tax">,
  cost: number | null | undefined
): number | null {
  if (cost == null) return null;
  const taxRate = Number.isFinite(promotion.tax_rate) ? promotion.tax_rate : 0.19;
  return promotion.cost_includes_tax === false ? cost : cost / (1 + taxRate);
}

export function getPromotionMaxUnitCost(promotion: PromotionMarginInput): number | null {
  if (promotion.minimum_profit == null) return null;
  const quantity = Math.max(promotion.required_quantity, 1);
  const netUnitCap = getPromotionUnitRevenue(promotion) - promotion.minimum_profit / quantity;
  const taxRate = Number.isFinite(promotion.tax_rate) ? promotion.tax_rate : 0.19;
  const costTaxMultiplier = promotion.cost_includes_tax === false ? 1 : 1 + taxRate;
  return Math.round(netUnitCap * costTaxMultiplier * 100) / 100;
}

export function getPromotionUnitMargin(promotion: PromotionMarginInput, cost: number | null | undefined): number | null {
  const netCost = getPromotionNetUnitCost(promotion, cost);
  if (netCost == null) return null;
  return getPromotionUnitRevenue(promotion) - netCost;
}

export function getPromotionBundleMargin(promotion: PromotionMarginInput, cost: number | null | undefined): number | null {
  const netCost = getPromotionNetUnitCost(promotion, cost);
  if (netCost == null) return null;
  return getPromotionNetBundle(promotion) - netCost * Math.max(promotion.required_quantity, 1);
}

export function isVariantPromotionEligible(product: Product, variant: ProductVariant): boolean {
  const promotionId = product.promotion_id;
  if (!promotionId || !product.promotion?.active) return false;
  return Array.isArray(variant.promotionIds) && variant.promotionIds.includes(promotionId);
}

export function productHasActivePromotion(product: Product): boolean {
  return product.variants.some((variant) => isVariantPromotionEligible(product, variant));
}

export async function getPromotions(admin = false): Promise<Promotion[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("promotions")
    .select("id, name, required_quantity, bundle_price, allow_mixed, active, minimum_profit, tax_rate, price_includes_tax, cost_includes_tax, max_unit_cost, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("No se pudieron cargar las promociones:", error);
    throw error;
  }
  const promotions = (data ?? []).map((item) => ({
    ...item,
    required_quantity: Number(item.required_quantity),
    bundle_price: Number(item.bundle_price),
    minimum_profit: item.minimum_profit == null ? null : Number(item.minimum_profit),
    tax_rate: item.tax_rate == null ? 0.19 : Number(item.tax_rate),
    price_includes_tax: item.price_includes_tax ?? true,
    cost_includes_tax: item.cost_includes_tax ?? true,
    max_unit_cost: item.max_unit_cost == null ? null : Number(item.max_unit_cost),
  })) as Promotion[];
  return admin ? promotions : promotions.filter((item) => item.active);
}

export async function savePromotion(input: PromotionInput, id?: string): Promise<void> {
  const client = requireSupabase();
  const query = id
    ? client.from("promotions").update({ ...input, updated_at: new Date().toISOString() }).eq("id", id)
    : client.from("promotions").insert(input);
  const { error } = await query;
  if (error) {
    console.error("No se pudo guardar la promoción:", error);
    throw error;
  }
}

export async function togglePromotionActive(id: string, active: boolean): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from("promotions")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("No se pudo cambiar el estado de la promoción:", error);
    throw error;
  }
}

export async function deletePromotion(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("promotions").delete().eq("id", id);
  if (error) {
    console.error("No se pudo eliminar la promoción:", error);
    throw error;
  }
}

export async function getPromotionVariantOptions(promotionId: string): Promise<PromotionVariantOption[]> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_get_promotion_variants", {
    target_promotion_id: promotionId,
  });
  if (error) {
    console.error("No se pudieron cargar las presentaciones de la promoción:", error);
    throw promotionVariantsError(error);
  }
  return (Array.isArray(data) ? data : []).map((item: any) => ({
    variantId: String(item.variant_id),
    productId: String(item.product_id),
    brand: String(item.brand ?? ""),
    name: String(item.name ?? ""),
    size: Number(item.size_ml),
    price: Number(item.price),
    cost: item.cost == null ? null : Number(item.cost),
    stock: Number(item.stock),
    variantActive: item.variant_active !== false,
    productActive: item.product_active !== false,
    archived: item.archived === true,
    selected: item.selected === true,
  }));
}

export async function setPromotionVariants(promotionId: string, variantIds: string[]): Promise<number> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_set_promotion_variants", {
    target_promotion_id: promotionId,
    variant_ids: variantIds,
  });
  if (error) {
    console.error("No se pudieron guardar las presentaciones de la promoción:", error);
    throw promotionVariantsError(error);
  }
  return typeof data === "number" ? data : variantIds.length;
}

export interface PromotionCartLine {
  productId: string;
  promotionId: string | null;
  promotion?: Promotion | null;
  promotionEligible: boolean;
  variantId: string;
  unitPrice: number;
  quantity: number;
}

export interface PromotionPrice {
  subtotal: number;
  discount: number;
  total: number;
  lineDiscounts: Record<string, number>;
}

export function calculatePromotionPrice(lines: PromotionCartLine[]): PromotionPrice {
  const lineDiscounts: Record<string, number> = {};
  let subtotal = 0;
  for (const line of lines) subtotal += line.unitPrice * line.quantity;

  const groups = new Map<string, PromotionCartLine[]>();
  for (const line of lines) {
    if (!line.promotionEligible || !line.promotionId || !line.promotion?.active) continue;
    const groupKey = `${line.promotionId}:${line.promotion.allow_mixed ? "all" : line.productId}`;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), line]);
  }

  for (const group of groups.values()) {
    const promotion = group[0].promotion;
    if (!promotion || promotion.required_quantity < 1) continue;
    const quantity = group.reduce((sum, line) => sum + line.quantity, 0);
    const dealUnits = Math.floor(quantity / promotion.required_quantity) * promotion.required_quantity;
    if (!dealUnits) continue;

    let unitsToDiscount = dealUnits;
    const eligible = [...group]
      .sort((a, b) =>
        b.unitPrice - a.unitPrice ||
        a.productId.localeCompare(b.productId) ||
        a.variantId.localeCompare(b.variantId)
      )
      .map((line) => {
        const discountedQuantity = Math.min(line.quantity, unitsToDiscount);
        unitsToDiscount -= discountedQuantity;
        return { line, quantity: discountedQuantity, regular: discountedQuantity * line.unitPrice };
      })
      .filter((entry) => entry.quantity > 0);
    const regularDealPrice = eligible.reduce((sum, entry) => sum + entry.regular, 0);
    const promotionPrice = dealUnits / promotion.required_quantity * promotion.bundle_price;
    const discount = Math.max(0, regularDealPrice - promotionPrice);
    if (!discount || !regularDealPrice) continue;

    let allocated = 0;
    eligible.forEach((entry, index) => {
      const allocation = index === eligible.length - 1
        ? Math.round((discount - allocated) * 100) / 100
        : Math.round(discount * entry.regular / regularDealPrice * 100) / 100;
      allocated = Math.round((allocated + allocation) * 100) / 100;
      lineDiscounts[entry.line.variantId] = Math.round(
        ((lineDiscounts[entry.line.variantId] ?? 0) + allocation) * 100
      ) / 100;
    });
  }

  const discount = Math.round(
    Object.values(lineDiscounts).reduce((sum, value) => sum + value, 0) * 100
  ) / 100;
  return { subtotal, discount, total: Math.max(0, subtotal - discount), lineDiscounts };
}
