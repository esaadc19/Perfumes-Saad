import { supabase } from "../lib/supabase";

export interface StoreSettings {
  store_name: string;
  logo_url: string | null;
  whatsapp_number: string;
  contact_email: string;
  whatsapp_greeting: string;
  home_title: string;
  home_message: string;
  receipt_footer_message: string;
}

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  store_name: "Perfumes SAAD",
  logo_url: null,
  whatsapp_number: "573181749436",
  contact_email: "",
  whatsapp_greeting: "Hola, quiero hacer una consulta sobre sus perfumes.",
  home_title: "Encuentra una fragancia que vaya contigo.",
  home_message: "Catálogo de perfumería con recomendaciones, diferentes presentaciones y atención personalizada por WhatsApp.",
  receipt_footer_message: "Gracias por elegir Perfumes SAAD",
};

const settingsColumns = Object.keys(DEFAULT_STORE_SETTINGS).join(", ");

function requireSupabase() {
  if (!supabase) throw new Error("Supabase no está configurado.");
  return supabase;
}

export async function getStoreSettings(): Promise<StoreSettings> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("store_settings")
    .select(settingsColumns)
    .eq("id", 1)
    .single()
    .overrideTypes<StoreSettings, { merge: false }>();
  if (error) {
    console.error("No se pudo cargar la configuración de la tienda:", error);
    throw new Error(error.message || "No se pudo cargar la configuración de la tienda.");
  }
  return {
    ...DEFAULT_STORE_SETTINGS,
    ...data,
    contact_email: data.contact_email ?? "",
  } as StoreSettings;
}

export async function uploadStoreLogo(file: File): Promise<{ url: string; path: string }> {
  const client = requireSupabase();
  const extensionByType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
  };
  const extension = extensionByType[file.type];
  if (!extension) throw new Error("El logo debe ser JPG, PNG, WebP o AVIF.");
  if (file.size > 5 * 1024 * 1024) throw new Error("El logo debe pesar máximo 5 MB.");

  const path = `branding/${crypto.randomUUID()}.${extension}`;
  const { error } = await client.storage
    .from("product-images")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    console.error("No se pudo subir el logo:", error);
    throw new Error(error.message || "No se pudo subir el logo.");
  }
  return {
    path,
    url: client.storage.from("product-images").getPublicUrl(path).data.publicUrl,
  };
}

export async function removeStoreLogo(path: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.storage.from("product-images").remove([path]);
  if (error) {
    console.error("No se pudo limpiar el logo que falló al guardar:", error);
    throw new Error(error.message || "No se pudo limpiar el logo subido.");
  }
}

export async function saveStoreSettings(settings: StoreSettings): Promise<StoreSettings> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("store_settings")
    .update({
      store_name: settings.store_name.trim(),
      logo_url: settings.logo_url?.trim() || null,
      whatsapp_number: settings.whatsapp_number.replace(/\D/g, ""),
      contact_email: settings.contact_email.trim().toLowerCase() || null,
      whatsapp_greeting: settings.whatsapp_greeting.trim(),
      home_title: settings.home_title.trim(),
      home_message: settings.home_message.trim(),
      receipt_footer_message: settings.receipt_footer_message.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1)
    .select(settingsColumns)
    .single()
    .overrideTypes<StoreSettings, { merge: false }>();
  if (error) {
    console.error("No se pudo guardar la configuración de la tienda:", error);
    throw new Error(error.message || "No se pudo guardar la configuración de la tienda.");
  }
  return {
    ...DEFAULT_STORE_SETTINGS,
    ...data,
    contact_email: data.contact_email ?? "",
  } as StoreSettings;
}
