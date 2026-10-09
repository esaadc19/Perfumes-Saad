# MEMORY.md — Diario de Estudio

Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.

## Estado actual

- Perfumes SAAD: tienda de perfumes con React 19 + TypeScript + Vite 7 + Supabase, en Vercel.
- Tienda pública: catálogo, filtros, detalle, carrito, recibo → WhatsApp, sin pago online.
- Admin: dashboard, productos, promociones, pedidos, cartera (crédito), clientes, gastos, asesores, perfiles, configuración.
- Supabase Auth con roles admin/cliente; modo demo sin `.env`.
- Importación CSV/Excel; Edge Function `weekly-report`; cron los domingos 8am (Colombia).
- Seguimiento de pedidos sin login: número de 8 caracteres + teléfono. Link `?track=A1B2C3D4`.
- Cartera/fiado: abonos, límite por cliente, términos quincenal/mensual, bloqueo por mora.
- UI del admin: botones CoreUI pill (`AdminButton`), `EmptyState`, tablas con cabecera sticky y zebra.

## Decisiones (y por qué)

- Sin cobro online: el flujo es pedido → WhatsApp → confirmación manual (MVP).
- Sin enrutador: navegación por estado en App.tsx (simplicidad para MVP).
- CSS plano, sin frameworks: control total y sin dependencias extra.
- CoreUI solo para botones, por SCSS partial: el bundle completo suma +334 KB de CSS, el partial +36 KB.
- Carrito sin persistencia en localStorage: decisión de MVP, se pierde al recargar.
- Stock se descuenta al confirmar el pedido, no al crearlo: permite ajustes antes.
- Pedidos pagados no editables: solo reembolso que restaura stock (integridad del inventario).
- Promociones se recalculan en Supabase: evita manipulación desde el frontend.
- Variables VITE_* solo con anon key: nunca service_role en el frontend.
- Español en código y UI: el negocio es para Colombia.

## Aprendizajes y errores a evitar

- `orders.credit_amount` guarda el **saldo pendiente**, no el total. `admin_record_credit_payment` ya lo descuenta: restar `paid_amount` en el frontend duplicaba el saldo.
- La tabla `orders` NO tiene columna `number`: el código visible (#A1B2C3D4) es `id::text` truncado.
- La RPC `create_whatsapp_order` debe existir en Supabase o los pedidos fallan (PGRST202).
- El CSV de productos NO va directo a `products`: el panel crea también `product_variants` con UUIDs.
- `supabase` puede ser `null` sin `.env`: el código debe manejar el modo demo.
- `grid-template-columns` con `auto` al final desalinea cabeceras y datos; cada fila es una rejilla independiente, así que las celdas necesitan `min-width: 0`.
- Si el dato de una columna va centrado, su `<span>` de cabecera necesita `cell-center` a mano: CSS no puede emparejar columnas entre filas hermanas.
- Las reglas `::before { content: "Etiqueta" }` de la vista móvil deben quedar **dentro** del `@media`, o duplican el texto en escritorio.
- En CoreUI v5 `CButtonProps` no se re-exporta del barrel: derivar con `ComponentProps<typeof CButton>`.
- Los partials SCSS de CoreUI no traen `--cui-border-radius` ni `.rounded-pill`: definirlos a mano.
- `type="button"` en todo botón dentro de un `<form>`, o dispara el submit.

## Próximos pasos

- Persistencia del carrito en localStorage.
- Pasarela de pago (Wompi, Mercado Pago).
- Notificaciones de stock bajo por correo/WhatsApp.
- Búsqueda avanzada (familia olfativa, clima).
- Reporte semanal con más métricas.

## Deuda técnica conocida

- `removePromotion` usa `window.confirm()`, prohibido por `.agents/ux-experience.agents.md`. Usar el modal `onConfirm` que ya existe.
- Migración `20261008120000_edit_credit_payments.sql` sin ejecutar en Supabase: el botón Editar de abonos no funciona sin ella.