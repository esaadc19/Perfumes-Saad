# 40 · Cartera, Créditos y Cobro de Fiados

Manual del área de créditos y cobranzas de **Perfumes SAAD**. Aquí reside la política de fiados, el control de plazos, los cupos asignados por cliente y el protocolo de cobro amistoso por WhatsApp.

---

## Qué vive aquí

- **Registro de pedidos a crédito:** Pedidos en estado `credit` (saldo total pendiente) o `partial` (con abonos parciales recibidos).
- **Control de vencimientos:** Plazo máximo otorgado (15 o 30 días) y cálculo automático de días vencidos.
- **Historial de abonos:** Cada pago recibido registrado en `customer_credit_payments`.
- **Bloqueo preventivo:** Opción de congelar crédito a clientes con mora severa.

---

## Políticas de Crédito

1. **A quién se le fía:**
   - Exclusivamente a clientes recurrentes con al menos 2 compras previas pagadas de contado, o recomendados directos verificados.
   - Todo cliente nuevo paga el 100% anticipado o contraentrega en Bogotá.
2. **Cupo máximo sugerido:**
   - Clientes estándar: hasta $350.000 (equivalente a 1 perfume de diseñador promedio o lote de decants).
   - Clientes VIP / Coleccionistas: hasta $700.000 con autorización expresa.
3. **Plazos:**
   - Máximo 30 días calendario para saldar la totalidad.
   - Se incentiva abonar el 50% al momento de la entrega y el 50% restante a los 15-30 días.

---

## Protocolo de Cobro por WhatsApp

### Recordatorio 1 (3 días antes del vencimiento o día del corte)
> *"Hola [Nombre], ¿cómo estás? Te saluda [Nombre Asesor] de Perfumes SAAD. Pasaba a saludarte y recordarte amablemente que el saldo de tu pedido #[Código] por valor de $[Monto] tiene fecha estimada de pago para este [Día]. Cuéntame si te queda fácil transferir por Nequi o Bancolombia para enviarte los datos. ¡Muchas gracias!"*

### Recordatorio 2 (Saldo vencido con 5-10 días de mora)
> *"Hola [Nombre], esperamos te encuentres muy bien. Te escribimos de Perfumes SAAD para consultarte sobre el saldo pendiente de $[Monto] de tu compra anterior. ¿Podrías apoyarnos con el pago el día de hoy o confirmarnos para qué fecha te queda programado? Agradecemos mucho tu compromiso para mantener tu crédito activo."*

---

## Procedimiento para Registrar un Abono en el Sistema

1. Ingresar al panel administrativo > menú lateral **Cartera** (`/cartera`).
2. Localizar al cliente en la lista (buscar por nombre o código de pedido).
3. Hacer clic en el botón **Abonar** (icono de signo `+`).
4. Ingresar el monto recibido, seleccionar el **Método de pago** (Nequi, Bancolombia, Efectivo, etc.) y la fecha.
5. Si el abono salda el total pendiente, el sistema automáticamente:
   - Registrará el pago en cartera.
   - Pondrá el saldo del pedido en `$ 0`.
   - Pasará el estado del pedido a `Pagado` (`paid`).
   - Trasladará el registro a la pestaña de **Conciliación** para que verifiques el soporte bancario.

---

## Qué recibe de otras áreas

- **De `20-pedidos-despachos`:** Notificación de pedido despachado bajo modalidad a crédito.
- **De `50-finanzas-conciliacion`:** Alerta en caso de que un soporte enviado por el cliente no coincida con el dinero real en la cuenta.

## Qué entrega a otras áreas

- **A `50-finanzas-conciliacion`:** Cada abono individual con su fecha y método para el arqueo de cuentas.
- **A `60-crm-asesores`:** Calificación del cliente (buen pagador vs cliente con mora recurrente).
