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
- **Merma de inventario**: 6 motivos (merma, rotura, robo, vencimiento, ingreso, devolución) e historial por presentación. **Rentabilidad por producto**, ordenada por utilidad y no por unidades.
- **Dock de navegación en móvil**: 5 secciones fijas al pie + hoja "Más" con las otras 8. Antes no había nada visible en móvil: los tabs están en `display: none` por debajo de 900px.
- **`ConfirmDialog`** sustituye a `window.confirm()`: cierra con Escape y atrapa el foco.
- **Catálogo en móvil: 2 columnas, sin repetir el precio.** El problema nunca fue el número de columnas sino la densidad: a ~171px por tarjeta cabían 7 cosas apiladas. Los chips muestran solo el tamaño y el precio va una sola vez a 17px. "Agregar" ocupa el ancho completo a 44px. La tarjeta es columna flex con las acciones en `margin-top: auto`, si no dos productos de una fila quedan desalineados.

## CRM (Fases 1-5)

- App aparte en `crm/` (`base: /crm/`), emitida en `dist/crm`: un solo deploy sirve tienda y CRM.
- Se abre desde el admin con la entrada **CRM** (sidebar y barra de secciones, pestaña nueva) y desde Cuenta → "Abrir el CRM". No se embebe.
- Lee el `.env` de la raíz (`envDir: ".."`): misma sesión de Supabase Auth, sin credenciales duplicadas.
- Interfaz: sidebar oscuro `#1B2436` con `mark.png`, tarjetas blancas, datos en cian `#00BCD4` por opacidad.
- 9 tablas `crm_*` + rol `asesor` en `profiles` (única tabla existente tocada).
- **CRM Fase 4: tablero Kanban + pipeline editable** (`Board.tsx`, `PipelineSettings.tsx`). Las etapas se editan desde Configuración y el tablero se ajusta solo.
- **CRM Fase 7: panel con embudo y KPIs** (`Dashboard.tsx`, `services/dashboard.ts`, `Donut.tsx`, `Funnel.tsx`). Las cifras de la tienda salen de `admin_dashboard_metrics()`, no de una fórmula duplicada.
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
- El CRM **no puede reusar clases de la tienda** (`.overlay`, `.auth-modal`): no carga su CSS y el elemento sale sin estilos. Cada app tiene sus propias.
- En un input controlado que escribe directo en el estado, al hacer el guardado **no se puede comparar contra el estado actual**: ya tiene el valor nuevo y la comprobación "cambió algo?" siempre da falso. Comparar contra lo último persistido (un ref).
- Un `width: X%` en línea no siempre cede ante un `min-width` de CSS: calcular el mínimo en JS para que las barras vacías no dejen el texto ilegible.
- Formatear porcentajes con `Intl.NumberFormat("es-CO")`, no con `toFixed`: el punto decimal no es el de Colombia.
- La tasa de conversión va sobre lo **decidido** (ganados + perdidos), no sobre el total: contar los deals abiertos en el denominador la hunde sin sentido.
- `type="button"` en todo botón dentro de un `<form>`.
- En PowerShell `&&` no funciona: usar `;`. `git push` escribe en stderr y parece error aunque salga bien: mirar `main -> main`.
- `npx vercel@latest` falla a veces con `notarget`: usar la fija `npx vercel@64.0.2`.
- **Una función SQL sin migración no existe en la base.** `admin_record_credit_payment` vivía solo en `schema.sql`; por eso los abonos no descontaban el saldo mientras el archivo ya decía que sí. Si una RPC importa, tiene su migración.
- **Un comentario CSS sin cerrar se come reglas.** `/* ...` sin `*/` hace que todo lo que sigue dentro del media query desaparezca en silencio: compila, no tira error, y la regla simplemente no está.
- **`.admin-dock` ya existe** y es el contenedor del sidebar (`flex-direction: column`). La navegación móvil nueva se llama `.admin-navdock` para no chocar.
- Los modales usan la clase `.overlay`. `.modal-overlay` no existe: el diálogo salía pegado en la esquina y detrás del sidebar (que tiene z-index 120).
- `resize_page` cambia la ventana, no el viewport CSS: para probar móvil de verdad hay que usar emulación de dispositivo.

## Próximos pasos

- **CRM Fase 6**: que la ruta de salida funcione. `ZERNIO_SEND_PATH=/v1/inbox/messages` está por defecto, **sin confirmar** contra la documentación. Fase 8: PWA y push.
- **Probar WhatsApp**: solo se verificó Instagram. Falta confirmar que Zernio mande el número en `sender.id`.
- Correr `supabase/SEMILLA-CRM-TEST.sql` para tener deals repartidos en varias etapas y ver el embudo con datos (es idempotente).
- Persistencia del carrito; pasarela de pago; avisos de stock bajo.

## Deuda técnica conocida

- **No se ha probado el aislamiento entre admin y asesor.** La RLS está activa, pero `crm_deals`/`crm_conversations`/`crm_tasks` nunca se han abierto con una sesión de asesor. Necesita una segunda cuenta con `role = 'asesor'`.
- Inventario y Clientes tienen 3 tarjetas donde Cartera tiene 5: al igualar las cajas queda aire al pie.
- `crm/serve.mjs` sirve `dist/` en local (`node crm/serve.mjs 4174`). Es solo herramienta de desarrollo.