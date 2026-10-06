import { useEffect, useState } from "react";
import { Save, Upload } from "lucide-react";
import {
  removeStoreLogo,
  saveStoreSettings,
  uploadStoreLogo,
  type StoreSettings,
} from "../../services/store-settings";

export default function SettingsPage({
  settings,
  loadError,
  onSaved,
}: {
  settings: StoreSettings;
  loadError: string | null;
  onSaved: (settings: StoreSettings) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState("");

  useEffect(() => {
    setDraft(settings);
    setLogoFile(null);
    setRemoveLogo(false);
  }, [settings]);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview("");
      return;
    }
    const previewUrl = URL.createObjectURL(logoFile);
    setLogoPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [logoFile]);

  const setField = <K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setFeedback(null);
    if (!draft.store_name.trim()) {
      setError("El nombre de la tienda es obligatorio.");
      return;
    }
    if (draft.whatsapp_number.replace(/\D/g, "").length < 7) {
      setError("Ingresa un número de WhatsApp válido con indicativo de país.");
      return;
    }

    setSaving(true);
    let uploadedLogoPath: string | null = null;
    try {
      let nextSettings = {
        ...draft,
        logo_url: removeLogo ? null : draft.logo_url,
      };
      if (logoFile) {
        const uploadedLogo = await uploadStoreLogo(logoFile);
        uploadedLogoPath = uploadedLogo.path;
        nextSettings = { ...nextSettings, logo_url: uploadedLogo.url };
      }
      const saved = await saveStoreSettings(nextSettings);
      onSaved(saved);
      setDraft(saved);
      setLogoFile(null);
      setRemoveLogo(false);
      setFeedback("La configuración de la tienda se guardó correctamente.");
    } catch (saveError) {
      if (uploadedLogoPath) {
        try {
          await removeStoreLogo(uploadedLogoPath);
        } catch (cleanupError) {
          console.error("No se pudo eliminar el logo temporal:", cleanupError);
        }
      }
      console.error("No se pudo guardar la configuración:", saveError);
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar la configuración.");
    } finally {
      setSaving(false);
    }
  };

  const logoUrl = logoFile ? logoPreview : removeLogo ? "" : draft.logo_url ?? "";

  return (
    <section className="admin-card store-settings-page">
      <div className="card-title">
        <div>
          <h2>Configuración de la tienda</h2>
          <span>Actualiza la identidad, el contacto y los mensajes visibles para tus clientes.</span>
        </div>
      </div>
      {loadError && <p className="profile-notice" role="status">{loadError}</p>}
      <form className="store-settings-form" onSubmit={(event) => void save(event)}>
        <section className="store-settings-logo">
          <div>
            <strong>Logo</strong>
            <span>JPG, PNG, WebP o AVIF · máximo 5 MB</span>
          </div>
          <label className="secondary image-file-button">
            <Upload size={15} /> {logoFile ? "Cambiar archivo" : "Subir logo"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              disabled={saving}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                event.currentTarget.value = "";
                setLogoFile(file);
                if (file) setRemoveLogo(false);
              }}
            />
          </label>
          {logoUrl && (
            <div className="store-settings-logo-preview">
              <img src={logoUrl} alt="Vista previa del logo de la tienda" />
              {(draft.logo_url || logoFile) && (
                <button className="text-button" type="button" disabled={saving} onClick={() => {
                  setLogoFile(null);
                  setRemoveLogo(true);
                }}>
                  Quitar logo
                </button>
              )}
            </div>
          )}
        </section>

        <div className="form-grid">
          <label>Nombre de la tienda
            <input value={draft.store_name} maxLength={80} disabled={saving} onChange={(event) => setField("store_name", event.target.value)} required />
          </label>
          <label>Número de WhatsApp
            <input
              type="tel"
              value={draft.whatsapp_number}
              maxLength={20}
              placeholder="573001234567"
              disabled={saving}
              onChange={(event) => setField("whatsapp_number", event.target.value)}
              required
            />
            <small>Incluye indicativo de país, sin el signo +.</small>
          </label>
          <label className="form-wide">Correo de contacto
            <input type="email" value={draft.contact_email} maxLength={254} disabled={saving} onChange={(event) => setField("contact_email", event.target.value)} />
          </label>
          <label className="form-wide">Saludo de WhatsApp
            <textarea value={draft.whatsapp_greeting} maxLength={500} rows={2} disabled={saving} onChange={(event) => setField("whatsapp_greeting", event.target.value)} required />
          </label>
          <label className="form-wide">Título de la portada
            <input value={draft.home_title} maxLength={140} disabled={saving} onChange={(event) => setField("home_title", event.target.value)} required />
          </label>
          <label className="form-wide">Mensaje de la portada
            <textarea value={draft.home_message} maxLength={500} rows={3} disabled={saving} onChange={(event) => setField("home_message", event.target.value)} required />
          </label>
          <label className="form-wide">Mensaje al final del recibo
            <textarea value={draft.receipt_footer_message} maxLength={240} rows={2} disabled={saving} onChange={(event) => setField("receipt_footer_message", event.target.value)} required />
          </label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {feedback && <p className="import-feedback" role="status">{feedback}</p>}
        <button className="primary" type="submit" disabled={saving}>
          <Save size={16} /> {saving ? "Guardando..." : "Guardar configuración"}
        </button>
      </form>
    </section>
  );
}
