# Perfumes SAAD — MVP 0.1

Primer artefacto del proyecto Perfumes SAAD.

## Qué incluye

- Catálogo público responsive.
- Categorías y búsqueda.
- Vista de producto inspirada en la referencia proporcionada.
- Variantes por presentación (ml).
- Cambio automático de precio al seleccionar presentación.
- Control visual de stock/agotado.
- Carrito/pedido.
- Generación de pedido y apertura de WhatsApp con los productos y total.
- Vista administrativa demo.
- Métricas iniciales de inventario.
- Alta de producto demo.
- Esqueleto de Supabase.
- Esquema SQL inicial.

## Importante

Esta primera versión NO realiza un cobro online. El flujo es:

Catálogo → selección → pedido/recibo → WhatsApp → cierre manual de la venta.

No se procesa ningún pago en línea; el recibo registra el pedido pendiente de confirmación.

## Instalación

```bash
npm install
npm run dev
```

Abrir la URL mostrada por Vite.

## Configurar Supabase

1. Crea un proyecto en Supabase y espera a que termine de aprovisionarse.
2. En el panel del proyecto, abre **Project Settings → API** (o **API Keys**).
3. Copia la **Project URL** y la clave pública **anon/public** o **publishable**. No uses `service_role` ni `sb_secret_*` en la aplicación web.
4. Copia `.env.example` como `.env` en la raíz del proyecto y completa:

   ```env
   VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
   VITE_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA
   VITE_WHATSAPP_NUMBER=573181749436
   VITE_GOOGLE_MAPS_API_KEY=TU_CLAVE_PUBLICA_RESTRINGIDA
   ```

5. En **SQL Editor → New query**, abre `supabase/schema.sql`, copia su contenido, pégalo y selecciona **Run**. Este paso crea las tablas, políticas y funciones que usa la aplicación. Vuelve a ejecutar el esquema actualizado cuando incorpores funciones administrativas nuevas.
6. Reinicia el servidor local (`Ctrl+C` y `npm run dev`) para que Vite cargue las variables nuevas.
7. Prueba un pedido pequeño desde la tienda. Si aparece un error de clave, vuelve a copiar la URL y la clave pública del mismo proyecto. Si indica que falta `create_whatsapp_order`, vuelve a ejecutar el esquema.

El esquema crea el bucket público `product-images` para mostrar las fotos del catálogo. Solo las cuentas con rol de administrador pueden cargar, cambiar o borrar imágenes; el límite es 5 MB por archivo.

El registro y la sección **Mi cuenta** permiten escribir, guardar y editar una dirección de entrega en un campo de texto. Vuelve a ejecutar `supabase/schema.sql` para agregar el campo y sus permisos de perfil.

El archivo `.env` está excluido de Git. No publiques ni envíes claves privadas; las variables `VITE_*` se incorporan al frontend, por lo que solo deben contener la URL y una clave pública protegida con las políticas RLS del esquema.

### Enlaces de correo de autenticación

El dominio oficial de la tienda es `https://perfumes-saad.vercel.app/`. Los correos de confirmación de registro vuelven siempre a este dominio, incluso si la cuenta se solicita mientras se ejecuta la aplicación en localhost.

En Supabase abre **Authentication → URL Configuration**:

1. Configura **Site URL** como `https://perfumes-saad.vercel.app/`.
2. En **Redirect URLs**, agrega `https://perfumes-saad.vercel.app/**`. Agrega URLs localhost solo si todavía necesitas probar callbacks locales; el sitio publicado no las utiliza.
3. Deja activada la confirmación de correo en **Authentication → Providers → Email** para que el registro envíe el mensaje de confirmación. El correo predeterminado de Supabase tiene límites de envío; configura SMTP propio en **Authentication → SMTP Settings** si necesitas mayor cuota o entrega de producción.
4. El formulario de acceso permite solicitar un enlace en **¿Olvidaste tu contraseña?**. El enlace vuelve a la tienda, donde se puede definir y confirmar una contraseña nueva. Si personalizas la plantilla de restablecimiento en **Authentication → Email Templates**, conserva el enlace seguro de Supabase (`{{ .ConfirmationURL }}`).

