# MEMORY.md — Perfumes SAAD

Memoria entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.
Las reglas permanentes de UI viven en `.agents/ux-experience.agents.md`, no aquí.

## Estado

- Tienda de perfumes (React 19 + TS + Vite 7 + Supabase, en Vercel). Flujo: catálogo → carrito → recibo → WhatsApp → confirmación manual. **Sin pago online, por decisión.**
- Admin: dashboard, productos, promociones, pedidos, Cartera (fiado), clientes, gastos, asesores, perfiles, config. Botones CoreUI pill (`AdminButton`), `EmptyState`, tablas sticky.
- **Dashboard movil (2026-10-22):** en <=900 px el inicio sigue la referencia: resumen 2x2, ingresos y pedidos recientes. El orden se hace con `.overview-flow` + `order`; escritorio conserva sus grupos y su orden. `MobileOverview.tsx` reutiliza `metrics` y `orders`; el gráfico mide su contenedor con `ResizeObserver` para no aplastar las etiquetas y el header del overview usa iconos compactos.
- **HTML sin caché (2026-10-23):** `vercel.json` sirve `/`, `/index.html` y las entradas del CRM con `no-store`; los assets con hash siguen cacheables. Así el móvil no se queda con un HTML viejo tras un despliegue.
- **SKU de producto (2026-10-23):** `products.sku` es opcional y único (índice sobre `upper(sku)`). Se edita en alta/edición, se muestra y se busca en Productos, y se importa con la columna `sku`. Es del producto, no de la presentación: todas las filas de un producto repiten el mismo SKU. Migración `20261023150240_add_product_sku.sql`; mantener sincronizados `schema.sql`, `admin_create_product` y `admin_update_product`.
- Merma de inventario (6 motivos + historial por presentación) y rentabilidad por producto ordenada por utilidad. **Ambos dependían de migraciones ya aplicadas.**
- Pantalla **Cobrar**: quién debe, agrupado por cliente y no por pedido, un solo mensaje con el total.
- Seguimiento de pedidos sin login: código de 8 caracteres + teléfono, link `?track=A1B2C3D4`.
- Fiado: abonos, límite por cliente, términos quincenal/mensual, bloqueo por mora. Lo pagado queda con estado `Pagado`.
- Importación CSV/Excel; Edge Function `weekly-report`; cron los domingos 8am (Colombia). El **correo** sale de `_shared/report-email.ts`: la plantilla de negro y dorado que pidió el dueño (`reporte_semanal_email.html`) traducida a HTML de correo seguro (tablas + estilos en línea, sin Tailwind CDN, que Gmail/Outlook borran). Título dinámico **REPORTE DIARIO / SEMANAL / MENSUAL** (>31 días: "DE N DÍAS"); se prueba con `node supabase/functions/_shared/report-email.test.ts`. La migración `20261022130000_report_email_details.sql` agrega a las RPC `channels`, `buyers`, `family` y los datos extra del diario; sin ella el correo degrada (omite secciones) en vez de romperse. No rediseñar sin pedido del dueño.
- **CRM** aparte en `crm/` (`base: /crm/`), emitido en `dist/crm`: un solo deploy sirve tienda y CRM. Misma sesión de Supabase (`envDir: ".."`). No es Next.js sino Vite con serverless en `api/`. 9 tablas `crm_*`, rol `asesor` en `profiles`. Zernio recibe mensajes reales de Instagram y deduplica. **Solo el administrador entra al CRM** (ver sección propia).

## El número de WhatsApp de la tienda

- **Es `573102318786`** y vive en la fila `id = 1` de `store_settings`. Cambiarlo exige **migración + `DEFAULT_STORE_SETTINGS` + default de la columna en `schema.sql`**: los tres, o el enlace cambia según por dónde se entre.
- `VITE_WHATSAPP_NUMBER` está en `.env` pero **ningún archivo lo lee**.
- Los `wa.me` de cobranza, pedidos, CRM y reportes usan el teléfono del **cliente**: no se tocan.

## Permisos del panel (2 capas)

- **Capa 1, el rol:** `admin` y `asesor` entran al panel; `customer` no.
- **Capa 2, las secciones:** tabla `admin_section_permissions`. Una sección es visible **si y solo si** hay fila con `allowed = true`. Sin filas, no ve nada. Aplica a admins y asesores por igual.
- **La cuenta del propietario es `esaadc19@gmail.com`**: rol admin y las 13 secciones. Los demás quedan sin acceso hasta que se les asigne.
- **El enforcement es de verdad, no solo de pantalla.** Las 22 funciones `admin_*` exigían `is_admin()`; ahora exigen la sección que corresponde, y las políticas RLS de cada tabla preguntan por sección. Sin esto, esconder Cartera del menú no escondía nada: se pedía por la API.
- La UI para repartir está en **Configuración > Permisos**. Cada casilla se guarda sola. **No te puedes cambiar tus propios permisos** (la RPC lo bloquea): si te los quitas, no queda nadie para devolvértelos. Solo quien ve **todas** las secciones puede repartir.
- La lista de secciones vive en `admin_sections` (base) **y** en el array `sections` de `App.tsx` (títulos e iconos). **Las dos tienen que coincidir**: agregar una en una sola deja esa sección sin repartir.
- Si la tabla de permisos no existe (migración sin correr), la app **degrada a "ve todo"** en vez de dejar al dueño fuera de su panel.

