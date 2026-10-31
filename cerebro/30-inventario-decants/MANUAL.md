# 30 · Inventario, Decants (10 ml) y Mermas

Manual del área de inventario y fraccionamiento de **Perfumes SAAD**. Aquí se define el control de stock de frascos sellados, la preparación de decants de 10 ml, los costos unitarios y el registro de mermas/roturas.

---

## Qué vive aquí

- **Catálogo de presentaciones activas:** Frascos completos (30ml, 50ml, 100ml, etc.) y presentaciones de 10ml (decants).
- **Costos snapshot:** Costo de compra de cada botella y costo prorrateado de cada decant.
- **Registro de movimientos:** Ventas, ingresos de mercancía nueva, transferencias para fraccionar y mermas.
- **Métricas de Decants en Dashboard:** Ranking de decants más vendidos, decants con mayor margen (%) y clientes líderes en decants.

---

## Matemáticas del Fraccionamiento (Decants de 10 ml)

Para botellas estándar de **100 ml**:
- **Rendimiento teórico:** 10 decants de 10 ml.
- **Rendimiento real con merma de decantado:** 9.5 a 9 decants de 10 ml (debido a la pérdida en el atomizador, embudo o jeringa de extracción).
- **Cálculo del Costo por Decant:**
  $$\text{Costo Decant} = \left(\frac{\text{Costo Frasco 100ml}}{9.5}\right) + \text{Costo Insumo (Frasco vidrio 10ml + Atomizador + Etiqueta)}$$
  *(Ejemplo: Si un perfume cuesta $180.000 y el envase de 10ml con etiqueta cuesta $4.000: costo = $18.947 + $4.000 = ~$23.000 COP).*
- **Margen de rentabilidad típico en Decants:** Entre **40% y 60%**, superando el margen porcentual de una botella completa.

---

## Procedimiento para Registro de Mermas / Roturas

Si durante la manipulación o empaque se quiebra una botella o se daña un atomizador:
1. Ir al panel administrativo > menú **Productos** (`/productos`).
2. Buscar el perfume afectado y hacer clic en el botón **Merma o ingreso**.
3. Seleccionar **Merma (Pérdida)**.
4. Digitar el número de unidades perdidas y el motivo (ej. *Rotura en bodega*, *Falla en atomizador de fábrica*, *Extravío en transporte*).
5. El sistema descontará el stock y registrará el valor en la tarjeta de **Merma** del Dashboard para que se refleje como costo perdido en el análisis financiero.

---

## Qué recibe de otras áreas

- **De `10-catalogo-cotizaciones`:** Demanda de fragancias para decidir qué botellas conviene abrir para fraccionar.
- **De `20-pedidos-despachos`:** Notificación de unidades reservadas o enviadas.

## Qué entrega a otras áreas

- **Al Dashboard y Dirección:** Alertas de presentaciones agotadas, stock bajo y rentabilidad por producto.
- **A `50-finanzas-conciliacion`:** Costo de mercancía vendida (`sales_cost`) calculado unidad por unidad.
