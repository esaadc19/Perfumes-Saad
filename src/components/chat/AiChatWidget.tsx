import React, { useState, useRef, useEffect } from "react";
import { Bot, MessageCircle, Send, Sparkles, X, RotateCcw, Check, ShoppingBag } from "lucide-react";
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

/** Formatea texto con soporte para negritas (**texto**) y precios ($190.000) */
function parseInlineStyles(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // Coincide con **negrita** o precios en formato COP ($ 190.000 o $190.000)
  const regex = /(\*\*.*?\*\*|\$\s?[0-9]{1,3}(?:\.[0-9]{3})+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={match.index} className="ai-font-bold">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("$")) {
      parts.push(
        <span key={match.index} className="ai-price-tag">
          {token}
        </span>
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  return parts.length > 0 ? parts : text;
}

/** Componente que limpia markdown crudo (###, *, etc.) y lo presenta con diseño premium */
function FormattedChatContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];

  let currentBulletList: React.ReactNode[] = [];

  const flushBullets = (key: string) => {
    if (currentBulletList.length > 0) {
      elements.push(
        <div key={key} className="ai-bubble-bullet-group">
          {currentBulletList}
        </div>
      );
      currentBulletList = [];
    }
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushBullets(`flush-${idx}`);
      return;
    }

    // Encabezados estilo markdown (###, ##, #)
    if (trimmed.startsWith("#")) {
      flushBullets(`flush-h-${idx}`);
      const cleanHeader = trimmed.replace(/^#+\s*/, "");
      elements.push(
        <h5 key={`h-${idx}`} className="ai-bubble-heading">
          {cleanHeader}
        </h5>
      );
      return;
    }

    // Viñetas (* o -)
    if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
      const cleanBullet = trimmed.replace(/^[*\-]\s+/, "");
      currentBulletList.push(
        <div key={`b-${idx}`} className="ai-bubble-bullet">
          <span className="ai-bullet-dot">•</span>
          <span className="ai-bullet-text">{parseInlineStyles(cleanBullet)}</span>
        </div>
      );
      return;
    }

    // Líneas normales de texto
    flushBullets(`flush-p-${idx}`);
    elements.push(
      <p key={`p-${idx}`} className="ai-bubble-paragraph">
        {parseInlineStyles(trimmed)}
      </p>
    );
  });

  flushBullets("flush-final");

  // Detección de invitación a WhatsApp para agregar botón directo
  const mentionsWhatsapp =
    content.includes("WhatsApp") ||
    content.includes("310 231 8786") ||
    content.includes("3102318786");

  return (
    <div className="ai-formatted-content">
      {elements}
      {mentionsWhatsapp && (
        <a
          href="https://wa.me/573102318786?text=Hola%20Perfumes%20SAAD,%20estoy%20recibiendo%20asesor%C3%ADa%20en%20la%20tienda%20y%20quiero%20confirmar%20un%20pedido."
          target="_blank"
          rel="noopener noreferrer"
          className="ai-whatsapp-pill"
        >
          <MessageCircle size={14} />
          <span>Pedir o consultar por WhatsApp</span>
        </a>
      )}
    </div>
  );
}

export default function AiChatWidget({ isAdmin = false, authToken = null }: AiChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);

  const initialWelcome = isAdmin
    ? "Hola Saad. Soy tu copiloto ejecutivo de Perfumes SAAD. Puedes consultarme ventas del período, perfumes con stock bajo, margen o cartera vencida."
    : "¡Hola! Te doy la bienvenida a **Perfumes SAAD** ✨\n\nSoy tu asesor olfativo personal. Para recomendarte fragancias 100% certeras con disponibilidad real, cuéntame:\n\n**¿Para quién buscas el perfume hoy?**";

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: initialWelcome,
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
  }, [messages, isOpen, loading]);

  const handleReset = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: "assistant",
        content: initialWelcome,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

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

  // Cálculo de qué opciones sugerir dinámicamente según la etapa de la conversación
  const userMessagesCount = messages.filter((m) => m.role === "user").length;

  let contextualChips: string[] = [];

  if (isAdmin) {
    contextualChips = [
      "¿Cómo van las ventas de este mes?",
      "¿Qué clientes tienen crédito vencido?",
      "¿Cuáles perfumes tienen stock bajo?",
    ];
  } else {
    if (userMessagesCount === 0) {
      // Paso 1 del perfilamiento: ¿Para quién es?
      contextualChips = [
        "👨 Para Caballero (Hombre)",
        "👩 Para Dama (Mujer)",
        "✨ Unisex",
        "🎁 Es para un Regalo",
        "🔍 Busco un perfume específico",
      ];
    } else if (userMessagesCount === 1) {
      // Paso 2 del perfilamiento: ¿Cómo o para qué ocasión lo busca?
      contextualChips = [
        "☀️ Diario / Fresco (Calor u oficina)",
        "🌙 Noche / Citas (Seductor y duradero)",
        "👑 Lujo Árabe / Exclusivo con estela",
        "🧪 Quiero probar Decants de 10ml",
        "💎 Los más vendidos",
      ];
    } else {
      // Paso 3: Preguntas de cierre / exploración
      contextualChips = [
        "🧪 ¿Cuáles tienen Decant de 10ml?",
        "🚚 ¿Cómo son los envíos a mi ciudad?",
        "💳 Medios de pago disponibles",
        "🔄 Empezar de nuevo",
      ];
    }
  }

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
                <h4>{isAdmin ? "Copiloto Perfumes SAAD" : "Asesor Olfativo SAAD"}</h4>
                <span>{isAdmin ? "Gemini 3.5 Flash · Métricas en vivo" : "Perfilamiento olfativo · Stock en tiempo real"}</span>
              </div>
            </div>
            <div className="ai-header-actions">
              <button
                type="button"
                className="ai-header-btn"
                onClick={handleReset}
                title="Reiniciar conversación"
                aria-label="Reiniciar conversación"
              >
                <RotateCcw size={15} />
              </button>
              <button
                type="button"
                className="ai-header-btn"
                onClick={() => setIsOpen(false)}
                title="Cerrar chat"
                aria-label="Cerrar chat"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="ai-chat-messages">
            {messages.map((m) => (
              <div key={m.id} className={`ai-message-row ${m.role}`}>
                <div className="ai-message-bubble">
                  {m.role === "assistant" ? (
                    <FormattedChatContent content={m.content} />
                  ) : (
                    <p className="ai-user-content">{m.content}</p>
                  )}
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
                  <span className="ai-typing-label">Consultando catálogo y stock disponible…</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chips de perfilamiento interactivo */}
          {!loading && contextualChips.length > 0 && (
            <div className="ai-profiling-chips">
              <span className="ai-chips-label">
                {isAdmin
                  ? "Sugerencias:"
                  : userMessagesCount === 0
                  ? "Paso 1 · ¿Para quién es?"
                  : userMessagesCount === 1
                  ? "Paso 2 · ¿Qué estilo buscas?"
                  : "Explorar:"}
              </span>
              <div className="ai-chips-scroll">
                {contextualChips.map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="ai-chip-btn"
                    onClick={() => {
                      if (chip === "🔄 Empezar de nuevo") {
                        handleReset();
                      } else {
                        handleSend(chip);
                      }
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
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
              placeholder={
                isAdmin
                  ? "Pregúntale a Gemini sobre ventas o cartera…"
                  : userMessagesCount === 0
                  ? "Escribe o elige una opción arriba…"
                  : "¿Qué aroma u ocasión buscas?…"
              }
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