Al registrarse, el cliente debe aceptar el tratamiento de datos personales y las promociones por WhatsApp. La aceptación y su fecha se guardan en el perfil de Supabase.

### Crear la primera cuenta de administrador

1. En la tienda, abre **Cuenta → Crear una cuenta de cliente** y regístrate con un correo al que tengas acceso. Elige tu propia contraseña; la tienda no asigna contraseñas ni comparte credenciales.
2. Si Supabase lo solicita, confirma la cuenta desde el correo e inicia sesión al menos una vez.
3. En **Supabase → SQL Editor → New query**, promueve únicamente ese correo registrado:

   ```sql
   update public.profiles p
   set role = 'admin'
   from auth.users u
   where p.id = u.id
     and lower(u.email) = lower('TU_CORREO');
   ```

4. Cierra sesión y vuelve a entrar en la tienda. Abre **Administración**; el panel permitirá gestionar productos, pedidos, clientes y roles de perfiles.
5. Después de iniciar sesión como administrador, asigna los roles de otras cuentas registradas desde **Perfiles**. No cambies tu propio rol ni elimines el último administrador.

Para dar acceso administrativo a una cuenta concreta, esa persona primero debe registrarse, confirmar el correo si Supabase lo solicita e iniciar sesión al menos una vez. Desde otra cuenta administradora, abre **Perfiles**, busca el correo registrado y cambia su permiso a **Administrador**. No compartas contraseñas ni incluyas el correo o la contraseña en el código.

No registres contraseñas en SQL ni en perfiles. Las credenciales se administran exclusivamente desde Supabase Auth. Vuelve a ejecutar el `supabase/schema.sql` actualizado en el SQL Editor para habilitar las métricas y funciones administrativas.

### Transacciones, costos y utilidad

En el panel, registra el costo unitario de cada presentación desde **Productos**. Los pedidos nuevos guardan una copia del costo de cada línea, para que los cambios futuros de costo no alteren la rentabilidad histórica.

En **Productos**, ajusta el stock de cada presentación; cada ajuste se registra como movimiento de inventario. En el dashboard, pulsa **Agotados**, **Pedidos pendientes** o **Presentaciones con stock bajo** para abrir el detalle y navegar a la sección correspondiente.

En **Pedidos**, puedes buscar por nombre o teléfono del cliente, perfume o número de pedido; filtrar por estado de pago; crear pedidos con un cliente existente o ingresar un cliente manualmente (nombre obligatorio; teléfono, correo, ciudad y dirección opcionales); elegir la fecha del pedido y seleccionar las presentaciones. El filtro **Pendientes de pago** muestra los pedidos confirmados que aún no se han pagado. Puedes editar cliente, fecha, productos, cantidades y costo de domicilio mientras el pedido no esté marcado como **Pagado · completar venta**. Cambiar el estado del pedido no impide completar la venta: al elegir el pago, la función protegida confirma el pedido, descuenta el inventario y registra los movimientos. Los pedidos pagados quedan bloqueados para edición y eliminación; usa el flujo de reembolso, que restaura el inventario, antes de cambiarlos. Al borrar un pedido, sus movimientos de inventario se conservan y quedan desvinculados del pedido para mantener el historial sin bloquear el borrado. Ejecuta el `supabase/schema.sql` actualizado en Supabase para aplicar estas reglas.