## Acceso al CRM: solo administradores (desde 2026-10-22)

- **Cuatro capas dicen lo mismo**: la app (`loadRole` devuelve null para todo rol no-admin → pantalla de acceso denegado), `api/zernio/enviar` (valida `role === 'admin'` con la anon key, nunca con service role), la RLS de `crm_*` (`crm_is_staff()` = `is_admin()`, migración `20261022120000_crm_solo_administradores.sql`) y el enlace de la tienda (`canOpenCrm` exige admin + permiso de sección `crm`).
- El rol `asesor` sigue en la base y en `CrmRole` listo para la Fase 2: volver a abrirlo es restaurar `crm_is_staff` (línea comentada en la migración) y el chequeo de `loadRole`.
- `crm/src/layout/nav.tsx` tiene `ADMIN_ONLY = [informes, configuracion]`, hardcodeado. No usa la tabla de secciones.
- `crm/src/services/dashboard.ts` llama `admin_dashboard_metrics`, que exige la sección `overview`; el error crudo se traduce a español para el que lo vea.
- Pruebas: `supabase/PRUEBA-CRM.sql` y `PRUEBA-CRM-ESCRITURA.sql`, actualizadas: el asesor ya no ve ni crea nada (antes veía 1 deal y creaba los suyos).

## Probar en local (Postgres de verdad)

- `supabase start` levanta el stack local de Supabase con Docker (Postgres en `127.0.0.1:54322`).
- El `supabase db reset` **no sirve**: aplica solo `migrations/`, y la base vive en `schema.sql`. Aplicar a mano: `Get-Content supabase\schema.sql -Raw | docker exec -i supabase_db_Perfume_SAAD psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f -` y después cada migración en orden.
- `supabase/PRUEBA-PERMISOS.sql` simula tres cuentas con claims de sesión reales y comprueba permisos, RLS y reparto. Salida esperada: el asesor ve `pedidos=1 gastos=0`, el dueño `1/1` y el que no tiene nada `0/0`.
- Para probar la app contra el local hay que cambiar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en `.env.local` (tiene prioridad sobre `.env`).

## Decisiones que no se deducen del código

- Utilidad = cobrada − costo del fiado − gastos. No usar `credit_profit`. El reporte semanal separa **"Utilidad cobrada"** (`net_profit + credit_cost`, la titular) de **"Inversión en fiado"** (`credit_cost` acotado a la semana), porque no son pérdida: es plata que todavía no entró. `orders.credit_amount` es el **saldo pendiente**, no el total. Un pedido fue a crédito si tiene filas en `customer_credit_payments`.
- `orders` NO tiene columna `number`: el código visible es `id::text` truncado.
- `unit_price` y `unit_cost_snapshot` se congelan al crear el pedido, así que cambiar precios **no** altera la historia. Por eso no hay historial de precios.
- Una etapa con deals no se borra, se desactiva; `crm_deals.staged_at_stage_id` guarda la etapa al cerrar para que renombrarla no rompa nada.
- Identidad de contacto: `sender.contactId` de Zernio > teléfono en WhatsApp > `@usuario` en Instagram. El id crudo de Instagram **nunca** es teléfono.
- El CRM no puede reusar clases de la tienda (`.overlay`, `.auth-modal`): cada app carga su CSS.
- Dos tarjetas de una misma fila quedan alineadas solo si son columna flex con las acciones en `margin-top: auto`.
- Sin enrutador; CSS plano; variables VITE_* solo con anon key; la service role nunca en el frontend.

## Errores que ya me costaron tiempo

