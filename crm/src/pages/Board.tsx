import { useCallback, useEffect, useMemo, useState } from "react";
import { KanbanSquare, Plus } from "lucide-react";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import Badge from "../components/Badge";
import Button from "../components/Button";
import {
  createDeal,
  formatMoney,
  listDeals,
  listStages,
  moveDeal,
} from "../services/pipeline";
import type { Deal, Stage } from "../services/pipeline";
import { displayName, listContacts } from "../services/crm";
import type { Contact } from "../services/crm";

const SCOPES = [
  { id: "all", label: "Todos los deals" },
  { id: "mine", label: "Mis deals" },
] as const;

/**
 * Tablero Kanban del pipeline.
 *
 * Las columnas vienen de `crm_pipeline_stages`: si en Configuración se agrega,
 * renombra o desactiva una etapa, el tablero cambia sin tocar código.
 */
export default function Board({ userId }: { userId: string }) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [showHidden, setShowHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [s, d, c] = await Promise.all([listStages(), listDeals("all"), listContacts()]);
      setStages(s);
      setDeals(d);
      setContacts(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el tablero.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleDeals = useMemo(
    () => (scope === "mine" ? deals.filter((d) => d.owner_id === userId) : deals),
    [deals, scope, userId],
  );

  const byStage = useMemo(() => {
    const map = new Map<string, Deal[]>();
    for (const stage of stages) map.set(stage.id, []);
    for (const deal of visibleDeals) {
      if (!deal.stage_id) continue;
      map.get(deal.stage_id)?.push(deal);
    }
    return map;
  }, [stages, visibleDeals]);

  const drop = async (stageId: string) => {
    if (!dragId) return;
    const deal = deals.find((d) => d.id === dragId);
    setDragId(null);
    setOverStage(null);
    if (!deal || deal.stage_id === stageId) return;

    // Optimista: la tarjeta salta antes de que Supabase confirme.
    const previous = deal.stage_id;
    setDeals((prev) => prev.map((d) => (d.id === dragId ? { ...d, stage_id: stageId } : d)));

    try {
      await moveDeal(dragId, stageId, stages);
    } catch (err) {
      setDeals((prev) => prev.map((d) => (d.id === dragId ? { ...d, stage_id: previous } : d)));
      setError(err instanceof Error ? err.message : "No se pudo mover el deal.");
    }
  };

  const hidden = stages.filter((s) => !s.is_active);

  return (
    <>
      <div className="crm-page-head">
        <div>
          <h1 className="crm-page-title">Tablero</h1>
          <p className="crm-page-sub">
            Arrastra una tarjeta a otra columna para mover el deal de etapa.
            {showHidden && hidden.length > 0 && (
              <>
                {" "}
                <strong>
                  {hidden.length} etapa{hidden.length > 1 ? "s" : ""} oculta
                  {hidden.length > 1 ? "s" : ""} con {hidden.map((s) => s.name).join(", ")}.
                </strong>
              </>
            )}
          </p>
        </div>
        <div className="crm-topbar__spacer" />
        <div className="crm-row" style={{ gap: 8 }}>
          <select
            className="crm-select"
            name="filtro-deals"
            value={scope}
            onChange={(event) => setScope(event.target.value as "all" | "mine")}
            aria-label="Filtrar deals"
          >
            {SCOPES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {hidden.length > 0 && (
            <Button small tone="secondary" onClick={() => setShowHidden((v) => !v)}>
              {showHidden ? "Ocultar etapas ocultas" : `Ver ${hidden.length} etapa(s) oculta(s)`}
            </Button>
          )}
          <Button small onClick={() => setCreating(true)}>
            <Plus size={14} /> Nuevo deal
          </Button>
        </div>
      </div>

      {error && (
        <p className="crm-login__error" role="alert" style={{ margin: "0 0 12px" }}>
          {error}
        </p>
      )}

      {loading ? (
        <p style={{ color: "var(--crm-text-soft)" }} role="status">
          Cargando...
        </p>
      ) : stages.length === 0 ? (
        <Card title="Pipeline">
          <EmptyState
            icon={<KanbanSquare size={20} />}
            title="No hay etapas"
            hint="Creá las etapas desde Configuración → Pipeline."
          />
        </Card>
      ) : (
        <div className="crm-board">
          {stages.map((stage) => {
            const items = showHidden ? byStage.get(stage.id) ?? [] : byStage.get(stage.id) ?? [];
            return (
              <section
                key={stage.id}
                className={[
                  "crm-col",
                  overStage === stage.id && "is-over",
                  dragId && overStage === stage.id && "is-drop",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOverStage(stage.id);
                }}
                onDragLeave={() => setOverStage((current) => (current === stage.id ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  void drop(stage.id);
                }}
              >
                <header className="crm-col__head">
                  <span className="crm-col__dot" style={{ background: stage.color }} />
                  <span className="crm-col__name">{stage.name}</span>
                  {stage.is_won && <Badge tone="success">Ganada</Badge>}
                  {stage.is_lost && <Badge tone="danger">Perdida</Badge>}
                  <span className="crm-col__count">{items.length}</span>
                </header>
                <div className="crm-col__body">
                  {items.length === 0 ? (
                    <p style={{ fontSize: 12, color: "var(--crm-text-faint)", padding: "6px 2px" }}>
                      Sin deals
                    </p>
                  ) : (
                    items.map((deal) => (
                      <article
                        key={deal.id}
                        className={["crm-card-deal", dragId === deal.id && "is-dragging"].filter(Boolean).join(" ")}
                        draggable
                        onDragStart={() => setDragId(deal.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverStage(null);
                        }}
                      >
                        <div className="crm-card-deal__title">{deal.title ?? displayName(deal.contact)}</div>
                        <div className="crm-card-deal__foot">
                          <span className="crm-card-deal__value">{formatMoney(deal.value)}</span>
                          <span className="crm-card-deal__who">
                            {deal.owner_id === userId ? "yo" : "otro"}
                          </span>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            );
          })}

          {showHidden &&
            hidden.map((stage) => (
              <section key={stage.id} className="crm-col" style={{ opacity: 0.6 }}>
                <header className="crm-col__head">
                  <span className="crm-col__dot" style={{ background: stage.color }} />
                  <span className="crm-col__name">{stage.name}</span>
                  <Badge>Oculta</Badge>
                  <span className="crm-col__count">{byStage.get(stage.id)?.length ?? 0}</span>
                </header>
                <div className="crm-col__body">
                  <p style={{ fontSize: 12, color: "var(--crm-text-faint)", padding: "6px 2px" }}>
                    No aparece en el tablero mientras esté desactivada.
                  </p>
                </div>
              </section>
            ))}
        </div>
      )}

      {creating && (
        <NewDealDialog
          contacts={contacts}
          stages={stages}
          userId={userId}
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await load();
          }}
          onError={setError}
        />
      )}
    </>
  );
}

function NewDealDialog({
  contacts,
  stages,
  userId,
  onClose,
  onCreated,
  onError,
}: {
  contacts: Contact[];
  stages: Stage[];
  userId: string;
  onClose: () => void;
  onCreated: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [stageId, setStageId] = useState(stages[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [mine, setMine] = useState(true);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!contactId || !stageId) return;
    setSaving(true);
    onError(null);
    try {
      await createDeal({
        contact_id: contactId,
        stage_id: stageId,
        title,
        value: value ? Number(value) : null,
        owner_id: mine ? userId : null,
      });
      await onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo crear el deal.");
      setSaving(false);
    }
  };

  return (
    <div className="crm-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="crm-modal" role="dialog" aria-modal="true" aria-labelledby="nuevo-deal">
        <h2 id="nuevo-deal">Nuevo deal</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="crm-field">
            <span className="crm-label">Contacto</span>
            <select className="crm-select" style={{ maxWidth: "none" }} name="deal-contacto" value={contactId} onChange={(e) => setContactId(e.target.value)}>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name ?? c.phone_e164 ?? c.email ?? "Sin nombre"}
                </option>
              ))}
            </select>
          </label>
          <label className="crm-field">
            <span className="crm-label">Etapa</span>
            <select className="crm-select" style={{ maxWidth: "none" }} name="deal-etapa" value={stageId} onChange={(e) => setStageId(e.target.value)}>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="crm-field">
            <span className="crm-label">Título</span>
            <input className="crm-input" name="deal-titulo" placeholder="Ej: Jean Paul Gaultier 100ml" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="crm-field">
            <span className="crm-label">Valor (opcional)</span>
            <input className="crm-input" name="deal-valor" type="number" min="0" placeholder="385000" value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          <label className="crm-toggle">
            <input type="checkbox" name="deal-mio" checked={mine} onChange={(e) => setMine(e.target.checked)} />
            Es mío
          </label>
          <div className="crm-row" style={{ gap: 8 }}>
            <Button small onClick={() => void submit()} disabled={saving || !contactId}>
              {saving ? "Guardando…" : "Crear deal"}
            </Button>
            <Button small tone="ghost" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}