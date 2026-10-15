import EmptyState from "../components/EmptyState";

/**
 * Marcador de módulo sin construir todavía. Cada pantalla del menú entra por
 * aquí hasta que le toque su fase, en vez de dejar el enlace muerto.
 */
export default function Placeholder({ title, phase }: { title: string; phase: string }) {
  return (
    <>
      <div className="crm-page-head">
        <h1 className="crm-page-title">{title}</h1>
      </div>
      <EmptyState title="Pantalla pendiente" hint={`Esta pantalla se construye en la ${phase}.`} />
    </>
  );
}