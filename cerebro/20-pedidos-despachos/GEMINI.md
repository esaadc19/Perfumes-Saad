# 20-pedidos-despachos — Manual del Área

Este es el manual operativo de **Pedidos y Despachos** de Perfumes SAAD. Aquí vive todo el proceso logístico desde que una venta queda confirmada hasta que el producto llega físicamente a las manos del cliente.

---

## Qué vive aquí

- **Panel de control de pedidos:** Módulo de Pedidos en el panel administrativo (`/pedidos`).
- **Canal de seguimiento al cliente:** Link de rastreo web sin contraseña (`?track=[CODIGO]`).
- **Materiales de empaque:**
  - Bolsas de regalo personalizadas con el logo oficial de **Perfumes SAAD** (para botellas grandes).
  - Empaques especiales de cartón con inserto interno de fomi amortiguador a medida (para decants de 10 ml).
- **Transportadora nacional oficial:** **Coordinadora**.
- **Entregas locales (Barranquilla y Soledad):** Entrega directa y personalizada por el propietario.

---

## Plantilla Oficial de Solicitud de Datos de Envío

Para clientes nuevos o ventas que requieren despacho a domicilio, se envía esta plantilla por WhatsApp inmediatamente después de confirmar el pago o crédito:

```text
📦 DATOS PARA TU ENTREGA — Perfumes SAAD

Para coordinar tu entrega, por favor compártenos los siguientes datos:

* 👤 Nombre completo:
* 📱 Teléfono de contacto:
* 📍 Dirección exacta:
* 🏢 Casa / Apto / Torre:
* 🏘️ Barrio y Ciudad:
* 🧭 Indicaciones o puntos de referencia (ej. portería, horario preferido):

¡Listo! Te avisaremos en cuanto tu pedido vaya en camino. ✨
```

---

## Protocolo de Empaque y Protección

El perfume es un producto delicado (frascos de vidrio y líquidos presurizados) que requiere máxima protección:

### 1. Botellas grandes (30ml, 50ml, 100ml, etc.)
- Se verifica que la caja original esté sellada y en perfecto estado.
- Se empaca dentro de la **bolsa de lujo con el logo de Perfumes SAAD**.
- Para envíos nacionales por Coordinadora: la caja se envuelve previamente en plástico de burbujas antes de introducirla a la caja o bolsa de seguridad de la transportadora.

### 2. Decants (10 ml)
- Se enrosca firmemente el atomizador y se revisa que no haya residuos en el cuello del frasco.
- Se inserta en el **estuche de cartón protector con base de fomi**. El fomi inmoviliza el frasco para que no choque contra las paredes de la caja durante el transporte.
- Presentación limpia, estética y segura contra caídas.

### 3. Detalle de experiencia (Próxima implementación)
- Tarjeta de agradecimiento con recomendaciones de conservación del perfume (guardar en lugar fresco y oscuro, no frotar en muñecas) y código QR directo al catálogo web.

---

## Tiempos y Logística de Entrega

| Destino | Operador | Tiempo de Entrega | Seguimiento al Cliente |
|---|---|---|---|
| **Barranquilla y Soledad** | Propietario (Entrega directa) | **El mismo día** (Same-Day) | Mensaje por WhatsApp al salir y al estar en la puerta |
| **Nivel Nacional (Resto del país)** | **Coordinadora** | 2 a 4 días hábiles según ciudad | Link de rastreo web del sistema (`?track=...`) |

### La Promesa de "Mismo Día" en Barranquilla
Entregar el mismo día es la mayor ventaja competitiva de Perfumes SAAD frente a compras en tiendas de Bogotá, Medellín o plataformas web. El cliente no tiene que esperar días para estrenar su fragancia.

---

## Tareas del Área

### Tarea 1: Verificación de pago y datos de envío
- Revisar que el pago esté confirmado en el área `10-ventas` o pactado en `50-cartera`.
- Solicitar y confirmar la dirección completa con la plantilla oficial.

### Tarea 2: Alistamiento y empaque
- Revisar stock en `30-inventario-decants`.
- Si es decant: asegurar frasco atomizador limpio, envasado y rotulado con el nombre del perfume.
- Colocar en empaque de fomi / bolsa con logo.

### Tarea 3: Ejecución de la entrega
- **Ruta local:** Planificar paradas en Barranquilla según zonas (norte, centro, sur, Soledad).
- **Ruta nacional:** Entregar en punto Coordinadora, obtener número de guía y registrarlo en el pedido.

### Tarea 4: Cierre del pedido en el sistema
- **Frecuencia:** **Al final del día.**
- Entrar al panel (`/pedidos`) y cambiar el estado del pedido a **"Entregado"** (o "Enviado" con su número de guía de Coordinadora).
- Si el pedido se pagó contraentrega en efectivo, entregar el reporte de dinero a `60-finanzas-conciliacion`.

---

## Qué recibe de otras áreas

- **De `10-ventas-catalogo`:** Notificación de pedido confirmado, productos solicitados y comprobante de pago o acuerdo de fiado.
- **De `30-inventario-decants`:** Botellas selladas y decants listos para empacar.

---

## Qué entrega a otras áreas

- **A `30-inventario-decants`:** Descuento físico del inventario (al marcarse pagado/entregado).
- **A `50-cartera-cobranza`:** Confirmación de entrega para pedidos a fiado (inicia el conteo de días para el cobro).
- **A `60-finanzas-conciliacion`:** Dinero en efectivo cobrado contraentrega y costos de envío/fletes pagados a Coordinadora para el cálculo del P&L real.

---

## Dolores Principales y Oportunidades

1. **Cuello de botella de tiempo personal:** El dueño realiza personalmente las entregas en Barranquilla, lo que consume horas críticas en tráfico y desplazamientos que restan tiempo a ventas, compras y pauta.
   - *Oportunidad:* A medida que el volumen suba, vincular un mensajero motorizado de confianza o servicio por aplicación (InDrive/Mensajeros Urbanos) para rutas locales.
2. **Alistamiento de decants a contrarreloj:** Preparar decants uno a uno justo antes de salir genera estrés para cumplir con la entrega el mismo día.
   - *Oportunidad:* Pre-fraccionar y mantener un stock mínimo listo de los 5 a 10 perfumes más vendidos en decant de 10 ml.
3. **Cierre nocturno de pedidos:** Al actualizar los pedidos solo al final del día, el panel puede mostrar pedidos pendientes que en la calle ya fueron entregados.

---

## PENDIENTE (de esta área)

- [ ] Definir tarifario exacto de Coordinadora por peso/volumen para cotizaciones nacionales especiales.
- [ ] Contacto o convenio con mensajero motorizado de respaldo para días de alta demanda en Barranquilla.
- [ ] Diseño e impresión de tarjetas de agradecimiento y tips de uso del perfume.
