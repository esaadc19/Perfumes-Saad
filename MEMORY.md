# MEMORY.md — Diario de Estudio

Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.

## Estado actual

- Perfumes SAAD: tienda de perfumes con React 19 + TypeScript + Vite 7 + Supabase, en Vercel.
- Tienda pública: catálogo, filtros, detalle, carrito, recibo → WhatsApp, sin pago online.
- Admin: dashboard, productos, promociones, pedidos, cartera (crédito), clientes, gastos, asesores, perfiles, configuración.
- Importación CSV/Excel; Edge Function `weekly-report`; cron los domingos 8am (Colombia).
- Seguimiento de pedidos sin login: número de 8 caracteres + teléfono. Link `?track=A1B2C3D4`.
- Cartera/fiado: abonos, límite por cliente, términos quincenal/mensual, bloqueo por mora.
- UI del admin: botones CoreUI pill (`AdminButton`), `EmptyState`, tablas con cabecera sticky y zebra.
- Dashboard: `MetricGroup` agrupa por dominio; `AlertBlock` solo aparece si hay algo > 0.
- Cartera conserva el histórico: los fiados pagados quedan con estado `Pagado`.
- Pantalla **Cobrar**: quién debe, agrupado por cliente (no por pedido), con botón de WhatsApp.

## CRM (Fases 1-5)

- App aparte en `crm/` (`base: /crm/`), emitida en `dist/crm`: un solo deploy sirve tienda y CRM.
- Se abre desde el admin con la entrada **CRM** (sidebar y barra de secciones, pestaña nueva) y desde Cuenta → "Abrir el CRM". No se embebe.
- Lee el `.env` de la raíz (`envDir: ".."`): misma sesión de Supabase Auth, sin credenciales duplicadas.
- Interfaz: sidebar oscuro `#1B2436` con `mark.png`, tarjetas blancas, datos en cian `#00BCD4` por opacidad.
- 9 tablas `crm_*` + rol `asesor` en `profiles` (única tabla existente tocada).
- **Zernio funcionando en producción**: recibe mensajes reales de Instagram, los guarda y deduplica. Persistencia activa (`ZERNIO_OBSERVE=0`). Verificado por el usuario.
- Endpoints en `api/zernio/`: `webhook.ts` (entrante) y `enviar.ts` (saliente). Contrato en `api/_lib/zernio.ts`.
- El logo de la marca es un JPEG 1254x1254 con mucho fondo blanco: a 30px no se lee. `crm/public/mark.png` es el recorte.

## Decisiones (y por qué)

- Sin cobro online: el flujo es pedido → WhatsApp → confirmación manual.
- Sin enrutador: navegación por estado en App.tsx (simplicidad para MVP).
- CSS plano, sin frameworks; CoreUI solo para botones por SCSS partial (+36 KB, no +334 KB).
- El CRM **no** es Next.js: es Vite como la tienda, con serverless en `api/` (Vercel las sirve sin router).
- `npm run dev` levanta las dos apps con `concurrently`: 5173 y 5174, y el proxy de la tienda expone `/crm`. Con `strictPort`: fallan en vez de correrse y romper el proxy.
- Sin reparto automático entre las 2 personas: manual, o "el que responde primero".
- El CRM no reemplaza la tienda: `orders` sigue siendo la fuente de verdad de la venta.
- Una etapa con deals no se borra, se desactiva. `crm_deals.staged_at_stage_id` guarda la etapa al cerrar, para que renombrarla no rompa el histórico.
- Deduplicación de Zernio por **id del evento** (`payload.id`), no del mensaje: un mensaje genera received/delivered/read. Por eso la tabla `crm_zernio_events`.
- Identidad de contacto según plataforma: `sender.contactId` de Zernio (estable) > teléfono en WhatsApp > `@usuario` en Instagram. El id crudo de Instagram **nunca** es teléfono.
- Variables VITE_* solo con anon key. La service role solo en el servidor, nunca en el frontend.
- Español en código y UI; el negocio es para Colombia.
- La utilidad descuenta lo que falta: **cobrada − costo del fiado − gastos**. No usar `credit_profit`.
- Un pedido fue a crédito si tiene filas en `customer_credit_payments`; no hay columna `was_credit`.
- `period_days` acota solo métricas de flujo; las instantáneas no se acotan.

