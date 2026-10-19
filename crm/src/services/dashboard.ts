import { requireSupabase } from "../lib/supabase";
import { listStages } from "./pipeline";
import type { Stage } from "./pipeline";
import type { Conversation } from "./crm";

/**
 * Datos del panel de control.
 *
 * Mezcla dos fuentes: las tablas `crm_*` (deals, conversaciones, tareas) y
 * `admin_dashboard_metrics()` de la tienda, que ya calcula la utilidad y el
 * fiado con la lógica contable correcta. No se duplica ese cálculo: si
 * mañana cambia la fórmula en la tienda, el panel del CRM cambia con ella.
 *
 * El filtro de rango (Hoy / Semana / Mes / Todo) acota solo métricas de flujo
 * (deals y conversaciones nuevas). Las instantáneas —cartera por cobrar,
 * deals abiertos, tareas pendientes— no se acotan: son fotos del ahora.
 */

export type Range = "hoy" | "semana" | "mes" | "todo";

export const RANGE_DAYS: Record<Range, number | null> = {
  hoy: 0,
  semana: 6,
  mes: 29,
  todo: null,
};

export type FunnelRow = {
  stage: Stage;
  /** Deals que están o pasaron por esta etapa. */
  count: number;
  /** Suma de `value` de esos deals. */
  amount: number;
  /** Porcentaje respecto de la primera etapa. */
  percent: number;
  /** Qué fracción de la etapa anterior pasó a esta. */
  stepConversion: number | null;
};

