/**
 * Motor central de IA para Perfumes SAAD con Google Gemini.
 *
 * Conecta el modelo Gemini 2.5 Flash con la base de datos de Supabase
 * usando Function Calling (Herramientas / Tools).
 */

import { createClient } from "@supabase/supabase-js";

export interface ChatMessage {
  role: "user" | "model" | "assistant" | "system";
  content: string;
}

export interface GeminiChatOptions {
  messages: ChatMessage[];
  mode?: "store" | "admin" | "whatsapp";
  userSessionToken?: string | null;
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Faltan variables de entorno de Supabase (SUPABASE_URL o SERVICE_ROLE_KEY).");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function getGeminiApiKey() {
  const env = process.env;
  // Búsqueda directa o por coincidencia insensible a mayúsculas
  for (const [key, val] of Object.entries(env)) {
    if (
      val &&
      (key.toUpperCase().includes("GEMINI") ||
       key.toUpperCase() === "GOOGLE_API_KEY" ||
       key.toUpperCase() === "GOOGLE_AI_KEY")
    ) {
      return val;
    }
  }

  const detectedKeys = Object.keys(env).filter(
    (k) =>
      k.toUpperCase().includes("KEY") ||
      k.toUpperCase().includes("API") ||
      k.toUpperCase().includes("TOKEN") ||
      k.toUpperCase().includes("SECRET")
  );

  throw new Error(
    `Falta la variable de entorno GEMINI_API_KEY en Vercel (Environments: Production). Variables detectadas en el servidor: [${detectedKeys.join(", ")}]`
  );
}

// ============================================================================
// DEFINICIÓN DE HERRAMIENTAS (Function Calling para Gemini)
// ============================================================================

export const GEMINI_TOOLS = [
  {
    name: "buscar_perfumes",
    description: "Busca perfumes en el catálogo activo por nombre, marca, género (Hombres, Mujeres, Unisex), categoría (Diseñador, Árabes, Nicho), notas o clima.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING", description: "Término de búsqueda o nombre de perfume (ej. 'Club de Nuit', 'Versace', 'vainilla', 'cítrico')" },
        genero: { type: "STRING", enum: ["Hombres", "Mujeres", "Unisex"] },
        categoria: { type: "STRING", enum: ["Diseñador", "Árabes", "Nicho"] },
        clima: { type: "STRING", description: "Clima recomendado (ej. 'Calor', 'Frío', 'Versátil')" },
        soloDisponibles: { type: "BOOLEAN", description: "Si es true, solo trae perfumes que tengan stock > 0" }
      }
    }
  },
  {
    name: "consultar_stock_y_precios",
    description: "Consulta las presentaciones (ej. 10ml decant, 100ml, etc.), stock actual y precios exactos en pesos colombianos (COP) de un perfume.",
    parameters: {
      type: "OBJECT",
      properties: {
        perfumeId: { type: "STRING", description: "ID del perfume (si se conoce)" },
        nombre: { type: "STRING", description: "Nombre o marca del perfume para buscarlo exactamente" }
      },
      required: ["nombre"]
    }
  },
  {
    name: "consultar_metricas_negocio",
    description: "MODO ADMIN: Consulta resumen de ventas, costos, cartera y margen del negocio en un período.",
    parameters: {
      type: "OBJECT",
      properties: {
        periodoDias: { type: "NUMBER", description: "Días para consultar métricas: 7 (semana), 30 (mes), 365 (año), o null para histórico" }
      }
    }
  },
  {
    name: "consultar_cartera_clientes",
    description: "MODO ADMIN: Consulta el estado de cuentas por cobrar, clientes con crédito y cartera vencida.",
    parameters: {
      type: "OBJECT",
      properties: {
        soloVencidos: { type: "BOOLEAN", description: "Filtrar únicamente créditos vencidos" },
        clienteNombre: { type: "STRING", description: "Nombre o teléfono del cliente específico a consultar" }
      }
    }
  }
];

// ============================================================================
// EJECUCIÓN DE HERRAMIENTAS EN SUPABASE
// ============================================================================

