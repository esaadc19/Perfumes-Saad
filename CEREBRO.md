# Perfumes SAAD · Cerebro Empresarial

Este archivo es el centro del cerebro de **Perfumes SAAD**. Se lee cada vez que se inicia una sesión operativa o de consulta. Cada área del negocio tiene su propia carpeta dentro de `cerebro/` con su propio `MANUAL.md` operativo; aquí está el plano general.

---

## Quiénes somos y cómo operamos

- **Negocio:** Perfumería original en Colombia (diseñador, nicho y árabes). Vendemos botellas selladas estándar (30ml, 50ml, 100ml, 175ml) y perfumería fraccionada en muestras/decants de 10 ml para que los clientes prueben antes de comprar el frasco completo.
- **Canales de venta:** Catálogo web oficial (`catalogo-saad.vercel.app`), ventas por WhatsApp, Instagram y gestión comercial mediante asesores.
- **Métodos de pago:** Nequi (portal de Nequi Negocios y Nequi Personal), Bancolombia (transferencia), Efectivo (contraentrega local), Datáfono / link de pago y ventas a crédito/fiado para clientes habituales.
- **Equipo:**
  - **Dirección general:** Gestión de compras, inventario maestro, fijación de precios y conciliación financiera de cuentas.
  - **Asesores comerciales:** Atención a clientes, cotizaciones por WhatsApp y cierre de pedidos.
  - **Logística y despacho:** Domicilios locales en Bogotá y despachos nacionales por transportadora (Interrapidísimo, Envía, etc.).

---

## Las Áreas del Negocio

| Carpeta | Área | Qué vive ahí | Tareas recurrentes | De dónde salen los datos |
|---|---|---|---|---|
| `cerebro/10-catalogo-cotizaciones` | **Catálogo y Cotizaciones** | Precios de frascos y decants (10ml), promociones activas, guías olfativas, guiones de WhatsApp. | Responder dudas de fragancias, recomendar notas según ocasión, cotizar botellas vs decants, enviar fotos y pirámides olfativas. | Base de datos de productos en Supabase, catálogo web y notas de fragancias. |
| `cerebro/20-pedidos-despachos` | **Pedidos y Logística** | Gestión de pedidos (borrador, confirmado, enviado, entregado), empaque, guías de envío y domicilios. | Registrar pedidos nuevos, generar resúmenes con código `#XXXXXXXX`, coordinar mensajero en Bogotá o generar guía nacional. | Panel de administración (`/pedidos`) y Supabase. |
| `cerebro/30-inventario-decants` | **Inventario y Decants** | Stock de presentaciones madre, fraccionamiento a 10ml, mermas por rotura o atomizador, control de costos. | Fraccionar botellas de 100ml a decants de 10ml, registrar mermas o roturas, alertar stock bajo o agotado. | Panel de inventario (`/productos`), alertas del Dashboard y movimientos de inventario. |
| `cerebro/40-cartera-fiados` | **Cartera y Fiados** | Registro de ventas a crédito, cupos por cliente, fechas de vencimiento, abonos parciales y recordatorios. | Aprobar ventas a crédito según historial, registrar abonos en cartera, enviar recordatorios amables de cobro por WhatsApp. | Sección de Cartera (`/cartera`) y tabla `customer_credit_payments`. |
| `cerebro/50-finanzas-conciliacion` | **Finanzas y Conciliación** | P&L (ingresos, costos de mercancía, domicilios, gastos operativos), conciliación con reportes CSV de Nequi y transferencias Bancolombia. | Importar y cruzar CSV de Nequi Negocios, puntear transferencias de Bancolombia y Nequi Personal con referencias, registrar gastos operativos y medir utilidad neta. | Módulo de Utilidad y Finanzas (`/utilidad`), reportes bancarios y Supabase. |
| `cerebro/60-crm-asesores` | **CRM y Asesores** | Base de clientes, perfumes favoritos, fecha de última compra, asignación de clientes por asesor y comisiones. | Fidelización post-venta, seguimiento a clientes que compraron decants para ofrecer la botella completa, liquidar comisiones de asesores. | CRM (`/crm/`), sección de Clientes (`/clientes`) y Asesores (`/asesores`). |