## Aprendizajes y errores a evitar

- **Vercel compila las funciones pero no las empaqueta**: los imports relativos necesitan `.js`. Las pruebas con esbuild dan **falso positivo** porque esbuild sí empaqueta; por eso `tools/probar-webhook.mjs` incluye un chequeo estático de imports (13 pruebas).
- **Cambiar una variable de entorno en Vercel no basta: hay que redesplegar** para que las funciones la tomen.
- Firmar HMAC desde PowerShell no coincide por el encoding del cuerpo. **Usar Node** (`tools/firma-de-prueba.mjs`).
- **Nunca imprimir valores secretos**: dos veces se filtraron en transcripción (un filtro de `.env` que no cubría el nombre, y un `Invoke-Expression` que imprimió sus argumentos). En PowerShell, `Invoke-Expression` no acepta tubería: usar `&` con `--value`.
- Verificar un secreto escrito en un archivo: releerlo y comparar el largo. `Add-Content` falló una vez y dejó el valor vacío.
- En `.gitignore` las excepciones de `.env*` van **después** de `.env*`: gana la última regla.
- `api/` en la raíz crea rutas en Vercel; `_lib/` no (el guion bajo lo excluye). Los archivos de prueba van en `tools/`, o Vercel los publica.
- `crm_deals` tiene **dos FK** a `crm_pipeline_stages`: un embed sin `!crm_deals_stage_id_fkey` da PGRST201.
- Para saber si una RPC existe hay que llamar `rest/v1/rpc/<n>` **con los nombres de parámetro exactos**: PostgREST da "not found in the schema cache" también cuando solo falla la aridad.
- PostgREST valida el `select` aunque RLS oculte las filas: sirve para probar consultas sin credenciales.
- Sin tipos generados de Supabase, los embeds a-uno llegan como array: normalizarlos con `one()`.
- `orders.credit_amount` guarda el **saldo pendiente**, no el total.
- La tabla `orders` NO tiene columna `number`: el código visible (#A1B2C3D4) es `id::text` truncado.
- El CSV de productos NO va directo a `products`: el panel crea también `product_variants`.
- `grid-template-columns` con `auto` al final desalinea cabeceras y datos; las celdas necesitan `min-width: 0`.
- Al verificar CSS, **medir con el marcado real del componente**, no con HTML inventado.
- `wa.me` exige el número con código de país: un móvil colombiano necesita el `57` delante.
- `type="button"` en todo botón dentro de un `<form>`.
- En PowerShell `&&` no funciona: usar `;`. `git push` escribe en stderr y parece error aunque salga bien: mirar `main -> main`.
- `npx vercel@latest` falla a veces con `notarget`: usar la fija `npx vercel@64.0.2`.

## Próximos pasos

- **CRM Fase 6**: que la ruta de salida funcione de verdad. `ZERNIO_SEND_PATH=/v1/inbox/messages` está por defecto, **sin confirmar** contra la documentación.
- **Probar WhatsApp**: solo se verificó Instagram. Falta confirmar que Zernio mande el número en `sender.id`.
- CRM Fase 4: pipeline editable + Tablero Kanban + Configuración → Pipeline.
- CRM Fase 7: dashboard con embudo y KPIs. Fase 8: PWA, push.
- Correr `supabase/SEMILLA-CRM-TEST.sql` para tener datos de prueba (es idempotente).
- Persistencia del carrito; pasarela de pago; avisos de stock bajo.

## Deuda técnica conocida

- **No se ha probado el aislamiento entre admin y asesor.** La RLS está activa, pero `crm_deals`/`crm_conversations`/`crm_tasks` nunca se han abierto con una sesión de asesor. Necesita una segunda cuenta con `role = 'asesor'`.
- `removePromotion` usa `window.confirm()`, prohibido por `.agents/ux-experience.agents.md`. Usar el modal `onConfirm`.
- Inventario y Clientes tienen 3 tarjetas donde Cartera tiene 5: al igualar las cajas queda aire al pie.
- `crm/serve.mjs` sirve `dist/` en local (`node crm/serve.mjs 4174`). Es solo herramienta de desarrollo.