export async function executeGeminiTool(name: string, args: Record<string, any>, mode: "store" | "admin" | "whatsapp" = "store") {
  const supabase = getSupabaseClient();

  if (name === "buscar_perfumes") {
    let queryBuilder = supabase
      .from("products")
      .select("id, brand, name, gender, category, description, family, climate, image, product_variants(id, size_ml, price, stock, active)")
      .eq("active", true)
      .eq("archived", false);

    if (args.query) {
      const q = `%${args.query}%`;
      queryBuilder = queryBuilder.or(`name.ilike.${q},brand.ilike.${q},family.ilike.${q},description.ilike.${q}`);
    }
    if (args.genero) {
      queryBuilder = queryBuilder.eq("gender", args.genero);
    }
    if (args.categoria) {
      queryBuilder = queryBuilder.eq("category", args.categoria);
    }

    const { data, error } = await queryBuilder.limit(8);
    if (error) return { error: error.message };

    const formatted = (data || []).map((p: any) => {
      const activeVariants = (p.product_variants || []).filter((v: any) => v.active !== false);
      const hasStock = activeVariants.some((v: any) => v.stock > 0);
      const decant = activeVariants.find((v: any) => v.size_ml === 10);
      const full = activeVariants.find((v: any) => v.size_ml >= 50);

      return {
        id: p.id,
        nombre: `${p.brand} ${p.name}`,
        marca: p.brand,
        genero: p.gender,
        categoria: p.category,
        familia: p.family,
        clima: p.climate,
        disponible: hasStock,
        precio_decant_10ml: decant ? decant.price : null,
        stock_decant_10ml: decant ? decant.stock : 0,
        precio_frasco_completo: full ? full.price : null,
        stock_frasco_completo: full ? full.stock : 0,
        presentaciones: activeVariants.map((v: any) => `${v.size_ml}ml: $${v.price.toLocaleString("es-CO")} (${v.stock > 0 ? `${v.stock} disp.` : "Agotado"})`)
      };
    });

    if (args.soloDisponibles) {
      return formatted.filter((p: any) => p.disponible);
    }
    return formatted;
  }

  if (name === "consultar_stock_y_precios") {
    let queryBuilder = supabase
      .from("products")
      .select("id, brand, name, product_variants(id, size_ml, price, stock, active)")
      .eq("active", true)
      .eq("archived", false);

    if (args.perfumeId) {
      queryBuilder = queryBuilder.eq("id", args.perfumeId);
    } else if (args.nombre) {
      const q = `%${args.nombre}%`;
      queryBuilder = queryBuilder.or(`name.ilike.${q},brand.ilike.${q}`);
    }

    const { data, error } = await queryBuilder.limit(3);
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { mensaje: "No se encontró el perfume especificado en el inventario." };

    return data.map((p: any) => ({
      id: p.id,
      nombre: `${p.brand} ${p.name}`,
      variantes: (p.product_variants || [])
        .filter((v: any) => v.active !== false)
        .map((v: any) => ({
          presentacion_ml: v.size_ml,
          precio_cop: v.price,
          unidades_disponibles: v.stock,
          estado: v.stock > 0 ? "Disponible para despacho" : "Agotado temporalmente"
        }))
    }));
  }

  // Herramientas administrativas (requieren modo admin)
  if (name === "consultar_metricas_negocio") {
    if (mode !== "admin") {
      return { error: "Acceso denegado: solo el administrador puede consultar métricas financieras." };
    }
    try {
      const { data, error } = await supabase.rpc("admin_dashboard_metrics", {
        period_days: args.periodoDias ?? 30
      });
      if (error) return { error: error.message };
      return {
        periodo: `Últimos ${args.periodoDias ?? 30} días`,
        ingresos_ventas: data.sales_revenue,
        costos_mercancia: data.sales_cost,
        utilidad_realizada: data.sales_profit,
        margen_neto: `${data.net_margin_percent}%`,
        cartera_pendiente: data.credit_outstanding_balance,
        cartera_vencida: data.credit_overdue_balance
      };
    } catch (e: any) {
      return { error: e.message };
    }
  }

  if (name === "consultar_cartera_clientes") {
    if (mode !== "admin") {
      return { error: "Acceso denegado: solo el administrador puede consultar cartera de clientes." };
    }
    let queryBuilder = supabase
      .from("orders")
      .select("id, total, credit_amount, credit_due_date, payment_status, created_at, customers(id, full_name, phone)")
      .in("payment_status", ["credit", "partial"])
      .order("credit_due_date", { ascending: true });

    if (args.soloVencidos) {
      const today = new Date().toISOString().slice(0, 10);
      queryBuilder = queryBuilder.lt("credit_due_date", today);
    }

    const { data, error } = await queryBuilder.limit(10);
    if (error) return { error: error.message };

    return (data || []).map((o: any) => ({
      pedido_id: o.id.slice(0, 8),
      cliente: o.customers?.full_name || "Sin nombre",
      telefono: o.customers?.phone || "Sin teléfono",
      total_pedido: o.total,
      saldo_pendiente: o.credit_amount,
      vencimiento: o.credit_due_date || "Sin fecha fija"
    }));
  }

  return { error: `Herramienta ${name} no reconocida` };
}

