import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendAppsScriptEmail } from "./apps-script-mail.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function escapeHtml(value: string | null | undefined): string {
  if (!value) return "";
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST" && req.method !== "GET") {
      return Response.json(
        { success: false, error: "Method not allowed" },
        { status: 405, headers: corsHeaders },
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase reminder function environment is not configured.");
    }

    const authorization = req.headers.get("authorization") ?? "";
    const accessToken = authorization.replace(/^Bearer\s+/i, "");

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Si viene token de usuario, validar rol admin; si es service role (cron), permitir directo
    if (accessToken && accessToken !== SUPABASE_SERVICE_ROLE_KEY) {
      if (SUPABASE_ANON_KEY) {
        const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: `Bearer ${accessToken}` } },
        });
        const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
        if (!userError && userData.user) {
          const { data: profile } = await serviceClient
            .from("profiles")
            .select("role")
            .eq("id", userData.user.id)
            .maybeSingle();
          if (profile?.role !== "admin" && profile?.role !== "asesor") {
            return Response.json(
              { success: false, error: "Administrator or advisor access required" },
              { status: 403, headers: corsHeaders },
            );
          }
        }
      }
    }

    // Fecha actual en hora legal colombiana (America/Bogota)
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const startOfToday = `${today}T00:00:00-05:00`;
    const endOfToday = `${today}T23:59:59-05:00`;

    // Consultar pedidos programados o registrados para hoy
    const { data: todayOrders, error: ordersError } = await serviceClient
      .from("orders")
      .select(`
        id,
        created_at,
        status,
        payment_status,
        payment_method,
        total,
        delivery_cost,
        customers (
          full_name,
          phone,
          city,
          delivery_address
        ),
        sales_advisors (
          full_name
        ),
        order_items (
          product_name_snapshot,
          size_ml,
          quantity,
          unit_price,
          subtotal
        )
      `)
      .gte("created_at", startOfToday)
      .lte("created_at", endOfToday)
      .neq("status", "cancelled")
      .order("created_at", { ascending: true });

    if (ordersError) throw ordersError;

    // Consultar pedidos futuros (próximos 7 días)
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const in7DaysStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(in7Days);

    const { data: futureOrders } = await serviceClient
      .from("orders")
      .select(`
        id,
        created_at,
        status,
        payment_status,
        total,
        customers (
          full_name,
          phone
        ),
        order_items (
          product_name_snapshot,
          size_ml,
          quantity
        )
      `)
      .gt("created_at", endOfToday)
      .lte("created_at", `${in7DaysStr}T23:59:59-05:00`)
      .neq("status", "cancelled")
      .order("created_at", { ascending: true });

    const ordersCount = todayOrders?.length ?? 0;
    const futureCount = futureOrders?.length ?? 0;

    // Si no hay pedidos para hoy ni pedidos futuros, no enviamos spam a menos que se fuerce
    const url = new URL(req.url);
    const forceSend = url.searchParams.get("force") === "true";

    if (ordersCount === 0 && futureCount === 0 && !forceSend) {
      return Response.json(
        {
          success: true,
          today_orders: 0,
          future_orders: 0,
          email_sent: false,
          message: "No hay pedidos programados para hoy ni para los próximos 7 días.",
        },
        { headers: corsHeaders },
      );
    }

    const totalHoy = todayOrders?.reduce((sum, o) => sum + Number(o.total || 0), 0) ?? 0;

    // Construcción del HTML elegante para el correo
    const rowsHtml = (todayOrders ?? []).map((o, idx) => {
      const customer = o.customers as any;
      const advisor = o.sales_advisors as any;
      const items = (o.order_items as any[]) ?? [];
      const cleanPhone = customer?.phone ? String(customer.phone).replace(/\D/g, "") : "";
      const waLink = cleanPhone ? `https://wa.me/57${cleanPhone}` : null;

      const itemsDesc = items
        .map((it) => `• <strong>${it.quantity}x</strong> ${escapeHtml(it.product_name_snapshot)} (${it.size_ml} ml)`)
        .join("<br/>");

      const paymentBadge =
        o.payment_status === "paid"
          ? `<span style="color:#059669; font-weight:600;">✓ Pagado</span>`
          : o.payment_status === "credit"
          ? `<span style="color:#d97706; font-weight:600;">⏳ A crédito</span>`
          : `<span style="color:#dc2626; font-weight:600;">⚠️ Pendiente de cobro</span>`;

      return `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 12px; font-family: sans-serif; font-size: 13px;">
            <strong>#${idx + 1}</strong>
          </td>
          <td style="padding: 12px; font-family: sans-serif; font-size: 13px;">
            <strong style="color: #0f172a;">${escapeHtml(customer?.full_name ?? "Cliente sin registrar")}</strong><br/>
            ${waLink ? `<a href="${waLink}" style="color: #0284c7; text-decoration: none;">📱 ${escapeHtml(customer?.phone)} (WhatsApp)</a><br/>` : ""}
            <span style="color: #64748b; font-size: 12px;">📍 ${escapeHtml(customer?.delivery_address ?? "Entrega a convenir")}${customer?.city ? ` · ${escapeHtml(customer.city)}` : ""}</span>
          </td>
          <td style="padding: 12px; font-family: sans-serif; font-size: 13px; line-height: 1.5;">
            ${itemsDesc || "Sin items"}
            ${advisor?.full_name ? `<br/><small style="color:#64748b;">Asesor: ${escapeHtml(advisor.full_name)}</small>` : ""}
          </td>
          <td style="padding: 12px; font-family: sans-serif; font-size: 13px; text-align: right;">
            <strong style="font-size: 14px; color: #0f172a;">${formatMoney(Number(o.total || 0))}</strong><br/>
            ${paymentBadge}
          </td>
        </tr>
      `;
    }).join("");

    const futureRowsHtml = (futureOrders ?? []).map((fo) => {
      const customer = fo.customers as any;
      const dateStr = new Intl.DateTimeFormat("es-CO", {
        timeZone: "America/Bogota",
        month: "short",
        day: "numeric",
        weekday: "short",
      }).format(new Date(fo.created_at));

      const itemsDesc = ((fo.order_items as any[]) ?? [])
        .map((it) => `${it.quantity}x ${escapeHtml(it.product_name_snapshot)}`)
        .join(", ");

      return `
        <li style="margin-bottom: 8px; font-size: 13px; font-family: sans-serif; color: #334155;">
          <strong style="color: #6366f1;">📅 ${dateStr}:</strong> <strong>${escapeHtml(customer?.full_name ?? "Cliente")}</strong> · ${itemsDesc} (${formatMoney(Number(fo.total || 0))})
        </li>
      `;
    }).join("");

    const formattedToday = new Intl.DateTimeFormat("es-CO", {
      timeZone: "America/Bogota",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date());

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Recordatorio Diario de Pedidos</title>
      </head>
      <body style="margin: 0; padding: 20px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <div style="max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          
          <!-- Cabecera de Lujo -->
          <div style="background: linear-gradient(135deg, #09090b 0%, #1e293b 100%); padding: 26px 30px; color: #ffffff;">
            <p style="margin: 0 0 6px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #cbd5e1; font-weight: 600;">PERFUMES SAAD · RECORDATORIO OPERATIVO</p>
            <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">📦 Pedidos del Día</h1>
            <p style="margin: 6px 0 0 0; font-size: 14px; color: #94a3b8; text-transform: capitalize;">${formattedToday}</p>
          </div>

          <!-- Resumen de Métricas de Hoy -->
          <div style="padding: 24px 30px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; gap: 20px;">
            <div style="flex: 1; background: #ffffff; padding: 14px 18px; border-radius: 10px; border: 1px solid #e2e8f0;">
              <span style="font-size: 12px; color: #64748b; font-weight: 500;">Pedidos para hoy</span>
              <div style="font-size: 22px; font-weight: 700; color: #0f172a; margin-top: 4px;">${ordersCount} ${ordersCount === 1 ? "pedido" : "pedidos"}</div>
            </div>
            <div style="flex: 1; background: #ffffff; padding: 14px 18px; border-radius: 10px; border: 1px solid #e2e8f0;">
              <span style="font-size: 12px; color: #64748b; font-weight: 500;">Total a cobrar / ventas hoy</span>
              <div style="font-size: 22px; font-weight: 700; color: #0284c7; margin-top: 4px;">${formatMoney(totalHoy)}</div>
            </div>
          </div>

          <!-- Cuerpo: Pedidos de Hoy -->
          <div style="padding: 26px 30px;">
            <h2 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 700; color: #0f172a;">Detalle de pedidos para despachar o entregar hoy</h2>
            
            ${ordersCount > 0 ? `
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                <thead>
                  <tr style="background: #f1f5f9; text-align: left;">
                    <th style="padding: 10px 12px; font-size: 11px; text-transform: uppercase; color: #475569;">#</th>
                    <th style="padding: 10px 12px; font-size: 11px; text-transform: uppercase; color: #475569;">Cliente y Destino</th>
                    <th style="padding: 10px 12px; font-size: 11px; text-transform: uppercase; color: #475569;">Perfumes</th>
                    <th style="padding: 10px 12px; font-size: 11px; text-transform: uppercase; color: #475569; text-align: right;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            ` : `
              <p style="color: #64748b; font-size: 14px; margin: 0 0 20px 0;">🎉 No tienes pedidos agendados para entrega hoy.</p>
            `}

            <!-- Próximos pedidos futuros agendados -->
            ${futureCount > 0 ? `
              <div style="margin-top: 24px; padding: 18px 20px; background: rgba(99, 102, 241, 0.05); border-radius: 12px; border: 1px solid rgba(99, 102, 241, 0.2);">
                <h3 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 700; color: #4338ca;">
                  📅 Próximos pedidos agendados (Siguientes 7 días)
                </h3>
                <ul style="margin: 0; padding-left: 20px;">
                  ${futureRowsHtml}
                </ul>
              </div>
            ` : ""}

            <!-- Recomendaciones Logísticas Cerebro -->
            <div style="margin-top: 26px; padding: 14px 18px; background: #faf5ff; border-radius: 10px; border: 1px solid #f3e8ff; font-size: 12px; color: #6b21a8; line-height: 1.5;">
              <strong>💡 Recordatorio de calidad y empaque (Área 20):</strong><br/>
              • Botellas selladas van dentro de la <em>bolsa de lujo oficial con logo SAAD</em>.<br/>
              • Decants de 10 ml van asegurados en su <em>estuche con inserto amortiguador de fomi</em>.<br/>
              • En Barranquilla y Soledad: entregas Same-Day directas con confirmación por WhatsApp antes de salir.
            </div>

            <!-- Botón de Acceso -->
            <div style="text-align: center; margin-top: 30px;">
              <a href="https://perfumes-saad.vercel.app" style="display: inline-block; background: #09090b; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                Ir al Panel de Pedidos
              </a>
            </div>

          </div>

          <!-- Pie de página -->
          <div style="background: #f8fafc; padding: 16px 30px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
            Perfumes SAAD · Sistema Automatizado de Operaciones · Generado a las 8:00 AM (Col)
          </div>

        </div>
      </body>
      </html>
    `;

    const subject = ordersCount > 0
      ? `📦 Recordatorio: ${ordersCount} ${ordersCount === 1 ? "pedido para hoy" : "pedidos para hoy"} (${formatMoney(totalHoy)}) — Perfumes SAAD`
      : `📅 ${futureCount} pedido(s) próximos agendados — Perfumes SAAD`;

    const emailResult = await sendAppsScriptEmail(subject, emailHtml);

    return Response.json(
      {
        success: true,
        today_orders: ordersCount,
        future_orders: futureCount,
        total_revenue: totalHoy,
        email_sent: emailResult.sent,
        email_error: emailResult.error,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("Error in daily orders reminder:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error al procesar el recordatorio diario.",
      },
      { status: 500, headers: corsHeaders },
    );
  }
});