- **Una función SQL sin migración no existe en la base.** `admin_record_credit_payment` vivía solo en `schema.sql` y los abonos no descontaban saldo. Si una RPC importa, tiene su migración.
- **Recrear una RPC `admin_*` desde `schema.sql` borra el guard por sección.** `schema.sql` todavía usa `is_admin`; después de recrearla, restaurar `admin_require_section('products')` (migración `20261023151907`).
- **Para saber si una RPC existe:** `rest/v1/rpc/<fn>` con los nombres de parámetro exactos. **401 = existe** (solo no permitido; es lo esperado con la anon key). **404 = no existe *o* la firma está mal**, así que no concluyas que falta la migración antes de revisar los parámetros. Me pasó con `get_variant_movements`: daba 404 y el parámetro era `target_variant_id`, no `p_variant_id`.
- **Un comentario CSS sin cerrar se come reglas.** Compila, no tira error y la regla desaparece. La única señal es visual.
- **`.admin-dock` ya existe** y es el contenedor del sidebar. La navegación móvil es `.admin-navdock`.
- Los modales usan `.overlay`, no `.modal-overlay`. Sidebar z-index 120, overlays 200.
- **Nunca imprimir valores secretos.** En PowerShell `Invoke-Expression` no acepta tubería: usar `& --value`.
- **Cambiar una variable en Vercel no basta: hay que redesplegar.**
- `api/` en la raíz crea rutas en Vercel, `_lib/` no. Los archivos de prueba van en `tools/`.
- `crm_deals` tiene **dos FK** a `crm_pipeline_stages`: un embed sin `!crm_deals_stage_id_fkey` da PGRST201.
- Sin tipos generados de Supabase, los embeds a-uno llegan como array: normalizar con `one()`.
- `grid-template-columns` con `auto` al final desalinea cabeceras y datos; las celdas necesitan `min-width: 0`.
- Al verificar CSS, **medir con el marcado real del componente**, no con HTML inventado.
- **`.metric span` alcanzaba el span interno de `CountUp`** y dejaba los valores del dashboard en 10-11 px aunque el `<strong>` dijera 28. La etiqueta ahora es `.metric-label`; el valor usa `container-type: inline-size` + `clamp(16px, 10cqi, 24px)` y los grupos van de una tarjeta por fila para que el monto quepa.
- **No editar `App.tsx` por líneas desde PowerShell:** se dañó dos veces. Usar el editor.
- Mojibake en la consola **no** es un archivo roto: verificar bytes antes de "arreglar".
- `npm run dev` levanta las dos apps en 5173 y 5174 con `strictPort`: fallan en vez de corresse y romper el proxy que expone `/crm`.
- Formatear montos con `Intl.NumberFormat("es-CO")`, nunca con `toFixed`: el punto decimal no es el de Colombia.
- En PowerShell `&&` no funciona: usar `;`. `git push` escribe en stderr y parece error aunque salga bien.
- **Un `.env` con BOM rompe el CLI de Supabase**: "unexpected character ﻿ in variable name". Vite lo tolera, el CLI no. Se quita con `[System.IO.File]::WriteAllBytes($p, $bytes[3..])`.
- **`schema.sql` no se puede aplicar desde cero si tiene un error de orden**: `alter table` de una tabla que se crea después. Con `ON_ERROR_STOP=1` revienta; sin él, el error se pasa por alto y el archivo "parece funcionar". Por eso el `supabase db reset` fallaba en la primera migración.
- **Un `revoke`/`grant` con la firma equivocada falla en silencio** y deja la función ejecutable por quien sea. `admin_save_pending_order` tenia 7 argumentos y la funcion 9.
- **Un secreto con valor real en `.env.example` es un incidente**: el repo es público y el historial guarda todo. La postura nueva: **nada firmado por el navegador**; el CRM manda su token de sesión de Supabase y el servidor valida usuario y rol. La API key de Zernio nunca sale del servidor. **Rotar `ZERNIO_API_KEY` y `ZERNIO_WEBHOOK_SECRET` sigue pendiente del dueño** (las viejas están en el historial).
- **El navegador no puede guardar un secreto.** Firmar con `VITE_ZERNIO_API_KEY` obligaba a meter la clave en el bundle; sin la clave, el servidor respondía 401. La autenticación del CRM es la sesión del usuario, punto.
- `resize_page` cambia la ventana, no el viewport CSS: para probar móvil de verdad hay que emular dispositivo.

## Pendiente

- **Salida del CRM (Fase 6)**: el contrato ya está verificado contra docs.zernio.com — `POST https://zernio.com/api/v1/inbox/conversations/{conversationId}/messages` con `{accountId, message}` y cabecera `Idempotency-Key` (el id del mensaje como clave: el reintento no duplica). Falta **probar un envío real de punta a punta**. Fase 8: PWA y push.
- **WhatsApp saliente sin probar**: solo se verificó Instagram. Falta confirmar que Zernio mande el número en `sender.id`.
- **Aislamiento admin/asesor**: PROBADO (ver arriba). Ya no está pendiente.
- **Probar el panel con una cuenta de asesor**: la cuenta de pruebas es `esaadc19@gmail.com` (es el propietario, con todo). Para probar el aislamiento del **panel** hace falta una **cuenta aparte** con rol asesor. Al CRM ya no entra (por diseño).
- Correr `supabase/SEMILLA-CRM-TEST.sql` para ver el embudo con datos (es idempotente).
- **Nunca dupliques el prefijo de 14 dígitos** en `supabase/migrations`: la PK de `schema_migrations` es solo `version` (el prefijo). Ya pasó con `20261017130000_crm_zernio_contact_identity` vs `inventory_movements` (bloqueaba `db push` con 23505); se resolvió renombrando la segunda a `20261017130001` y registrando con `npx supabase migration repair --status applied <version>` las que se habían aplicado a mano sin quedar en el historial. Hoy el historial está completo y `npx supabase db push` (`--project-ref elfkbytvuatjlhzhdsmy`, conecta con pooler sin token) queda `up to date`.
- Persistencia del carrito; pasarela de pago; avisos de stock bajo.