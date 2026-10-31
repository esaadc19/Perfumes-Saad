# CLAUDE.md — Perfumes SAAD

Este repositorio contiene tanto el software del negocio (tienda web, panel administrativo y CRM) como el **Cerebro Operativo de la Empresa**.

---

## 🧠 Cerebro de la Empresa (`cerebro/`)

El modelo organizacional, manuales por área, flujo entre áreas y reglas de negocio viven en la carpeta:
👉 **[`cerebro/CLAUDE.md`](file:///c:/Saad/Perfume%20SAAD/cerebro/CLAUDE.md)** (Plano Central de la Empresa)

### Áreas del Negocio:
1. `cerebro/10-ventas-catalogo/`
2. `cerebro/20-pedidos-despachos/`
3. `cerebro/30-inventario-decants/`
4. `cerebro/40-proveedores-compras/`
5. `cerebro/50-cartera-cobranza/`
6. `cerebro/60-finanzas-conciliacion/`
7. `cerebro/70-marketing-crm/`

### Protocolo para Claude:
- Cuando el usuario pregunte sobre operaciones, políticas, catálogo, costos, clientes o estrategias de **Perfumes SAAD**, consulta primero `cerebro/CLAUDE.md` y el manual del área correspondiente.
- **Regla de Cero Invención:** Si un dato del negocio no está registrado, escribe `PENDIENTE` y pregunta al dueño.
- Cuando el usuario diga *"abramos el área [nombre]"*, sigue el protocolo de entrevista guiada documentado en `cerebro/CLAUDE.md`.

---

## 💻 Stack Técnico del Software

- **Frontend:** React 19 + TypeScript + Vite 7 (Tienda y Admin)
- **CRM:** Vite + React independiente en `/crm`
- **Backend:** Supabase (PostgreSQL + RLS + RPCs + Auth + Edge Functions)
- **Despliegue:** Vercel (`catalogo-saad.vercel.app` / `perfumes-saad.vercel.app`)
- **Reglas técnicas y memoria de código:** Consulta [`MEMORY.md`](file:///c:/Saad/Perfume%20SAAD/MEMORY.md).
