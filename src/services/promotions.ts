import { supabase } from "../lib/supabase";

export interface Promotion {
  id: string;
  name: string;
  required_quantity: number;
  bundle_price: number;
  allow_mixed: boolean;
  active: boolean;
  created_at?: string;
}

export interface PromotionInput {
  name: string;
  required_quantity: number;
  bundle_price: number;
  allow_mixed: boolean;
  active: boolean;
}

function requireSupabase() {
  if (!supabase) throw new Error("Supabase no está configurado.");
  return supabase;
}

export async function getPromotions(admin = false): Promise<Promotion[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("promotions")
    .select("id, name, required_quantity, bundle_price, allow_mixed, active, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("No se pudieron cargar las promociones:", error);
    throw error;
  }
  const promotions = (data ?? []).map((item) => ({
    ...item,
    required_quantity: Number(item.required_quantity),
    bundle_price: Number(item.bundle_price),
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

export async function deletePromotion(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("promotions").delete().eq("id", id);
  if (error) {
    console.error("No se pudo eliminar la promoción:", error);
    throw error;
  }
}

export interface PromotionCartLine {
  productId: string;
  promotionId: string | null;
  promotion?: Promotion | null;
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
    if (!line.promotionId || !line.promotion?.active) continue;
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
