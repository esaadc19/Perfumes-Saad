/**
 * Parser y motor de cruce para reportes CSV de Nequi Negocios.
 */

export interface NequiTransaction {
  id: string; // Id de la transaccion
  rawDate: string; // Fecha original
  dateStr: string; // YYYY-MM-DD
  reference: string; // Referencia (ej. M03845808)
  amount: number; // Valor total con propina en COP
  method: string; // Medio de pago
  payerName: string; // Nombre del pagador
  originBank: string; // Banco originador
}

export interface ReconcileCandidate {
  type: "order" | "credit_payment";
  id: string;
  code: string;
  customerName: string;
  amount: number;
  dateStr: string;
  currentMethod: string;
  reconciled: boolean;
  reference?: string | null;
}

export type MatchQuality = "exact" | "high" | "potential" | "none";

export interface NequiMatchResult {
  nequiTx: NequiTransaction;
  matchQuality: MatchQuality;
  matchedCandidate: ReconcileCandidate | null;
  matchReason?: string;
}

/**
 * Normaliza nombres quitando tildes, caracteres especiales y espacios extra para comparación.
 */
function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

/**
 * Calcula similitud entre dos nombres (si comparten al menos 2 palabras clave o si uno contiene al otro).
 */
function namesMatch(name1: string, name2: string): boolean {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);
  if (!n1 || !n2) return false;
  if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) return true;

  const words1 = n1.split(/\s+/).filter((w) => w.length > 2);
  const words2 = n2.split(/\s+/).filter((w) => w.length > 2);

  const shared = words1.filter((w) => words2.includes(w));
  return shared.length >= 2 || (shared.length === 1 && (words1.length <= 2 || words2.length <= 2));
}

/**
 * Lee y parsea el CSV exportado desde el portal de Nequi Negocios.
 */
export function parseNequiCsv(csvContent: string): NequiTransaction[] {
  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  // Función simple para parsear una línea CSV respetando comillas
  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = "";
      } else {
        cur += c;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const header = parseCsvLine(lines[0]);
  const idxId = header.findIndex((h) => h.toLowerCase().includes("id de la transaccion"));
  const idxFecha = header.findIndex((h) => h.toLowerCase().includes("fecha"));
  const idxRef = header.findIndex((h) => h.toLowerCase().includes("referencia"));
  const idxTotal = header.findIndex((h) => h.toLowerCase().includes("valor total con propina") || h.toLowerCase().includes("valor de la venta"));
  const idxMetodo = header.findIndex((h) => h.toLowerCase().includes("medio de pago"));
  const idxPagador = header.findIndex((h) => h.toLowerCase().includes("nombre del pagador"));
  const idxBanco = header.findIndex((h) => h.toLowerCase().includes("banco originador"));

  const transactions: NequiTransaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length <= Math.max(idxId, idxTotal)) continue;

    const id = cols[idxId] || `nequi-${i}`;
    const rawDate = cols[idxFecha] || "";
    const dateStr = rawDate ? rawDate.slice(0, 10) : "";
    const reference = idxRef !== -1 ? cols[idxRef] : "";
    
    // Convertir "150000,00" a 150000
    const rawAmount = cols[idxTotal] || "0";
    const cleanAmountStr = rawAmount.replace(/\./g, "").replace(",", ".");
    const amount = Math.round(Number(cleanAmountStr) || 0);

    const method = idxMetodo !== -1 ? cols[idxMetodo] : "Llave Negocios";
    const payerName = idxPagador !== -1 ? cols[idxPagador] : "";
    const originBank = idxBanco !== -1 ? cols[idxBanco] : "";

    if (amount > 0) {
      transactions.push({
        id,
        rawDate,
        dateStr,
        reference,
        amount,
        method,
        payerName,
        originBank,
      });
    }
  }

  return transactions;
}

/**
 * Cruza las transacciones del CSV de Nequi con las transacciones registradas en el sistema.
 */
export function matchNequiTransactions(
  nequiTransactions: NequiTransaction[],
  candidates: ReconcileCandidate[]
): {
  matches: NequiMatchResult[];
  unmatchedCandidates: ReconcileCandidate[];
} {
  const usedCandidateIds = new Set<string>();
  const results: NequiMatchResult[] = [];

  for (const tx of nequiTransactions) {
    // 1. Buscar coincidencias por monto exacto
    const matchingAmount = candidates.filter(
      (c) => !usedCandidateIds.has(c.id) && Math.abs(c.amount - tx.amount) < 1
    );

    if (matchingAmount.length === 0) {
      results.push({
        nequiTx: tx,
        matchQuality: "none",
        matchedCandidate: null,
        matchReason: "No hay ningún pedido o abono por este monto",
      });
      continue;
    }

    // 2. Intentar match exacto (Monto + Fecha coincidente + Nombre coincidente)
    let bestMatch: ReconcileCandidate | null = null;
    let matchQuality: MatchQuality = "none";
    let reason = "";

    // A. Match por nombre si existe en Nequi
    if (tx.payerName) {
      const byName = matchingAmount.find((c) => namesMatch(c.customerName, tx.payerName));
      if (byName) {
        bestMatch = byName;
        matchQuality = byName.dateStr === tx.dateStr ? "exact" : "high";
        reason = `Coincide en monto y nombre del pagador (${tx.payerName})`;
      }
    }

    // B. Si no hubo match por nombre, intentar por fecha cercana (mismo día o +/- 1 día)
    if (!bestMatch) {
      const sameDate = matchingAmount.find((c) => c.dateStr === tx.dateStr);
      if (sameDate) {
        bestMatch = sameDate;
        matchQuality = matchingAmount.length === 1 ? "high" : "potential";
        reason = `Mismo monto y misma fecha (${tx.dateStr})${matchingAmount.length > 1 ? " (hay varios pedidos por este valor)" : ""}`;
      } else {
        // C. Cualquier fecha si solo hay un candidato con ese monto
        if (matchingAmount.length === 1) {
          bestMatch = matchingAmount[0];
          matchQuality = "potential";
          reason = `Único pedido por este valor ($${tx.amount.toLocaleString("es-CO")}), fecha registrada: ${bestMatch.dateStr}`;
        }
      }
    }

    if (bestMatch && (matchQuality === "exact" || matchQuality === "high" || matchQuality === "potential")) {
      usedCandidateIds.add(bestMatch.id);
      results.push({
        nequiTx: tx,
        matchQuality,
        matchedCandidate: bestMatch,
        matchReason: reason,
      });
    } else {
      results.push({
        nequiTx: tx,
        matchQuality: "none",
        matchedCandidate: null,
        matchReason: `Hay ${matchingAmount.length} pedido(s) por este monto pero en fechas distintas o sin pagador identificado`,
      });
    }
  }

  const unmatchedCandidates = candidates.filter((c) => !usedCandidateIds.has(c.id));

  return {
    matches: results,
    unmatchedCandidates,
  };
}
