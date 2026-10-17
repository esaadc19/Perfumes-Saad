import { requireSupabase } from "../lib/supabase";

/**
 * Pipeline de ventas: etapas (editables) y deals.
 *
 * Reglas que vienen de la base y hay que respetar desde el cliente:
 *  - Solo una etapa puede ser "ganada" y solo una "perdida" (índices únicos).
 *  - Una etapa con deals no se borra: se desactiva. Los deals se guardan con
 *    `stage_id`, así que renombrar o reordenar no los mueve de columna.
 */

export type Stage = {
  id: string;
  name: string;
  position: number;
  color: string;
  is_won: boolean;
  is_lost: boolean;
  is_active: boolean;
};

export type Deal = {
  id: string;
  title: string | null;
  value: number | null;
  stage_id: string | null;
  owner_id: string | null;
  created_at: string;
  closed_at: string | null;
  contact: { id: string; full_name: string | null; phone_e164: string | null } | null;
};

/** Normaliza un embed a-uno: sin tipos generados el cliente lo tipa como array. */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value ?? null;
}

/** Etapas activas para el tablero, en orden. Las ocultas salen en otro filtro. */
export async function listStages(includeInactive = false): Promise<Stage[]> {
  let query = requireSupabase()
    .from("crm_pipeline_stages")
    .select("id, name, position, color, is_won, is_lost, is_active")
    .order("position", { ascending: true });

  if (!includeInactive) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Stage[];
}

/** Cuántos deals tiene cada etapa: decide si se puede borrar o solo desactivar. */
export async function countDealsByStage(): Promise<Record<string, number>> {
  const { data, error } = await requireSupabase()
    .from("crm_deals")
    .select("stage_id");
  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { stage_id: string | null }[]) {
    if (!row.stage_id) continue;
    counts[row.stage_id] = (counts[row.stage_id] ?? 0) + 1;
  }
  return counts;
}

export async function listDeals(scope: "mine" | "all" = "all", userId?: string): Promise<Deal[]> {
  let query = requireSupabase()
    .from("crm_deals")
    .select("id, title, value, stage_id, owner_id, created_at, closed_at, contact:crm_contacts (id, full_name, phone_e164)")
    .order("created_at", { ascending: false })
    .limit(500);

  // El filtro "mis deals" es una vista, no seguridad: RLS ya limita lo que
  // devuelve la consulta. Para un asesor las dos dan lo mismo.
  if (scope === "mine" && userId) query = query.eq("owner_id", userId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    ...row,
    contact: one<NonNullable<Deal["contact"]>>(row.contact as never),
  })) as Deal[];
}

const money = (value: number | null) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);

/** Etiqueta de la etapa para los logs y los mensajes de error. */
export { money as formatMoney };

/**
 * Mueve un deal a otra etapa.
 *
 * Al entrar en la etapa ganada o perdida se marca `staged_at_stage_id` y
 * `closed_at`: es lo que permite medir conversión y duración aunque después
 * la etapa se renombre o se desactive.
 */
export async function moveDeal(dealId: string, stageId: string, stages: Stage[]): Promise<void> {
  const stage = stages.find((s) => s.id === stageId);
  const now = new Date().toISOString();
  const closes = Boolean(stage?.is_won || stage?.is_lost);

  const { error } = await requireSupabase()
    .from("crm_deals")
    .update({
      stage_id: stageId,
      ...(closes ? { staged_at_stage_id: stageId, staged_at: now, closed_at: now } : {}),
    })
    .eq("id", dealId);
  if (error) throw error;
}

export async function createDeal(input: {
  contact_id: string;
  stage_id: string;
  title?: string | null;
  value?: number | null;
  owner_id: string | null;
}): Promise<void> {
  const { error } = await requireSupabase().from("crm_deals").insert({
    contact_id: input.contact_id,
    stage_id: input.stage_id,
    title: input.title?.trim() || null,
    value: input.value ?? null,
    owner_id: input.owner_id,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Configuración de etapas (solo admin; lo bloquea RLS)
// ---------------------------------------------------------------------------

export async function createStage(name: string, color: string): Promise<void> {
  const { data: last } = await requireSupabase()
    .from("crm_pipeline_stages")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await requireSupabase().from("crm_pipeline_stages").insert({
    name: name.trim(),
    color,
    position: (last?.position ?? 0) + 1,
  });
  if (error) throw error;
}

export async function updateStage(
  id: string,
  patch: Partial<Pick<Stage, "name" | "color" | "is_active" | "is_won" | "is_lost">>,
): Promise<void> {
  const client = requireSupabase();

  // Solo puede haber una ganada y una perdida. Se sueltan las otras primero:
  // el indice único choca si las dos existen al mismo tiempo.
  if (patch.is_won) {
    await client.from("crm_pipeline_stages").update({ is_won: false }).neq("id", id);
  }
  if (patch.is_lost) {
    await client.from("crm_pipeline_stages").update({ is_lost: false }).neq("id", id);
  }

  const { error } = await client.from("crm_pipeline_stages").update(patch).eq("id", id);
  if (error) throw error;
}

/**
 * Guarda el orden completo de las etapas.
 *
 * `position` no tiene indice unico, así que se puede ir una por una sin que
 * dos etapas choquen en el mismo número.
 */
export async function reorderStages(orderedIds: string[]): Promise<void> {
  const client = requireSupabase();
  for (const [index, id] of orderedIds.entries()) {
    const { error } = await client
      .from("crm_pipeline_stages")
      .update({ position: index + 1 })
      .eq("id", id);
    if (error) throw error;
  }
}

/**
 * Elimina una etapa, pero solo si está vacía.
 *
 * Con deals no se toca: se desactiva, y los deals quedan fuera del tablero
 * pero intactos, recuperables con el filtro de etapas ocultas.
 */
export async function deleteStage(id: string): Promise<{ ok: boolean; reason?: string }> {
  const { data: deals } = await requireSupabase()
    .from("crm_deals")
    .select("id")
    .eq("stage_id", id)
    .limit(1);

  if ((deals ?? []).length > 0) {
    return { ok: false, reason: "La etapa tiene deals. Desactivala en vez de borrarla." };
  }

  const { error } = await requireSupabase().from("crm_pipeline_stages").delete().eq("id", id);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}