---

## Flujo de Trabajo (Cómo se pasa la información)

```
[10. Cotización / WhatsApp] 
        │
        ▼ (Cliente confirma el pedido)
[20. Registro de Pedido] ─────────────┐
        │                             │ (Si incluye decants de 10ml)
        │                             ▼
        │                    [30. Inventario & Decants]
        │
        ├─────────────────────────────┐
        ▼ (Si es venta de contado)   ▼ (Si es venta a crédito/fiado)
[50. Finanzas & Conciliación]  [40. Cartera & Abonos]
                                      │
                                      ▼ (Cuando el cliente abona)
                               [50. Conciliación Bancaria]
        │
        ▼ (Pedido entregado y satisfecho)
[60. CRM & Fidelización]
```

1. **Cotización aceptada → Pedido (10 → 20):** Cuando el cliente decide comprar por WhatsApp o web, se registra el pedido en el panel con sus ítems, cliente y asesor asignado.
2. **Pedido con Decants → Inventario (20 → 30):** Si el pedido contiene frascos de 10ml, se descuenta de los decants preparados o se fracciona un frasco madre registrando el movimiento.
3. **Pedido a Crédito → Cartera (20 → 40):** Si el cliente pide a fiado, el pedido se crea como `credit` o `partial`, y se asigna fecha límite de pago.
4. **Pago o Abono recibido → Conciliación (20/40 → 50):** Cuando entra dinero por Nequi o Bancolombia, se anota la referencia del comprobante y se puntea en el módulo de conciliación para verificar que el dinero realmente ingresó a la cuenta.
5. **Venta completada → CRM (20 → 60):** Queda registrado en el historial del cliente su perfume favorito y fecha de compra para futuras campañas y recomendaciones.

---

## Reglas de Oro para la IA en Perfumes SAAD

1. **Cero inventos:** Si un precio, costo, stock o dato de cliente no está en la base de datos o en los manuales, responde `PENDIENTE` y pide confirmación. Jamás inventes cifras financieras ni existencias.
2. **Moneda y fechas:** Toda cifra monetaria se expresa en Pesos Colombianos (`$ COP`) sin decimales. Las fechas y horas operan bajo la hora oficial de Colombia (Bogotá `UTC-5`).
3. **Tono con clientes:** Cercano, profesional, elegante y asesor consultivo de fragancias. En WhatsApp se habla de "tú" con respeto y calidez.
4. **Seguridad financiera:** Nunca alterar pagos o estados de conciliación sin confirmación. Todo abono registrado debe contar con su método de pago y comprobante/referencia cuando esté disponible.
5. **No ejecutar acciones irreversibles:** Antes de eliminar productos, pedidos o clientes, solicita confirmación explícita.

---

## Estado de Avance de las Áreas

- [x] `CEREBRO.md` (Plano general)
- [x] `cerebro/50-finanzas-conciliacion` (Prioridad activa: conciliación Nequi/Bancolombia, P&L)
- [x] `cerebro/10-catalogo-cotizaciones` (Precios, decants 10ml, WhatsApp)
- [x] `cerebro/40-cartera-fiados` (Políticas de crédito y cobro)
- [x] `cerebro/30-inventario-decants` (Fraccionamiento, mermas y stock)
- [x] `cerebro/20-pedidos-despachos` (Logística Bogotá y nacional)
- [x] `cerebro/60-crm-asesores` (Clientes y asesores)

---

## Datos Pendientes Generales

- Tarifas exactas de mensajería urbana en Bogotá para domicilios el mismo día.
- Costos de flete con transportadora nacional según peso/ciudad.
- Catálogo maestro de perfumes con notas olfativas completas y acordes principales.
- Porcentaje estándar de comisión pactado con cada asesor comercial.
