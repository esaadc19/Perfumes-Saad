import { supabase } from "../lib/supabase";

export interface ProductVariant {
  id: string;
  size: number;
  price: number;
  stock: number;
}

export interface Product {
  id: string;
  brand: string;
  name: string;
  gender: "Mujeres" | "Hombres" | "Unisex";
  category: "Comercial" | "Diseñador" | "Árabes" | "Nicho";
  description: string;
  family: string;
  climate: string[];
  image: string;
  featured?: boolean;
  active?: boolean;
  variants: ProductVariant[];
}

const productSelect = `
  id,
  brand,
  name,
  gender,
  category,
  description,
  family,
  climate,
  image_url,
  featured,
  active,
  product_variants (
    id,
    size_ml,
    price,
    stock,
    active
  )
`;

function mapProducts(data: any[]): Product[] {
  return data.map((product: any) => ({
    id: product.id,
    brand: product.brand,
    name: product.name,
    gender: product.gender,
    category: product.category,
    description: product.description ?? "",
    family: product.family ?? "",
    climate: product.climate ?? [],
    image: product.image_url ?? "",
    featured: product.featured ?? false,
    active: product.active ?? true,
    variants: (product.product_variants ?? [])
      .filter((variant: any) => variant.active ?? true)
      .map((variant: any) => ({
        id: variant.id,
        size: Number(variant.size_ml),
        price: Number(variant.price),
        stock: Number(variant.stock),
      })),
  }));
}

export async function getProducts(): Promise<Product[]> {
  if (!supabase) {
    throw new Error("Supabase no está configurado.");
  }

  const { data, error } = await supabase
    .from("products")
    .select(productSelect)
    .eq("active", true)
    .eq("product_variants.active", true)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    console.error("Error cargando productos:", error);
    throw error;
  }

  return mapProducts(data ?? []);
}

export async function getAdminProducts(): Promise<Product[]> {
  if (!supabase) {
    throw new Error("Supabase no está configurado.");
  }

  const { data, error } = await supabase
    .from("products")
    .select(productSelect)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error cargando productos del panel:", error);
    throw error;
  }

  return mapProducts(data ?? []);
}

export async function createProduct(product: {
  brand: string;
  name: string;
  gender: Product["gender"];
  category: Product["category"];
  description: string;
  family: string;
  climate: string[];
  image_url: string;
}, variants: { size: number; price: number; stock: number }[]): Promise<void> {
  if (!supabase) {
    throw new Error("Supabase no está configurado.");
  }

  const { error } = await supabase.rpc("admin_create_product", {
    product_data: product,
    variants_data: variants,
  });

  if (error) {
    console.error("Error creando producto:", error);
    throw error;
  }
}

export async function setProductActive(id: string, active: boolean): Promise<void> {
  if (!supabase) {
    throw new Error("Supabase no está configurado.");
  }

  const { error } = await supabase
    .from("products")
    .update({ active })
    .eq("id", id);

  if (error) {
    console.error("Error actualizando disponibilidad del producto:", error);
    throw error;
  }
}