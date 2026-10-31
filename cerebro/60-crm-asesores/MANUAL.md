# 60 · CRM, Fidelización de Clientes y Asesores Comerciales

Manual del área comercial y relación con clientes de **Perfumes SAAD**. Aquí reside la información para fidelizar compradores, hacer seguimiento a quienes adquirieron decants y coordinar al equipo de asesores de ventas.

---

## Qué vive aquí

- **Base de clientes (`/clientes` y `/crm/`):** Nombre, teléfono, ciudad, total gastado, fecha del último pedido y notas de preferencias (ej. *ama los perfumes dulces*, *prefiere notas cítricas para calor*).
- **Asesores comerciales (`/asesores`):** Asesores registrados que gestionan ventas con su respectiva tasa de comisión o asignación.
- **Estrategia "De Decant a Botella Completa":** El puente para convertir compradores de 10ml en compradores de frascos de 100ml.

---

## Estrategia de Fidelización: "De Decant a Botella"

Cuando un cliente compra 1 o más decants de 10ml, el objetivo es acompañarlo en su experiencia:
1. **Día +3 de entrega (Validación de experiencia):**
   > *"Hola [Nombre], ¿cómo estás? Esperamos que hayas recibido perfecto tus decants de Perfumes SAAD. Cuéntanos, ¿cuál de los aromas te ha gustado más en tu piel?"*
2. **Día +15 de entrega (Oferta de botella completa con beneficio):**
   > *"Hola [Nombre], qué bueno que te haya encantado [Nombre Perfume]. Como ya comprobaste su fijación y duración, te contamos que nos llegó stock nuevo en frasco sellado de 100ml. Si te animas a llevar la botella completa esta semana, te reconocemos el valor que pagaste por tu decant como descuento directo en el frasco grande. ¿Te apartamos una unidad?"*

---

## Gestión de Asesores Comerciales

- Cada pedido puede tener asignado un asesor comercial responsable (`sales_advisor_id`).
- En el panel administrativo (`/asesores` y `/reportes`), se calcula el total vendido por cada asesor en el período seleccionado (7, 30, 90 días o todo) para liquidar sus comisiones comerciales.
- Los pedidos tomados por asesores alimentan el reporte semanal enviado por correo electrónico.

---

## Qué recibe de otras áreas

- **De `20-pedidos-despachos`:** Confirmación de pedidos entregados y datos de contacto de nuevos clientes.
- **De `30-inventario-decants`:** Información sobre quién es el cliente #1 que más decants compra para darle trato preferencial.

## Qué entrega a otras áreas

- **A `10-catalogo-cotizaciones`:** Recomendaciones personalizadas para clientes frecuentes según sus notas olfativas preferidas.
- **A `40-cartera-fiados`:** Historial de fidelidad para evaluar aumentos de cupo de crédito.
