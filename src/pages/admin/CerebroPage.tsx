import { useState, useId } from "react";
import {
  Brain,
  ShoppingBag,
  Truck,
  FlaskConical,
  Store,
  CreditCard,
  DollarSign,
  Smartphone,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";

type FlowMode = "all" | "contado" | "credito" | "recompra";

interface AreaInfo {
  id: string;
  num: string;
  name: string;
  subtitle: string;
  icon: typeof ShoppingBag;
  iconBg: string;
  x: number;
  y: number;
  rules: string[];
  tasks: string;
  receives: string;
  delivers: string;
  manualPath: string;
}

const AREAS: Record<string, AreaInfo> = {
  core: {
    id: "core",
    num: "HQ",
    name: "Cerebro Central SAAD",
    subtitle: "Filosofía Operativa y Reglas Maestras",
    icon: Brain,
    iconBg: "linear-gradient(135deg, #d4af37, #996515)",
    x: 270,
    y: 200,
    rules: [
      "Cero Invención: Todo se rige por la realidad operativa documentada.",
      "Estructura Liviana: Cero arriendos ni empleados fijos; 100% digital.",
      "Dropshipping Local: Abastecimiento contra-pedido sin capital estancado.",
      "Utilidad por Caja Real: Ganancia computada solo cuando el recaudo supera el costo.",
    ],
    tasks:
      "Coordinar la sinergia entre ventas, inventario, compras, cartera, finanzas y marketing para proteger márgenes y garantizar entregas el mismo día.",
    receives: "Reportes de ingresos, costos, novedades de clientes y métricas de pauta.",
    delivers: "Directrices de precios, límites de crédito, políticas de garantía y reinversión.",
    manualPath: "cerebro/GEMINI.md",
  },
  "10": {
    id: "10",
    num: "10",
    name: "Ventas y Catálogo",
    subtitle: "Asesoría, cotización y cierre",
    icon: ShoppingBag,
    iconBg: "#3b82f6",
    x: 270,
    y: 45,
    rules: [
      "Envío GRATIS en compras iguales o superiores a $250.000 COP.",
      "Tarifas de flete: Barranquilla $10k-$12k | Resto del país $25k fijos.",
      "Crédito exclusivo para círculo de confianza (amigos, familia, compañeros).",
      "Plantilla oficial con cuentas Nequi, Bancolombia y enlace Wompi.",
    ],
    tasks:
      "Asesorar gustos olfativos por WhatsApp, cotizar frascos enteros vs decants de 10 ml y enviar links de catálogo.",
    receives: "Prospectos calificados de 70-marketing-crm y stock confirmado de 30-inventario.",
    delivers: "Órdenes confirmadas a 20-pedidos y solicitudes de crédito a 50-cartera.",
    manualPath: "cerebro/10-ventas-catalogo/GEMINI.md",
  },
  "20": {
    id: "20",
    num: "20",
    name: "Pedidos y Despachos",
    subtitle: "Empaque y logística de entrega",
    icon: Truck,
    iconBg: "#10b981",
    x: 430,
    y: 100,
    rules: [
      "Entrega el MISMO DÍA en Barranquilla (despacho personal por el dueño).",
      "Envíos nacionales vía Coordinadora con enlace de rastreo (?track=...).",
      "Empaque de lujo: Bolsa contramarcada para botellas; caja rígida con fomi a medida para decants.",
      "Cierre diario obligatorio de pedidos en el sistema al final de la jornada.",
    ],
    tasks:
      "Capturar datos con plantilla en WhatsApp, inspeccionar frascos, empacar con sello de marca y coordinar ruta.",
    receives: "Pedidos pagos de 10-ventas y producto inspeccionado de 30-inventario.",
    delivers: "Notificación de entrega a 60-finanzas y alerta de inicio post-venta a 70-marketing.",
    manualPath: "cerebro/20-pedidos-despachos/GEMINI.md",
  },
  "30": {
    id: "30",
    num: "30",
    name: "Inventario y Decants",
    subtitle: "Dropshipping local y control de producto",
    icon: FlaskConical,
    iconBg: "#8b5cf6",
    x: 460,
    y: 260,
    rules: [
      "Modelo Contra-Pedido: Cero inventario muerto y cero capital atrapado.",
      "Decants de 10 ml listos: El mayorista los entrega ya envasados (cero mermas).",
      "Margen Botellas: +$50.000 a +$70.000 COP de utilidad neta por unidad.",
      "Margen Decants: +$15.000 a +$20.000 COP de ganancia (40%-50% de margen).",
      "Consulta de stock obligatoria por WhatsApp antes de cerrar venta.",
    ],
    tasks:
      "Consultar stock por chat con proveedores, verificar sellos y celofán de botellas al recibirlas y embalar decants en bases de espuma.",
    receives: "Consultas de 10-ventas y producto físico de 40-proveedores.",
    delivers: "Luz verde de stock a 10-ventas y paquetes listos para ruta a 20-pedidos.",
    manualPath: "cerebro/30-inventario-decants/GEMINI.md",
  },
  "40": {
    id: "40",
    num: "40",
    name: "Proveedores y Compras",
    subtitle: "Red de mayoristas y arbitraje",
    icon: Store,
    iconBg: "#f59e0b",
    x: 350,
    y: 360,
    rules: [
      "2 Distribuidores integrales en Barranquilla (Árabes, Diseñador y Nicho).",
      "Arbitraje de precios: Comprar siempre al que lo venda más económico.",
      "Pago 100% anticipado vía Nequi/Bancolombia antes de despacho.",
      "Tiempos de entrega a casa: Máximo 2 horas tras confirmar transferencia.",
      "Garantía total: Cambio inmediato ante cajas golpeadas o fugas.",
    ],
    tasks:
      "Cotizar en simultáneo con ambos distribuidores, transferir pagos anticipados, recibir domicilios de $10k y comprar lotes de 50 empaques.",
    receives: "Requerimientos de compra de 10-ventas y fondos de 60-finanzas.",
    delivers: "Mercancía original a 30-inventario y comprobantes de costo a 60-finanzas.",
    manualPath: "cerebro/40-proveedores-compras/GEMINI.md",
  },
  "50": {
    id: "50",
    num: "50",
    name: "Cartera y Cobranza",
    subtitle: "Crédito 50/50 y cobros quincenales",
    icon: CreditCard,
    iconBg: "#ec4899",
    x: 190,
    y: 360,
    rules: [
      "Esquema 50/50: 50% inicial al recibir el producto + 50% restante a la quincena.",
      "Regla de Paz y Salvo: Máximo 1 perfume a la vez; cero créditos nuevos si debe algo.",
      "Cobros quincenales oficiales los días 15 y 30 por Llave Nequi (cuota completa).",
      "Tolerancia máxima de 5 días; tras mora, BLOQUEO PERMANENTE para crédito.",
    ],
    tasks:
      "Verificar historial crediticio en /cartera, registrar abonos del 50%, enviar cobros automáticos de WhatsApp desde /cobrar y bloquear morosos.",
    receives: "Pedidos a crédito de 10-ventas y reporte de entrega de 20-pedidos.",
    delivers: "Recaudos de cartera a 60-finanzas y lista de bloqueados a 10-ventas.",
    manualPath: "cerebro/50-cartera-cobranza/GEMINI.md",
  },
  "60": {
    id: "60",
    num: "60",
    name: "Finanzas y Conciliación",
    subtitle: "Caja, P&L y colchón de reserva",
    icon: DollarSign,
    iconBg: "#14b8a6",
    x: 80,
    y: 260,
    rules: [
      "Cero costos fijos: Operación 100% digital sin arriendos ni nóminas.",
      "Caja real: Utilidad en $0 hasta que el recaudo cubra el 100% del costo.",
      "Regla de oro bancaria: Cero compras sin notificación push oficial en el celular.",
      "Conciliación semanal: Subida de archivo CSV de Nequi Negocios en /utilidad.",
      "Meta de colchón de caja: $500.000 a $1.000.000 COP intocables.",
    ],
    tasks:
      "Verificar notificaciones bancarias, conciliar CSV semanalmente, auditar P&L neto y separar préstamos personales del dueño.",
    receives: "Recaudos de 20-pedidos y 50-cartera, costos de 40-proveedores.",
    delivers: "Fondos para compras a 40-proveedores y presupuesto de pauta a 70-marketing.",
    manualPath: "cerebro/60-finanzas-conciliacion/GEMINI.md",
  },
  "70": {
    id: "70",
    num: "70",
    name: "Marketing y CRM",
    subtitle: "Meta Ads, Instagram y recompra",
    icon: Smartphone,
    iconBg: "#e11d48",
    x: 110,
    y: 100,
    rules: [
      "Pauta ganadora: Reels virales (ej. Honor & Glory) directo a Instagram DM.",
      "Meta de inversión: $100.000 COP semanales en Meta Ads.",
      "Transparencia: Respuesta directa con precios de frasco y decant sin rodeos.",
      "Seguimiento post-venta: Escribir al día 4 a evaluar satisfacción y fijación.",
      "Fidelización: Precio especial VIP para clientes recurrentes.",
    ],
    tasks:
      "Responder cotizaciones en Instagram DM, publicar videos y entregas, optimizar pauta y activar alertas de recompra a los 40 días.",
    receives: "Alertas de entrega de 20-pedidos y presupuesto publicitario de 60-finanzas.",
    delivers: "Prospectos calificados a 10-ventas y clientes fidelizados al negocio.",
    manualPath: "cerebro/70-marketing-crm/GEMINI.md",
  },
};

const FLOWS: Record<FlowMode, Array<{ from: string; to: string }>> = {
  all: [
    { from: "70", to: "10" },
    { from: "10", to: "20" },
    { from: "20", to: "30" },
    { from: "30", to: "40" },
    { from: "10", to: "50" },
    { from: "50", to: "60" },
    { from: "20", to: "60" },
    { from: "60", to: "40" },
    { from: "60", to: "70" },
  ],
  contado: [
    { from: "70", to: "10" },
    { from: "10", to: "30" },
    { from: "10", to: "60" },
    { from: "60", to: "40" },
    { from: "40", to: "30" },
    { from: "30", to: "20" },
    { from: "20", to: "60" },
  ],
  credito: [
    { from: "10", to: "50" },
    { from: "50", to: "20" },
    { from: "60", to: "40" },
    { from: "50", to: "60" },
  ],
  recompra: [
    { from: "20", to: "70" },
    { from: "70", to: "10" },
  ],
};

export default function CerebroPage() {
  const [selectedId, setSelectedId] = useState<string>("10");
  const [flow, setFlow] = useState<FlowMode>("all");
  const glowFilterId = useId();

  const selectedArea = AREAS[selectedId] ?? AREAS["10"];
  const SelectedIcon = selectedArea.icon;

  const currentConnections = FLOWS[flow] || FLOWS.all;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1rem" }}>
      {/* Top Header Card */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "1rem",
          padding: "1.5rem",
          marginBottom: "1.5rem",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                padding: "0.2rem 0.6rem",
                borderRadius: "9999px",
                background: "rgba(212, 175, 55, 0.15)",
                color: "#d4af37",
                border: "1px solid rgba(212, 175, 55, 0.3)",
              }}
            >
              🧠 Cerebro de la Empresa
            </span>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                padding: "0.2rem 0.6rem",
                borderRadius: "9999px",
                background: "rgba(16, 185, 129, 0.15)",
                color: "#10b981",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
              }}
            >
              <CheckCircle2 size={13} /> 7 de 7 Áreas Activas
            </span>
          </div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: 0, color: "var(--foreground)" }}>
            Mapa Neuronal de Perfumes SAAD
          </h1>
          <p style={{ margin: "0.25rem 0 0", color: "var(--muted)", fontSize: "0.875rem" }}>
            Haz clic en cualquier área para inspeccionar sus reglas maestras, tareas y handoffs en tiempo real.
          </p>
        </div>

        {/* Flow selector buttons */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.4rem",
            background: "rgba(0,0,0,0.25)",
            padding: "0.35rem",
            borderRadius: "0.75rem",
            border: "1px solid var(--border)",
          }}
        >
          {(
            [
              { id: "all", label: "Todas las Áreas" },
              { id: "contado", label: "Venta Contado" },
              { id: "credito", label: "Crédito 50/50" },
              { id: "recompra", label: "Ciclo Recompra" },
            ] as const
          ).map((item) => {
            const active = flow === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setFlow(item.id)}
                style={{
                  padding: "0.4rem 0.8rem",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  borderRadius: "0.5rem",
                  border: "none",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  background: active ? "#d4af37" : "transparent",
                  color: active ? "#0b0f17" : "var(--muted)",
                  boxShadow: active ? "0 2px 8px rgba(212, 175, 55, 0.3)" : "none",
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Interactive Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        {/* Left: Neural Diagram Canvas */}
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "1rem",
            padding: "1rem",
            position: "relative",
            minHeight: 460,
            overflow: "hidden",
            boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "0.75rem",
              left: "1rem",
              fontSize: "0.7rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--muted)",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              zIndex: 5,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#10b981",
                boxShadow: "0 0 8px #10b981",
              }}
            />
            Red Sináptica de Operaciones
          </div>

          {/* SVG Connections Canvas */}
          <svg
            viewBox="0 0 540 400"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          >
            <defs>
              <filter id={glowFilterId}>
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {currentConnections.map((conn, idx) => {
              const fromArea = AREAS[conn.from];
              const toArea = AREAS[conn.to];
              if (!fromArea || !toArea) return null;
              const isHighlight = flow !== "all";
              return (
                <line
                  key={`${conn.from}-${conn.to}-${idx}`}
                  x1={fromArea.x}
                  y1={fromArea.y}
                  x2={toArea.x}
                  y2={toArea.y}
                  stroke={isHighlight ? "#d4af37" : "rgba(212, 175, 55, 0.25)"}
                  strokeWidth={isHighlight ? 2.8 : 1.5}
                  strokeDasharray={isHighlight ? "6 5" : "none"}
                  filter={isHighlight ? `url(#${glowFilterId})` : undefined}
                />
              );
            })}
          </svg>

          {/* Center Nucleus */}
          <div
            onClick={() => setSelectedId("core")}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: 104,
              height: 104,
              borderRadius: "50%",
              background:
                selectedId === "core"
                  ? "linear-gradient(135deg, #ffd700, #b8860b)"
                  : "linear-gradient(135deg, #d4af37, #996515)",
              color: "#0b0f17",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 24px rgba(212, 175, 55, 0.4)",
              border: "3px solid rgba(255, 255, 255, 0.5)",
              cursor: "pointer",
              zIndex: 10,
              textAlign: "center",
              padding: "0.25rem",
              transition: "transform 0.2s ease, box-shadow 0.2s ease",
            }}
          >
            <Brain size={24} strokeWidth={2.4} />
            <span style={{ fontSize: "0.65rem", fontWeight: 900, letterSpacing: "0.08em", marginTop: 2 }}>
              SAAD HQ
            </span>
            <span style={{ fontSize: "0.55rem", fontWeight: 700, opacity: 0.9 }}>Cerebro Central</span>
          </div>

          {/* 7 Orbiting Nodes */}
          {Object.keys(AREAS)
            .filter((k) => k !== "core")
            .map((k) => {
              const area = AREAS[k];
              const isSelected = selectedId === area.id;
              const IconComp = area.icon;

              const leftPct = (area.x / 540) * 100;
              const topPct = (area.y / 400) * 100;

              return (
                <div
                  key={area.id}
                  onClick={() => setSelectedId(area.id)}
                  style={{
                    position: "absolute",
                    left: `${leftPct}%`,
                    top: `${topPct}%`,
                    transform: "translate(-50%, -50%)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    cursor: "pointer",
                    zIndex: 20,
                  }}
                >
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: "0.85rem",
                      background: isSelected ? "#d4af37" : "var(--surface)",
                      color: isSelected ? "#0b0f17" : "var(--foreground)",
                      border: isSelected ? "2px solid #fff" : "2px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: isSelected
                        ? "0 0 20px rgba(212, 175, 55, 0.6)"
                        : "0 4px 12px rgba(0,0,0,0.15)",
                      transform: isSelected ? "scale(1.15)" : "scale(1)",
                      transition: "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
                      position: "relative",
                    }}
                  >
                    <IconComp size={22} strokeWidth={2.2} />
                    <span
                      style={{
                        position: "absolute",
                        top: -6,
                        right: -6,
                        fontSize: "0.55rem",
                        fontWeight: 900,
                        background: "#d4af37",
                        color: "#0b0f17",
                        padding: "1px 5px",
                        borderRadius: "9999px",
                        border: "1px solid var(--surface)",
                      }}
                    >
                      {area.num}
                    </span>
                  </div>
                  <span
                    style={{
                      marginTop: 4,
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      color: isSelected ? "#d4af37" : "var(--foreground)",
                      background: "rgba(0,0,0,0.65)",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      whiteSpace: "nowrap",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {area.name}
                  </span>
                </div>
              );
            })}
        </div>

        {/* Right: Area Detail Inspector */}
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "1rem",
            padding: "1.5rem",
            boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          {/* Card Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid var(--border)",
              paddingBottom: "1rem",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  color: "#d4af37",
                  background: "rgba(212, 175, 55, 0.12)",
                  padding: "0.2rem 0.5rem",
                  borderRadius: "4px",
                  border: "1px solid rgba(212, 175, 55, 0.25)",
                }}
              >
                Área {selectedArea.num}
              </span>
              <h2 style={{ fontSize: "1.35rem", fontWeight: 800, margin: "0.3rem 0 0.1rem", color: "var(--foreground)" }}>
                {selectedArea.name}
              </h2>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--muted)" }}>{selectedArea.subtitle}</p>
            </div>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "0.75rem",
                background: "rgba(212, 175, 55, 0.12)",
                border: "1px solid rgba(212, 175, 55, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#d4af37",
              }}
            >
              <SelectedIcon size={24} />
            </div>
          </div>

          {/* Reglas de Oro */}
          <div
            style={{
              background: "rgba(0,0,0,0.2)",
              border: "1px solid var(--border)",
              borderRadius: "0.75rem",
              padding: "1rem",
            }}
          >
            <div
              style={{
                fontSize: "0.72rem",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#d4af37",
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                marginBottom: "0.5rem",
              }}
            >
              <Sparkles size={14} /> Reglas de Oro del Área
            </div>
            <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.8rem", color: "var(--foreground)", lineHeight: 1.5 }}>
              {selectedArea.rules.map((rule, idx) => (
                <li key={idx} style={{ marginBottom: "0.35rem" }}>
                  {rule}
                </li>
              ))}
            </ul>
          </div>

          {/* Tareas Repetitivas */}
          <div
            style={{
              background: "rgba(0,0,0,0.15)",
              border: "1px solid var(--border)",
              borderRadius: "0.75rem",
              padding: "0.85rem 1rem",
            }}
          >
            <div
              style={{
                fontSize: "0.72rem",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#10b981",
                marginBottom: "0.35rem",
              }}
            >
              ⚡ Tareas Clave
            </div>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--foreground)", lineHeight: 1.45 }}>
              {selectedArea.tasks}
            </p>
          </div>

          {/* Recibe de / Entrega a */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div
              style={{
                background: "rgba(0,0,0,0.12)",
                border: "1px solid var(--border)",
                borderRadius: "0.5rem",
                padding: "0.75rem",
              }}
            >
              <span
                style={{
                  fontSize: "0.65rem",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  display: "block",
                  marginBottom: "0.25rem",
                }}
              >
                📥 Recibe De
              </span>
              <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--foreground)", lineHeight: 1.35 }}>
                {selectedArea.receives}
              </p>
            </div>
            <div
              style={{
                background: "rgba(0,0,0,0.12)",
                border: "1px solid var(--border)",
                borderRadius: "0.5rem",
                padding: "0.75rem",
              }}
            >
              <span
                style={{
                  fontSize: "0.65rem",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  display: "block",
                  marginBottom: "0.25rem",
                }}
              >
                📤 Entrega A
              </span>
              <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--foreground)", lineHeight: 1.35 }}>
                {selectedArea.delivers}
              </p>
            </div>
          </div>

          {/* Footer Manual File */}
          <div
            style={{
              paddingTop: "0.75rem",
              borderTop: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "0.75rem",
            }}
          >
            <span style={{ color: "var(--muted)" }}>Manual en Repositorio:</span>
            <code
              style={{
                background: "rgba(212, 175, 55, 0.1)",
                color: "#d4af37",
                padding: "2px 6px",
                borderRadius: "4px",
                fontSize: "0.75rem",
                fontWeight: 600,
              }}
            >
              {selectedArea.manualPath}
            </code>
          </div>
        </div>
      </div>

      {/* Bottom Summary Grid: All 7 areas at a glance */}
      <div style={{ marginTop: "2rem" }}>
        <h3
          style={{
            fontSize: "1rem",
            fontWeight: 800,
            color: "var(--foreground)",
            marginBottom: "0.75rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span>Directorio de Áreas del Negocio</span>
          <ArrowRight size={16} color="var(--muted)" />
        </h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: "0.75rem",
          }}
        >
          {Object.keys(AREAS)
            .filter((k) => k !== "core")
            .map((k) => {
              const a = AREAS[k];
              const isSelected = selectedId === a.id;
              const CardIcon = a.icon;
              return (
                <div
                  key={a.id}
                  onClick={() => {
                    setSelectedId(a.id);
                    window.scrollTo({ top: 120, behavior: "smooth" });
                  }}
                  style={{
                    background: isSelected ? "rgba(212, 175, 55, 0.08)" : "var(--surface)",
                    border: isSelected ? "1px solid #d4af37" : "1px solid var(--border)",
                    borderRadius: "0.75rem",
                    padding: "0.85rem",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: "0.5rem",
                      background: isSelected ? "#d4af37" : "rgba(255,255,255,0.06)",
                      color: isSelected ? "#0b0f17" : "#d4af37",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <CardIcon size={20} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                      <span style={{ fontSize: "0.65rem", fontWeight: 800, color: "#d4af37" }}>Área {a.num}</span>
                    </div>
                    <div
                      style={{
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        color: "var(--foreground)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {a.name}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