export type DashboardData = {
  stages: Stage[];
  funnel: FunnelRow[];
  /** Deals en etapas que no son ganada ni perdida. */
  openDeals: number;
  openAmount: number;
  wonDeals: number;
  lostDeals: number;
  /** won / (won + lost + abiertas): lo que de verdad se convierte. */
  conversionRate: number;
  /** Deals sin cerrar creados hace más de 3 días. */
  stuckDeals: number;
  /** Conversaciones abiertas esperando respuesta nuestra. */
  unanswered: number;
  openConversations: number;
  /** Tareas pendientes que vencen hoy. */
  tasksToday: number;
  tasksOverdue: number;
  /** Cifras de la tienda; null si el usuario no es admin. */
  store: {
    salesRevenue: number;
    salesProfit: number;
    creditOutstanding: number;
  } | null;
  /** Por qué no hay cifras de la tienda, para no callarlo en silencio. */
  storeError: string | null;
};

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export async function loadDashboard(range: Range): Promise<DashboardData> {
  const days = RANGE_DAYS[range];

  const [stages, dealsResult, conversationsResult, tasksResult] = await Promise.all([
    listStages(),
    fetchDeals(),
    fetchConversations(),
    fetchTasks(),
  ]);

  const deals = dealsResult;
  const conversations = conversationsResult;
  const tasks = tasksResult;

  // --- Embudo ---
  // Una etapa cuenta los deals que están en ella. Como una etapa desactivada
  // conserva `staged_at_stage_id`, el histórico no se pierde al renombrar.
  const wonStageIds = new Set(stages.filter((s) => s.is_won).map((s) => s.id));
  const lostStageIds = new Set(stages.filter((s) => s.is_lost).map((s) => s.id));

  // Sin la anotación, TS infiere `stepConversion` como el literal `null` (por
  // el `satisfies` de abajo) y después no le deja asignar un número.
  const rows: FunnelRow[] = stages.map((stage) => {
    const items = deals.filter((d) => d.stage_id === stage.id);
    return {
      stage,
      count: items.length,
      amount: items.reduce((sum, d) => sum + num(d.value), 0),
      percent: 0,
      stepConversion: null,
    } satisfies FunnelRow;
  });

  const firstCount = rows[0]?.count ?? 0;
  rows.forEach((row, index) => {
    row.percent = firstCount === 0 ? 0 : (row.count / firstCount) * 100;
    const previous = index === 0 ? null : rows[index - 1].count;
    row.stepConversion = previous === null || previous === 0 ? null : (row.count / previous) * 100;
  });

  // --- Estados ---
  // "En curso" son los deals que están en una etapa que no es ganada ni
  // perdida. Un deal pierde ese estado en cuanto se marca `closed_at`, que
  // es lo que pasa al moverlo a la etapa ganada o perdida.
  const inFlow = deals.filter(
    (d) => d.stage_id !== null && !wonStageIds.has(d.stage_id) && !lostStageIds.has(d.stage_id),
  );

  const wonDeals = deals.filter((d) => d.stage_id && wonStageIds.has(d.stage_id)).length;
  const lostDeals = deals.filter((d) => d.stage_id && lostStageIds.has(d.stage_id)).length;

  // La conversión se mide sobre lo decidido, no sobre el total: contar los
  // deals abiertos en el denominador hundiría el porcentaje sin sentido.
  const decided = wonDeals + lostDeals;

  const cutoff = new Date(Date.now() - 3 * 86400000).toISOString();
  const stuckDeals = deals.filter(
    (d) => !d.closed_at && d.stage_id && !wonStageIds.has(d.stage_id) && d.created_at < cutoff,
  ).length;

  // --- Conversaciones ---
  const openConversations = conversations.filter((c) => c.status !== "closed");
  const unanswered = openConversations.filter((c) => c.last_direction === "in").length;

  // --- Tareas ---
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const pending = tasks.filter((t) => !t.done);
  const tasksToday = pending.filter((t) => new Date(t.due_at) <= todayEnd).length;
  const nowIso = new Date().toISOString();
  const tasksOverdue = pending.filter((t) => t.due_at < nowIso).length;

  // --- Tienda ---
  let store: DashboardData["store"] = null;
  let storeError: string | null = null;
  try {
    const { data, error } = await requireSupabase().rpc("admin_dashboard_metrics", {
      period_days: days,
    });
    if (error) throw error;
    const metrics = (data ?? {}) as Record<string, unknown>;
    store = {
      salesRevenue: num(metrics.sales_revenue),
      salesProfit: num(metrics.sales_profit),
      creditOutstanding: num(metrics.credit_outstanding_balance),
    };
  } catch (err) {
    // Un asesor no puede llamar a esa RPC. No es un error que haya que
    // esconder: se avisa en la tarjeta y el panel sigue con lo del CRM.
    //
    // El mensaje de Postgres ("You do not have access to the overview
    // section") no le sirve de nada a un asesor: se le dice que el dueño
    // le tiene que dar acceso a esa seccion.
    const mensaje = err instanceof Error ? err.message : "";
    const esPermiso = /access to the|permission denied/i.test(mensaje);
    storeError = esPermiso
      ? "No tenés acceso a las cifras de la tienda. Pídele al administrador que te habilite esa sección."
      : err instanceof Error
        ? err.message
        : "No se pudieron leer las cifras de la tienda.";
  }

  return {
    stages,
    funnel: rows,
    openDeals: inFlow.length,
    openAmount: inFlow.reduce((sum, d) => sum + num(d.value), 0),
    wonDeals,
    lostDeals,
    conversionRate: decided === 0 ? 0 : (wonDeals / decided) * 100,
    stuckDeals,
    unanswered,
    openConversations: openConversations.length,
    tasksToday,
    tasksOverdue,
    store,
    storeError,
  };
}

type DealRow = {
  id: string;
  stage_id: string | null;
  value: number | null;
  created_at: string;
  closed_at: string | null;
  lostStageIds?: Set<string>;
};

async function fetchDeals(): Promise<DealRow[]> {
  const { data, error } = await requireSupabase()
    .from("crm_deals")
    .select("id, stage_id, value, created_at, closed_at");
  if (error) throw error;
  return (data ?? []) as DealRow[];
}

async function fetchConversations(): Promise<Conversation[]> {
  const { data, error } = await requireSupabase()
    .from("crm_conversations")
    .select("id, status, last_message_at, created_at");
  if (error) throw error;
  return (data ?? []) as Conversation[];
}

async function fetchTasks() {
  const { data, error } = await requireSupabase()
    .from("crm_tasks")
    .select("id, due_at, done");
  if (error) throw error;
  return (data ?? []) as { id: string; due_at: string; done: boolean }[];
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);

// `toFixed` usa punto decimal; en Colombia va coma. `Intl` con es-CO lo
// resuelve sin inventar un replace que rompa con los miles.
const percent = (value: number) =>
  `${new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}%`;

export { formatMoney, percent };