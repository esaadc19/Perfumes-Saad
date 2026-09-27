import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { X } from "lucide-react";
import { supabase } from "../lib/supabase";
import AddressInput from "./AddressInput";

export default function AccountDialog({
  user,
  isAdmin,
  onClose,
  onOpenAdmin,
  onSignOut,
}: {
  user: User;
  isAdmin: boolean;
  onClose: () => void;
  onOpenAdmin: () => void;
  onSignOut: () => Promise<void>;
}) {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!supabase) {
      setError("El acceso requiere configurar las variables de Supabase.");
      setLoading(false);
      return;
    }
    void supabase
      .from("profiles")
      .select("delivery_address")
      .eq("id", user.id)
      .single()
      .then(({ data, error: profileError }) => {
        if (!active) return;
        if (profileError) {
          console.error("No se pudo cargar la dirección del perfil:", profileError);
          setError("No se pudo cargar la dirección de entrega.");
        } else {
          setAddress(data.delivery_address ?? "");
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user.id]);

  const saveAddress = async () => {
    if (!supabase) {
      setError("El acceso requiere configurar las variables de Supabase.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ delivery_address: address.trim() || null })
      .eq("id", user.id)
      .select("id")
      .single();
    if (updateError) {
      console.error("No se pudo guardar la dirección de entrega:", updateError);
      setError("No se pudo guardar la dirección. Inténtalo de nuevo.");
    } else {
      setMessage("Dirección guardada correctamente.");
    }
    setSaving(false);
  };

  return (
    <div className="overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="auth-modal auth-scroll-modal account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <button className="close" onClick={onClose} aria-label="Cerrar"><X /></button>
        <p className="eyebrow">MI CUENTA</p>
        <h2 id="account-title">Hola</h2>
        <p>{user.email}</p>
        {loading ? (
          <p role="status">Cargando los datos de tu cuenta...</p>
        ) : (
          <>
            <AddressInput value={address} onChange={setAddress} />
            {error && <p className="form-error" role="alert">{error}</p>}
            {message && <p className="form-success" role="status">{message}</p>}
            <button className="primary full" disabled={saving} onClick={() => void saveAddress()}>
              {saving ? "Guardando..." : "Guardar dirección"}
            </button>
          </>
        )}
        {isAdmin && (
          <button className="secondary full" onClick={onOpenAdmin}>
            Abrir panel de administración
          </button>
        )}
        <button className="secondary full" onClick={() => void onSignOut()}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