En **Productos**, los perfumes se muestran en orden alfabético. Puedes añadir hasta tres imágenes JPG, PNG, WebP o AVIF por perfume. En la tienda, el cliente puede cambiar entre ellas desde la galería del detalle. El botón **Editar** permite modificar los datos y presentaciones existentes o pulsar **Agregar presentación** para crear otro tamaño (por ejemplo, 200 ml) con su propio precio, costo y stock. La casilla **Visible en tienda** permite ocultar y volver a publicar una presentación sin borrarla ni perder su inventario. Las presentaciones ocultas también se identifican en la lista de productos. También puedes quitar una presentación desde el icono de papelera; al guardar, se elimina si no tiene historial asociado y se desactiva conservando pedidos o movimientos de inventario cuando sí los tiene. Ejecuta la versión actualizada de `supabase/schema.sql` para habilitar la creación, activación y eliminación de presentaciones desde el editor. Los cambios de stock quedan registrados en movimientos de inventario. Al eliminar un producto con pedidos o movimientos asociados, se archiva y desaparece de la lista principal; usa **Archivados** para consultar el registro que se conserva por el historial. Los productos sin historial se eliminan físicamente. Para importar, descarga **Plantilla CSV** y luego usa **Importar archivo** en este panel para seleccionar el CSV o Excel `.xlsx` (se lee la primera hoja). No importes este CSV directamente en la tabla `products` desde Supabase: el panel crea también cada presentación en `product_variants`, y las dos tablas se relacionan mediante UUID generados por Supabase. El archivo debe contener estos encabezados: `brand`, `name`, `gender`, `category`, `size_ml`, `price`, `cost`, `stock`; `description`, `family`, `image_url` e `image_urls` son opcionales. También se aceptan los equivalentes `marca`, `nombre`, `producto`, `genero`, `categoria`, `descripcion`, `familia`, `familia_olfativa`, `imagen_url`, `imagenes_url`, `size`, `ml`, `tamano_ml`, `presentacion_ml`, `precio`, `costo` y `existencias`. Se importa una fila por presentación: repite marca y nombre para agrupar tamaños del mismo perfume. Género y categoría deben coincidir entre esas filas; descripción, familia e imágenes se pueden repetir o dejar en blanco en filas secundarias. En `image_urls`, separa hasta tres URL públicas con `|`. Los valores de precio/costo deben ser numéricos sin separador de miles; `gender` acepta `Hombre`, `Hombres`, `Masculino`, `Mujer`, `Mujeres`, `Femenino` o `Unisex`; `category` acepta  `Diseñador`, `Árabes` o `Nicho`. Las filas se validan antes de importar y, si falla la escritura de un producto, se informa sin ocultar los demás resultados.

En **Configuración**, puedes cambiar el nombre y el logo de la tienda, el WhatsApp de pedidos, el correo público de contacto y los textos de saludo, portada y recibo. El logo se guarda en el bucket `product-images`; solo los administradores pueden modificar estos valores. Ejecuta el `supabase/schema.sql` actualizado para crear la tabla singleton `store_settings` y sus políticas antes de guardar la configuración.

En **Promociones**, crea paquetes indicando un nombre, la cantidad de unidades y su precio total. Decide si el paquete permite combinar los productos asociados o si requiere unidades del mismo perfume; luego selecciona esa promoción al crear o editar cada producto. En la tienda, el filtro **Ofertas** muestra los productos con promociones activas. El carrito, el recibo y los pedidos manuales de administración repiten la oferta por cada paquete completo y cobran las unidades sobrantes al precio normal. Los descuentos se vuelven a calcular en Supabase al guardar y se reflejan en las métricas de utilidad.

En el CSV o Excel de productos, `gender` acepta `Hombre`, `Hombres`, `Masculino`, `Mujer`, `Mujeres`, `Femenino` o `Unisex`; los valores singulares y masculino/femenino se normalizan automáticamente. El lector de CSV admite UTF-8 y Windows-1252 para que Excel no dañe acentos como el de `Diseñador`. La plantilla CSV descargable incluye dos filas de ejemplo: reemplázalas por tus datos antes de importar.

En **Clientes**, también puedes importar contactos desde CSV o Excel `.xlsx`. Usa `full_name` como columna obligatoria y, opcionalmente, `phone`, `email` y `city` (se aceptan los encabezados equivalentes en español mostrados en el panel). Cada cliente debe tener correo o teléfono. Los registros existentes con el mismo correo o teléfono se omiten para evitar duplicados; la importación no crea cuentas ni cambia permisos.

