import { supabase } from "../lib/supabase";

export interface ProductVariant {
  id: string;
  size: number;
  price: number;
  cost?: number | null;
  stock: number;
  minStock?: number;
  active?: boolean;
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
  images?: string[];
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
  image_urls,
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

function mapProducts(data: any[], includeInactiveVariants = false): Product[] {
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
    images: Array.isArray(product.image_urls) && product.image_urls.length
      ? product.image_urls
      : product.image_url
        ? [product.image_url]
        : [],
    featured: product.featured ?? false,
    active: product.active ?? true,
    variants: (product.product_variants ?? [])
      .filter((variant: any) => includeInactiveVariants || (variant.active ?? true))
      .map((variant: any) => ({
        id: variant.id,
        size: Number(variant.size_ml),
        price: Number(variant.price),
        cost: variant.cost === undefined
          ? undefined
          : variant.cost === null
            ? null
            : Number(variant.cost),
        stock: Number(variant.stock),
        minStock: Number(variant.min_stock ?? 2),
        active: variant.active ?? true,
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

  const { data, error } = await supabase.rpc("admin_get_products");

  if (error) {
    console.error("Error cargando productos del panel:", error);
    throw error;
  }

  return mapProducts((data ?? []) as any[], true);
}

export interface NewProductInput {
  brand: string;
  name: string;
  gender: Product["gender"];
  category: Product["category"];
  description: string;
  family: string;
  climate: string[];
  image_url: string;
  image_urls?: string[];
}

export async function createProduct(
  product: NewProductInput,
  variants: { size: number; price: number; cost: number; stock: number }[],
  imageFiles: File[] = []
): Promise<void> {
  if (!supabase) {
    throw new Error("Supabase no está configurado.");
  }

  if (imageFiles.length + (product.image_urls?.length ?? 0) > 3) {
    throw new Error("Cada perfume admite un máximo de tres imágenes.");
  }

  const uploadedPaths: string[] = [];
  const uploadedUrls: string[] = [];
  try {
    for (const file of imageFiles) {
      const extensionByType: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/avif": "avif",
      };
      const extension = extensionByType[file.type];
      if (!extension) {
        throw new Error("Las imágenes deben ser JPG, PNG, WebP o AVIF.");
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("Cada imagen debe pesar máximo 5 MB.");
      }
      const path = `${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      uploadedPaths.push(path);
      uploadedUrls.push(supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl);
    }

    const imageUrls = [...(product.image_urls ?? []), ...uploadedUrls];
    const { error } = await supabase.rpc("admin_create_product", {
      product_data: {
        ...product,
        image_url: imageUrls[0] ?? product.image_url,
        image_urls: imageUrls,
      },
      variants_data: variants,
    });
    if (error) throw error;
  } catch (error) {
    if (uploadedPaths.length) {
      const { error: cleanupError } = await supabase.storage
        .from("product-images")
        .remove(uploadedPaths);
      if (cleanupError) console.error("No se pudieron limpiar las imágenes subidas:", cleanupError);
    }
    console.error("Error creando producto:", error);
    throw error;
  }
}

export async function setVariantCost(id: string, cost: number): Promise<void> {
  if (!supabase) {
    throw new Error("Supabase no está configurado.");
  }
  const { error } = await supabase.rpc("admin_update_variant_cost", {
    target_variant_id: id,
    new_cost: cost,
  });
  if (error) {
    console.error("No se pudo actualizar el costo de la presentación:", error);
    throw error;
  }
}

export async function setVariantStock(id: string, stock: number): Promise<void> {
  if (!supabase) {
    throw new Error("Supabase no está configurado.");
  }
  if (!Number.isInteger(stock) || stock < 0) {
    throw new Error("El stock debe ser un número entero igual o mayor que cero.");
  }
  const { error } = await supabase.rpc("admin_update_variant_stock", {
    target_variant_id: id,
    new_stock: stock,
  });
  if (error) {
    console.error("No se pudo actualizar el stock de la presentación:", error);
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