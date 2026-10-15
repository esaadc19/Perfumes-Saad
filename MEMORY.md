# MEMORY.md — Diario de Estudio

Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.

- CRM Fase 3: bandeja de conversaciones y ficha de contacto funcionan (`Inbox.tsx`, `Contacts.tsx`, `services/crm.ts`).
- Datos de prueba del CRM: correr `supabase/SEMILLA-CRM-TEST.sql` (borra y recrea lo `test_`, es idempotente).
- **Fase 5 (Zernio)Endpoints en `api/zernio/`** → `webhook.ts` (entrante) y `enviar.ts` (saliente), con el contrato en `api/_lib/zernio.ts`.
- `api/` en la raíz de Vercel es lo que crea las rutas `/api/*`. **`_lib/` no se vuelve ruta** porque el guion bajo lo excluye. Cualquier archivo de prueba va fuera de `api/` (está en `tools/`), o Vercel lo publica.
- Zernio firma con **HMAC-SHA256 hexadecimal del cuerpo crudo**; hay que comparar antes de parsear. El secreto lo elige uno al crear el endpoint con `POST /v1/webhooks/settings`.
- La deduplicación de Zernio es por **id del evento** (`payload.id`), no del mensaje: un mismo mensaje produce received/delivered/read. Por eso la tabla `crm_zernio_events`, no una columna.
- Probar el webhook sin URL pública: `npx esbuild api/zernio/webhook.ts --bundle --platform=node --format=esm --outfile=tmp\webhook.mjs` y luego `node tools\probar-webhook.mjs tmp` (7 pruebas, todas pasan).
- **Hallazgo de Instagram:** en `message.received` de Instagram, `sender` trae `{id, name, username}` y **no hay teléfono** (`phoneFromSender` devuelve null). El contacto de Instagram se cruza por `username`, no por número.
- La API key de Zernio quedó expuesta en una transcripción **dos veces** (una al listar el `.env` con un filtro que no cubría `API_ZERNIO`, otra al fallar un `Invoke-Expression` que imprimió los argumentos). Hay que **rotarla una última vez** cuando el deploy quede andando.
- `ZERNIO_WEBHOOK_SECRET` quedó vacía en el `.env` la primera vez: `Add-Content` con un valor generado no es confiable sin verificar. **Siempre releer el archivo y comparar el largo** después de escribir un secreto.
- En PowerShell, `Invoke-Expression` **no acepta entrada por tubería**; para pasar un secreto a un CLI usar el operador de llamada `&` con `--value $secreto` y la salida a `$null`.
- **Deploy: el proyecto sí estaba enlazado a Vercel, pero `.vercel/project.json` estaba vacío.** El fallo no era solo el token. `vercel link` lo arregla.
- Los deploys de hace días los hizo el usuario **desde la CLI** (`vercel deploy`), no por integración de Git. El workflow de Actions nunca funcionó y sigue sin probarse.
- `vercel build` local en Windows falla con `spawn cmd.exe ENOENT` (bug de la CLI en este equipo, no del repo). En Linux funciona. El buildCommand en sí (`npm run build`) anda perfecto.
- `npx vercel@latest` falla a veces con `notarget`; usar la versión fija `npx vercel@64.0.2`.
- Vercel tiene ya `SUPABASE_SERVICE_ROLE_KEY` y las tres `VITE_` del build. Faltan en Vercel: `ZERNIO_API_KEY` (tras rotarla).
- En `.gitignore` las excepciones de `.env*` tienen que ir **después** de `.env*`, porque gana la última regla que coincide.
- **Nadie ha corrido `SEMILLA-CRM-TEST.sql` todavía**: la base sigue sin conversaciones. Hay un contacto `test_ Verificacion CRM` (573009990001) creado desde la UI al revisar la Fase 3.
- **Sin Zernio (Fase 5) no entran mensajes**: la bandeja no recibe nada sola. Es el hueco funcional más grande del CRM ahora mismo.
- El usuario activo en el navegador de pruebas es `elias`, con rol admin.

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
- **CRM en `crm/`** (Fase 1 lista): segunda app Vite propia, `base: /crm/`, se sirve en `dist/crm` con un solo deploy.
- El CRM lee el `.env` de la raíz (`envDir: ".."`), no duplica credenciales. Misma sesión de Supabase Auth.
- Interfaz del CRM: sidebar oscuro `#1B2436` con `mark.png` recortado del logo, tarjetas blancas, datos en cian `#00BCD4` por opacidad.
- El CRM se abre desde el admin de la tienda con la entrada **CRM** (sidebar y barra de secciones, en pestaña nueva) y desde Cuenta → "Abrir el CRM". No se embebe: es otra app.