Los pedidos antiguos pueden no tener costo histórico. El panel los señala y deja su utilidad incompleta en lugar de inventar costos. La utilidad neta mostrada para ventas pagadas se calcula como total cobrado menos el costo de los productos y el costo de domicilio asumido por la tienda; no incluye comisiones ni otros gastos.

El número de WhatsApp de pedidos se configura en `VITE_WHATSAPP_NUMBER`, en formato internacional, sin `+` ni espacios. El reporte semanal usa `WHATSAPP_NUMBERS`; si no se define, se envía a `3102318786` (Colombia, prefijo `57` aplicado automáticamente).

### Reportes y gastos recurrentes

El dashboard permite generar un reporte para cualquier rango de fechas pasado o actual; incluye ventas pagadas por fecha de pago, unidades vendidas, el producto más vendido y gastos registrados dentro del rango. También conserva el reporte semanal de la última semana completa. Ambos ejecutan `weekly-report`, que solo permite el acceso a administradores, e incluyen un enlace de WhatsApp y envío por correo. Vuelve a ejecutar `supabase/schema.sql` para crear la función de base de datos `sales_report_by_date_range` usada por el reporte por rango. En **Gastos**, marca un gasto como recurrente para crear su primer vencimiento semanal, mensual o anual. Los pagos próximos y vencidos aparecen en el panel. Al registrar un pago, se guarda el gasto en el historial y se programa el siguiente vencimiento. `expense-reminders` envía un correo a las 8:00 a. m. hora de Colombia el día del vencimiento y vuelve a avisar diariamente mientras siga pendiente.

Ambos envíos por correo usan el Apps Script configurado en `GOOGLE_APPS_SCRIPT_URL` y `GOOGLE_APPS_SCRIPT_SECRET` dentro de **Supabase → Edge Functions → Secrets**. La URL es la implementación `/exec`; el secreto debe coincidir con la propiedad de secuencia de comandos `REPORT_SHARED_SECRET`. Apps Script lee el destinatario de `REPORT_RECIPIENT_EMAIL`. `weekly-report` y `expense-reminders` envían el JSON `{ secret, subject, html }` a `doPost`. No guardes el secreto en el frontend, `.env` de Vite ni Git. Configura también, si hace falta, `WHATSAPP_NUMBERS`; su valor predeterminado es `3102318786`, y a los celulares colombianos de 10 dígitos se les aplica el prefijo `57`. Para desplegar `weekly-report` y `expense-reminders` automáticamente con cada push a `main`, configura `SUPABASE_ACCESS_TOKEN` (token de acceso de Supabase con alcance limitado al proyecto) y `SUPABASE_PROJECT_ID` (referencia del proyecto) en **GitHub → Settings → Secrets and variables → Actions**. Los cron de reportes y recordatorios dependen además de que `app.settings.supabase_url` y `app.settings.supabase_service_role_key` estén configurados en la base de datos; el enlace de WhatsApp requiere que un administrador lo abra.

## Vercel

Conecta el repositorio de GitHub con Vercel. En **Project Settings → Environment Variables**, crea `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_WHATSAPP_NUMBER` con los valores locales. Luego vuelve a desplegar el proyecto. No agregues claves `service_role` o `sb_secret_*` al frontend.

Build command:
`npm run build`

Output:
`dist`

No se necesita comprar hosting para este MVP. GitHub aloja el código y Vercel sirve el frontend; Supabase aloja la base de datos.

## Estado de la integración

La aplicación ya incluye autenticación, roles, gestión de productos y guardado de pedidos. Estas funciones requieren completar los pasos de configuración de Supabase anteriores. El flujo de pedido no cobra en línea: registra el pedido y lo envía a WhatsApp para confirmar la venta manualmente.
