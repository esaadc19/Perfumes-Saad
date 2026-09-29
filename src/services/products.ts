import { supabase } from "../lib/supabase";
import type { Promotion } from "./promotions";

function getSupabaseErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

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
  category: "Diseñador" | "Árabes" | "Nicho";
  description: string;
  family: string;
  climate: string[];
  image: string;
  images?: string[];
  featured?: boolean;
  active?: boolean;
  promotion_id?: string | null;
  promotion?: Promotion | null;
  archived?: boolean;
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
  promotion_id,
  featured,
  active,
  promotion:promotions (
    id,
    name,
    required_quantity,
    bundle_price,
    allow_mixed,
    active
  ),
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
    archived: product.archived ?? false,
    promotion_id: product.promotion_id ?? null,
    promotion: product.promotion
      ? {
          ...product.promotion,
          required_quantity: Number(product.promotion.required_quantity),
          bundle_price: Number(product.promotion.bundle_price),
        }
      : null,
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
  promotion_id?: string | null;
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
        promotion_id: product.promotion_id?.trim() || null,
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
    const errorCode = getSupabaseErrorCode(error);
    if (errorCode === "22P02") {
      throw new Error(
        "Supabase recibió un UUID vacío al guardar el producto. Vuelve a ejecutar el supabase/schema.sql actualizado en el SQL Editor y reintenta la importación desde Administración → Productos."
      );
    }
    if (errorCode === "PGRST202" || errorCode === "42883") {
      throw new Error(
        "Supabase no encuentra la función para crear productos. Ejecuta de nuevo supabase/schema.sql en el SQL Editor."
      );
    }
    if (errorCode === "42501") {
      throw new Error(
        "No tienes permisos de administrador para importar productos. Cierra sesión y vuelve a entrar con una cuenta administradora."
      );
    }
    throw error;
  }
}

async function uploadProductImages(files: File[]): Promise<{ paths: string[]; urls: string[] }> {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const uploadedPaths: string[] = [];
  const uploadedUrls: string[] = [];
  const extensionByType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
  };
  try {
    for (const file of files) {
      const extension = extensionByType[file.type];
      if (!extension) throw new Error("Las imágenes deben ser JPG, PNG, WebP o AVIF.");
      if (file.size > 5 * 1024 * 1024) throw new Error("Cada imagen debe pesar máximo 5 MB.");
      const path = `${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage
        .from("product-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      uploadedPaths.push(path);
      uploadedUrls.push(supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl);
    }
  } catch (error) {
    if (uploadedPaths.length) {
      const { error: cleanupError } = await supabase.storage
        .from("product-images")
        .remove(uploadedPaths);
      if (cleanupError) console.error("No se pudieron limpiar las imágenes subidas:", cleanupError);
    }
    throw error;
  }
  return { paths: uploadedPaths, urls: uploadedUrls };
}

async function removeStoredProductImages(imageUrls: string[]): Promise<void> {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const bucketMarker = "/product-images/";
  const paths = imageUrls.flatMap((imageUrl) => {
    try {
      const path = new URL(imageUrl).pathname.split(bucketMarker)[1];
      return path ? [decodeURIComponent(path)] : [];
    } catch {
      return [];
    }
  });
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from("product-images").remove(paths);
  if (error) {
    console.error("No se pudieron borrar algunas imágenes antiguas del almacenamiento:", error);
  }
}

export async function updateAdminProduct(input: {
  product: Product;
  imageFiles: File[];
}): Promise<void> {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const existingImages = input.product.images ?? (input.product.image ? [input.product.image] : []);
  if (existingImages.length + input.imageFiles.length > 3) {
    throw new Error("Cada perfume admite un máximo de tres imágenes.");
  }

  let uploadedPaths: string[] = [];
  let uploadedUrls: string[] = [];
  try {
    const uploaded = await uploadProductImages(input.imageFiles);
    uploadedPaths = uploaded.paths;
    uploadedUrls = uploaded.urls;
    const imageUrls = [...existingImages, ...uploadedUrls];
    const { error } = await supabase.rpc("admin_update_product", {
      target_product_id: input.product.id,
      product_data: {
        brand: input.product.brand,
        name: input.product.name,
        gender: input.product.gender,
        category: input.product.category,
        description: input.product.description,
        family: input.product.family,
        climate: input.product.climate,
        image_url: imageUrls[0] ?? "",
        image_urls: imageUrls,
        promotion_id: input.product.promotion_id ?? null,
      },
      variants_data: input.product.variants.map((variant) => ({
        id: variant.id.startsWith("new-") ? null : variant.id,
        size: variant.size,
        price: variant.price,
        cost: variant.cost,
        stock: variant.stock,
      })),
    });
    if (error) throw error;
    const removedImages = existingImages.filter((imageUrl) => !imageUrls.includes(imageUrl));
    await removeStoredProductImages(removedImages);
  } catch (error) {
    if (uploadedPaths.length) {
      const { error: cleanupError } = await supabase.storage
        .from("product-images")
        .remove(uploadedPaths);
      if (cleanupError) console.error("No se pudieron limpiar las imágenes subidas:", cleanupError);
    }
    console.error("No se pudo actualizar el producto:", error);
    throw error;
  }
}

export async function deleteAdminProduct(product: Product): Promise<"deleted" | "archived"> {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const { data, error } = await supabase.rpc("admin_delete_product", {
    target_product_id: product.id,
  });
  if (error) {
    console.error("No se pudo eliminar el producto:", error);
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error("Supabase no encuentra la función para eliminar productos. Ejecuta de nuevo supabase/schema.sql en el SQL Editor.");
    }
    if (error.code === "42501") {
      throw new Error("No tienes permisos de administrador para eliminar productos. Cierra sesión y vuelve a entrar con una cuenta administradora.");
    }
    if (error.code === "23503") {
      throw new Error("El producto tiene registros relacionados y no se puede borrar físicamente. Ejecuta de nuevo supabase/schema.sql para archivarlo de forma segura desde este botón.");
    }
    throw error;
  }
  if (data !== "deleted" && data !== "archived") {
    throw new Error("Supabase no devolvió un resultado válido al eliminar el producto.");
  }
  if (data === "deleted") {
    await removeStoredProductImages(product.images ?? (product.image ? [product.image] : []));
  }
  return data;
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