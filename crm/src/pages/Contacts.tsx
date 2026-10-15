import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, Pencil, Phone, Plus, Search, User, X } from "lucide-react";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import Badge from "../components/Badge";
import Button from "../components/Button";
import {
  createContact,
  getContactDeals,
  getContactTasks,
  listContacts,
  updateContact,
  waLink,
} from "../services/crm";
import type { Contact, Deal, Task } from "../services/crm";

function label(contact: Contact): string {
  return contact.full_name?.trim() || contact.phone_e164 || contact.email || "Sin nombre";
}

function subtitle(contact: Contact): string {
  return contact.phone_e164 ?? contact.email ?? contact.instagram_handle ?? "Sin datos";
}

const money = (value: number | null) =>
  value === null
    ? "Sin valor"
    : new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);

const TASK_LABEL: Record<Task["kind"], string> = {
  llamar: "Llamar",
  recordar: "Recordar",
  cobrar: "Cobrar",
  otro: "Otro",
};

export default function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [deals, setDeals] = useState<Deal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const [creating, setCreating] = useState(false);
  const [newContact, setNewContact] = useState({ full_name: "", phone_e164: "" });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: "", phone_e164: "", email: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setContacts(await listContacts());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los contactos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = contacts.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) {
      setDeals([]);
      setTasks([]);
      return;
    }
    let active = true;
    void Promise.all([getContactDeals(selected.id), getContactTasks(selected.id)]).then(([d, t]) => {
      if (!active) return;
      setDeals(d);
      setTasks(t);
    });
    return () => {
      active = false;
    };
  }, [selected]);

  const startEdit = () => {
    if (!selected) return;
    setForm({
      full_name: selected.full_name ?? "",
      phone_e164: selected.phone_e164 ?? "",
      email: selected.email ?? "",
      notes: selected.notes ?? "",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await updateContact(selected.id, {
        full_name: form.full_name.trim(),
        phone_e164: form.phone_e164.trim(),
        email: form.email.trim(),
        notes: form.notes.trim(),
      });
      setEditing(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el contacto.");
    } finally {
      setSaving(false);
    }
  };

  const saveNew = async () => {
    if (!newContact.full_name.trim() && !newContact.phone_e164.trim()) return;
    setSaving(true);
    try {
      const created = await createContact(newContact);
      setCreating(false);
      setNewContact({ full_name: "", phone_e164: "" });
      await load();
      setSelectedId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el contacto.");
    } finally {
      setSaving(false);
    }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      [c.full_name, c.phone_e164, c.email, c.instagram_handle]
        .filter(Boolean)
        .some((field) => (field as string).toLowerCase().includes(q))
    );
  }, [contacts, query]);

  const wa = waLink(selected?.phone_e164 ?? null, selected ? `Hola ${label(selected)}, te escribimos de Perfumes SAAD.` : undefined);

  return (
    <div className={["crm-split", selected && "is-detail-open"].filter(Boolean).join(" ")}>
      <Card
        title="Contactos"
        caption={`${visible.length} en total`}
        bodyClassName="crm-inbox__list"
        actions={
          <Button small onClick={() => setCreating(true)}>
            <Plus size={14} /> Nuevo
          </Button>
        }
      >
        <div className="crm-inbox__filters">
          <input
            className="crm-input"
            style={{ flex: 1, minWidth: 0 }}
            placeholder="Buscar contacto..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            name="buscar-contactos"
            aria-label="Buscar contactos"
          />
        </div>

        {error && (
          <p className="crm-login__error" role="alert" style={{ margin: 10 }}>
            {error}
          </p>
        )}

        {creating && (
          <div className="crm-inbox__filters" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <input
              className="crm-input"
              placeholder="Nombre"
              autoFocus
              name="nuevo-contacto-nombre"
              value={newContact.full_name}
              onChange={(e) => setNewContact({ ...newContact, full_name: e.target.value })}
            />
            <input
              className="crm-input"
              placeholder="WhatsApp con 57, ej. 573001234567"
              name="nuevo-contacto-telefono"
              value={newContact.phone_e164}
              onChange={(e) => setNewContact({ ...newContact, phone_e164: e.target.value })}
            />
            <div className="crm-row" style={{ gap: 7 }}>
              <Button small onClick={() => void saveNew()} disabled={saving}>
                Guardar
              </Button>
              <Button small tone="ghost" onClick={() => setCreating(false)}>
                <X size={14} /> Cancelar
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <p style={{ padding: 14, color: "var(--crm-text-soft)" }} role="status">
            Cargando...
          </p>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<User size={20} />}
            title={contacts.length === 0 ? "Todavía no hay contactos" : "Ningún resultado"}
            hint={
              contacts.length === 0
                ? "Se crean solos al entrar un mensaje, o con el botón Nuevo."
                : "Prueba con otro nombre o número."
            }
          />
        ) : (
          visible.map((c) => (
            <button
              key={c.id}
              type="button"
              className={["crm-conv", c.id === selectedId && "is-active"].filter(Boolean).join(" ")}
              onClick={() => setSelectedId(c.id)}
            >
              <span className="crm-avatar">{label(c).slice(0, 1).toUpperCase()}</span>
              <span className="crm-conv__body">
                <span className="crm-conv__top">
                  <span className="crm-conv__name">{label(c)}</span>
                </span>
                <span className="crm-conv__preview">{subtitle(c)}</span>
              </span>
            </button>
          ))
        )}
      </Card>

      <Card
        className="crm-split__detail"
        bodyClassName="crm-thread"
        title={
          <span className="crm-row" style={{ gap: 8 }}>
            <button
              type="button"
              className="crm-btn crm-btn--ghost crm-btn--sm crm-back"
              onClick={() => setSelectedId(null)}
            >
              <ArrowLeft size={15} />
            </button>
            {selected ? label(selected) : "Contacto"}
          </span>
        }
        caption={selected ? subtitle(selected) : undefined}
        actions={
          selected ? (
            <div className="crm-row" style={{ gap: 7 }}>
              {wa && (
                <a className="crm-btn crm-btn--secondary crm-btn--sm" href={wa} target="_blank" rel="noopener noreferrer">
                  <Phone size={14} /> WhatsApp <ExternalLink size={12} />
                </a>
              )}
              <Button small tone="secondary" onClick={startEdit}>
                <Pencil size={14} /> Editar
              </Button>
            </div>
          ) : null
        }
      >
        {!selected ? (
          <div className="crm-thread__empty">
            <EmptyState
              icon={<Search size={20} />}
              title="Elige un contacto"
              hint="Aqui ves sus datos, sus deals en el pipeline y lo que falta por cobrarle."
            />
          </div>
        ) : editing ? (
          <div className="crm-thread__scroll" style={{ gap: 12 }}>
            <label className="crm-field">
              <span className="crm-label">Nombre</span>
              <input
                className="crm-input"
                name="contacto-nombre"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </label>
            <label className="crm-field">
              <span className="crm-label">WhatsApp (con 57)</span>
              <input
                className="crm-input"
                name="contacto-telefono"
                value={form.phone_e164}
                onChange={(e) => setForm({ ...form, phone_e164: e.target.value })}
              />
            </label>
            <label className="crm-field">
              <span className="crm-label">Correo</span>
              <input
                className="crm-input"
                type="email"
                name="contacto-correo"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="crm-field">
              <span className="crm-label">Notas</span>
              <textarea
                className="crm-input"
                name="contacto-notas"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
            <div className="crm-row" style={{ gap: 7 }}>
              <Button small onClick={() => void saveEdit()} disabled={saving}>
                Guardar cambios
              </Button>
              <Button small tone="ghost" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="crm-thread__scroll">
            <div className="crm-row" style={{ gap: 8 }}>
              {selected.instagram_handle && <Badge>@{selected.instagram_handle}</Badge>}
              {selected.customer_id ? (
                <Badge tone="success">Cliente de la tienda</Badge>
              ) : (
                <Badge>Sin historial en la tienda</Badge>
              )}
            </div>

            {selected.notes && (
              <div className="crm-bubble" style={{ alignSelf: "stretch", maxWidth: "100%" }}>
                {selected.notes}
              </div>
            )}

            <h3 style={{ margin: "6px 0 0", fontSize: 13 }}>Pipeline</h3>
            {deals.length === 0 ? (
              <p style={{ color: "var(--crm-text-soft)", fontSize: 13, margin: 0 }}>
                Este contacto no tiene deals todavia.
              </p>
            ) : (
              deals.map((d) => (
                <div key={d.id} className="crm-row" style={{ gap: 8 }}>
                  {d.stage && (
                    <span className="crm-badge">
                      <span
                        style={{ width: 8, height: 8, borderRadius: 4, background: d.stage.color, display: "inline-block" }}
                      />
                      {d.stage.name}
                    </span>
                  )}
                  <span style={{ fontSize: 13 }}>{d.title ?? "Sin título"}</span>
                  <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--crm-text-soft)" }}>
                    {money(d.value)}
                  </span>
                </div>
              ))
            )}

            <h3 style={{ margin: "10px 0 0", fontSize: 13 }}>Pendientes</h3>
            {tasks.length === 0 ? (
              <p style={{ color: "var(--crm-text-soft)", fontSize: 13, margin: 0 }}>Nada pendiente.</p>
            ) : (
              tasks.map((t) => (
                <div key={t.id} className="crm-row" style={{ gap: 8 }}>
                  <Badge tone={t.kind === "cobrar" ? "danger" : "info"}>{TASK_LABEL[t.kind]}</Badge>
                  <span style={{ fontSize: 13 }}>{t.title}</span>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--crm-text-soft)" }}>
                    {new Date(t.due_at).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" })}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </Card>
    </div>
  );
}