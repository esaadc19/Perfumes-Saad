-- ------------------------------------------------------------
-- Optimizacion de indices y limpieza de RLS duplicada
-- ------------------------------------------------------------
-- La base funciona, pero el auditor de Postgres encontro dos frentes:
--
--   1. Varias columnas de foreign key no tenian indice. Postgres no las
--      indexa solo: cada JOIN, cada borrado en cascada y cada filtro por
--      cliente/pedido/variante termina en un Seq Scan.
--
--   2. Algunas consultas calientes (catalogo, pedidos, dashboard,
--      cartera, inventario y CRM) ordenan o filtran por columnas que
--      tampoco tenian indice.
--
-- Los indices de abajo son deliberadamente especificos: se crean para
-- consultas que ya existen en la aplicacion, no "por si acaso". Los
-- parciales mantienen el indice pequeno cuando la consulta solo mira un
-- subconjunto (pagados, fiados, activos, mermas).
--
-- Tambien se eliminan dos politicas RLS viejas que quedaron duplicadas
-- con las de schema.sql. Tener dos politicas identicas en SELECT hace
-- que Postgres evalue las dos por cada fila.
--
-- No se toca ninguna regla de negocio, ningun grant ni ninguna funcion.

-- ------------------------------------------------------------
-- 1. Foreign keys sin indice
-- ------------------------------------------------------------

create index if not exists products_promotion_id_idx
  on public.products (promotion_id);

create index if not exists orders_customer_id_idx
  on public.orders (customer_id);

create index if not exists order_items_order_id_idx
  on public.order_items (order_id);

create index if not exists order_items_variant_id_idx
  on public.order_items (variant_id);

create index if not exists inventory_movements_order_id_idx
  on public.inventory_movements (order_id);

-- Cubre la FK de variant_id y, de paso, el historial de una presentacion
-- que pide get_variant_movements() ordenado por fecha.
create index if not exists inventory_movements_variant_created_idx
  on public.inventory_movements (variant_id, created_at desc);

create index if not exists customer_credit_payments_recorded_by_idx
  on public.customer_credit_payments (recorded_by);

create index if not exists admin_section_permissions_section_id_idx
  on public.admin_section_permissions (section_id);

create index if not exists crm_conversations_channel_id_idx
  on public.crm_conversations (channel_id);

create index if not exists crm_deals_staged_at_stage_id_idx
  on public.crm_deals (staged_at_stage_id);

create index if not exists crm_tasks_contact_id_idx
  on public.crm_tasks (contact_id);

create index if not exists crm_tasks_deal_id_idx
  on public.crm_tasks (deal_id);

-- ------------------------------------------------------------
-- 2. Consultas calientes de la tienda
-- ------------------------------------------------------------

-- Catalogo publico: where active = true order by created_at desc.
create index if not exists products_active_created_at_idx
  on public.products (created_at desc)
  where active;

-- admin_get_products() devuelve todos los productos ordenados por fecha.
create index if not exists products_created_at_idx
  on public.products (created_at desc);

-- Listado de pedidos del panel y de cartera.
create index if not exists orders_created_at_idx
  on public.orders (created_at desc);

-- Dashboard, reportes y rentabilidad: solo ventas cobradas, por paid_at.
create index if not exists orders_paid_at_idx
  on public.orders (paid_at)
  where payment_status = 'paid';

-- Pipeline de fiado: pedidos credit/partial por fecha de creacion.
create index if not exists orders_credit_created_at_idx
  on public.orders (created_at)
  where payment_status in ('credit', 'partial');

-- Cobros vencidos: solo fiados con fecha de vencimiento.
create index if not exists orders_credit_due_date_idx
  on public.orders (credit_due_date)
  where payment_status in ('credit', 'partial')
    and credit_due_date is not null;

-- get_waste_summary(): perdidas por fecha, sin mirar ingresos ni ventas.
create index if not exists inventory_movements_waste_idx
  on public.inventory_movements (created_at)
  where movement_type in ('merma', 'rotura', 'robo', 'vencimiento')
    and quantity < 0;

-- Listado de clientes del panel.
create index if not exists customers_created_at_idx
  on public.customers (created_at desc);

-- getCustomersWithCredit(): clientes con credito, ordenados por nombre.
create index if not exists customers_credit_full_name_idx
  on public.customers (full_name)
  where credit_enabled;

-- Listado de gastos y filtros por fecha del dashboard.
create index if not exists expenses_expense_date_idx
  on public.expenses (expense_date);

-- Seguimiento publico: get_order_tracking() busca por los 8 primeros
-- caracteres del UUID. Sin este indice, cada consulta recorre orders.
create index if not exists orders_code_prefix_idx
  on public.orders (upper(left(id::text, 8)));

-- ------------------------------------------------------------
-- 3. Consultas calientes del CRM
-- ------------------------------------------------------------

-- Bandeja: conversaciones ordenadas por el ultimo mensaje.
create index if not exists crm_conversations_last_message_idx
  on public.crm_conversations (last_message_at desc nulls last, created_at desc);

-- Listado de contactos.
create index if not exists crm_contacts_created_at_idx
  on public.crm_contacts (created_at desc);

-- Listado de deals.
create index if not exists crm_deals_created_at_idx
  on public.crm_deals (created_at desc);

-- ------------------------------------------------------------
-- 4. RLS duplicada
-- ------------------------------------------------------------
-- schema.sql ya crea "Public can read active products" y
-- "Public can read active variants". Estas dos variantes viejas hacian
-- exactamente lo mismo y se evaluaban en paralelo.

drop policy if exists "public_read_active_products" on public.products;
drop policy if exists "public_read_active_variants" on public.product_variants;

-- ------------------------------------------------------------
-- 5. Refrescar estadisticas del planificador
-- ------------------------------------------------------------
-- Varias tablas no tenian ANALYZE manual y el planificador seguia
-- estimando con datos viejos. Es barato y evita planes malos despues
-- de crear los indices.

analyze public.products;
analyze public.product_variants;
analyze public.promotions;
analyze public.promotion_variants;
analyze public.orders;
analyze public.order_items;
analyze public.inventory_movements;
analyze public.customers;
analyze public.customer_credit_payments;
analyze public.expenses;
analyze public.recurring_expenses;
analyze public.profiles;
analyze public.sales_advisors;
analyze public.admin_section_permissions;
analyze public.crm_contacts;
analyze public.crm_conversations;
analyze public.crm_deals;
analyze public.crm_tasks;
