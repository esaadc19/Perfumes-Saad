# AGENTS.md — UX/UI Experience (Perfumes SAAD)

Responsable de la experiencia de usuario, accesibilidad, flujos de navegación y coherencia visual de la tienda de perfumes y el panel de administración.

## Stack y estructura

- **React 19 + TypeScript + Vite 7**
- **CSS plano** (`src/styles.css`) — sin frameworks de CSS
- **Iconos:** `lucide-react` + `@hugeicons/react`
- **Animaciones:** `motion`
- **Sin enrutador:** Navegación por estado en `App.tsx`

### Puntos de entrada de UX

- **Tienda pública:** `src/App.tsx` (vista `store`)
- **Panel admin:** `src/App.tsx` (vista `admin`, componente `Admin`)
- **Componentes modales:** `AuthDialog`, `AccountDialog`, `ReceiptDialog`
- **Componentes de catálogo:** Grid de productos, detalle de producto, carrito drawer
- **Componentes admin:** `OrdersPage`, `OrderEditorModal`, `SettingsPage`, `DashboardCharts`

## Comandos

```bash
npm run dev       # Desarrollo con HMR
npm run build     # Type-check + build
npm run preview   # Preview del build
```

## Convenciones

- **Idioma de textos de UI:** Español (Colombia)
- **Tono:** Cercano, profesional, orientado a la venta
- **Formato de moneda:** COP con `Intl.NumberFormat("es-CO")`
- **Accesibilidad:** `aria-label` en botones de icono, `role="alert"` en errores, `aria-pressed` en toggles
- **Responsive:** Mobile-first, el `Dock` es la navegación principal en móvil
- **Feedback visual:** Estados de carga, error y vacío en todas las vistas
- **Archivo de referencia:** `src/App.tsx` para flujos de usuario, `src/styles.css` para sistema visual

## Reglas de dominio / trampas conocidas