// ============================================================================
// SYSTEM PROMPTS SEGÚN EL ROL
// ============================================================================

function getSystemInstruction(mode: "store" | "admin" | "whatsapp") {
  if (mode === "admin") {
    return `Eres el Copiloto Ejecutivo de Perfumes SAAD. Ayudas al dueño (Saad) a gestionar su negocio de perfumería original en Barranquilla, Colombia.
Tienes acceso a herramientas para consultar catálogo, inventario, ventas y cartera de crédito (esquema 50/50 quincenal).
Hablas en español de Colombia con tono ejecutivo, directo, transparente y analítico.
Si te piden números, siempre consulta las herramientas en tiempo real para no inventar datos.
Moneda: Pesos colombianos (COP).`;
  }

  return `Eres el Asesor Olfativo Virtual de "Perfumes SAAD", una boutique de perfumería original (árabes, diseñador y nicho) y perfumería fraccionada (decants de 10 ml) ubicada en Barranquilla, Colombia.
Tu misión es asesorar a los clientes con calidez, elegancia y conocimiento experto en fragancias.
REGLAS FUNDAMENTALES:
1. Recomienda perfumes basándote en la ocasión (citas, oficina, noche, fiesta), clima (cálido como Barranquilla, fresco, versátil) o notas olfativas (vainilla, maderas, cítricos, cuero, oud).
2. Usa la herramienta 'buscar_perfumes' o 'consultar_stock_y_precios' para verificar siempre disponibilidad y precios reales antes de afirmar que un perfume está disponible.
3. Menciona que manejamos tanto frascos completos sellados como decants de 10 ml (ideales para probar antes de comprar o llevar de viaje).
4. Medios de pago disponibles: Nequi, Daviplata, Bancolombia, efectivo contraentrega en Barranquilla y envíos a todo Colombia.
5. Invita amablemente al cliente a confirmar su pedido por WhatsApp (+57 310 231 8786) o agregar al carrito.
6. Habla en un tono amigable, distinguido y apasionado por los aromas.`;
}

let cachedActiveModel: string | null = null;

async function getAvailableModels(apiKey: string): Promise<string[]> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (res.ok) {
      const json = await res.json();
      const list = (json.models || [])
        .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
        .map((m: any) => m.name.replace(/^models\//, "")) as string[];
      if (list.length > 0) return list;
    } else {
      const err = await res.text();
      console.warn("[Gemini API] No se pudo listar modelos:", res.status, err);
    }
  } catch (err: any) {
    console.warn("[Gemini API] Error en listModels:", err?.message || err);
  }
  return [];
}

async function callGeminiApi(apiKey: string, payload: any): Promise<{ data: any; usedModel: string; endpoint: string }> {
  const modelsToTry: string[] = [];
  if (process.env.GEMINI_MODEL) modelsToTry.push(process.env.GEMINI_MODEL);
  if (cachedActiveModel) modelsToTry.push(cachedActiveModel);

  // Consultar directamente a la API de Google qué modelos están activos para este API key
  const liveModels = await getAvailableModels(apiKey);
  for (const m of liveModels) {
    if (!modelsToTry.includes(m)) modelsToTry.push(m);
  }

  // Fallbacks estándar si la lista vino vacía
  for (const fallback of ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"]) {
    if (!modelsToTry.includes(fallback)) modelsToTry.push(fallback);
  }

  console.log("[Gemini API] Modelos disponibles a intentar:", modelsToTry);

  let lastError: any = null;

  for (const model of modelsToTry) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.warn(`[Gemini API] Modelo ${model} respondió con ${res.status}:`, errorText);
        if (res.status === 404 || res.status === 400) {
          lastError = new Error(`Modelo ${model} no disponible (${res.status}): ${errorText}`);
          continue;
        }
        throw new Error(`Error comunicando con Gemini (${res.status}): ${errorText}`);
      }

      const data = await res.json();
      cachedActiveModel = model;
      return { data, usedModel: model, endpoint };
    } catch (err: any) {
      console.warn(`[Gemini API] Falló llamada con ${model}:`, err?.message || err);
      lastError = err;
    }
  }

  throw lastError || new Error("No se pudo conectar con ningún modelo de Gemini disponible.");
}

