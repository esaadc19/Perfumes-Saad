export const config = { runtime: "nodejs" };

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request): Promise<Response> {
  const host = request.headers.get("host") || "perfumes-saad.vercel.app";
  const protocol = host.includes("localhost") ? "http" : "https";

  const openapiSpec = {
    openapi: "3.0.3",
    info: {
      title: "Perfumes SAAD — Conector Inteligente de Gemini",
      description: "API de integración de Perfumes SAAD para agentes Gemini, Custom Gems y automatizaciones. Permite consultar catálogo, stock real, notas olfativas y métricas del negocio.",
      version: "1.0.0",
      contact: {
        name: "Perfumes SAAD",
        email: "esaadc19@gmail.com",
        url: `${protocol}://${host}`
      }
    },
    servers: [
      {
        url: `${protocol}://${host}/api`,
        description: "Servidor de Producción / Vercel"
      }
    ],
    paths: {
      "/gemini/chat": {
        post: {
          summary: "Conversar con el Asesor Olfativo y Operativo de Perfumes SAAD",
          description: "Envía un historial de mensajes para que Gemini responda usando herramientas conectadas a la base de datos de Supabase en tiempo real.",
          operationId: "geminiChat",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["messages"],
                  properties: {
                    mode: {
                      type: "string",
                      enum: ["store", "admin"],
                      default: "store",
                      description: "Modo de atención: 'store' para clientes (catálogo y recomendaciones) o 'admin' para métricas y cartera (requiere Bearer Token)"
                    },
                    messages: {
                      type: "array",
                      description: "Historial de conversación",
                      items: {
                        type: "object",
                        required: ["role", "content"],
                        properties: {
                          role: {
                            type: "string",
                            enum: ["user", "model", "assistant"]
                          },
                          content: {
                            type: "string",
                            description: "Texto del mensaje"
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          responses: {
            "200": {
              description: "Respuesta generada exitosamente",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      mode: { type: "string" },
                      response: { type: "string", description: "Texto generado por Gemini con base en los datos reales" },
                      toolsUsed: {
                        type: "array",
                        items: { type: "string" },
                        description: "Herramientas de base de datos invocadas durante la consulta"
                      }
                    }
                  }
                }
              }
            },
            "400": { description: "Petición inválida o mensajes vacíos" },
            "500": { description: "Error interno o de comunicación con Gemini" }
          }
        }
      }
    }
  };

  return new Response(JSON.stringify(openapiSpec, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS
    }
  });
}
