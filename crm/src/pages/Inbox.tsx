import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bot, Check, CheckCheck, Instagram, MessageCircle, Send, Search, Users } from "lucide-react";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import Badge from "../components/Badge";
import Button from "../components/Button";
import {
  displayName,
  getMessages,
  listConversations,
  sendMessage,
  setConversationAi,
  setConversationStatus,
} from "../services/crm";
import type { Conversation, ConversationStatus, Message } from "../services/crm";

/** Tiempo relativo corto. La lista es densa: la fecha completa estorba. */
function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d`;
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" });
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function channelIcon(provider: string | undefined) {
  if (provider === "instagram") return <Instagram size={13} />;
  if (provider === "messenger") return <MessageCircle size={13} />;
  return <MessageCircle size={13} />;
}

const STATUS_LABEL: Record<ConversationStatus, string> = {
  open: "Abierta",
  pending: "Esperando",
  closed: "Cerrada",
};

const FILTERS: { id: ConversationStatus | "all"; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "open", label: "Abiertas" },
  { id: "pending", label: "Esperando" },
  { id: "closed", label: "Cerradas" },
];

export default function Inbox({ userId }: { userId: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ConversationStatus | "all">("all");

  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setConversations(await listConversations());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las conversaciones.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  // Al abrir una conversacion se sube `last_message_at` para que quede arriba
  // en el listado; sin esto, responder una seria "reenvejecerla".
  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    let active = true;
    void getMessages(selectedId)
      .then((rows) => {
        if (active) setMessages(rows);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "No se pudo abrir el hilo.");
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  // Mantiene el hilo pegado al ultimo mensaje.
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length, selectedId]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter !== "all" && c.status !== filter) return false;
      if (!q) return true;
      const name = displayName(c.contact).toLowerCase();
      const preview = (c.last_body ?? "").toLowerCase();
      return name.includes(q) || preview.includes(q);
    });
  }, [conversations, query, filter]);

  const submit = async () => {
    if (!selectedId || !draft.trim() || sending) return;
    const text = draft;
    setDraft("");
    setSending(true);
    try {
      // Optimista: el mensaje aparece ya, sin esperar la ida a la base.
      setMessages((prev) => [
        ...prev,
        {
          id: `tmp-${Date.now()}`,
          direction: "out",
          sender_type: "human",
          body: text,
          delivery_status: "sending",
          sent_at: new Date().toISOString(),
        },
      ]);
      await sendMessage(selectedId, text, Boolean(selected?.zernio_conversation_id));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el mensaje.");
      setMessages((prev) => prev.filter((m) => m.id !== `tmp-${Date.now()}`));
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async (status: ConversationStatus) => {
    if (!selected) return;
    setConversations((prev) => prev.map((c) => (c.id === selected.id ? { ...c, status } : c)));
    try {
      await setConversationStatus(selected.id, status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el estado.");
      void load();
    }
  };

  const toggleAi = async () => {
    if (!selected) return;
    const next = !selected.ai_enabled;
    setConversations((prev) => prev.map((c) => (c.id === selected.id ? { ...c, ai_enabled: next } : c)));
    try {
      await setConversationAi(selected.id, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el agente.");
      void load();
    }
  };

  return (
    <div className={["crm-inbox", selected && "is-thread-open"].filter(Boolean).join(" ")}>
      <Card
        title="Conversaciones"
        caption={`${visible.length} de ${conversations.length}`}
        className="crm-inbox__list"
        bodyClassName="crm-inbox__list"
      >
        <div className="crm-inbox__filters">
          <input
            className="crm-input"
            style={{ flex: 1, minWidth: 0 }}
            placeholder="Buscar por nombre o texto..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            name="buscar-conversaciones"
            aria-label="Buscar conversaciones"
          />
          <select
            className="crm-select"
            style={{ maxWidth: 130 }}
            name="filtro-estado"
            value={filter}
            onChange={(event) => setFilter(event.target.value as ConversationStatus | "all")}
            aria-label="Filtrar por estado"
          >
            {FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="crm-login__error" role="alert" style={{ margin: 10 }}>
            {error}
          </p>
        )}

        {loading ? (
          <p style={{ padding: 14, color: "var(--crm-text-soft)" }} role="status">
            Cargando...
          </p>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Users size={20} />}
            title={conversations.length === 0 ? "Todavía no hay conversaciones" : "Ningún resultado"}
            hint={
              conversations.length === 0
                ? "Se crean solas cuando entre un mensaje por Zernio, o puedes crear un contacto y empezar a escribir."
                : "Prueba con otro nombre o cambia el filtro de estado."
            }
          />
        ) : (
          visible.map((c) => {
            const name = displayName(c.contact);
            const mine = c.assigned_to === userId;
            return (
              <button
                key={c.id}
                type="button"
                className={["crm-conv", c.id === selectedId && "is-active"].filter(Boolean).join(" ")}
                onClick={() => setSelectedId(c.id)}
              >
                <span className="crm-avatar">{name.slice(0, 1).toUpperCase()}</span>
                <span className="crm-conv__body">
                  <span className="crm-conv__top">
                    <span className="crm-conv__name">{name}</span>
                    <span className="crm-conv__time">{relativeTime(c.last_message_at ?? c.created_at)}</span>
                  </span>
                  <span className="crm-conv__preview">
                    {c.last_direction === "out" ? "Tú: " : ""}
                    {c.last_body ?? "Sin mensajes"}
                  </span>
                  <span className="crm-row" style={{ gap: 5, marginTop: 4 }}>
                    {channelIcon(c.channel?.provider)}
                    {c.status !== "open" && <Badge>{STATUS_LABEL[c.status]}</Badge>}
                    {c.assigned_to ? (
                      <Badge tone={mine ? "info" : "neutral"}>{mine ? "Mía" : "De otro asesor"}</Badge>
                    ) : (
                      <Badge>Sin asignar</Badge>
                    )}
                    {!c.ai_enabled && <Badge>IA off</Badge>}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </Card>

      <Card
        className="crm-inbox__thread"
        bodyClassName="crm-thread"
        title={
          <span className="crm-row" style={{ gap: 8 }}>
            <button type="button" className="crm-btn crm-btn--ghost crm-btn--sm crm-back" onClick={() => setSelectedId(null)}>
              <ArrowLeft size={15} />
            </button>
            {selected ? displayName(selected.contact) : "Conversación"}
          </span>
        }
        caption={selected?.contact?.phone_e164 ?? undefined}
        actions={
          selected ? (
            <div className="crm-row" style={{ gap: 7 }}>
              <select
                className="crm-select"
                name="estado-conversacion"
                value={selected.status}
                onChange={(event) => void changeStatus(event.target.value as ConversationStatus)}
                aria-label="Estado de la conversación"
              >
                {FILTERS.filter((f) => f.id !== "all").map((f) => (
                  <option key={f.id} value={f.id}>
                    {STATUS_LABEL[f.id as ConversationStatus]}
                  </option>
                ))}
              </select>
              <Button small tone={selected.ai_enabled ? "secondary" : "primary"} onClick={() => void toggleAi()}>
                <Bot size={14} /> {selected.ai_enabled ? "IA activa" : "IA apagada"}
              </Button>
            </div>
          ) : null
        }
      >
        {!selected ? (
          <div className="crm-thread__empty">
            <EmptyState
              icon={<Search size={20} />}
              title="Elige una conversación"
              hint="A la izquierda están los hilos. El agente de IA se prende por conversación."
            />
          </div>
        ) : (
          <>
            <div className="crm-thread__scroll" ref={scrollRef}>
              {messages.length === 0 ? (
                <EmptyState
                  icon={<Send size={20} />}
                  title="Sin mensajes todavía"
                  hint="Escribe abajo para abrir la conversación."
                />
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={["crm-bubble", m.direction === "out" && "crm-bubble--out", m.delivery_status === "failed" && "crm-bubble--failed"].filter(Boolean).join(" ")}>
                    {m.body}
                    <span className="crm-bubble__meta">
                      {clockTime(m.sent_at)}
                      {m.sender_type === "ai" && " · IA"}
                      {m.direction === "out" &&
                        (m.delivery_status === "read" || m.delivery_status === "delivered" ? (
                          <CheckCheck size={12} />
                        ) : m.delivery_status === "sent" ? (
                          <Check size={12} />
                        ) : (
                          "· pendiente"
                        ))}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="crm-thread__composer">
              <textarea
                className="crm-input"
                placeholder="Escribe un mensaje..."
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  // Enter envia; Shift+Enter hace salto de linea. Es lo que
                  // espera cualquiera que venga de una app de mensajeria.
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                name="mensaje"
                aria-label="Mensaje"
              />
              <Button onClick={() => void submit()} disabled={sending || !draft.trim()}>
                <Send size={15} /> Enviar
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}