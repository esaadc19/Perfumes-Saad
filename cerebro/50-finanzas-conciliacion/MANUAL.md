# 50 · Finanzas, Utilidad y Conciliación Bancaria

Manual del área financiera de **Perfumes SAAD**. Aquí reside la gestión del flujo de caja, el Estado de Resultados (P&L), el registro de egresos operativos y el cruce/verificación de comprobantes de pago recibidos.

---

## Qué vive aquí

- **Cuentas bancarias y canales de recaudación:**
  - **Nequi Negocios:** Cuenta de recaudos comerciales con reporte exportable en CSV desde el portal web.
  - **Nequi Personal:** Pagos directos de clientes a número de celular.
  - **Bancolombia:** Cuenta corriente/ahorros para transferencias directas y QR.
  - **Efectivo (Caja física):** Pagos contraentrega en Bogotá.
  - **Datáfono / Link de pago:** Pagos con tarjeta de crédito o débito.
- **P&L (Estado de Pérdidas y Ganancias):** Cálculo en tiempo real de ingresos cobrados, costos de productos vendidos (costo snapshot), costos de flete/domicilio asumidos y gastos fijos/variables.
- **Herramienta de Conciliación:** Punteo interactivo en el panel administrativo (`/utilidad` pestaña "Conciliación y Cuadre de Cuentas").

---

## Canales de Pago y Cuentas

| Canal en el Sistema | Nombre / Entidad | Uso principal | Cómo se verifica |
|---|---|---|---|
| `nequi_daviplata` | Nequi Negocios | Ventas web y transferencias formales. | Subiendo el CSV del portal Nequi o manual. |
| `nequi_daviplata` | Nequi Personal | Transferencias directas de clientes a celular. | Digitando el número de celular o comprobante MXXXXXXX en el campo de referencia. |
| `bancolombia` | Bancolombia Transferencias | Pagos de pedidos grandes o abonos de fiados. | Digitando el número de aprobación / comprobante de 6-10 dígitos. |
| `efectivo` | Efectivo / Caja | Domicilios locales contraentrega. | Arqueo físico de billetes contra pedidos entregados. |
| `datafono` | Datáfono / Bold / Link | Cobros presenciales o links Wompi/Bold. | Reporte de la pasarela o voucher físico. |

---

## Tareas Recurrentes

### 1. Conciliación Automática con Nequi Negocios (Lote)
- **Frecuencia:** Semanal o quincenal (los lunes o días de corte).
- **De dónde sale el archivo:** Se descarga el reporte de transacciones desde el portal web de Nequi Negocios (archivo `.csv`).
- **Procedimiento:**
  1. Ir al panel administrativo > **Utilidad** > pestaña **Conciliación y Cuadre de Cuentas**.
  2. Hacer clic en **Importar Reporte Nequi (CSV)**.
  3. El sistema cruza automáticamente por valor exacto, fecha y similitud del nombre del pagador con el cliente.
  4. Revisar la lista de coincidencias sugeridas (Exacta, Alta, Posible).
  5. Hacer clic en **Confirmar y Conciliar X Pagos**. El sistema marcará los pedidos y abonos como verificados y guardará la referencia oficial de Nequi (`M03845808...`).

### 2. Punteo Manual de Comprobantes (Bancolombia y Nequi Personal)
- **Frecuencia:** Diaria o cada vez que un cliente envía un soporte por WhatsApp.
- **Procedimiento:**
  1. En la tabla **Punteo de Pagos Recibidos**, buscar al cliente por su nombre o código de pedido (ej. `Juan`).
  2. En la columna **Canal de pago**, seleccionar `Bancolombia` o `Nequi / Daviplata`.
  3. En el campo **Referencia / Comprobante**, escribir el número de aprobación o nota (ej. `0000047700 - Personal` o `M128490`). Presionar `Enter` o hacer clic fuera para autoguardar.
  4. Presionar el botón **Verificar** para que cambie a verde (`Verificado`).

### 3. Registro de Gastos Operativos
- **Frecuencia:** En el momento en que se incurra en un gasto.
- **Categorías permitidas:**
  - `arriendo`: Bodega o espacio de almacenamiento.
  - `servicios`: Luz, agua, internet, telefonía.
  - `publicidad`: Pauta en Meta Ads (Instagram/Facebook) o Google.
  - `empaque`: Cajas, cinta, papel burbuja, bolsas de lujo, frascos de decants vacíos.
  - `transporte`: Gasolina, carreras de mensajería no cobradas al cliente.
  - `nomina`: Pagos a asesores o ayudantes.
  - `otros`: Papelería, imprevistos.

---

## Qué recibe de otras áreas

- **De `20-pedidos-despachos`:** Notificación de ventas de contado pagadas con su medio de pago.
- **De `40-cartera-fiados`:** Registro de cada abono parcial o total pagado por el cliente, listo para conciliar con el extracto.

---

## Qué entrega a otras áreas

- **A Dirección:** Estado real de la utilidad neta mensual descontando costos de mercancía y gastos fijos.
- **A `40-cartera-fiados`:** Confirmación de si el dinero de un abono realmente entró a la cuenta bancaria antes de liberar nuevos despachos a crédito.
