import { useState } from "react";
import { signIn } from "../lib/auth";
import Button from "../components/Button";

export default function Login({ onError }: { onError: (message: string | null) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    onError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      const message =
        err instanceof Error ? "Correo o contraseña incorrectos." : "No se pudo iniciar sesión.";
      setError(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="crm-login">
      <div className="crm-login__card">
        <div className="crm-login__brand">
          <img className="crm-side__logo" src="/crm/mark.png" alt="" />
          <span className="crm-side__brand-text">
            <span className="crm-side__brand-name">Perfumes SAAD</span>
            <span className="crm-side__brand-role">CRM</span>
          </span>
        </div>

        <h1 className="crm-login__title">Entrar al CRM</h1>

        <form className="crm-login__form" onSubmit={submit}>
          {error && <div className="crm-login__error">{error}</div>}

          <label className="crm-field">
            <span className="crm-label">Correo</span>
            <input
              className="crm-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="crm-field">
            <span className="crm-label">Contraseña</span>
            <input
              className="crm-input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <Button type="submit" disabled={busy}>
            {busy ? "Entrando…" : "Entrar"}
          </Button>
        </form>

        <p className="crm-login__demo">
          Se usan las mismas cuentas de Supabase Auth que la tienda. Un asesor entra con su cuenta y solo
          ve lo que tiene asignado.
        </p>
      </div>
    </div>
  );
}