## Decisiones (y por qué)

- Sin cobro online: el flujo es pedido → WhatsApp → confirmación manual (MVP).
- Sin enrutador: navegación por estado en App.tsx (simplicidad para MVP).
- CSS plano, sin frameworks: control total y sin dependencias extra.
- El CRM **no** es Next.js: es Vite como la tienda, con funciones serverless en `crm/api/` para los webhooks de Zernio (Vercel las sirve sin router).
- `npm run dev` levanta las dos apps con `concurrently`: tienda en 5173, CRM en 5174, y el proxy de la tienda expone `/crm`. Ambos con `strictPort`: si el puerto está ocupado, fallan en vez de correrse al siguiente y romper el proxy.
- 9 tablas `crm_*` nuevas, ya creadas. No se toca ninguna tabla existente, salvo `profiles.role`, que ahora admite `asesor` ademas de `customer` y `admin`.
- Para probar si una RPC existe: llamarla por `rest/v1/rpc/<nombre>` **con los nombres de parámetro exactos**. PostgREST devuelve "not found in the schema cache" tambien cuando solo falla la aridad, no solo cuando la función no existe: un test mal escrito da un falso "no existe".
- `profiles.role` tiene CHECK; para agregar un rol hay que quitar `profiles_role_check` primero o el `add constraint` choca.
- **`crm_deals` tiene dos FK a `crm_pipeline_stages`** (`stage_id` y `staged_at_stage_id`). Un embed `stage:crm_pipeline_stages(...)` da PGRST201 por relación ambigua: hay que escribir `stage:crm_pipeline_stages!crm_deals_stage_id_fkey(...)`.
- PostgREST valida el `select` aunque RLS oculte las filas: un embed mal escrito se detecta contra la base real sin necesitar sesión. Sirve para probar las consultas sin credenciales.
- `services/crm.ts` normaliza embeds a-uno con `one()`, porque sin tipos generados de Supabase el cliente los tipa como array.
- El proxy `/crm` tarda un instante en responder justo después de levantar `npm run dev`: no es un fallo, hay que reintentar.
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

- CRM Fase 3: bandeja de conversaciones y ficha de contacto, sobre las tablas `crm_*` ya creadas.

- Persistencia del carrito en localStorage.
- Pasarela de pago (Wompi, Mercado Pago).
- Notificaciones de stock bajo por correo/WhatsApp.
- Búsqueda avanzada (familia olfativa, clima).
- Reporte semanal con más métricas.

## Deuda técnica conocida

- `removePromotion` usa `window.confirm()`, prohibido por `.agents/ux-experience.agents.md`. Usar el modal `onConfirm` que ya existe.
- **Migraciones del CRM aplicadas** (Fase 2): `20261013090000_crm_core.sql` crea las 9 tablas `crm_*`, RLS, las funciones `is_asesor`/`crm_is_staff` y abre el rol `asesor` en `profiles`. Etapas por defecto ya sembradas.
- Las 5 migraciones que estaban sin ejecutar en Supabase **ya se aplicaron** (20261008120000 a 20261012110000). El bloqueante del dashboard (`credit_cost_in_profit`) ya no lo es.
- **El deploy a Vercel nunca funcionó**: las 66 ejecuciones del workflow fallaron por falta del secreto `VERCEL_TOKEN` en GitHub Actions. El sitio en producción es una build vieja, sin CoreUI.
- Inventario y Clientes tienen 3 tarjetas donde Cartera tiene 5: al igualar las cajas queda aire al pie. Se llena agregando una métrica real a cada uno.
- No se puede probar el admin en el navegador: la sesión de test no tiene login e `is_admin()` rechaza las llamadas RPC. Para verificar CSS hay que inyectar el marcado a mano.
- `crm/serve.mjs` sirve `dist/` en local para revisar el build (`node crm/serve.mjs 4174`). Es solo herramienta de desarrollo.
- El logo de la marca es un JPEG 1254x1254 con mucho fondo blanco: a 30px no se lee. `crm/public/mark.png` es el recorte cuadrado sobre la botella.