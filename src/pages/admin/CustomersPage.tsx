import { Pencil, Search, Users } from "lucide-react";
import AdminButton from "../../components/admin/AdminButton";
import EmptyState from "../../components/admin/EmptyState";
import Pagination from "../../components/admin/Pagination";
import type { AdminCustomer } from "../../services/admin";

interface CustomersPageProps {
  customers: AdminCustomer[];
  visibleCount: number;
  loading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  importFeedback: string | null;
  importError: string | null;
  onEdit: (customer: AdminCustomer) => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}

export default function CustomersPage({
  customers,
  visibleCount,
  loading,
  search,
  onSearchChange,
  importFeedback,
  importError,
  onEdit,
  page,
  pageCount,
  onPageChange,
}: CustomersPageProps) {
  return (
    <section className="admin-card">
      <div className="card-title customer-toolbar">
        <p className="customer-toolbar-note">Consulta compras y actualiza los datos de contacto.</p>
        <label className="admin-search">
          <Search size={16} />
          <input
            aria-label="Buscar clientes"
            placeholder="Buscar"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
      </div>
      {importFeedback && <p className="import-feedback" role="status">{importFeedback}</p>}
      {importError && <p className="form-error" role="alert">{importError}</p>}
      <p className="customer-import-hint">Importa CSV o Excel (.xlsx) con las columnas <code>full_name</code> y, opcionalmente, <code>phone</code>, <code>email</code> y <code>city</code>. Se omiten coincidencias por correo o teléfono.</p>
      <div className="admin-table">
        <div className="table-row customer-row header"><span>Cliente</span><span>WhatsApp</span><span>Correo</span><span>Ciudad</span><span className="cell-center">Pedidos</span><span></span></div>
        {customers.map((customer) => (
          <div className="table-row customer-row" key={customer.id}>
            <strong>{customer.full_name}</strong><span>{customer.phone || "—"}</span><span>{customer.email || "—"}</span><span>{customer.city || "—"}</span><span className="cell-center">{customer.orders?.length ?? 0}</span>
            <AdminButton tone="secondary" compact type="button" aria-label={`Editar ${customer.full_name}`} onClick={() => onEdit(customer)}><Pencil size={16}/></AdminButton>
          </div>
        ))}
        {!loading && visibleCount === 0 && (
          <EmptyState
            icon={<Users size={26} />}
            title="No hay clientes que coincidan con la búsqueda."
            hint="Prueba con otro nombre o teléfono."
          />
        )}
      </div>
      <Pagination
        page={page}
        pageCount={pageCount}
        total={visibleCount}
        noun="cliente"
        label="Paginación de clientes"
        onPageChange={onPageChange}
      />
    </section>
  );
}