- **El flujo de compra NO incluye pago online.** Es: Catálogo → Carrito → Recibo → WhatsApp → Confirmación manual.
- **El carrito NO persiste** al recargar la página (decisión de MVP).
- **El modo demo (sin Supabase)** muestra `seedProducts` con un aviso claro al usuario.
- **Las variantes agotadas se deshabilitan**, no se ocultan — el cliente ve que existe pero no puede comprarla.
- **Las promociones se muestran** como badge "Oferta" + texto explicativo ("3 por $X").
- **El recibo es tipo impresora** (formato texto plano) y se envía por WhatsApp.
- **El panel admin solo es accesible** con rol `admin` o `asesor` en la tabla `profiles`.
- **El rol dice si puede ENTRAR al panel; los permisos dicen qué puede VER dentro.** Son dos capas: con el rol solo, un asesor entra y ve Cartera, Gastos y Reportes, que es justo lo que no debería. La tabla `admin_section_permissions` da acceso seccion por seccion, y sin filas no ve nada. La UI para repartirlo vive en **Configuración > Permisos**, fuera del formulario de configuración, porque cada casilla se guarda sola y no hay un "Guardar" que se pueda olvidar.
- **Una cuenta sin secciones asignadas no ve un panel vacío: ve un aviso** que le diga que pida acceso. Un panel en blanco parece un error de la app y la persona no sabe si algo se rompió o si le falta permiso.
- La lista de secciones del panel tiene que coincidir con la tabla `admin_sections` de la migración `20261019100000_admin_section_permissions.sql`. Si agregas una sección en `App.tsx`, agregala también allá o no se podrá repartir.
- **Un permiso que solo esconde en la pantalla no es un permiso.** Al ocultar una sección del menú, hay que cambiarla también en la base: las funciones `admin_*` y las políticas RLS. Si no, la persona abre la consola y pide los datos igual. Cada función `admin_*` pide una sección (`admin_require_section`), y cada política RLS pregunta por sección, no por rol.
- **NO usar `alert()` ni `confirm()`.** Usar modales y feedback inline.
- **Los recordatorios de cobro van agrupados por cliente, no por pedido.** Quien tiene tres fiados unaware que los tiene: recibir tres mensajes distintos lo hace ver desorganizado. La pantalla "Cobrar" suma los saldos y arma un solo mensaje con el total y el atraso.
- **Toda confirmación va por `ConfirmDialog`.** `window.confirm()` está prohibido: sus botones son nativos del sistema, no se pueden estilizar y en móvil tapan la pantalla sin poder cerrarse con Escape. El diálogo además cierra con Escape y atrapa el foco.
- **En móvil la navegación es el dock fijo al pie**, no los tabs de sección (esos están en `display: none` por debajo de 900px). Cinco secciones frecuentes + "Más" con el resto agrupado. Ítems de 56px mínimo, `env(safe-area-inset-bottom)` para la barra del iPhone, y `padding-bottom` en el contenido para que el dock no tape la última fila.
- **Estados vacíos: usar siempre el componente `EmptyState`.** No escribir un `<p className="empty-state">` a mano: el markup queda distinto al del resto y el estilo se desvía.
- **En móvil, quitar redundancia antes que cambiar el layout.** Cuando una tarjeta no cabe, el problema casi nunca es el layout: es que el mismo dato aparece dos veces (el precio dentro de cada chip *y* debajo). Quitar lo repetido libera el ancho sin tocar el flujo de compra. Y cuando las tarjetas de una misma fila se ven desiguales, la causa es que el texto más largo empuja el contenido: la tarjeta debe ser columna flex con las acciones en `margin-top: auto`.
- **En una ficha de producto, la compra va al alcance del pulgar.** En escritorio el botón al final se lee bien; en un teléfono hay que scrollear por la descripción y las reseñas para llegar. La ficha lleva una barra fija al pie con precio y botón juntos, y el contenido se reordena con `order`: primero lo que sirve para decidir (nombre, precio, presentaciones), después lo que se lee por interés. Ocultar en móvil el precio que ya está en la barra: dos precios a 190px se leen como un error.
- **`order` en una columna flex mueve lo visual, no el orden del tabulador.** Funciona cuando los elementos que se quedan en su sitio son los del principio, porque los que no llevan `order` quedan en 0. Si hace falta reordenar la primera mitad, mover el marcado.
- **El logo y los textos de la tienda** vienen de `store_settings` (configurable por el admin).
- **El número de WhatsApp** se configura en `VITE_WHATSAPP_NUMBER` y en `store_settings`.
- **El seguimiento de pedidos** se accede desde el footer ("Rastrear pedido"). El cliente ingresa número de pedido (8 caracteres) + teléfono. No requiere login. Muestra línea de tiempo: Pedido recibido → Confirmado → Enviado → Entregado. El link de seguimiento (`?track=A1B2C3D4`) se puede enviar por WhatsApp desde el recibo o el modal de rastreo.

## Forma de trabajar

- **Planificar antes** si el cambio afecta: flujos de usuario, navegación, o la estructura de modales.
- **Tamaño de cambios:** Un flujo o pantalla por commit.
- **Al terminar:** Explicar qué se mejoró en la experiencia y cómo verificarlo.
- **Commits en español:** `feat:`, `fix:`, `ux:`, `style:` con descripción clara.

## Límites

- ✅ Siempre: actualizar `MEMORY.md` al terminar cada tarea.
- ✅ Siempre: probar el flujo completo en móvil y escritorio.
- ✅ Siempre: verificar accesibilidad básica (aria-labels, roles, contraste).
- ⚠️ Pregunta antes: cambios en flujos de compra, nuevos modales, cambios en la navegación principal.
- 🚫 Nunca: romper el flujo de compra, usar `alert()`/`confirm()`, hardcodear textos configurables, ignorar el modo demo.

## Memoria

- Al empezar, lee `MEMORY.md` para conocer el estado del proyecto y las decisiones tomadas.
- Al terminar una tarea, actualízalo: estado actual, decisiones importantes (con su porqué) y errores a evitar.
- Mantenlo breve (máximo ~50 líneas): resume o elimina lo que ya no aporte.
- Si algo se convierte en una regla permanente, propón moverlo a `AGENTS.md` en lugar de dejarlo en la la memoria.
- No guardes nunca datos sensibles (claves, tokens, datos personales).

## Verificación

1. `npm run dev` — recorrer el flujo completo de compra en móvil y escritorio
2. Verificar que los estados de carga, error y vacío se ven correctamente
3. Probar el modo demo (sin `.env`) — debe ser claro que es demostración
4. Verificar accesibilidad: tab navigation, aria-labels, contraste de colores
5. Probar el flujo admin: login → dashboard → productos → pedidos → configuración
