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
- Dashboard: `MetricGroup` agrupa por dominio (Cartera, Inventario, Clientes, Ventas) con título y pista; `AlertBlock` solo aparece si hay algo > 0.
- Cartera conserva el histórico: los fiados pagados no desaparecen, quedan con estado `Pagado`.
- Pantalla **Cobrar**: quién debe, agrupado por cliente (no por pedido) con botón de WhatsApp y mensaje escrito.

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
- La utilidad contable descuenta lo que falta: **utilidad cobrada − costo del fiado por cobrar − gastos**. No usar `credit_profit`, que se perdía al pasar a `paid`.
- Un pedido fue a crédito si tiene filas en `customer_credit_payments`: esa es la huella, y evita agregar una columna `was_credit`.
- `period_days` acota solo métricas de flujo; las instantáneas (stock, por cobrar, vencidos) no se acotan.

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
- En las tarjetas de métrica, la desalineación vertical venía de `align-content`, no de `align-items`: las filas se repartían el sobrante y una tarjeta de 2 filas lo distribuía distinto que una de 3. Con `align-content: start` los montos caen en la misma línea base.
- Igualar el alto de **las cajas de grupo** es otra cosa que igualar el de **las tarjetas**: si falta `align-items: start` en la rejilla de grupos, cada caja queda a su alto natural y se ven de distinto tamaño.
- Repartir N tarjetas: mejor que el número de filas salga exacto (9 en 3 columnas) que forzar un `span 2`. Si una tarjeta es más ancha, la última fila queda con hueco.
- Al verificar CSS, **medir con el marcado real del componente**, no con HTML inventado en la consola: si no, se depura algo que no existe.
- - Un recordatorio de cobro va **un mensaje por cliente**, no uno por pedido: quien tiene tres fiados unaware que los tiene y no quiere recibir tres mensajes distintos. Por eso `getCustomersToCollect()` agrupa.
- `wa.me` exige el n��mero con código de país: un móvil colombiano de 10 dígitos necesita el `57` delante o el link no abre.
- El panel admin no se abre solo: hay que entrar por el botón "Cuenta" -> "Abrir panel de administraci��n". `userRole` sale de la tabla `profiles`.
En PowerShell `&&` no funciona: usar `;` o el parámetro `workdir`. `git push` escribe en stderr y PowerShell lo marca como error aunque salga bien: mirar que apareceu `main -> main`.

## Próximos pasos

- Persistencia del carrito en localStorage.
- Pasarela de pago (Wompi, Mercado Pago).
- Notificaciones de stock bajo por correo/WhatsApp.
- Búsqueda avanzada (familia olfativa, clima).
- Reporte semanal con más métricas.

## Deuda técnica conocida

- `removePromotion` usa `window.confirm()`, prohibido por `.agents/ux-experience.agents.md`. Usar el modal `onConfirm` que ya existe.
- **Migraciones sin ejecutar en Supabase** (el usuario las corre a mano):
  - `20261009100000_credit_cost_in_profit.sql` ← bloqueante, sin ella el dashboard da error
  - `20261008120000_edit_credit_payments.sql` ← sin ella no funciona Editar abonos
- **El deploy a Vercel nunca funcionó**: las 66 ejecuciones del workflow fallaron por falta del secreto `VERCEL_TOKEN` en GitHub Actions. El sitio en producción es una build vieja, sin CoreUI.
- Inventario y Clientes tienen 3 tarjetas donde Cartera tiene 5: al igualar las cajas queda aire al pie. Se llena agregando una métrica real a cada uno.
- No se puede probar el admin en el navegador: la sesión de test no tiene login e `is_admin()` rechaza las llamadas RPC. Para verificar CSS hay que inyectar el marcado a mano.