// ============================================================================
// LLAMADA A LA API DE GEMINI CON FUNCTION CALLING
// ============================================================================

export async function runGeminiConversation(options: GeminiChatOptions): Promise<{ text: string; toolCallsRun?: string[] }> {
  const apiKey = getGeminiApiKey();
  const mode = options.mode || "store";
  const systemInstruction = getSystemInstruction(mode);

  // Filtramos herramientas según el rol
  const allowedTools = mode === "admin"
    ? GEMINI_TOOLS
    : GEMINI_TOOLS.filter((t) => !["consultar_metricas_negocio", "consultar_cartera_clientes"].includes(t.name));

  // Formateamos historial para la API de Gemini v1beta
  const contents = options.messages.map((m) => ({
    role: m.role === "assistant" || m.role === "model" ? "model" : "user",
    parts: [{ text: m.content }]
  }));

  const payload: any = {
    system_instruction: {
      parts: [{ text: systemInstruction }]
    },
    contents,
    tools: [
      {
        function_declarations: allowedTools
      }
    ],
    generation_config: {
      temperature: 0.6,
      max_output_tokens: 1200
    }
  };

  // 1. Primera llamada a Gemini con fallback de modelos
  const { data, endpoint: modelEndpoint } = await callGeminiApi(apiKey, payload);
  const candidate = data.candidates?.[0];
  if (!candidate) {
    return { text: "No se pudo obtener respuesta del modelo de IA." };
  }

  const parts = candidate.content?.parts || [];
  const functionCallPart = parts.find((p: any) => p.functionCall);

  // Si Gemini no llamó a ninguna función, devolvemos el texto directamente
  if (!functionCallPart) {
    const textPart = parts.find((p: any) => p.text);
    return { text: textPart?.text || "Respuesta completada." };
  }

  // 2. Si Gemini llamó a una función (Function Calling)
  const fnCall = functionCallPart.functionCall;
  const toolName = fnCall.name;
  const toolArgs = fnCall.args || {};

  console.log(`[Gemini Tool] Ejecutando: ${toolName}`, toolArgs);
  let toolResult: any;
  try {
    toolResult = await executeGeminiTool(toolName, toolArgs, mode);
  } catch (tErr: any) {
    toolResult = { error: `Error ejecutando consulta en base de datos: ${tErr?.message || tErr}` };
  }

  // Añadimos la llamada del modelo y el resultado de la función al historial
  const updatedContents = [
    ...contents,
    {
      role: "model",
      parts: [{ functionCall: fnCall }]
    },
    {
      role: "user",
      parts: [
        {
          functionResponse: {
            name: toolName,
            response: { content: toolResult }
          }
        }
      ]
    }
  ];

  payload.contents = updatedContents;

  // 3. Segunda llamada para que Gemini redacte la respuesta final usando el resultado
  let res: Response;
  try {
    res = await fetch(modelEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (netErr: any) {
    throw new Error(`Fallo de red en segunda llamada a Gemini: ${netErr?.message || netErr}`);
  }

  if (!res.ok) {
    const errorText = await res.text();
    console.error("Error segunda llamada Gemini:", errorText);
    return {
      text: `Se consultó la base de datos (${toolName}) pero hubo un detalle al redactar: ${JSON.stringify(toolResult)}`
    };
  }

  const finalData = await res.json();
  const finalCandidate = finalData.candidates?.[0];
  const finalTextPart = finalCandidate?.content?.parts?.find((p: any) => p.text);

  return {
    text: finalTextPart?.text || "Aquí tienes la información consultada.",
    toolCallsRun: [toolName]
  };
}
