# MEMORY.md — Diario de Estudio

Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.

## Estado actual

- Proyecto Perfumes SAAD v0.1: tienda de perfumes con React 19 + TypeScript + Vite 7 + Supabase.
- Tienda pública funcional: catálogo, búsqueda, filtros, detalle de producto, carrito, recibo + WhatsApp.
- Panel admin funcional: dashboard, productos, promociones, pedidos, clientes, gastos, perfiles, configuración.
- Autenticación con Supabase Auth (email/contraseña, recuperación, roles admin/cliente).
- Modo demo sin Supabase: muestra productos de ejemplo con aviso.
- Importación de productos y clientes desde CSV/Excel.
- Edge Function `weekly-report` para reporte semanal por WhatsApp/correo.
- Desplegado en Vercel (frontend) + Supabase (base de datos).
- 4 agentes definidos en `.agents/`: programador-senior, frontend-developer, ux-experience, gestor-perfumeria.
- Sistema de seguimiento de pedidos: consulta por número de pedido (8 caracteres) + teléfono, sin login. Línea de tiempo: Pedido recibido → Confirmado → Enviado → Entregado. Link de seguimiento: `?track=A1B2C3D4`. Botón para enviar link + número de pedido por WhatsApp desde el recibo y el modal de rastreo.
- Sistema de crédito/fiado: Cartera con abonos, límites por cliente, términos quincenal/mensual, bloqueo por mora. `orders.credit_amount` guarda el **saldo pendiente**, no el total.
- Botones del admin con CoreUI (`CButton`) envueltos en `AdminButton`: forma pill, primary verde `#1a2e22`, secundario contorno, peligro sólido.
- Estados vacíos unificados con `EmptyState`; tablas del admin con cabecera sticky, zebra y hover.

## Decisiones (y por qué)

- Sin cobro online: el flujo es pedido → WhatsApp → confirmación manual (MVP).
- Sin enrutador: navegación por estado en App.tsx (simplicidad para MVP).
- CSS plano sin frameworks: control total y sin dependencias extra.
- CoreUI solo para botones, compilado por SCSS partial: importar `@coreui/coreui/dist/css/coreui.min.css` cuesta +334 KB de CSS, compilar `_buttons.scss` cuesta solo +36 KB.
- Carrito sin persistencia en localStorage: decisión de MVP, se pierde al recargar.
- Stock se descuenta al marcar como "Pagado", no al crear el pedido: permite ajustes antes de confirmar.
- Pedidos pagados no editables: solo reembolso que restaura stock (integridad del inventario).
- Promociones se recalculan en Supabase: evita manipulación del frontend.
- Variables VITE_* solo con anon key: nunca service_role en el frontend.
- Idioma español en código y UI: el negocio es para Colombia.

## Aprendizajes y errores a evitar

- La función RPC `create_whatsapp_order` debe existir en Supabase o los pedidos fallan (error PGRST202).
- El CSV de productos NO se importa directo en `products`: el panel crea también `product_variants` con UUIDs.
- `supabase` puede ser `null` si no hay `.env`: el código debe manejar ese caso (modo demo).
- Los movimientos de inventario se conservan al eliminar un pedido (quedan desvinculados).
- El bucket `product-images` es público para lectura; solo admins pueden escribir.
- La tabla `orders` NO tiene columna `number`: el código visible (#A1B2C3D4) es `id::text` truncado en el frontend.
- `admin_record_credit_payment` ya descuenta el abono de `credit_amount`: restar `paid_amount` otra vez en el frontend duplicaba el saldo.
- En CoreUI v5 `CButtonProps` no se re-exporta del barrel: derivar el tipo con `ComponentProps<typeof CButton>`.
- Los partials SCSS de CoreUI no traen `--cui-border-radius` ni la clase `.rounded-pill`: definirlos a mano en `coreui-buttons.scss`.
- Always `type="button"` en botones dentro de `<form>`: sin esto disparan el submit.

## Próximos pasos

- Implementar persistencia del carrito en localStorage.
- Agregar pasarela de pago (Wompi, Mercado Pago, etc.).
- Mejorar el reporte semanal con más métricas.
- Agregar notificaciones de stock bajo por correo/WhatsApp.
- Implementar búsqueda avanzada (por familia olfativa, clima, etc.).
