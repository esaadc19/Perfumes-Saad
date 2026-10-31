# 20 · Pedidos, Logística y Despachos

Manual del área logística y de pedidos de **Perfumes SAAD**. Aquí se controla el ciclo de vida de cada orden desde su creación hasta la entrega efectiva al cliente final.

---

## Qué vive aquí

- **Órdenes de pedido:** Cada orden con su código único de 8 caracteres (ej. `#18B5034E`).
- **Estados de cumplimiento:**
  - `pending_confirmation`: Pedido creado, pendiente de validar pago o dirección.
  - `confirmed`: Pago verificado o crédito autorizado, listo para empacar.
  - `shipped`: Pedido entregado al mensajero en Bogotá o con guía generada en transportadora.
  - `delivered`: Entregado a satisfacción del cliente.
  - `cancelled`: Pedido cancelado (libera el stock inmediatamente).
- **Control de logística:** Mensajería urbana el mismo día (Bogotá) y guías nacionales (Interrapidísimo, Envía, Servientrega).

---

## Protocolo de Empaque y Despacho

1. **Revisión de ítems:**
   - Para botellas selladas: verificar celofán intacto y batch code legible.
   - Para decants de 10ml: verificar hermeticidad de la tapa, atomizador funcional y etiqueta limpia con nombre de la fragancia y casa perfumera.
2. **Protección:**
   - Cada producto se envuelve en plástico de burbujas de doble capa.
   - Si viaja a nivel nacional, se empaca en caja de cartón corrugado sellada con cinta de seguridad para evitar aperturas en tránsito.
3. **Notificación al Cliente por WhatsApp:**
   Tan pronto se entrega al mensajero o transportadora, se envía el mensaje automático con el link de rastreo:
   > *"Hola [Nombre], tu pedido #[Código] en Perfumes SAAD ya va en camino. 🚚✨ Puedes rastrearlo aquí: [Link de Rastreo]. ¡Que lo disfrutes mucho!"*

---

## Qué recibe de otras áreas

- **De `10-catalogo-cotizaciones`:** Datos completos del comprador y productos acordados.
- **De `50-finanzas-conciliacion`:** Luz verde de pago confirmado (para ventas de contado).
- **De `40-cartera-fiados`:** Luz verde de crédito autorizado (para ventas a fiado).

## Qué entrega a otras áreas

- **A `30-inventario-decants`:** Descuento automático de existencias en el inventario.
- **A `50-finanzas-conciliacion`:** Registro de costo de domicilio asumido o cobrado.
- **A `60-crm-asesores`:** Fecha de entrega para programar el mensaje de satisfacción a los 3 días.
