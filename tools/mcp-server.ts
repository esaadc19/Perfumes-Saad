#!/usr/bin/env node
/**
 * Servidor MCP (Model Context Protocol) oficial de Perfumes SAAD.
 *
 * Permite a Gemini, Google Antigravity, Cursor o Claude conectarse
 * directamente a la base de datos de Perfumes SAAD y consultar
 * inventario, stock, ventas y cartera mediante herramientas nativas.
 *
 * Uso en Antigravity / Claude / Cursor:
 *   npx tsx tools/mcp-server.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Cargar variables de entorno locales si existen
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const [key, ...rest] = trimmed.split("=");
      const val = rest.join("=").replace(/(^["']|["']$)/g, "");
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Error: Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const TOOLS = [
  {
    name: "buscar_perfumes",
    description: "Busca perfumes en Perfumes SAAD por nombre, marca, género, categoría o notas.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Término o nombre (ej. 'Club de Nuit', 'Versace', 'árabe')" },
        genero: { type: "string", enum: ["Hombres", "Mujeres", "Unisex"] },
        categoria: { type: "string", enum: ["Diseñador", "Árabes", "Nicho"] },
        soloDisponibles: { type: "boolean", description: "Solo con stock > 0" },
      },
    },
  },
  {
    name: "consultar_stock_y_precios",
    description: "Consulta las presentaciones (10ml decant, frascos), stock y precios de un perfume.",
    inputSchema: {
      type: "object",
      required: ["nombre"],
      properties: {
        nombre: { type: "string", description: "Nombre o marca del perfume" },
      },
    },
  },
  {
    name: "consultar_metricas_negocio",
    description: "Consulta resumen de ventas, costos, utilidad y margen del negocio en un período.",
    inputSchema: {
      type: "object",
      properties: {
        periodoDias: { type: "number", description: "Días (7 para semana, 30 para mes, 365 para año)" },
      },
    },
  },
  {
    name: "consultar_cartera_clientes",
    description: "Consulta créditos pendientes, fiados y cartera vencida del negocio.",
    inputSchema: {
      type: "object",
      properties: {
        soloVencidos: { type: "boolean", description: "Filtrar únicamente vencidos" },
      },
    },
  },
];

async function handleToolCall(name: string, args: any) {
  if (name === "buscar_perfumes") {
    let qb = supabase
      .from("products")
      .select("id, brand, name, gender, category, description, family, climate, product_variants(id, size, price, stock, active)")
      .eq("active", true)
      .eq("archived", false);

    if (args.query) {
      const q = `%${args.query}%`;
      qb = qb.or(`name.ilike.${q},brand.ilike.${q},family.ilike.${q}`);
    }
    if (args.genero) qb = qb.eq("gender", args.genero);
    if (args.categoria) qb = qb.eq("category", args.categoria);

    const { data, error } = await qb.limit(8);
    if (error) throw new Error(error.message);

    return (data || []).map((p: any) => ({
      nombre: `${p.brand} ${p.name}`,
      genero: p.gender,
      categoria: p.category,
      familia: p.family,
      variantes: (p.product_variants || [])
        .filter((v: any) => v.active !== false)
        .map((v: any) => `${v.size}ml: $${v.price} (${v.stock} disp.)`),
    }));
  }

  if (name === "consultar_stock_y_precios") {
    const q = `%${args.nombre}%`;
    const { data, error } = await supabase
      .from("products")
      .select("brand, name, product_variants(size, price, stock, active)")
      .or(`name.ilike.${q},brand.ilike.${q}`)
      .limit(3);

    if (error) throw new Error(error.message);
    return data;
  }

  if (name === "consultar_metricas_negocio") {
    const { data, error } = await supabase.rpc("admin_dashboard_metrics", {
      period_days: args.periodoDias ?? 30,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  if (name === "consultar_cartera_clientes") {
    let qb = supabase
      .from("orders")
      .select("id, total, credit_amount, credit_due_date, customers(full_name, phone)")
      .in("payment_status", ["credit", "partial"]);

    if (args.soloVencidos) {
      qb = qb.lt("credit_due_date", new Date().toISOString().slice(0, 10));
    }

    const { data, error } = await qb.limit(10);
    if (error) throw new Error(error.message);
    return data;
  }

  throw new Error(`Herramienta ${name} no encontrada.`);
}

// ============================================================================
// PROTOCOLO MCP POR STDIO (JSON-RPC 2.0)
// ============================================================================

let buffer = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const request = JSON.parse(line);
      const { id, method, params } = request;

      if (method === "initialize") {
        sendResponse(id, {
          protocolVersion: "2024-11-05",
          serverInfo: {
            name: "perfumes-saad-mcp",
            version: "1.0.0",
          },
          capabilities: {
            tools: {},
          },
        });
      } else if (method === "tools/list") {
        sendResponse(id, { tools: TOOLS });
      } else if (method === "tools/call") {
        const { name, arguments: toolArgs } = params;
        try {
          const result = await handleToolCall(name, toolArgs || {});
          sendResponse(id, {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          });
        } catch (callError: any) {
          sendResponse(id, {
            isError: true,
            content: [{ type: "text", text: callError.message }],
          });
        }
      } else {
        // Métodos de notificación o no implementados
        if (id !== undefined) {
          sendResponse(id, {});
        }
      }
    } catch (parseError: any) {
      console.error("Error parseando mensaje MCP:", parseError);
    }
  }
});

function sendResponse(id: any, result: any) {
  const message = JSON.stringify({
    jsonrpc: "2.0",
    id,
    result,
  });
  process.stdout.write(message + "\n");
}
