import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { X } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function AuthDialog({
  onClose,
  onAuthenticated,
  notice,
}: {
  onClose: () => void;
  onAuthenticated: (user: User) => void;
  notice: string | null;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(null);
    setMessage(null);
    if (!supabase) {
      setError("El acceso requiere configurar las variables de Supabase.");
      return;
    }

    setSaving(true);
    try {
      if (mode === "login") {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authError) throw authError;
        if (!data.user) throw new Error("No se pudo iniciar sesión.");
        onAuthenticated(data.user);
        return;
      }

      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name.trim(), phone: phone.trim() } },
      });
      if (authError) throw authError;
      if (data.session && data.user) {
        onAuthenticated(data.user);
      } else {
        setMessage("Revisa tu correo para confirmar la cuenta y después inicia sesión.");
      }
    } catch (submitError) {
      console.error("Error de autenticación:", submitError);
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo completar la solicitud."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="close" onClick={onClose} aria-label="Cerrar"><X /></button>
        <p className="eyebrow">{mode === "login" ? "ACCESO" : "NUEVA CUENTA"}</p>
        <h2 id="auth-title">{mode === "login" ? "Iniciar sesión" : "Crear cuenta cliente"}</h2>
        <p>
          {mode === "login"
            ? "Ingresa con tu correo y contraseña."
            : "El registro público crea una cuenta de cliente, no una cuenta de administrador."}
        </p>
        {mode === "register" && (
          <label className="auth-label">
            Nombre
            <input
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
        )}
        {mode === "register" && (
          <label className="auth-label">
            Número de WhatsApp
            <input
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
            />
          </label>
        )}
        <label className="auth-label">
          Correo electrónico
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="auth-label">
          Contraseña
          <input
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {notice && <p className="form-error" role="alert">{notice}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="form-success" role="status">{message}</p>}
        <button className="primary full" disabled={saving || !email || password.length < 6 || (mode === "register" && (!name.trim() || !phone.trim()))} onClick={() => void submit()}>
          {saving ? "Procesando..." : mode === "login" ? "Iniciar sesión" : "Registrarme"}
        </button>
        <button
          className="text-button auth-switch"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
            setMessage(null);
          }}
        >
          {mode === "login" ? "Crear una cuenta de cliente" : "Ya tengo cuenta"}
        </button>
      </div>
    </div>
  );
}
