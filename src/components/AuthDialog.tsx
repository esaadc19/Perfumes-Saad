import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { X } from "lucide-react";
import { supabase } from "../lib/supabase";
import AddressInput from "./AddressInput";

const AUTH_REDIRECT_URL = "https://perfumes-saad.vercel.app/";
type AuthMode = "login" | "register" | "forgot" | "reset";

export default function AuthDialog({
  onClose,
  onAuthenticated,
  onPasswordReset,
  initialMode = "login",
  notice,
}: {
  onClose: () => void;
  onAuthenticated: (user: User) => void;
  onPasswordReset: () => void;
  initialMode?: AuthMode;
  notice: string | null;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [dataProcessingConsent, setDataProcessingConsent] = useState(false);
  const [whatsappPromotionsConsent, setWhatsappPromotionsConsent] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const closeDialog = async () => {
    if (mode === "reset" && supabase) {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        console.error("No se pudo cancelar la recuperación de contraseña:", signOutError);
        setError("No se pudo cerrar la sesión de recuperación. Inténtalo de nuevo.");
        return;
      }
      onPasswordReset();
      window.history.replaceState(null, "", "/");
    }
    onClose();
  };

  const submit = async () => {
    setError(null);
    setMessage(null);
    if (!supabase) {
      setError("El acceso requiere configurar las variables de Supabase.");
      return;
    }

    setSaving(true);
    try {
      if (mode === "forgot") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: AUTH_REDIRECT_URL }
        );
        if (resetError) throw resetError;
        setMessage("Si existe una cuenta con ese correo, recibirás un enlace para restablecer la contraseña.");
        return;
      }

      if (mode === "reset") {
        if (password.length < 8) {
          throw new Error("La nueva contraseña debe tener al menos 8 caracteres.");
        }
        if (password !== passwordConfirmation) {
          throw new Error("Las contraseñas no coinciden.");
        }
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;

        setPassword("");
        setPasswordConfirmation("");
        setMode("login");
        setMessage("Tu contraseña se actualizó correctamente. Ya puedes iniciar sesión con la nueva contraseña.");
        onPasswordReset();
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) {
          console.error("La contraseña se actualizó, pero no se pudo cerrar la sesión:", signOutError);
          setMessage("Tu contraseña se actualizó. Cierra sesión manualmente antes de continuar.");
        }
        window.history.replaceState(null, "", "/");
        return;
      }

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
        options: {
          data: {
            full_name: name.trim(),
            phone: phone.trim(),
            delivery_address: deliveryAddress.trim(),
            data_processing_consent: dataProcessingConsent,
            whatsapp_promotions_consent: whatsappPromotionsConsent,
          },
          emailRedirectTo: AUTH_REDIRECT_URL,
        },
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
      if (event.target === event.currentTarget) void closeDialog();
    }}>
      <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="close" onClick={() => void closeDialog()} aria-label="Cerrar"><X /></button>
        <p className="eyebrow">
          {mode === "register" ? "NUEVA CUENTA" : mode === "reset" ? "RESTABLECER ACCESO" : "ACCESO"}
        </p>
        <h2 id="auth-title">
          {mode === "login"
            ? "Iniciar sesión"
            : mode === "register"
              ? "Crear cuenta cliente"
              : mode === "forgot"
                ? "Recuperar contraseña"
                : "Elegir nueva contraseña"}
        </h2>
        <p>
          {mode === "login"
            ? "Ingresa con tu correo y contraseña."
            : mode === "register"
              ? "El registro público crea una cuenta de cliente, no una cuenta de administrador."
              : mode === "forgot"
                ? "Te enviaremos un enlace seguro al correo asociado a tu cuenta."
                : "Crea una contraseña nueva para volver a acceder a tu cuenta."}
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
          <AddressInput value={deliveryAddress} onChange={setDeliveryAddress} />
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
        {mode !== "reset" && (
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
        )}
        {(mode === "login" || mode === "register" || mode === "reset") && (
          <label className="auth-label">
            {mode === "reset" ? "Nueva contraseña" : "Contraseña"}
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "reset" ? 8 : 6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
        )}
        {mode === "register" && (
          <div className="consent-fields">
            <label className="consent-option">
              <input
                type="checkbox"
                checked={dataProcessingConsent}
                onChange={(event) => setDataProcessingConsent(event.target.checked)}
                required
              />
              <span>Acepto el tratamiento de mis datos personales para gestionar mi cuenta y mis pedidos.</span>
            </label>
            <label className="consent-option">
              <input
                type="checkbox"
                checked={whatsappPromotionsConsent}
                onChange={(event) => setWhatsappPromotionsConsent(event.target.checked)}
                required
              />
              <span>Acepto recibir promociones de Perfumes SAAD por WhatsApp.</span>
            </label>
          </div>
        )}
        {mode === "reset" && (
          <label className="auth-label">
            Confirmar nueva contraseña
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              required
            />
          </label>
        )}
        {notice && <p className="form-error" role="alert">{notice}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="form-success" role="status">{message}</p>}
        <button
          className="primary full"
          disabled={
            saving ||
            (mode !== "reset" && !email) ||
            ((mode === "login" || mode === "register") && password.length < 6) ||
            (mode === "reset" && (password.length < 8 || passwordConfirmation.length < 8)) ||
            (mode === "register" && (
              !name.trim() ||
              !phone.trim() ||
              !dataProcessingConsent ||
              !whatsappPromotionsConsent
            ))
          }
          onClick={() => void submit()}
        >
          {saving
            ? "Procesando..."
            : mode === "login"
              ? "Iniciar sesión"
              : mode === "register"
                ? "Registrarme"
                : mode === "forgot"
                  ? "Enviar enlace"
                  : "Guardar nueva contraseña"}
        </button>
        {mode === "login" && (
          <button
            className="text-button auth-recovery-link"
            onClick={() => { setMode("forgot"); setError(null); setMessage(null); }}
          >
            ¿Olvidaste tu contraseña?
          </button>
        )}
        {(mode === "login" || mode === "register") && (
          <button
            className="text-button auth-switch"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
              setMessage(null);
            }}
          >
            {mode === "register" ? "Ya tengo cuenta" : "Crear una cuenta de cliente"}
          </button>
        )}
        {(mode === "forgot" || mode === "reset") && (
          <button
            className="text-button auth-switch"
            onClick={() => {
              setMode("login");
              setError(null);
              setMessage(null);
            }}
          >
            Volver a iniciar sesión
          </button>
        )}
      </div>
    </div>
  );
}
