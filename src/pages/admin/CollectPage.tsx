import { useState, useEffect, useMemo } from "react";
import { MessageCircle, Search, AlertTriangle, Clock, PhoneOff, ShieldCheck, CheckCircle2, ChevronDown } from "lucide-react";
import {
  getCustomersToCollect,
  buildCollectionMessage,
  type CustomerToCollect,
} from "../../services/credits";
import AdminButton from "../../components/admin/AdminButton";
import EmptyState from "../../components/admin/EmptyState";

const money = (value: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);

/** Fecha de hoy en Bogotá, para no depender del reloj del navegador. */
function todayBogota(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

type Bucket = "overdue" | "soon" | "later";

const BUCKET_LABEL: Record<Bucket, { title: string; hint: string }> = {
  overdue: {
    title: "Vencido",
    hint: "Estos clientes ya pasaron la fecha. Un recordatorio a tiempo es lo que recupera la plata.",
  },
  soon: {
    title: "Vence esta semana",
    hint: "Todavía no vencen. Avisarles ahora es menos molesto que insistir después.",
  },
  later: {
    title: "Vence mas adelante",
    hint: "Para tener presente, no hace falta escribirles todavia.",
  },
};

function bucketOf(customer: CustomerToCollect): Bucket {
  if (customer.overdue) return "overdue";
  const days = customer.days_until_due;
  if (days !== null && days <= 7) return "soon";
  return "later";
}

/** "vence en 3 días" / "venció hace 12 días" / "vence el 2026-11-01". */
function dueLabel(customer: CustomerToCollect): string {
  const days = customer.days_until_due;
  if (customer.overdue) {
    return customer.days_overdue === 1
      ? "Venció ayer"
      : `Venció hace ${customer.days_overdue} días`;
  }
  if (days === null) return "Sin fecha de vencimiento";
  if (days === 0) return "Vence hoy";
  if (days === 1) return "Vence mañana";
  if (days <= 7) return `Vence en ${days} días`;
  return `Vence el ${customer.next_due_date}`;
}

function whatsappLink(customer: CustomerToCollect): string | null {
  if (!customer.whatsapp_number) return null;
  return `https://wa.me/${customer.whatsapp_number}?text=${encodeURIComponent(
    buildCollectionMessage(customer),
  )}`;
}

function CollectRow({ customer }: { customer: CustomerToCollect }) {
  const [expanded, setExpanded] = useState(false);
  const link = whatsappLink(customer);
  const late = customer.overdue;

  return (
    <div className={`collect-row${late ? " is-late" : ""}`}>
      <div className="collect-main">
        <div className="collect-who">
          <strong>{customer.customer_name}</strong>
          <span className={`collect-due${late ? " is-late" : ""}`}>
            {late ? <AlertTriangle size={13} /> : <Clock size={13} />}
            {dueLabel(customer)}
          </span>
        </div>
        <div className="collect-amount">
          <strong>{money(customer.total_due)}</strong>
          <span>
            {customer.order_count === 1 ? "1 pedido" : `${customer.order_count} pedidos`}
          </span>
        </div>
        <div className="collect-actions">
          {link ? (
            <AdminButton
              tone={late ? "primary" : "secondary"}
              compact
              type="button"
              onClick={() => window.open(link, "_blank", "noopener,noreferrer")}
            >
              <MessageCircle size={15} /> WhatsApp
            </AdminButton>
          ) : (
            <span className="collect-no-phone" title="El cliente no registró teléfono">
              <PhoneOff size={14} /> Sin teléfono
            </span>
          )}
          <AdminButton
            tone="secondary"
            compact
            type="button"
            variant="ghost"
            aria-expanded={expanded}
            aria-label={`Ver pedidos de ${customer.customer_name}`}
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronDown size={15} />
          </AdminButton>
        </div>
      </div>

      {customer.phone_incomplete && (
        <p className="collect-warning">
          El teléfono está incompleto ({customer.customer_phone}). Agrega el 57 para que
          el link de WhatsApp abra bien.
        </p>
      )}

      {expanded && (
        <ul className="collect-orders">
          {customer.orders.map((order) => (
            <li key={order.order_id}>
              <span className="collect-order-code">#{order.order_code}</span>
              <span>{money(order.credit_amount)}</span>
              <span className="collect-order-date">
                {order.credit_due_date ?? "Sin fecha"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CollectPage({ sectionRevision }: { sectionRevision: number }) {
  const [customers, setCustomers] = useState<CustomerToCollect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getCustomersToCollect(todayBogota());
        if (!cancelled) setCustomers(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudo cargar la cartera por cobrar");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [sectionRevision]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matched = term
      ? customers.filter((c) =>
          c.customer_name.toLowerCase().includes(term) ||
          c.customer_phone.includes(term),
        )
      : customers;
    // Primero los mas atrasados: es el orden en el que conviene cobrar.
    return [...matched].sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      if (a.overdue) return b.days_overdue - a.days_overdue;
      return (a.days_until_due ?? 9999) - (b.days_until_due ?? 9999);
    });
  }, [customers, search]);

  const buckets = useMemo(() => {
    const grouped: Record<Bucket, CustomerToCollect[]> = { overdue: [], soon: [], later: [] };
    for (const customer of visible) grouped[bucketOf(customer)].push(customer);
    return grouped;
  }, [visible]);

  const totalOverdue = customers.filter((c) => c.overdue).reduce((s, c) => s + c.total_due, 0);
  const totalToCollect = customers.reduce((s, c) => s + c.total_due, 0);
  const withoutPhone = customers.filter((c) => !c.whatsapp_number).length;

  if (loading) {
    return (
      <div className="loading-state" role="status">
        <span className="loading-spinner" aria-hidden="true" />
        <span>Cargando quién debe…</span>
      </div>
    );
  }

  return (
    <div className="collect-page">
      <div className="collect-summary">
        <div className={`summary-card${totalOverdue > 0 ? " warning" : ""}`}>
          {totalOverdue > 0 ? <AlertTriangle size={20} /> : <ShieldCheck size={20} />}
          <div>
            <span>Vencido</span>
            <strong>{money(totalOverdue)}</strong>
          </div>
        </div>
        <div className="summary-card">
          <CheckCircle2 size={20} />
          <div>
            <span>Por cobrar en total</span>
            <strong>{money(totalToCollect)}</strong>
          </div>
        </div>
        <div className="summary-card">
          <MessageCircle size={20} />
          <div>
            <span>Clientes a contactar</span>
            <strong>{customers.length}</strong>
          </div>
        </div>
      </div>

      {customers.length > 0 && (
        <div className="credit-filters">
          <label className="admin-search">
            <Search size={16} />
            <input
              type="search"
              placeholder="Buscar por cliente o teléfono"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
      )}

      {withoutPhone > 0 && (
        <p className="collect-note">
          {withoutPhone} {withoutPhone === 1 ? "cliente no tiene" : "clientes no tienen"} teléfono
          registrado. Podés contactarlos por otro medio o agregarlo en Clientes.
        </p>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      {visible.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={26} />}
          title={
            customers.length === 0
              ? "No hay nada por cobrar."
              : "Ningún cliente coincide con la búsqueda."
          }
          hint={
            customers.length === 0
              ? "Cuando haya pedidos a crédito sin saldar, van a aparecer aquí listos para contactar."
              : "Prueba con otro nombre o número de teléfono."
          }
        />
      ) : (
        (Object.keys(BUCKET_LABEL) as Bucket[]).map((bucket) => {
          const list = buckets[bucket];
          if (list.length === 0) return null;
          const meta = BUCKET_LABEL[bucket];
          const subtotal = list.reduce((s, c) => s + c.total_due, 0);
          return (
            <section key={bucket} className={`collect-group is-${bucket}`}>
              <header className="collect-group-head">
                <div>
                  <h3>
                    {meta.title} <span className="collect-count">{list.length}</span>
                  </h3>
                  <p>{meta.hint}</p>
                </div>
                <strong>{money(subtotal)}</strong>
              </header>
              <div className="collect-list">
                {list.map((customer) => (
                  <CollectRow key={customer.customer_id} customer={customer} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
