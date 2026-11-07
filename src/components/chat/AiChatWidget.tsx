import { useState, useRef, useEffect } from "react";
import { Bot, MessageCircle, Send, Sparkles, X, User, ArrowRight } from "lucide-react";
import { supabase } from "../../lib/supabase";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
}

interface AiChatWidgetProps {
  isAdmin?: boolean;
  authToken?: string | null;
}

export default function AiChatWidget({ isAdmin = false, authToken = null }: AiChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: isAdmin
        ? "Hola Saad. Soy tu copiloto de Perfumes SAAD. Puedes preguntarme por catálogo, stock de presentaciones, ventas del período o cartera vencida."
        : "¡Hola! Bienvenido a Perfumes SAAD. Soy tu asesor olfativo virtual. ¿Buscas alguna fragancia en especial, decants de 10ml o te gustaría que te recomiende un perfume según la ocasión o el clima?",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!textToSend) setInput("");
    setLoading(true);

    try {
      const historyPayload = [...messages, userMessage].map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        content: m.content,
      }));

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      let token = authToken;
      if (isAdmin && !token && supabase) {
        const { data } = await supabase.auth.getSession();
        token = data.session?.access_token || null;
      }
      if (isAdmin && token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch("/api/gemini/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: historyPayload,
          mode: isAdmin ? "admin" : "store",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "No se pudo obtener respuesta del asesor.");
      }

      const botMessage: Message = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: data.response || "No recibí información.",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `Lo siento, ocurrió un error temporal: ${err.message || "intenta de nuevo"}.`,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = isAdmin
    ? [
        "¿Cómo van las ventas de este mes?",
        "¿Qué clientes tienen crédito vencido?",
        "¿Cuáles perfumes tienen stock bajo?",
      ]
    : [
        "Recomiéndame un perfume para clima cálido",
        "¿Qué decants de 10ml tienen disponibles?",
        "Busco un perfume árabe elegante",
      ];

  return (
    <div className="ai-chat-root">
      {/* Botón flotante */}
      {!isOpen && (
        <button
          type="button"
          className="ai-chat-launcher"
          onClick={() => setIsOpen(true)}
          aria-label="Abrir asesor olfativo inteligente"
        >
          <span className="ai-launcher-icon">
            <Sparkles size={18} />
          </span>
          <span className="ai-launcher-text">
            {isAdmin ? "Copiloto IA" : "Asesor Olfativo"}
          </span>
        </button>
      )}

      {/* Ventana de chat */}
      {isOpen && (
        <div className="ai-chat-window" role="dialog" aria-label="Asesor Inteligente">
          <div className="ai-chat-header">
            <div className="ai-header-info">
              <span className="ai-avatar">
                <Bot size={18} />
              </span>
              <div>
                <h4>{isAdmin ? "Copiloto Perfumes SAAD" : "Asesor Perfumes SAAD"}</h4>
                <span>{isAdmin ? "Gemini 2.5 · Conectado a Supabase" : "Asesoría olfativa con catálogo en vivo"}</span>
              </div>
            </div>
            <button
              type="button"
              className="ai-close-btn"
              onClick={() => setIsOpen(false)}
              aria-label="Cerrar chat"
            >
              <X size={18} />
            </button>
          </div>

          <div className="ai-chat-messages">
            {messages.map((m) => (
              <div key={m.id} className={`ai-message-row ${m.role}`}>
                <div className="ai-message-bubble">
                  <p>{m.content}</p>
                  <span className="ai-message-time">{m.time}</span>
                </div>
              </div>
            ))}
            {loading && (
              <div className="ai-message-row assistant">
                <div className="ai-message-bubble loading">
                  <span className="ai-typing-dot" />
                  <span className="ai-typing-dot" />
                  <span className="ai-typing-dot" />
                  <span className="ai-typing-label">Consultando catálogo y stock…</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Accesos rápidos sugeridos */}
          {messages.length <= 2 && !loading && (
            <div className="ai-quick-prompts">
              {quickPrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="ai-quick-btn"
                  onClick={() => handleSend(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          <form
            className="ai-chat-input-bar"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <input
              type="text"
              placeholder={isAdmin ? "Pregúntale a Gemini sobre tu negocio…" : "Escribe tu duda o qué perfume buscas…"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              autoFocus
            />
            <button
              type="submit"
              className="ai-send-btn"
              disabled={!input.trim() || loading}
              aria-label="Enviar mensaje"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
