import { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical, Plus, RotateCcw, Trash2 } from "lucide-react";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import {
  countDealsByStage,
  createStage,
  deleteStage,
  listStages,
  reorderStages,
  updateStage,
} from "../services/pipeline";
import type { Stage } from "../services/pipeline";

/**
 * Configuración → Pipeline.
 *
 * Las etapas viven en la base, no en el código: se crean, renombran, reordenan,
 * colorean, desactivan y marcan como ganada o perdida sin tocar una línea.
 *
 * Una etapa con deals nunca se borra, se desactiva. Los deals quedan fuera del
 * tablero pero intactos, y vuelven a la vista con el botón del Tablero.
 */
export default function PipelineSettings() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [dealCounts, setDealCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#00BCD4");

  /**
   * Último nombre que vino de la base, por id.
   *
   * El input controlado escribe directo en `stages` al teclear, así que al
   * salir del campo el estado YA tiene el nombre nuevo. Comparar contra
   * `stage.name` ahí siempre da "sin cambios" y el renombre nunca se guarda:
   * hay que comparar contra lo que estaba persistido.
   */
  const savedNames = useRef<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setError(null);
      const [s, counts] = await Promise.all([listStages(true), countDealsByStage()]);
      setStages(s);
      setDealCounts(counts);
      savedNames.current = Object.fromEntries(s.map((stage) => [stage.id, stage.name]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las etapas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rename = async (stage: Stage, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === savedNames.current[stage.id]) return;
    try {
      await updateStage(stage.id, { name: trimmed });
      savedNames.current[stage.id] = trimmed;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo renombrar.");
      await load();
    }
  };

  const patch = async (stage: Stage, changes: Partial<Stage>) => {
    setStages((prev) => prev.map((s) => (s.id === stage.id ? { ...s, ...changes } : s)));
    try {
      await updateStage(stage.id, changes);
      // Marcar una ganada suelta la anterior: hay que reflejarlo en pantalla.
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el cambio.");
      await load();
    }
  };

  const drop = async (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const order = [...stages];
    const from = order.findIndex((s) => s.id === dragId);
    const to = order.findIndex((s) => s.id === targetId);
    if (from === -1 || to === -1) return;

    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);

    const renumbered = order.map((s, i) => ({ ...s, position: i + 1 }));
    setStages(renumbered);
    setDragId(null);
    setOverId(null);

    try {
      await reorderStages(renumbered.map((s) => s.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el orden.");
      await load();
    }
  };

  const add = async () => {
    if (!newName.trim()) return;
    try {
      setError(null);
      await createStage(newName, newColor);
      setNewName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la etapa.");
    }
  };

  const remove = async (stage: Stage) => {
    setNotice(null);
    const result = await deleteStage(stage.id);
    if (!result.ok) {
      // Con deals no se borra: se desactiva y los datos quedan.
      await patch(stage, { is_active: false });
      setNotice(
        `"${stage.name}" tiene ${dealCounts[stage.id] ?? 0} deal(s). Se desactivó en vez de borrarse: el tablero deja de mostrarla, pero los deals siguen intactos.`,
      );
      return;
    }
    await load();
  };

  const restore = async (stage: Stage) => {
    await patch(stage, { is_active: true });
    setNotice(`"${stage.name}" volvió al tablero.`);
  };

  if (loading) {
    return (
      <Card title="Pipeline">
        <p role="status" style={{ color: "var(--crm-text-soft)" }}>
          Cargando...
        </p>
      </Card>
    );
  }

  return (
    <Card
      title="Pipeline"
      caption="Las etapas son editables: el tablero se ajusta solo."
      bodyClassName="crm-stage-list"
    >
      {error && (
        <p className="crm-login__error" role="alert" style={{ margin: "0 0 12px" }}>
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          style={{
            margin: "0 0 12px",
            padding: "9px 11px",
            borderRadius: 6,
            background: "var(--crm-primary-soft)",
            border: "1px solid #bfdbfe",
            color: "#1d4ed8",
            fontSize: 12.5,
          }}
        >
          {notice}
        </p>
      )}

      {stages.length === 0 ? (
        <EmptyState title="No hay etapas" hint="Creá la primera para empezar a usar el tablero." />
      ) : (
        stages.map((stage) => {
          const deals = dealCounts[stage.id] ?? 0;
          return (
            <div
              key={stage.id}
              className={[
                "crm-stage-row",
                dragId === stage.id && "is-dragging",
                overId === stage.id && "is-drop",
                !stage.is_active && "is-inactive",
              ]
                .filter(Boolean)
                .join(" ")}
              onDragOver={(event) => {
                event.preventDefault();
                setOverId(stage.id);
              }}
              onDragLeave={() => setOverId((current) => (current === stage.id ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                void drop(stage.id);
              }}
            >
              <span
                className="crm-stage-row__grip"
                draggable
                onDragStart={() => setDragId(stage.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
                aria-hidden
              >
                <GripVertical size={16} />
              </span>

              <input
                type="color"
                className="crm-color"
                name={`color-${stage.id}`}
                value={stage.color}
                aria-label={`Color de ${stage.name}`}
                onChange={(event) => void patch(stage, { color: event.target.value })}
              />

              <span className="crm-stage-row__name">
                <input
                  type="text"
                  className="crm-input"
                  name={`etapa-${stage.id}`}
                  value={stage.name}
                  maxLength={60}
                  aria-label={`Nombre de la etapa ${stage.name}`}
                  onChange={(event) =>
                    setStages((prev) =>
                      prev.map((s) => (s.id === stage.id ? { ...s, name: event.target.value } : s)),
                    )
                  }
                  onBlur={(event) => void rename(stage, event.target.value)}
                />
              </span>

              <span className="crm-stage-row__deals">
                {deals} deal{deals === 1 ? "" : "s"}
              </span>

              <label className="crm-toggle">
                <input
                  type="checkbox"
                  name={`ganada-${stage.id}`}
                  checked={stage.is_won}
                  onChange={(event) => void patch(stage, { is_won: event.target.checked })}
                />
                Ganada
              </label>

              <label className="crm-toggle">
                <input
                  type="checkbox"
                  name={`perdida-${stage.id}`}
                  checked={stage.is_lost}
                  onChange={(event) => void patch(stage, { is_lost: event.target.checked })}
                />
                Perdida
              </label>

              {stage.is_active ? (
                <Button
                  small
                  tone="ghost"
                  onClick={() => void patch(stage, { is_active: false })}
                  title="Quitar del tablero sin perder los deals"
                >
                  Desactivar
                </Button>
              ) : (
                <Button small tone="secondary" onClick={() => void restore(stage)}>
                  <RotateCcw size={13} /> Reactivar
                </Button>
              )}

              <Button small tone="ghost" onClick={() => void remove(stage)} title="Borrar etapa vacía">
                <Trash2 size={14} />
              </Button>
            </div>
          );
        })
      )}

      <div className="crm-row" style={{ padding: 12, gap: 8 }}>
        <input
          type="color"
          className="crm-color"
          name="color-nueva-etapa"
          value={newColor}
          aria-label="Color de la nueva etapa"
          onChange={(event) => setNewColor(event.target.value)}
        />
        <input
          className="crm-input"
          style={{ flex: 1, minWidth: 140 }}
          placeholder="Nombre de la nueva etapa"
          maxLength={60}
          name="nueva-etapa"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void add();
          }}
        />
        <Button small onClick={() => void add()} disabled={!newName.trim()}>
          <Plus size={14} /> Agregar etapa
        </Button>
      </div>

      <p style={{ margin: 0, padding: "0 12px 12px", fontSize: 12, color: "var(--crm-text-soft)" }}>
        Solo una etapa puede ser <Badge tone="success">ganada</Badge> y una{" "}
        <Badge tone="danger">perdida</Badge>. Al marcar una nueva, la anterior se suelta sola. Una etapa
        con deals nunca se borra: se desactiva, y sus deals quedan guardados fuera del tablero.
      </p>
    </Card>
  );
}