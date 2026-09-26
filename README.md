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
   VITE_WHATSAPP_NUMBER=573102318786
   ```

5. En **SQL Editor → New query**, abre `supabase/schema.sql`, copia su contenido, pégalo y selecciona **Run**. Este paso crea las tablas, políticas y funciones que usa la aplicación. Vuelve a ejecutar el esquema actualizado cuando incorpores funciones administrativas nuevas.
6. Reinicia el servidor local (`Ctrl+C` y `npm run dev`) para que Vite cargue las variables nuevas.
7. Prueba un pedido pequeño desde la tienda. Si aparece un error de clave, vuelve a copiar la URL y la clave pública del mismo proyecto. Si indica que falta `create_whatsapp_order`, vuelve a ejecutar el esquema.

El esquema crea el bucket público `product-images` para mostrar las fotos del catálogo. Solo las cuentas con rol de administrador pueden cargar, cambiar o borrar imágenes; el límite es 5 MB por archivo.

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

En **Pedidos**, puedes crear pedidos con un cliente existente y seleccionar las presentaciones, o editar/eliminar pedidos todavía no pagados. Al guardar, el total se calcula con los precios actuales y se comprueba el stock. El stock se descuenta al marcar el pedido como **Pagado · completar venta**; entonces la función protegida confirma la venta, registra el movimiento y su fecha. Los pedidos pagados no se pueden editar ni eliminar; usa el flujo de reembolso, que restaura el inventario.

En **Productos**, puedes añadir hasta tres imágenes JPG, PNG, WebP o AVIF por perfume. En la tienda, el cliente puede cambiar entre ellas desde la galería del detalle. Los botones **Editar** y **Eliminar** permiten actualizar imágenes, precios, costos y stock desde una ventana. Los cambios de stock quedan registrados en movimientos de inventario. Si un producto tiene pedidos o movimientos asociados, al eliminarlo se archiva para conservar el historial; los productos sin historial se eliminan. Para importar productos, pulsa **Importar archivo** y selecciona CSV o Excel `.xlsx` (se lee la primera hoja). Usa estos encabezados: `brand`, `name`, `gender`, `category`, `description`, `family`, `image_url`, `image_urls`, `size_ml`, `price`, `cost`, `stock`. También se aceptan los equivalentes `marca`, `nombre`, `producto`, `genero`, `categoria`, `descripcion`, `familia`, `familia_olfativa`, `imagen_url`, `imagenes_url`, `size`, `ml`, `tamano_ml`, `presentacion_ml`, `precio`, `costo` y `existencias`. Las columnas `brand`, `name`, `gender`, `category`, `size_ml`, `price`, `cost` y `stock` son obligatorias; los demás campos son opcionales. Se importa una fila por presentación: repite marca y nombre para agrupar tamaños del mismo perfume. Género y categoría deben coincidir entre esas filas; descripción, familia e imágenes se pueden repetir o dejar en blanco en filas secundarias. En `image_urls`, separa hasta tres URL públicas con `|`. Los valores de precio/costo deben ser numéricos sin separador de miles; `gender` acepta `Mujeres`, `Hombres` o `Unisex`; `category` acepta `Comercial`, `Diseñador`, `Árabes` o `Nicho`. Las filas se validan antes de importar y, si falla la escritura de un producto, se informa sin ocultar los demás resultados.

En **Clientes**, también puedes importar contactos desde CSV o Excel `.xlsx`. Usa `full_name` como columna obligatoria y, opcionalmente, `phone`, `email` y `city` (se aceptan los encabezados equivalentes en español mostrados en el panel). Cada cliente debe tener correo o teléfono. Los registros existentes con el mismo correo o teléfono se omiten para evitar duplicados; la importación no crea cuentas ni cambia permisos.

Los pedidos antiguos pueden no tener costo histórico. El panel los señala y deja su utilidad incompleta en lugar de inventar costos. Los importes son utilidad bruta y no incluyen domicilio, comisiones ni otros gastos.

El número de WhatsApp se configura en `VITE_WHATSAPP_NUMBER`, en formato internacional, sin `+` ni espacios.

## Vercel

Conecta el repositorio de GitHub con Vercel. En **Project Settings → Environment Variables**, crea `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_WHATSAPP_NUMBER` con los valores locales. Luego vuelve a desplegar el proyecto. No agregues claves `service_role` o `sb_secret_*` al frontend.

Build command:
`npm run build`

Output:
`dist`

No se necesita comprar hosting para este MVP. GitHub aloja el código y Vercel sirve el frontend; Supabase aloja la base de datos.

## Estado de la integración

La aplicación ya incluye autenticación, roles, gestión de productos y guardado de pedidos. Estas funciones requieren completar los pasos de configuración de Supabase anteriores. El flujo de pedido no cobra en línea: registra el pedido y lo envía a WhatsApp para confirmar la venta manualmente.
