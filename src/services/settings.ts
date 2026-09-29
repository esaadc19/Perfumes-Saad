import { supabase } from "../lib/supabase";

export type StoreSettings = {
  id: number;
  business_name: string;
  logo_url: string | null;
  legal_representative: string | null;
  identification_type: string | null;
  identification_number: string | null;
  business_email: string | null;
  business_phone: string | null;
  whatsapp_number: string | null;
  website_url: string | null;
  address: string | null;
  city: string | null;
  department: string | null;
  country: string;
  tax_regime: string | null;
  tax_id: string | null;
  invoice_prefix: string | null;
  invoice_resolution: string | null;
  invoice_resolution_date: string | null;
  invoice_notes: string | null;
  currency: string;
  instagram_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  updated_at: string;
};

export type StoreSettingsInput = Omit<StoreSettings, "id" | "updated_at">;

export async function uploadStoreLogo(file: File, path: string): Promise<string> {
  const client = requireSupabase();
  const { error } = await client.storage.from("store-assets").upload(path, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: "3600",
  });
  if (error) throw error;
  const { data } = client.storage.from("store-assets").getPublicUrl(path);
  return data.publicUrl;
}

function requireSupabase() {
  if (!supabase) throw new Error("Supabase no está configurado.");
  return supabase;
}

export async function getStoreSettings(): Promise<StoreSettings> {
  const { data, error } = await requireSupabase().rpc("admin_get_store_settings");
  if (error) throw error;
  return data as StoreSettings;
}

export async function updateStoreSettings(input: StoreSettingsInput): Promise<StoreSettings> {
  const { data, error } = await requireSupabase().rpc("admin_update_store_settings", {
    settings_data: input,
  });
  if (error) throw error;
  return data as StoreSettings;
}
