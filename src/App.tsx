import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Session, User as AuthUser } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import {
  createProduct,
  getAdminProducts,
  getProducts,
  deleteAdminProduct,
  setProductActive,
  setVariantCost,
  setVariantStock,
  updateAdminProduct,
  type NewProductInput,
  type Product,
  type ProductVariant,
} from "./services/products";
import type { ImportedCustomer, ImportedProduct } from "./services/product-import";
import {
  calculatePromotionPrice,
  deletePromotion,
  getPromotions,
  savePromotion,
  togglePromotionActive,
  type Promotion,
  type PromotionInput,
} from "./services/promotions";
import {
  getAdminCustomers,
  getAdminDashboardMetrics,
  getAdminOrders,
  getAdminProfiles,
  getSalesAdvisors,
  createSalesAdvisor,
  updateSalesAdvisor,
  deleteSalesAdvisor,
  importAdminCustomers,
  deleteAdminPendingOrder,
  saveAdminPendingOrder,
  updateAdminCustomer,
  updateAdminCustomerCredit,
  updateAdminOrderWithCredit,
  updateAdminOrderStatus,
  updateAdminProfileRole,
  type AdminCustomer,
  type AdminDashboardMetrics,
  type AdminOrder,
  type AdminProfile,
  type SalesAdvisor,
} from "./services/admin";
import {
  getExpenses,
  getRecurringExpenses,
  createExpense,
  deleteRecurringExpense,
  deleteExpense,
  markRecurringExpensePaid,
  EXPENSE_CATEGORIES,
  type Expense,
  type RecurrenceFrequency,
  type RecurringExpense,
} from "./services/expenses";
import AuthDialog from "./components/AuthDialog";
import AccountDialog from "./components/AccountDialog";
import ReceiptDialog from "./components/ReceiptDialog";
import OrderTracking from "./components/OrderTracking";
import PeekRating from "./components/PeekRating";
import Dock from "./components/Dock";
import Metric from "./components/admin/Metric";
import Pagination from "./components/admin/Pagination";
import AdminButton from "./components/admin/AdminButton";
import EmptyState from "./components/admin/EmptyState";
import { Toaster, useToasts } from "./components/Toast";

// Solo el panel de administración necesita estos módulos: se cargan bajo demanda
// para que los visitantes de la tienda descarguen un bundle inicial más pequeño.
const Charts = lazy(() => import("./components/admin/Charts"));
const CreditPage = lazy(() => import("./components/admin/CreditPage"));
const OrderEditorModal = lazy(() => import("./components/admin/OrderEditorModal"));
const OrdersPage = lazy(() => import("./components/admin/OrdersPage"));
const SettingsPage = lazy(() => import("./components/admin/SettingsPage"));
import {
  DEFAULT_STORE_SETTINGS,
  getStoreSettings,
  type StoreSettings,
} from "./services/store-settings";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Download,
  LayoutDashboard,
  Menu,
  Package,
  Pencil,
  Plus,
  DollarSign,
  RefreshCw,
  Search,
  ReceiptText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Tag,
  Trash2,
  Wallet,
  Lock,
  CalendarClock,
  TrendingUp,
  Upload,
  User,
  UserCheck,
  Users,
  X,
} from "lucide-react";

type Variant = {
  id: string;
  size: number;
  price: number;
  stock: number;
};

type CartItem = {
  product: Product;
  variant: Variant;
  quantity: number;
};

const seedProducts: Product[] = [
  {
    id: "1",
    brand: "Ariana Grande",
    name: "Thank U, Next",
    gender: "Mujeres",
    category: "Diseñador",
    description:
      "Fragancia Floral Frutal Gourmand. Un aroma dulce, juvenil y femenino con una salida frutal y un fondo cálido.",
    family: "Floral Frutal Gourmand",
    climate: ["Verano (Calor)", "Primavera (Templado, fresco)"],
    image:
      "https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=1000&q=85",
    variants: [
      { id: "1-30", size: 30, price: 25000, stock: 5 },
      { id: "1-50", size: 50, price: 45000, stock: 3 },
      { id: "1-100", size: 100, price: 65000, stock: 0 },
    ],
    featured: true,
  },
  {
    id: "2",
    brand: "Lattafa",
    name: "Qaed Al Fursan",
    gender: "Unisex",
    category: "Árabes",
    description:
      "Fragancia dulce y frutal con un perfil marcado de piña, maderas y un fondo cálido.",
    family: "Frutal Amaderado",
    climate: ["Verano (Calor)", "Todo el año"],
    image:
      "https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=1000&q=85",
    variants: [
      { id: "2-90", size: 90, price: 95000, stock: 7 },
    ],
  },
  {
    id: "3",
    brand: "Armaf",
    name: "Club de Nuit Intense Man",
    gender: "Hombres",
    category: "Árabes",
    description:
      "Perfil cítrico, ahumado y amaderado. Una opción versátil para salidas y ocasiones especiales.",
    family: "Amaderado Especiado",
    climate: ["Todo el año"],
    image:
      "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=1000&q=85",
    variants: [
      { id: "3-105", size: 105, price: 130000, stock: 4 },
    ],
  },
];

const money = (value: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);

const getBogotaDate = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const formatBogotaDate = (date: string) => new Date(`${date}T12:00:00-05:00`)
  .toLocaleDateString("es-CO", { timeZone: "America/Bogota" });

const getDaysUntil = (date: string) => Math.round(
  (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${getBogotaDate()}T00:00:00Z`)) / 86_400_000
);

const productNameCollator = new Intl.Collator("es", { sensitivity: "base" });

function App() {
  const [view, setView] = useState<"store" | "admin">("store");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userRole, setUserRole] = useState<"customer" | "admin" | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [adminAccessPending, setAdminAccessPending] = useState(false);
  const [loginFeedback, setLoginFeedback] = useState<string | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [storeSettingsError, setStoreSettingsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catalogNotice, setCatalogNotice] = useState<string | null>(null);
  useEffect(() => {
    let active = true;

    async function loadProducts() {
      try {
        setError(null);
        if (!supabase) {
          if (active) {
            setProducts(seedProducts);
            setCatalogNotice(
              "Mostrando el catálogo de demostración. Configura Supabase para cargar tu inventario."
            );
          }
          return;
        }

        const data = await getProducts();
        if (active) setProducts(data);
      } catch (err) {
        console.error("No se pudo cargar el catálogo:", err);
        if (active) setError("No pudimos cargar el catálogo. Revisa la conexión e inténtalo de nuevo.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadProducts();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void getStoreSettings()
      .then((settings) => {
        if (active) {
          setStoreSettings(settings);
          setStoreSettingsError(null);
        }
      })
      .catch((settingsError: unknown) => {
        console.error("No se pudo cargar la configuración de la tienda:", settingsError);
        if (active) setStoreSettingsError(
          settingsError instanceof Error
            ? settingsError.message
            : "No se pudo cargar la configuración de la tienda."
        );
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    document.title = storeSettings.store_name;
  }, [storeSettings.store_name]);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [catalogVariantIds, setCatalogVariantIds] = useState<Record<string, string>>({});
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem("perfumes-saad-cart");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("perfumes-saad-cart", JSON.stringify(cart));
    } catch {
      // localStorage no disponible o lleno
    }
  }, [cart]);

  const [cartOpen, setCartOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("Todas");
  const [category, setCategory] = useState("Todos");
  const [showLogin, setShowLogin] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showTracking, setShowTracking] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has("track");
  });
  const [trackingCode, setTrackingCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("track") ?? "";
  });
  const [adminError, setAdminError] = useState<string | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [savingProductEdit, setSavingProductEdit] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [updatingProductId, setUpdatingProductId] = useState<string | null>(null);
  const [savingCostVariantId, setSavingCostVariantId] = useState<string | null>(null);
  const [savingStockVariantId, setSavingStockVariantId] = useState<string | null>(null);

  useEffect(() => {
    const imageCount = selectedProduct?.images?.length ?? 0;
    if (imageCount < 2) return;
    const carousel = window.setInterval(() => {
      setSelectedImageIndex((current) => (current + 1) % imageCount);
    }, 3500);
    return () => window.clearInterval(carousel);
  }, [selectedProduct?.id, selectedProduct?.images?.length]);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    const client = supabase;
    let active = true;
    let lookup = 0;
    const initialAuthParams = new URLSearchParams(window.location.hash.slice(1));
    if (initialAuthParams.get("type") === "recovery") {
      setPasswordRecovery(true);
      setShowLogin(true);
    }
    const syncSession = async (session: Session | null) => {
      const currentLookup = ++lookup;
      if (!active) return;
      setUser(session?.user ?? null);
      if (!session?.user) {
        setUserRole(null);
        setAuthLoading(false);
        return;
      }

      setUserRole(null);
      setAuthLoading(true);
      const { data, error: roleError } = await client
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();
      if (!active || currentLookup !== lookup) return;
      if (roleError) {
        console.error("No se pudo verificar el rol de la cuenta:", roleError);
        setLoginFeedback("No se pudo verificar el rol de la cuenta. Vuelve a iniciar sesión.");
        setUserRole(null);
      } else {
        setUserRole(data?.role === "admin" ? "admin" : "customer");
      }
      setAuthLoading(false);
    };

    const { data: authListener } = client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
        setShowLogin(true);
      }
      window.setTimeout(() => void syncSession(session), 0);
    });
    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) {
        console.error("No se pudo recuperar la sesión:", sessionError);
        setLoginFeedback("No se pudo recuperar la sesión. Inicia sesión nuevamente.");
        setAuthLoading(false);
        return;
      }
      void syncSession(data.session);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!adminAccessPending || authLoading || !user || !userRole) return;
    setAdminAccessPending(false);
    if (userRole === "admin") {
      setView("admin");
      setShowLogin(false);
      setLoginFeedback(null);
    } else {
      setLoginFeedback("Esta cuenta es de cliente y no tiene permisos de administración.");
      setShowLogin(true);
    }
  }, [adminAccessPending, authLoading, user, userRole]);

  useEffect(() => {
    if (view !== "admin" || userRole !== "admin") return;
    let active = true;
    setAdminError(null);
    void Promise.all([getAdminProducts(), getPromotions(true)])
      .then(([data, loadedPromotions]) => {
        if (active) setProducts(data);
        if (active) setPromotions(loadedPromotions);
      })
      .catch((loadError: unknown) => {
        console.error("No se pudo cargar el inventario administrativo:", loadError);
        if (active) setAdminError("No se pudieron cargar el inventario y las promociones. Revisa la conexión.");
      });
    return () => {
      active = false;
    };
  }, [view, userRole]);

  const requestAdminAccess = () => {
    setAdminAccessPending(true);
    setLoginFeedback(null);
    if (!supabase) {
      setLoginFeedback("Configura Supabase para habilitar el acceso administrativo.");
      setAdminAccessPending(false);
      setShowLogin(true);
      return;
    }
    if (user && userRole === "admin") {
      setAdminAccessPending(false);
      setView("admin");
    } else {
      setShowLogin(true);
    }
  };

  const handleAuthenticated = (authenticatedUser: AuthUser) => {
    setUser(authenticatedUser);
    setShowLogin(false);
  };

  const handleProductSave = async (
    product: NewProductInput,
    variants: { size: number; price: number; cost: number; stock: number }[],
    images: File[]
  ) => {
    setSavingProduct(true);
    setAdminError(null);
    try {
      await createProduct(product, variants, images);
      setProducts(await getAdminProducts());
      setShowAddProduct(false);
    } catch (saveError) {
      console.error("No se pudo guardar el producto:", saveError);
      setAdminError("No se pudo guardar el producto. Verifica los datos y tus permisos.");
    } finally {
      setSavingProduct(false);
    }
  };

  const handleProductImport = async (imports: ImportedProduct[]) => {
    const failures: string[] = [];
    let imported = 0;
    for (const item of imports) {
      try {
        await createProduct(item.product, item.variants);
        imported += 1;
      } catch (importError) {
        console.error(`No se pudo importar ${item.product.brand} ${item.product.name}:`, importError);
        const reason = importError instanceof Error ? `: ${importError.message}` : "";
        failures.push(`${item.product.brand} ${item.product.name} (filas ${item.sourceRows.join(", ")})${reason}`);
      }
    }
    if (imported > 0) {
      try {
        setProducts(await getAdminProducts());
      } catch (refreshError) {
        console.error("Se importaron productos, pero no se pudo recargar el inventario:", refreshError);
        failures.push("No se pudo recargar el inventario; actualiza la página para ver los productos importados.");
      }
    }
    return { imported, failures };
  };

  const handleProductActiveChange = async (product: Product) => {
    const nextActive = product.active === false;
    setUpdatingProductId(product.id);
    setAdminError(null);
    try {
      await setProductActive(product.id, nextActive);
      setProducts((current) => current.map((item) =>
        item.id === product.id ? { ...item, active: nextActive } : item
      ));
    } catch (updateError) {
      console.error("No se pudo cambiar la disponibilidad:", updateError);
      setAdminError("No se pudo actualizar la disponibilidad del producto.");
    } finally {
      setUpdatingProductId(null);
    }
  };

  const handleProductEdit = async (product: Product, imageFiles: File[]) => {
    setSavingProductEdit(true);
    setAdminError(null);
    try {
      await updateAdminProduct({ product, imageFiles });
      try {
        setProducts(await getAdminProducts());
      } catch (refreshError) {
        console.error("El producto se guardó, pero no se pudo recargar el inventario:", refreshError);
        setAdminError("Los cambios se guardaron, pero no se pudo actualizar la lista. Actualiza el panel para ver las imágenes nuevas.");
      }
    } catch (updateError) {
      console.error("No se pudo guardar el producto:", updateError);
      setAdminError(updateError instanceof Error
        ? updateError.message
        : "No se pudo guardar el producto. Verifica los datos y tus permisos.");
      throw updateError;
    } finally {
      setSavingProductEdit(false);
    }
  };

  const handleProductDelete = async (product: Product): Promise<"deleted" | "archived"> => {
    setDeletingProductId(product.id);
    setAdminError(null);
    try {
      const result = await deleteAdminProduct(product);
      setProducts((current) => result === "deleted"
        ? current.filter((item) => item.id !== product.id)
        : current.map((item) => item.id === product.id
          ? { ...item, active: false, archived: true }
          : item));
      return result;
    } catch (deleteError) {
      console.error("No se pudo eliminar el producto:", deleteError);
      setAdminError(deleteError instanceof Error
        ? deleteError.message
        : "No se pudo eliminar el producto. Revisa tus permisos.");
      throw deleteError;
    } finally {
      setDeletingProductId(null);
    }
  };

  const handleVariantCostChange = async (variantId: string, cost: number) => {
    setSavingCostVariantId(variantId);
    try {
      await setVariantCost(variantId, cost);
      setProducts((current) => current.map((product) => ({
        ...product,
        variants: product.variants.map((variant) =>
          variant.id === variantId ? { ...variant, cost } : variant
        ),
      })));
    } catch (costError) {
      console.error("No se pudo guardar el costo de la presentación:", costError);
      setAdminError("No se pudo guardar el costo. Revisa tus permisos e inténtalo de nuevo.");
      throw costError;
    } finally {
      setSavingCostVariantId(null);
    }
  };

  const handleVariantStockChange = async (variantId: string, stock: number) => {
    setAdminError(null);
    setSavingStockVariantId(variantId);
    try {
      await setVariantStock(variantId, stock);
      setProducts((current) => current.map((product) => ({
        ...product,
        variants: product.variants.map((variant) =>
          variant.id === variantId ? { ...variant, stock } : variant
        ),
      })));
    } catch (stockError) {
      console.error("No se pudo guardar el stock de la presentación:", stockError);
      setAdminError(stockError instanceof Error ? stockError.message : "No se pudo guardar el stock.");
      throw stockError;
    } finally {
      setSavingStockVariantId(null);
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (p.active === false || p.variants.length === 0) return false;
      const matchesSearch =
        `${p.brand} ${p.name}`.toLowerCase().includes(search.toLowerCase());
      const matchesBrand = brandFilter === "Todas" || p.brand === brandFilter;
      const matchesCategory = category === "Todos"
        || (category === "Ofertas" ? Boolean(p.promotion?.active) : p.category === category);
      return matchesSearch && matchesBrand && matchesCategory;
    });
  }, [products, search, brandFilter, category]);
  const availableBrands = useMemo(
    () => [...new Set(products.filter((product) => product.active !== false).map((product) => product.brand))]
      .sort((a, b) => a.localeCompare(b, "es")),
    [products]
  );
  const cartPrice = useMemo(() => calculatePromotionPrice(cart.map((item) => ({
    productId: item.product.id,
    promotionId: item.product.promotion_id ?? null,
    promotion: item.product.promotion,
    variantId: item.variant.id,
    unitPrice: item.variant.price,
    quantity: item.quantity,
  }))), [cart]);

  const openProduct = (product: Product) => {
    setSelectedProduct(product);
    setSelectedImageIndex(0);
    setSelectedVariantId(
      product.variants.find((variant) =>
        variant.id === catalogVariantIds[product.id] && variant.stock > 0
      )?.id ?? product.variants.find((variant) => variant.stock > 0)?.id ?? product.variants[0].id
    );
  };

  const selectedVariant =
    selectedProduct?.variants.find((v) => v.id === selectedVariantId) ??
    selectedProduct?.variants[0];

  const addVariantToCart = (product: Product, variant: ProductVariant) => {
    if (variant.stock <= 0) return;
    setCart((current) => {
      const existing = current.find((item) => item.variant.id === variant.id);

      if (existing) {
        return current.map((item) =>
          item.variant.id === variant.id
            ? { ...item, quantity: Math.min(item.quantity + 1, variant.stock) }
            : item
        );
      }

      return [...current, { product, variant, quantity: 1 }];
    });
    setCartOpen(true);
  };

  const addToCart = () => {
    if (!selectedProduct || !selectedVariant) return;
    addVariantToCart(selectedProduct, selectedVariant);
  };

  const total = cartPrice.total;

  return (
    <div className="app">
      {view === "store" ? (
        <>
          <header className="topbar">
            <button className="mobile-menu"><Menu size={19} /></button>
            <nav className="nav-left">
              <button onClick={() => setCategory("Diseñador")}>Diseñador</button>
              <button onClick={() => setCategory("Árabes")}>Árabes</button>
              <button onClick={() => setCategory("Nicho")}>Nicho</button>
            </nav>

            <button className="brand" onClick={() => setCategory("Todos")} aria-label={storeSettings.store_name}>
              {storeSettings.logo_url
                ? <img className="brand-logo" src={storeSettings.logo_url} alt={storeSettings.store_name} />
                : storeSettings.store_name}
            </button>

            <div className="nav-actions">
              <div className="search-box">
                <Search size={17} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar"
                />
              </div>
              <button title="Cuenta" onClick={() => user ? setShowAccount(true) : setShowLogin(true)}>
                <User size={19} />
              </button>
              <button title="Carrito" onClick={() => setCartOpen(true)} className="cart-button">
                <ShoppingBag size={19} />
                {cart.length > 0 && <span>{cart.length}</span>}
              </button>
            </div>
          </header>

          <main>
            <section className="hero">
              <div>
                <p className="eyebrow">{storeSettings.store_name}</p>
                <h1>{storeSettings.home_title}</h1>
                <p>{storeSettings.home_message}</p>
                <a
                  className="primary hero-whatsapp"
                  href={`https://wa.me/${storeSettings.whatsapp_number.replace(/\D/g, "")}?text=${encodeURIComponent(storeSettings.whatsapp_greeting)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20.52 3.48A11.8 11.8 0 0 0 12.08 0C5.52 0 .18 5.34.18 11.9c0 2.1.55 4.15 1.6 5.96L.08 24l6.3-1.65a11.9 11.9 0 0 0 5.7 1.45h.01c6.56 0 11.9-5.34 11.9-11.9 0-3.18-1.24-6.17-3.47-8.42ZM12.09 21.8a9.9 9.9 0 0 1-5.05-1.39l-.36-.21-3.74.98 1-3.65-.24-.38a9.83 9.83 0 0 1-1.51-5.25c0-5.46 4.44-9.9 9.9-9.9a9.82 9.82 0 0 1 7 2.9 9.82 9.82 0 0 1 2.9 7c0 5.46-4.44 9.9-9.9 9.9Zm5.43-7.41c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.47-.89-.8-1.49-1.78-1.66-2.08-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.11 3.22 5.11 4.51.71.31 1.27.49 1.7.63.71.23 1.36.2 1.87.12.57-.08 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35Z"/>
                  </svg>
                  Preguntar por WhatsApp
                </a>
              </div>
              <div className="hero-card">
                <Sparkles size={24} />
                <strong>Compra sencilla</strong>
                <span>Elige tu perfume, presentación y recibimos tu pedido por WhatsApp.</span>
              </div>
            </section>

            <section id="catalogo" className="catalog-section">
              <div className="section-head">
                <div>
                  <p className="eyebrow">CATÁLOGO</p>
                  <h2>Perfumes destacados</h2>
                </div>
                <span>{filteredProducts.length} productos</span>
              </div>

              <div className="category-pills">
                {["Todos", "Diseñador", "Árabes", "Nicho", "Ofertas"].map((item) => (
                  <button
                    key={item}
                    className={category === item ? "pill active" : "pill"}
                    onClick={() => setCategory(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <label className="brand-filter">
                <span>Filtrar por marca</span>
                <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}>
                  <option value="Todas">Todas las marcas</option>
                  {availableBrands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
                </select>
              </label>

              {catalogNotice && <p className="catalog-message">{catalogNotice}</p>}
              <div className="product-grid">
                {loading ? (
                  <p className="catalog-message" role="status">Cargando perfumes...</p>
                ) : error ? (
                  <p className="catalog-message error-state" role="alert">{error}</p>
                ) : filteredProducts.length === 0 ? (
                  <p className="catalog-message">No encontramos perfumes con esos filtros.</p>
                ) : filteredProducts.map((product) => {
                  const firstAvailable =
                    product.variants.find((v) => v.stock > 0) ?? product.variants[0];
                  const cardVariant = product.variants.find((variant) =>
                    variant.id === catalogVariantIds[product.id]
                  ) ?? firstAvailable;
                  return (
                    <article className="product-card" key={product.id}>
                      <button className="product-image" onClick={() => openProduct(product)}>
                        <img src={product.image} alt={product.name} />
                        {firstAvailable.stock <= 0 && (
                          <span className="sold-out">Agotado</span>
                        )}
                        {product.promotion?.active && <span className="promotion-badge">Oferta</span>}
                      </button>
                      <div className="product-info">
                        <span>{product.brand}</span>
                        <h3>{product.name}</h3>
                        <p>{product.gender}</p>
                        <div className="catalog-variant-options" role="group" aria-label={`Presentaciones de ${product.name}`}>
                          {product.variants.map((variant) => (
                            <button
                              key={variant.id}
                              type="button"
                              className={cardVariant.id === variant.id ? "catalog-variant-option selected" : "catalog-variant-option"}
                              aria-pressed={cardVariant.id === variant.id}
                              disabled={variant.stock <= 0}
                              onClick={() => setCatalogVariantIds((current) => ({
                                ...current,
                                [product.id]: variant.id,
                              }))}
                            >
                              <span>{variant.size} ml</span>
                              <small>{money(variant.price)}</small>
                            </button>
                          ))}
                        </div>
                        <strong>{money(cardVariant.price)}</strong>
                        {product.promotion?.active && (
                          <span className="promotion-card-copy">
                            {product.promotion.required_quantity} por {money(product.promotion.bundle_price)}
                            {product.promotion.allow_mixed ? " · combinables" : " · mismo perfume"}
                          </span>
                        )}
                        <div className="product-card-actions">
                          <button className="text-button" onClick={() => openProduct(product)}>
                            Ver producto →
                          </button>
                          <button
                            type="button"
                            className="quick-add-button"
                            disabled={cardVariant.stock <= 0}
                            onClick={() => addVariantToCart(product, cardVariant)}
                          >
                            <Plus size={15} /> Agregar
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </main>

          {selectedProduct && (
            <div className="overlay">
              <div className="product-modal">
                <button className="close" onClick={() => setSelectedProduct(null)}>
                  <X />
                </button>
                <div className="product-detail-image">
                  <img
                    src={selectedProduct.images?.[selectedImageIndex] ?? selectedProduct.image}
                    alt={`${selectedProduct.name}, imagen ${selectedImageIndex + 1}`}
                  />
                  {(selectedProduct.images?.length ?? 0) > 1 && (
                    <>
                      <button
                        type="button"
                        className="product-carousel-arrow previous"
                        aria-label="Ver imagen anterior"
                        onClick={() => setSelectedImageIndex((index) =>
                          (index - 1 + (selectedProduct.images?.length ?? 1)) % (selectedProduct.images?.length ?? 1)
                        )}
                      >
                        <ChevronLeft size={22} />
                      </button>
                      <button
                        type="button"
                        className="product-carousel-arrow next"
                        aria-label="Ver imagen siguiente"
                        onClick={() => setSelectedImageIndex((index) =>
                          (index + 1) % (selectedProduct.images?.length ?? 1)
                        )}
                      >
                        <ChevronRight size={22} />
                      </button>
                    </>
                  )}
                  {(selectedProduct.images?.length ?? 0) > 1 && (
                    <div className="product-image-thumbnails" aria-label="Imágenes del producto">
                      {selectedProduct.images?.map((image, index) => (
                        <button
                          type="button"
                          key={`${image}-${index}`}
                          className={index === selectedImageIndex ? "selected" : ""}
                          aria-label={`Ver imagen ${index + 1} de ${selectedProduct.name}`}
                          aria-pressed={index === selectedImageIndex}
                          onClick={() => setSelectedImageIndex(index)}
                        >
                          <img src={image} alt="" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="product-detail-copy">
                  <span className="brand-small">{selectedProduct.brand}</span>
                  <h2>{selectedProduct.name}</h2>
                  <p className="gender">{selectedProduct.gender}</p>
                  <div className="price">{selectedVariant ? money(selectedVariant.price) : "—"}</div>
                  {selectedProduct.promotion?.active && (
                    <p className="promotion-detail-copy">
                      Oferta: {selectedProduct.promotion.required_quantity} por{" "}
                      {money(selectedProduct.promotion.bundle_price)}
                      {selectedProduct.promotion.allow_mixed ? " · puedes combinar referencias" : " · mismo perfume"}
                    </p>
                  )}
                  <p className="description">{selectedProduct.description}</p>
                  <PeekRating
                    key={selectedProduct.id}
                    defaultValue={3}
                    count={5}
                    shape="star"
                    labels={["Malo", "Regular", "Bueno", "Muy Bueno", "Excelente"]}
                    activeColor="#f5b400"
                    idleColor="#52525b"
                    tipColor="#27272a"
                    tipTextColor="#f5f5f5"
                    size={40}
                    lift={8}
                    magnify={1.15}
                    riseDuration={320}
                    popScale={1.3}
                    showTip
                    allowClear
                    onChange={(value) => console.log("rated", selectedProduct.name, value)}
                    showLabels
                    readOnly={false}
                  />

                  <div className="detail-block">
                    <label>Presentación</label>
                    <div className="variant-row">
                      {selectedProduct.variants.map((variant) => (
                        <button
                          key={variant.id}
                          disabled={variant.stock <= 0}
                          className={selectedVariantId === variant.id ? "variant active" : "variant"}
                          onClick={() => setSelectedVariantId(variant.id)}
                        >
                          {variant.size} ml
                          {variant.stock <= 0 && <small>Agotado</small>}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="detail-meta">
                    <div><b>Familia</b><span>{selectedProduct.family}</span></div>
                    <div><b>Clima</b><span>{selectedProduct.climate.join(" · ")}</span></div>
                  </div>

                  <button
                    className="primary full"
                    disabled={!selectedVariant || selectedVariant.stock <= 0}
                    onClick={addToCart}
                  >
                    <ShoppingBag size={17} />
                    {selectedVariant?.stock ? "Agregar al pedido" : "Agotado"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {cartOpen && (
            <div className="overlay">
              <aside className="cart-drawer">
                <div className="drawer-head">
                  <div>
                    <p className="eyebrow">PEDIDO</p>
                    <h2>Tu selección</h2>
                  </div>
                  <button className="close-small" onClick={() => setCartOpen(false)}><X /></button>
                </div>

                {cart.length === 0 ? (
                  <div className="empty">
                    <ShoppingBag size={32} />
                    <p>Tu pedido está vacío.</p>
                  </div>
                ) : (
                  <>
                    {cartPrice.discount > 0 && (
                      <p className="cart-promotion-note" role="status">
                        Descuento promocional aplicado al pedido: <strong>-{money(cartPrice.discount)}</strong>
                      </p>
                    )}
                    <div className="cart-items">
                      {cart.map((item) => (
                        <div className="cart-item" key={item.variant.id}>
                          <img src={item.product.image} alt="" />
                          <div>
                            <strong>{item.product.name}</strong>
                            <span>{item.variant.size} ml</span>
                            <label className="cart-quantity-control">
                              <span>Unidades</span>
                              <input
                                type="number"
                                min="1"
                                max={item.variant.stock}
                                value={item.quantity}
                                aria-label={`Unidades de ${item.product.name}`}
                                onChange={(event) => {
                                  const quantity = Number(event.target.value);
                                  if (!Number.isInteger(quantity) || quantity < 1) return;
                                  setCart((current) => current.map((line) =>
                                    line.variant.id === item.variant.id
                                      ? { ...line, quantity: Math.min(quantity, line.variant.stock) }
                                      : line
                                  ));
                                }}
                              />
                            </label>
                            {cartPrice.lineDiscounts[item.variant.id] > 0 && (
                              <small className="cart-line-discount">
                                Descuento aplicado: -{money(cartPrice.lineDiscounts[item.variant.id])}
                              </small>
                            )}
                            <b>{money(item.variant.price * item.quantity - (cartPrice.lineDiscounts[item.variant.id] ?? 0))}</b>
                          </div>
                          <button
                            onClick={() =>
                              setConfirmDialog({
                                title: "Eliminar del carrito",
                                message: `¿Eliminar "${item.product.name}" del carrito?`,
                                onConfirm: () =>
                                  setCart((current) =>
                                    current.filter((x) => x.variant.id !== item.variant.id)
                                  ),
                              })
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="cart-total">
                      <div>
                        {cartPrice.discount > 0 && (
                          <span className="cart-discount">Ahorro en promociones <b>-{money(cartPrice.discount)}</b></span>
                        )}
                        <span>Total</span>
                      </div>
                      <strong>{money(total)}</strong>
                    </div>
                    <p className="checkout-note">
                      Genera tu recibo tipo impresora, verifica los datos del cliente y
                      envía el pedido a {storeSettings.store_name} por WhatsApp.
                    </p>
                    <button className="primary full" onClick={() => setReceiptOpen(true)}>
                      Generar recibo del pedido
                    </button>
                  </>
                )}
              </aside>
            </div>
          )}

          <footer>
            <div className="footer-brand">{storeSettings.store_name}</div>
            <span>Perfumería · Barranquilla · Colombia</span>
            {storeSettings.contact_email && <a href={`mailto:${storeSettings.contact_email}`}>{storeSettings.contact_email}</a>}
            <a href="#" onClick={(e) => { e.preventDefault(); setShowTracking(true); }}>
              Rastrear pedido
            </a>
            {userRole === "admin" && (
              <a href="#" onClick={(e) => { e.preventDefault(); requestAdminAccess(); }}>
                Administración
              </a>
            )}
          </footer>
        </>
      ) : userRole === "admin" ? (
        <Admin
          products={products}
          storeSettings={storeSettings}
          storeSettingsError={storeSettingsError}
          onStoreSettingsSaved={(settings) => {
            setStoreSettings(settings);
            setStoreSettingsError(null);
          }}
          promotions={promotions}
          onPromotionsChange={setPromotions}
          currentUserId={user?.id ?? ""}
          onImportProducts={handleProductImport}
          onEditProduct={handleProductEdit}
          onDeleteProduct={handleProductDelete}
          savingProductEdit={savingProductEdit}
          deletingProductId={deletingProductId}
          onVariantCostChange={handleVariantCostChange}
          savingCostVariantId={savingCostVariantId}
          onVariantStockChange={handleVariantStockChange}
          savingStockVariantId={savingStockVariantId}
          onBack={() => {
            setView("store");
            void getProducts().then(setProducts).catch((loadError: unknown) => {
              console.error("No se pudo recargar el catálogo al volver a la tienda:", loadError);
              setError("No se pudo actualizar el catálogo. Recarga la página e inténtalo de nuevo.");
            });
          }}
          onProductsRefresh={async () => setProducts(await getAdminProducts())}
          onAdd={() => {
            setAdminError(null);
            setShowAddProduct(true);
          }}
          onProductActiveChange={handleProductActiveChange}
          updatingProductId={updatingProductId}
          error={adminError}
          onSignOut={async () => {
            if (!supabase) return;
            const { error: signOutError } = await supabase.auth.signOut();
            if (signOutError) {
              console.error("No se pudo cerrar la sesión:", signOutError);
              setAdminError("No se pudo cerrar la sesión. Inténtalo de nuevo.");
              return;
            }
            setView("store");
            void getProducts().then(setProducts).catch((loadError: unknown) => {
              console.error("No se pudo recargar el catálogo al cerrar sesión:", loadError);
              setError("No se pudo actualizar el catálogo. Recarga la página e inténtalo de nuevo.");
            });
          }}
          onConfirm={setConfirmDialog}
        />
      ) : (
        <main className="access-required">
          <p className="eyebrow">PERFUMES SAAD</p>
          <h1>Acceso al panel</h1>
          <p>
            {authLoading
              ? "Verificando tu sesión..."
              : "Inicia sesión con una cuenta autorizada para administrar la tienda."}
          </p>
          {loginFeedback && <p className="form-error" role="alert">{loginFeedback}</p>}
          <button className="primary" onClick={requestAdminAccess} disabled={authLoading}>
            Iniciar sesión como administrador
          </button>
          <button className="secondary full" onClick={() => setView("store")}>Volver a la tienda</button>
        </main>
      )}

      {showAddProduct && (
        <AddProductModal
          onClose={() => setShowAddProduct(false)}
          onSave={handleProductSave}
          promotions={promotions.filter((promotion) => promotion.active)}
          saving={savingProduct}
          error={adminError}
        />
      )}
      {showLogin && (
        <AuthDialog
          notice={loginFeedback}
          initialMode={passwordRecovery ? "reset" : "login"}
          onClose={() => {
            setShowLogin(false);
            setAdminAccessPending(false);
            setLoginFeedback(null);
          }}
          onPasswordReset={() => setPasswordRecovery(false)}
          onAuthenticated={handleAuthenticated}
        />
      )}
      {showAccount && user && (
        <AccountDialog
          user={user}
          isAdmin={userRole === "admin"}
          onClose={() => setShowAccount(false)}
          onOpenAdmin={() => {
            setShowAccount(false);
            setView("admin");
          }}
          onSignOut={async () => {
            if (!supabase) return;
            const { error: signOutError } = await supabase.auth.signOut();
            if (signOutError) {
              console.error("No se pudo cerrar la sesión:", signOutError);
              setLoginFeedback("No se pudo cerrar la sesión. Inténtalo de nuevo.");
              return;
            }
            setShowAccount(false);
          }}
        />
      )}
      {receiptOpen && (
        <ReceiptDialog
          cart={cart}
          user={user}
          whatsappNumber={storeSettings.whatsapp_number}
          whatsappGreeting={storeSettings.whatsapp_greeting}
          storeName={storeSettings.store_name}
          receiptFooterMessage={storeSettings.receipt_footer_message}
          onClose={() => setReceiptOpen(false)}
          onSignIn={() => {
            setReceiptOpen(false);
            setShowLogin(true);
          }}
          onOrderSaved={() => {
            setCart([]);
            setCartOpen(false);
          }}
        />
      )}
      {showTracking && (
        <OrderTracking onClose={() => setShowTracking(false)} />
      )}
      {confirmDialog && (
        <div className="overlay" onClick={() => setConfirmDialog(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{confirmDialog.title}</h3>
            <p>{confirmDialog.message}</p>
            <div className="confirm-dialog-actions">
              <AdminButton tone="secondary" compact onClick={() => setConfirmDialog(null)}>
                Cancelar
              </AdminButton>
              <AdminButton
                tone="danger"
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
              >
                Confirmar
              </AdminButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Admin({
  products,
  storeSettings,
  storeSettingsError,
  onStoreSettingsSaved,
  promotions,
  onPromotionsChange,
  onProductsRefresh,
  currentUserId,
  onImportProducts,
  onEditProduct,
  onDeleteProduct,
  savingProductEdit,
  deletingProductId,
  onVariantCostChange,
  savingCostVariantId,
  onVariantStockChange,
  savingStockVariantId,
  onBack,
  onAdd,
  onProductActiveChange,
  updatingProductId,
  onConfirm,
  error,
  onSignOut,
}: {
  products: Product[];
  storeSettings: StoreSettings;
  storeSettingsError: string | null;
  onStoreSettingsSaved: (settings: StoreSettings) => void;
  promotions: Promotion[];
  onPromotionsChange: (promotions: Promotion[]) => void;
  onProductsRefresh: () => Promise<void>;
  currentUserId: string;
  onImportProducts: (items: ImportedProduct[]) => Promise<{ imported: number; failures: string[] }>;
  onEditProduct: (product: Product, imageFiles: File[]) => Promise<void>;
  onDeleteProduct: (product: Product) => Promise<"deleted" | "archived">;
  savingProductEdit: boolean;
  deletingProductId: string | null;
  onVariantCostChange: (variantId: string, cost: number) => Promise<void>;
  savingCostVariantId: string | null;
  onVariantStockChange: (variantId: string, stock: number) => Promise<void>;
  savingStockVariantId: string | null;
  onBack: () => void;
  onAdd: () => void;
  onProductActiveChange: (product: Product) => void;
  updatingProductId: string | null;
  onConfirm: (config: { title: string; message: string; onConfirm: () => void }) => void;
  error: string | null;
  onSignOut: () => void;
}) {
  const [section, setSection] = useState<"overview" | "products" | "promotions" | "transactions" | "customers" | "expenses" | "advisors" | "profiles" | "settings" | "credit">("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.localStorage.getItem("saad-admin-sidebar") === "collapsed"
  );
  const [sectionRevision, setSectionRevision] = useState(0);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const { toasts, dismiss: dismissToast, notifySuccess, notifyError } = useToasts();

  useEffect(() => {
    window.localStorage.setItem("saad-admin-sidebar", sidebarCollapsed ? "collapsed" : "expanded");
  }, [sidebarCollapsed]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportDate, setReportDate] = useState(getBogotaDate);
  const [reportResult, setReportResult] = useState<{
    whatsappUrl: string;
    emailSent: boolean;
    emailError: string | null;
    label: string;
  } | null>(null);
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [salesAdvisors, setSalesAdvisors] = useState<SalesAdvisor[]>([]);
  const [advisorForm, setAdvisorForm] = useState({
    full_name: "",
    phone: "",
    email: "",
  });
  const [editingAdvisor, setEditingAdvisor] = useState<SalesAdvisor | null>(null);
  const [savingAdvisor, setSavingAdvisor] = useState(false);
  const [deletingAdvisorId, setDeletingAdvisorId] = useState<string | null>(null);
  const [customerPage, setCustomerPage] = useState(1);
  const [profilePage, setProfilePage] = useState(1);
  const [expensePage, setExpensePage] = useState(1);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [expenseForm, setExpenseForm] = useState({
    name: "",
    amount: "",
    category: "General",
    date: getBogotaDate(),
    recurring: false,
    frequency: "monthly" as RecurrenceFrequency,
  });
  const [savingExpense, setSavingExpense] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const [payingRecurringExpenseId, setPayingRecurringExpenseId] = useState<string | null>(null);
  const [deletingRecurringExpenseId, setDeletingRecurringExpenseId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editingCustomer, setEditingCustomer] = useState<AdminCustomer | null>(null);
  const [customerSaving, setCustomerSaving] = useState(false);
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
  const [savingProfileId, setSavingProfileId] = useState<string | null>(null);
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({});
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({});
  const [productSearch, setProductSearch] = useState("");
  const [productStockFilter, setProductStockFilter] = useState<"all" | "available" | "sold-out">("all");
  const [importingProducts, setImportingProducts] = useState(false);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const productImportInput = useRef<HTMLInputElement>(null);
  const [importingCustomers, setImportingCustomers] = useState(false);
  const [customerImportFeedback, setCustomerImportFeedback] = useState<string | null>(null);
  const [customerImportError, setCustomerImportError] = useState<string | null>(null);
  const customerImportInput = useRef<HTMLInputElement>(null);
  const [dashboardDetail, setDashboardDetail] = useState<"sold-out" | "low-stock" | "pending" | null>(null);
  const [showPendingOrdersOnly, setShowPendingOrdersOnly] = useState(false);
  const [orderEditor, setOrderEditor] = useState<{ order: AdminOrder | null } | null>(null);
  const [orderSaving, setOrderSaving] = useState(false);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [promotionEditor, setPromotionEditor] = useState<Promotion | null | "new">(null);
  const [promotionSaving, setPromotionSaving] = useState(false);
  const [promotionFeedback, setPromotionFeedback] = useState<string | null>(null);
  const [productActionFeedback, setProductActionFeedback] = useState<string | null>(null);
  const [productActionError, setProductActionError] = useState<string | null>(null);
  const [showArchivedProducts, setShowArchivedProducts] = useState(false);
  const archivedProductsCount = products.filter((product) => product.archived).length;
  const visibleProducts = products.filter((product) =>
    Boolean(product.archived) === showArchivedProducts &&
    `${product.brand} ${product.name}`.toLowerCase().includes(productSearch.toLowerCase()) &&
    (showArchivedProducts || productStockFilter === "all" ||
      (productStockFilter === "available"
        ? product.variants.some((variant) => variant.stock > 0)
        : product.variants.length > 0 && product.variants.every((variant) => variant.stock <= 0)))
  ).sort((left, right) =>
    productNameCollator.compare(left.name, right.name) ||
    productNameCollator.compare(left.brand, right.brand)
  );
  const totalStock = products.reduce(
    (sum, p) => sum + (p.archived ? 0 : p.variants.reduce((s, v) => s + v.stock, 0)),
    0
  );
  const stockTrackedProducts = products.filter((product) => !product.archived && product.active !== false);
  const lowStock = stockTrackedProducts.flatMap((product) =>
    product.variants.filter((variant) =>
      variant.active !== false &&
      variant.stock > 0 &&
      variant.stock <= (variant.minStock ?? 2)
    )
  ).length;
  const soldOut = stockTrackedProducts.filter((product) => {
    const activeVariants = product.variants.filter((variant) => variant.active !== false);
    return activeVariants.length > 0 && activeVariants.every((variant) => variant.stock <= 0);
  }).length;
  const sections = [
    { id: "overview", title: "Dashboard", icon: <LayoutDashboard size={17} /> },
    { id: "products", title: "Productos", icon: <Package size={17} /> },
    { id: "promotions", title: "Promociones", icon: <Tag size={17} /> },
    { id: "transactions", title: "Pedidos", icon: <ReceiptText size={17} /> },
    { id: "credit", title: "Cartera", icon: <DollarSign size={17} /> },
    { id: "customers", title: "Clientes", icon: <Users size={17} /> },
    { id: "expenses", title: "Gastos", icon: <Wallet size={17} /> },
    { id: "advisors", title: "Asesores", icon: <UserCheck size={17} /> },
    { id: "profiles", title: "Perfiles", icon: <ShieldCheck size={17} /> },
    { id: "settings", title: "Configuración", icon: <Settings size={17} /> },
  ] as const;

  useEffect(() => {
    let active = true;
    const loadSection = async () => {
      if (section === "products" || section === "settings") {
        setSectionLoading(false);
        setSectionError(null);
        return;
      }
      setSectionLoading(true);
      setSectionError(null);
      try {
        if (section === "overview") {
          const [metricsResult, ordersResult] = await Promise.all([
            getAdminDashboardMetrics(),
            getAdminOrders(),
          ]);
          if (active) {
            setMetrics(metricsResult);
            setOrders(ordersResult);
          }
        } else if (section === "transactions") {
          const [ordersResult, customersResult, advisorsResult] = await Promise.all([
            getAdminOrders(),
            getAdminCustomers(),
            getSalesAdvisors(),
          ]);
          if (active) {
            setOrders(ordersResult);
            setCustomers(customersResult);
            setSalesAdvisors(advisorsResult);
          }
        } else if (section === "advisors") {
          const result = await getSalesAdvisors();
          if (active) setSalesAdvisors(result);
        } else if (section === "customers") {
          const result = await getAdminCustomers();
          if (active) setCustomers(result);
        } else if (section === "expenses") {
          const [expenseResult, recurringExpenseResult] = await Promise.all([
            getExpenses(),
            getRecurringExpenses(),
          ]);
          if (active) {
            setExpenses(expenseResult);
            setRecurringExpenses(recurringExpenseResult);
          }
        } else if (section === "credit") {
          // CreditPage loads its own data
        } else {
          const result = await getAdminProfiles();
          if (active) setProfiles(result);
        }
      } catch (loadError) {
        console.error(`No se pudo cargar la sección ${section}:`, loadError);
        if (active) setSectionError("No se pudo cargar esta sección. Ejecuta el esquema actualizado de Supabase y vuelve a intentar.");
      } finally {
        if (active) setSectionLoading(false);
      }
    };
    void loadSection();
    return () => {
      active = false;
    };
  }, [section, sectionRevision]);

  const saveCustomer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingCustomer) return;
    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("full_name") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const city = String(form.get("city") ?? "").trim();
    const credit_enabled = form.get("credit_enabled") === "on";
    const credit_limit = Number(form.get("credit_limit") ?? 0);
    const credit_terms = String(form.get("credit_terms") ?? "quincenal") as "quincenal" | "mensual";
    const credit_blocked = form.get("credit_blocked") === "on";
    if (!fullName) {
      setSectionError("El nombre del cliente es obligatorio.");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setSectionError("Ingresa un correo válido o déjalo vacío.");
      return;
    }
    if (credit_limit < 0) {
      setSectionError("El límite de crédito no puede ser negativo.");
      return;
    }
    setCustomerSaving(true);
    setSectionError(null);
    try {
      await updateAdminCustomer({
        customerId: editingCustomer.id,
        fullName,
        phone,
        email,
        city,
        creditEnabled: credit_enabled,
        creditLimit: credit_limit,
        creditTerms: credit_terms,
        creditBlocked: credit_blocked,
      });
      setEditingCustomer(null);
      setSectionRevision((current) => current + 1);
    } catch (saveError) {
      console.error("No se pudo guardar el perfil del cliente:", saveError);
      setSectionError(saveError instanceof Error ? saveError.message : "No se pudo guardar el cliente.");
    } finally {
      setCustomerSaving(false);
    }
  };

  const generateReport = async (dailyReportDate: string | null = null) => {
    if (!supabase) {
      setReportError("Supabase no está configurado.");
      return;
    }
    if (dailyReportDate && dailyReportDate > getBogotaDate()) {
      setReportError("El reporte diario no puede usar una fecha futura.");
      return;
    }
    setReportLoading(true);
    setReportError(null);
    setReportResult(null);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error("Tu sesión no está activa. Cierra sesión, vuelve a entrar como administrador e inténtalo nuevamente.");
      }
      const { data, error: functionError } = await supabase.functions.invoke("weekly-report", {
        body: dailyReportDate ? { report_date: dailyReportDate } : {},
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (functionError) throw functionError;
      const whatsappUrl = Array.isArray(data?.whatsapp_links)
        ? data.whatsapp_links.find((link: unknown) => typeof link === "string")
        : null;
      if (data?.success !== true || typeof whatsappUrl !== "string") {
        throw new Error(typeof data?.error === "string" ? data.error : "Supabase no devolvió el reporte esperado.");
      }
      setReportResult({
        whatsappUrl,
        emailSent: data.email_sent === true,
        emailError: typeof data.email_error === "string" ? data.email_error : null,
        label: dailyReportDate ? `diario del ${dailyReportDate}` : "semanal",
      });
    } catch (reportFailure) {
      console.error("No se pudo generar el reporte:", reportFailure);
      setReportError(reportFailure instanceof Error
        ? reportFailure.message
        : "No se pudo generar el reporte semanal.");
    } finally {
      setReportLoading(false);
    }
  };

  const saveExpense = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(expenseForm.amount);
    if (!expenseForm.name.trim()) {
      setSectionError("El nombre del gasto es obligatorio.");
      return;
    }
    if (!expenseForm.amount.trim() || !Number.isFinite(amount) || amount <= 0) {
      setSectionError("El monto del gasto debe ser un número mayor que cero.");
      return;
    }
    if (!expenseForm.date) {
      setSectionError("Selecciona la fecha del gasto.");
      return;
    }
    setSavingExpense(true);
    setSectionError(null);
    try {
      await createExpense({
        name: expenseForm.name.trim(),
        amount,
        category: expenseForm.category,
        expense_date: expenseForm.date,
        recurrence_frequency: expenseForm.recurring ? expenseForm.frequency : null,
      });
      setExpenseForm({
        name: "",
        amount: "",
        category: "General",
        date: getBogotaDate(),
        recurring: false,
        frequency: "monthly",
      });
      setSectionRevision((current) => current + 1);
      notifySuccess(expenseForm.recurring ? "Recordatorio de pago creado." : "Gasto agregado.");
    } catch (saveError) {
      console.error("No se pudo guardar el gasto:", saveError);
      setSectionError(saveError instanceof Error ? saveError.message : "No se pudo guardar el gasto.");
      notifyError("No se pudo guardar el gasto.");
    } finally {
      setSavingExpense(false);
    }
  };

  const removeExpense = async (id: string) => {
    setDeletingExpenseId(id);
    setSectionError(null);
    try {
      await deleteExpense(id);
      setSectionRevision((current) => current + 1);
    } catch (deleteError) {
      console.error("No se pudo eliminar el gasto:", deleteError);
      setSectionError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el gasto.");
    } finally {
      setDeletingExpenseId(null);
    }
  };

  const payRecurringExpense = async (expense: RecurringExpense) => {
    setPayingRecurringExpenseId(expense.id);
    setSectionError(null);
    try {
      await markRecurringExpensePaid(expense.id);
      setSectionRevision((current) => current + 1);
    } catch (payError) {
      console.error("No se pudo registrar el pago recurrente:", payError);
      setSectionError(payError instanceof Error ? payError.message : "No se pudo registrar el pago.");
    } finally {
      setPayingRecurringExpenseId(null);
    }
  };

  const removeRecurringExpense = async (id: string) => {
    setDeletingRecurringExpenseId(id);
    setSectionError(null);
    try {
      await deleteRecurringExpense(id);
      setSectionRevision((current) => current + 1);
    } catch (deleteError) {
      console.error("No se pudo eliminar el gasto recurrente:", deleteError);
      setSectionError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el gasto recurrente.");
    } finally {
      setDeletingRecurringExpenseId(null);
    }
  };

  const saveOrderStatus = async (
    order: AdminOrder,
    status: "pending_confirmation" | "confirmed" | "cancelled",
    paymentStatus: "pending" | "paid" | "refunded" | "credit" | "partial"
  ) => {
    setSavingOrderId(order.id);
    setSectionError(null);
    try {
      // Calcular fecha de compromiso si se marca como crédito
      let creditDueDate: string | undefined;
      let creditLimitSnapshot: number | undefined;

      if (paymentStatus === "credit" && order.payment_status !== "credit") {
        // Obtener términos del cliente
        const customer = await getAdminCustomers().then(customers =>
          customers.find(c => c.id === order.customer_id)
        );
        if (customer?.credit_terms) {
          const days = customer.credit_terms === "quincenal" ? 15 : 30;
          const due = new Date();
          due.setDate(due.getDate() + days);
          creditDueDate = due.toISOString().split("T")[0];
        }
        creditLimitSnapshot = customer?.credit_limit ?? 0;
      }

      await updateAdminOrderWithCredit(order.id, status, paymentStatus, creditDueDate, creditLimitSnapshot);
      
      const finalStatus = paymentStatus === "paid" ? "confirmed" : status;
      setOrders((current) => current.map((item) => item.id === order.id
        ? {
            ...item,
            status: finalStatus,
            payment_status: paymentStatus,
            paid_at: paymentStatus === "paid" ? item.paid_at ?? new Date().toISOString() : item.paid_at,
            credit_due_date: creditDueDate ?? item.credit_due_date,
            credit_limit_snapshot: creditLimitSnapshot ?? item.credit_limit_snapshot,
            credit_amount: paymentStatus === "credit" ? item.total : paymentStatus === "partial" ? item.credit_amount : 0,
          }
        : item
      ));
      setSectionRevision((current) => current + 1);
    } catch (updateError) {
      console.error("No se pudo actualizar el estado del pedido:", updateError);
      setSectionError(updateError instanceof Error
        ? updateError.message
        : "No se pudo actualizar el pedido. Revisa tus permisos.");
    } finally {
      setSavingOrderId(null);
    }
  };

  const savePendingOrder = async (
    customerId: string | null,
    customer: {
      full_name: string;
      phone: string | null;
      email: string | null;
      city: string | null;
      delivery_address: string | null;
    } | null,
    items: { variant_id: string; quantity: number; unit_price: number; unit_cost: number | null }[],
    orderId: string | null,
    orderDate: string,
    deliveryCost: number,
    salesAdvisorId: string | null,
    orderStatus?: "pending_confirmation" | "confirmed" | "shipped" | "delivered" | "cancelled",
    paymentStatus?: "pending" | "paid" | "refunded" | "credit" | "partial"
  ) => {
    setOrderSaving(true);
    setSectionError(null);
    try {
      await saveAdminPendingOrder({ orderId, customerId, customer, items, orderDate, deliveryCost, salesAdvisorId, orderStatus, paymentStatus });
      setOrderEditor(null);
      setSectionRevision((current) => current + 1);
      notifySuccess(orderId ? "Pedido actualizado correctamente." : "Pedido creado correctamente.");
    } catch (saveError) {
      console.error("No se pudo guardar el pedido administrativo:", saveError);
      setSectionError(saveError instanceof Error ? saveError.message : "No se pudo guardar el pedido.");
      notifyError("No se pudo guardar el pedido.");
    } finally {
      setOrderSaving(false);
    }
  };

  const removePendingOrder = async (order: AdminOrder) => {
    if (!window.confirm(`¿Eliminar el pedido #${order.id.slice(0, 8).toUpperCase()}? Esta acción no se puede deshacer.`)) return;
    setDeletingOrderId(order.id);
    setSectionError(null);
    try {
      await deleteAdminPendingOrder(order.id);
      setSectionRevision((current) => current + 1);
      notifySuccess(`Pedido #${order.id.slice(0, 8).toUpperCase()} eliminado.`);
    } catch (deleteError) {
      console.error("No se pudo eliminar el pedido:", deleteError);
      setSectionError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el pedido.");
      notifyError("No se pudo eliminar el pedido.");
    } finally {
      setDeletingOrderId(null);
    }
  };

  const saveProfileRole = async (profile: AdminProfile, role: AdminProfile["role"]) => {
    setSavingProfileId(profile.id);
    setSectionError(null);
    try {
      await updateAdminProfileRole(profile.id, role);
      setProfiles((current) => current.map((item) => item.id === profile.id ? { ...item, role } : item));
    } catch (roleError) {
      console.error("No se pudo cambiar el rol del perfil:", roleError);
      setSectionError(roleError instanceof Error ? roleError.message : "No se pudo cambiar el rol.");
    } finally {
      setSavingProfileId(null);
    }
  };

  const saveAdvisor = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fullName = advisorForm.full_name.trim();
    const advisorEmail = advisorForm.email.trim();
    if (!fullName) {
      setSectionError("El nombre del asesor es obligatorio.");
      return;
    }
    if (advisorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(advisorEmail)) {
      setSectionError("Ingresa un correo válido o déjalo vacío.");
      return;
    }
    setSavingAdvisor(true);
    setSectionError(null);
    try {
      const payload = {
        full_name: fullName,
        phone: advisorForm.phone.trim() || null,
        email: advisorEmail || null,
      };
      if (editingAdvisor) {
        const updated = await updateSalesAdvisor(editingAdvisor.id, { ...payload, active: editingAdvisor.active });
        setSalesAdvisors((current) => current.map((item) => item.id === updated.id ? updated : item));
        setEditingAdvisor(null);
      } else {
        const created = await createSalesAdvisor(payload);
        setSalesAdvisors((current) => [...current, created]);
      }
      setAdvisorForm({ full_name: "", phone: "", email: "" });
      notifySuccess(editingAdvisor ? "Asesor actualizado correctamente." : "Asesor agregado.");
    } catch (advisorError) {
      console.error("No se pudo guardar el asesor:", advisorError);
      setSectionError(advisorError instanceof Error ? advisorError.message : "No se pudo guardar el asesor.");
      notifyError("No se pudo guardar el asesor.");
    } finally {
      setSavingAdvisor(false);
    }
  };

  const removeAdvisor = async (advisor: SalesAdvisor) => {
    setDeletingAdvisorId(advisor.id);
    setSectionError(null);
    try {
      await deleteSalesAdvisor(advisor.id);
      setSalesAdvisors((current) => current.filter((item) => item.id !== advisor.id));
      notifySuccess("Asesor eliminado.");
    } catch (advisorError) {
      console.error("No se pudo eliminar el asesor:", advisorError);
      setSectionError(advisorError instanceof Error ? advisorError.message : "No se pudo eliminar el asesor.");
      notifyError("No se pudo eliminar el asesor.");
    } finally {
      setDeletingAdvisorId(null);
    }
  };

  const submitPromotion = async (input: PromotionInput, promotionId?: string) => {
    setPromotionSaving(true);
    setSectionError(null);
    setPromotionFeedback(null);
    try {
      await savePromotion(input, promotionId);
      onPromotionsChange(await getPromotions(true));
      setPromotionEditor(null);
      setPromotionFeedback("La promoción se guardó correctamente.");
      notifySuccess("La promoción se guardó correctamente.");
    } catch (saveError) {
      console.error("No se pudo guardar la promoción:", saveError);
      setSectionError(saveError instanceof Error
        ? saveError.message
        : "No se pudo guardar la promoción. Verifica tus permisos.");
      notifyError("No se pudo guardar la promoción.");
    } finally {
      setPromotionSaving(false);
    }
  };

  const togglePromotion = async (promotion: Promotion) => {
    const nextActive = !promotion.active;
    setSectionError(null);
    setPromotionFeedback(null);
    try {
      await togglePromotionActive(promotion.id, nextActive);
      onPromotionsChange(await getPromotions(true));
      setPromotionFeedback(
        nextActive
          ? `«${promotion.name}» volvió a estar activa.`
          : `«${promotion.name}» quedó pausada y ya no aparece en la tienda.`
      );
      notifySuccess(
        nextActive
          ? `La promoción «${promotion.name}» se activó.`
          : `La promoción «${promotion.name}» se pausó.`
      );
    } catch (toggleError) {
      console.error("No se pudo cambiar el estado de la promoción:", toggleError);
      setSectionError(
        toggleError instanceof Error
          ? toggleError.message
          : "No se pudo cambiar el estado de la promoción."
      );
    }
  };

  const removePromotion = async (promotion: Promotion) => {
    if (!window.confirm(`¿Eliminar la promoción «${promotion.name}»? Los productos asociados quedarán sin promoción.`)) return;
    setSectionError(null);
    setPromotionFeedback(null);
    try {
      await deletePromotion(promotion.id);
      onPromotionsChange(await getPromotions(true));
      let productsRefreshed = true;
      try {
        await onProductsRefresh();
      } catch (refreshError) {
        productsRefreshed = false;
        console.error("La promoción se eliminó, pero no se pudieron recargar los productos:", refreshError);
        setSectionError("La promoción se eliminó, pero no se pudo actualizar la lista de productos. Recarga el panel.");
      }
      if (productsRefreshed) {
        setPromotionFeedback("La promoción se eliminó correctamente.");
        notifySuccess("La promoción se eliminó correctamente.");
      }
    } catch (deleteError) {
      console.error("No se pudo eliminar la promoción:", deleteError);
      setSectionError(deleteError instanceof Error
        ? deleteError.message
        : "No se pudo eliminar la promoción.");
      notifyError("No se pudo eliminar la promoción.");
    }
  };

  const importProductsFromFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setImportingProducts(true);
    setImportFeedback(null);
    setImportError(null);
    try {
      const { parseProductImportFile } = await import("./services/product-import");
      const parsedProducts = await parseProductImportFile(file);
      const variantCount = parsedProducts.reduce((sum, item) => sum + item.variants.length, 0);
      if (!window.confirm(`Se importarán ${parsedProducts.length} productos y ${variantCount} presentaciones. ¿Continuar?`)) return;
      const result = await onImportProducts(parsedProducts);
      const skipped = parsedProducts.length - result.imported;
      setImportFeedback(
        `Importación terminada: ${result.imported} de ${parsedProducts.length} productos.`
      );
      if (result.failures.length) {
        setImportError(`No se pudieron importar: ${result.failures.join(", ")}.`);
      } else if (skipped > 0) {
        setImportError(`Quedaron ${skipped} productos sin importar.`);
      }
    } catch (importError) {
      console.error("No se pudo importar el archivo:", importError);
      setImportError(importError instanceof Error ? importError.message : "No se pudo leer el archivo.");
    } finally {
      setImportingProducts(false);
    }
  };

  const importCustomersFromFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setImportingCustomers(true);
    setCustomerImportFeedback(null);
    setCustomerImportError(null);
    try {
      const { parseCustomerImportFile } = await import("./services/product-import");
      const importedCustomers: ImportedCustomer[] = await parseCustomerImportFile(file);
      if (!window.confirm(`Se importarán ${importedCustomers.length} clientes. Los ya registrados por correo o teléfono se omitirán. ¿Continuar?`)) return;
      const result = await importAdminCustomers(importedCustomers.map((customer) => ({
        full_name: customer.full_name,
        phone: customer.phone,
        email: customer.email,
        city: customer.city,
      })));
      setCustomerImportFeedback(
        `Importación terminada: ${result.imported} clientes agregados${result.skipped ? ` y ${result.skipped} duplicados omitidos` : ""}.`
      );
      try {
        setCustomers(await getAdminCustomers());
      } catch (refreshError) {
        console.error("No se pudo recargar la lista después de importar clientes:", refreshError);
        setCustomerImportError("La importación se completó, pero no se pudo actualizar la lista. Pulsa «Actualizar» para recargar.");
      }
    } catch (customerImportError) {
      console.error("No se pudo importar el archivo de clientes:", customerImportError);
      setCustomerImportError(
        customerImportError instanceof Error
          ? customerImportError.message
          : "No se pudo leer o guardar el archivo de clientes."
      );
    } finally {
      setImportingCustomers(false);
    }
  };

  const query = search.trim().toLowerCase();
  const visibleCustomers = customers.filter((customer) =>
    `${customer.full_name} ${customer.email ?? ""} ${customer.phone ?? ""}`.toLowerCase().includes(query)
  );
  const visibleProfiles = profiles.filter((profile) =>
    `${profile.full_name ?? ""} ${profile.email ?? ""} ${profile.role}`.toLowerCase().includes(query)
  );
  useEffect(() => {
    setCustomerPage(1);
    setProfilePage(1);
  }, [query, section]);
  const CUSTOMER_PAGE_SIZE = 10;
  const customerPageCount = Math.max(1, Math.ceil(visibleCustomers.length / CUSTOMER_PAGE_SIZE));
  const currentCustomerPage = Math.min(customerPage, customerPageCount);
  const paginatedCustomers = visibleCustomers.slice(
    (currentCustomerPage - 1) * CUSTOMER_PAGE_SIZE,
    currentCustomerPage * CUSTOMER_PAGE_SIZE
  );
  const PROFILE_PAGE_SIZE = 10;
  const profilePageCount = Math.max(1, Math.ceil(visibleProfiles.length / PROFILE_PAGE_SIZE));
  const currentProfilePage = Math.min(profilePage, profilePageCount);
  const paginatedProfiles = visibleProfiles.slice(
    (currentProfilePage - 1) * PROFILE_PAGE_SIZE,
    currentProfilePage * PROFILE_PAGE_SIZE
  );
  const EXPENSE_PAGE_SIZE = 10;
  const expensePageCount = Math.max(1, Math.ceil(expenses.length / EXPENSE_PAGE_SIZE));
  const currentExpensePage = Math.min(expensePage, expensePageCount);
  const paginatedExpenses = expenses.slice(
    (currentExpensePage - 1) * EXPENSE_PAGE_SIZE,
    currentExpensePage * EXPENSE_PAGE_SIZE
  );
  const pageTitle = sections.find((item) => item.id === section)?.title ?? "Dashboard";

  return (
    <div className={`admin-layout${sidebarCollapsed ? " is-collapsed" : ""}`}>
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <button className="admin-brand-mark" onClick={onBack} aria-label={storeSettings.store_name}>
            S
          </button>
          <span className="admin-sidebar-title">{storeSettings.store_name}</span>
          <button
            type="button"
            className="sidebar-collapse"
            onClick={() => setSidebarCollapsed((current) => !current)}
            aria-label={sidebarCollapsed ? "Expandir menú lateral" : "Colapsar menú lateral"}
            aria-expanded={!sidebarCollapsed}
            title={sidebarCollapsed ? "Expandir menú" : "Colapsar menú"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <nav className="admin-navigation">
          {sections.map((item) => (
            <button
              key={item.id}
              className={`admin-nav-item${section === item.id ? " active" : ""}`}
              onClick={() => { setSection(item.id); setSearch(""); }}
              data-tooltip={item.title}
              title={sidebarCollapsed ? item.title : undefined}
              aria-current={section === item.id ? "page" : undefined}
            >
              {item.icon}
              <span className="admin-nav-item-label">{item.title}</span>
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <button className="admin-store-button" onClick={onBack} title="Volver a la tienda">
            <ArrowLeft size={18} />
            <span className="admin-nav-item-label">Volver a la tienda</span>
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <div className="admin-top">
          <div>
            <p className="eyebrow">{storeSettings.store_name}</p>
            <h1>{pageTitle}</h1>
          </div>
          <div className="admin-actions">
            {section === "products" && (
              <>
                <input
                  ref={productImportInput}
                  className="visually-hidden"
                  type="file"
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(event) => void importProductsFromFile(event)}
                  disabled={importingProducts}
                  aria-label="Importar productos desde CSV o Excel"
                  tabIndex={-1}
                />
                <AdminButton
                  tone="secondary"
                  compact
                  type="button"
                  onClick={() => productImportInput.current?.click()}
                  disabled={importingProducts}
                >
                  <Upload size={16} /> {importingProducts ? "Importando..." : "Importar archivo"}
                </AdminButton>
                <a
                  className="secondary template-download"
                  href="/plantilla-importacion-productos.csv"
                  download="plantilla-importacion-productos.csv"
                  title="Descargar plantilla CSV para importar productos"
                >
                  <Download size={16} /> Plantilla CSV
                </a>
                <AdminButton type="button" onClick={onAdd}><Plus size={17}/> Nuevo producto</AdminButton>
              </>
            )}
            {section === "customers" && (
              <>
                <input
                  ref={customerImportInput}
                  className="visually-hidden"
                  type="file"
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(event) => void importCustomersFromFile(event)}
                  disabled={importingCustomers}
                  aria-label="Importar clientes desde CSV o Excel"
                  tabIndex={-1}
                />
                <AdminButton
                  tone="secondary"
                  compact
                  type="button"
                  onClick={() => customerImportInput.current?.click()}
                  disabled={importingCustomers}
                >
                  <Upload size={16} /> {importingCustomers ? "Importando..." : "Importar archivo"}
                </AdminButton>
              </>
            )}
            {section === "transactions" && <AdminButton type="button" onClick={() => setOrderEditor({ order: null })}><Plus size={17}/> Nuevo pedido</AdminButton>}
            <AdminButton tone="secondary" compact type="button" onClick={onSignOut}>Cerrar sesión</AdminButton>
            {section !== "products" && (
              <AdminButton
                tone="secondary"
                compact
                type="button"
                onClick={() => setSectionRevision((current) => current + 1)}
                disabled={sectionLoading}
                aria-label="Actualizar datos"
              >
                <RefreshCw size={16}/> Actualizar
              </AdminButton>
            )}
          </div>
        </div>
        <nav className="admin-section-tabs" aria-label="Secciones de administración">
          {sections.map((item) => (
            <AdminButton
              key={item.id}
              tone={section === item.id ? "primary" : "secondary"}
              compact
              variant={section === item.id ? undefined : "ghost"}
              aria-current={section === item.id ? "page" : undefined}
              onClick={() => {
                setSection(item.id);
                setSearch("");
                if (item.id === "transactions") setShowPendingOrdersOnly(false);
              }}
            >
              {item.icon}{item.title}
            </AdminButton>
          ))}
        </nav>

        {error && section === "products" && <p className="form-error" role="alert">{error}</p>}
        {section === "products" && importFeedback && <p className="import-feedback" role="status">{importFeedback}</p>}
        {section === "products" && importError && <p className="form-error" role="alert">{importError}</p>}
        {section === "products" && (
          <p className="customer-import-hint">
            Descarga la plantilla y luego importa ese archivo desde aquí. No importes este CSV directamente en la tabla
            <code> products</code> de Supabase: la tienda también crea las presentaciones en <code>product_variants</code>.
          </p>
        )}
        {section === "promotions" && promotionFeedback && <p className="import-feedback" role="status">{promotionFeedback}</p>}
        {sectionError && <p className="form-error" role="alert">{sectionError}</p>}
        {sectionLoading && (
          <div className="loading-state" role="status" aria-live="polite">
            <span className="loading-spinner" aria-hidden="true" />
            <span>Cargando {pageTitle.toLowerCase()}…</span>
          </div>
        )}

        {section === "overview" && metrics && (
          <>
            <div className="report-actions">
              <label className="report-date-field">
                Fecha del reporte diario
                <input
                  type="date"
                  value={reportDate}
                  max={getBogotaDate()}
                  disabled={reportLoading}
                  onChange={(event) => setReportDate(event.target.value)}
                />
              </label>
              <AdminButton
                tone="secondary"
                compact
                type="button"
                onClick={() => void generateReport(reportDate)}
                disabled={reportLoading || !reportDate}
              >
                <BarChart3 size={16} /> {reportLoading ? "Generando reporte..." : "Generar reporte diario"}
              </AdminButton>
              <AdminButton
                tone="secondary"
                compact
                type="button"
                onClick={() => void generateReport()}
                disabled={reportLoading}
              >
                <BarChart3 size={16} /> {reportLoading ? "Generando reporte..." : "Generar reporte semanal"}
              </AdminButton>
            </div>
            {reportError && <p className="form-error" role="alert">{reportError}</p>}
            {reportResult && (
              <p className="report-result" role="status">
                Reporte {reportResult.label} generado. {reportResult.emailSent
                  ? "Correo enviado. "
                  : `${reportResult.emailError ?? "No se pudo enviar el correo."} `}
                <a href={reportResult.whatsappUrl} target="_blank" rel="noreferrer">Abrir reporte en WhatsApp</a>
              </p>
            )}
            <div className="metrics">
              <Metric title="Ventas completas" value={String(metrics.completed_sales)} icon={<ShoppingBag />} />
              <Metric title="Total vendido" value={money(Number(metrics.sales_revenue))} icon={<BarChart3 />} />
              <Metric title="Clientes registrados" value={String(metrics.customer_count)} icon={<Users />} />
              <Metric title="Presentaciones con stock bajo" value={String(lowStock)} icon={<AlertTriangle />} warning onClick={() => setDashboardDetail("low-stock")} />
            </div>
            <div className="metrics">
              <Metric title="Productos" value={products.filter((product) => !product.archived).length.toString()} icon={<Package />} />
              <Metric title="Unidades en stock" value={totalStock.toString()} icon={<ShoppingBag />} />
              <Metric title="Pendientes de pago" value={String(metrics.pending_orders)} icon={<AlertTriangle />} warning onClick={() => setDashboardDetail("pending")} />
              <Metric title="Agotados" value={soldOut.toString()} icon={<X />} onClick={() => setDashboardDetail("sold-out")} />
            </div>
            <div className="metrics">
              <Metric title="Costo de ventas registrado" value={money(Number(metrics.sales_cost))} icon={<ReceiptText />} />
              <Metric title="Gastos registrados" value={money(Number(metrics.total_expenses))} icon={<Wallet />} />
              <Metric title="Utilidad estimada" value={metrics.missing_cost_items > 0 ? "Incompleta" : money(Number(metrics.sales_profit))} icon={<TrendingUp />} warning={metrics.sales_profit < 0} />
              <Metric title="Costos pendientes" value={String(metrics.missing_cost_items)} icon={<AlertTriangle />} warning={metrics.missing_cost_items > 0} />
              <Metric title="Pedidos registrados" value={String(metrics.total_orders)} icon={<ShoppingBag />} />
            </div>
            <div className="metrics">
              <Metric title="Ventas a crédito" value={String(metrics.credit_sales)} icon={<DollarSign />} />
              <Metric title="Total a crédito" value={money(Number(metrics.credit_revenue))} icon={<BarChart3 />} />
              <Metric title="Utilidad estimada" value={metrics.missing_cost_items > 0 ? "Incompleta" : money(Number(metrics.sales_profit))} icon={<TrendingUp />} warning={metrics.sales_profit < 0} />
              <Metric title="Por cobrar (CXC)" value={money(Number(metrics.credit_outstanding_balance))} icon={<DollarSign />} />
              <Metric title="Utilidad no cobrada" value={money(Number(metrics.locked_credit_profit))} icon={<Lock />} />
              <Metric title="Gastos comprometidos" value={money(Number(metrics.committed_expenses))} icon={<CalendarClock />} />
            </div>
            <div className="metrics">
              <Metric title="Vencido" value={money(Number(metrics.credit_overdue_balance))} icon={<AlertTriangle />} warning={metrics.credit_overdue_balance > 0} />
              <Metric title="Clientes vencidos" value={String(metrics.credit_customers_with_overdue)} icon={<Users />} warning={metrics.credit_customers_with_overdue > 0} />
            </div>
            <Suspense fallback={<div className="loading-state" role="status"><span className="loading-spinner" aria-hidden="true" /><span>Cargando gráficas…</span></div>}>
              <Charts orders={orders} products={metrics.top_products} />
            </Suspense>
            <section className="insight-grid">
              <div className="admin-card">
                <div className="card-title"><div><h2>Consejo</h2><span>Lectura inicial del inventario</span></div><Sparkles size={18}/></div>
                <p className="insight">{metrics.top_products[0]
                  ? `“${metrics.top_products[0].name}” es el producto más solicitado (${metrics.top_products[0].units} unidades en pedidos). Revisa su stock antes de impulsar nuevas ventas.`
                  : "Cuando registres pedidos, aquí aparecerá el producto más solicitado para ayudarte a planificar el inventario."}</p>
              </div>
              <div className="admin-card">
                <div className="card-title"><div><h2>Alertas</h2><span>Inventario y pedidos por atender</span></div><AlertTriangle size={18}/></div>
                <div className="alert-list">
                  <button className="alert-link" onClick={() => setDashboardDetail("sold-out")}>
                    <span>Productos agotados</span><strong>{soldOut}</strong>
                  </button>
                  <button className="alert-link" onClick={() => setDashboardDetail("low-stock")}>
                    <span>Presentaciones con stock bajo</span><strong>{lowStock}</strong>
                  </button>
                  <button className="alert-link" onClick={() => setDashboardDetail("pending")}>
                    <span>Confirmados pendientes de pago</span><strong>{metrics.pending_orders}</strong>
                  </button>
                  {soldOut === 0 && lowStock === 0 && metrics.pending_orders === 0 && (
                    <EmptyState
                      title="Todo en orden"
                      hint="No hay productos agotados, stock bajo ni pedidos pendientes."
                    />
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {section === "credit" && (
          <Suspense fallback={<div className="loading-state" role="status"><span className="loading-spinner" aria-hidden="true" /><span>Cargando cartera…</span></div>}>
            <CreditPage sectionRevision={sectionRevision} />
          </Suspense>
        )}

        {section === "expenses" && (
          <section className="admin-card">
            <div className="card-title">
              <div>
                <h2>Gastos</h2>
                <span>Registra gastos, programa recordatorios y consulta los pagos incluidos en reportes diarios y semanales.</span>
              </div>
            </div>
            <form className="expense-form" onSubmit={(event) => void saveExpense(event)}>
              <label>Nombre
                <input value={expenseForm.name} onChange={(event) => setExpenseForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ej. Alquiler local" required />
              </label>
              <label>Monto
                <input type="number" min="0" step="1" value={expenseForm.amount} onChange={(event) => setExpenseForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0" required />
              </label>
              <label>Categoría
                <select value={expenseForm.category} onChange={(event) => setExpenseForm((current) => ({ ...current, category: event.target.value }))}>
                  {EXPENSE_CATEGORIES.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label>{expenseForm.recurring ? "Primer vencimiento" : "Fecha"}
                <input type="date" value={expenseForm.date} onChange={(event) => setExpenseForm((current) => ({ ...current, date: event.target.value }))} required />
              </label>
              <label className="expense-recurring-toggle">
                <span>¿Es un gasto recurrente?</span>
                <input
                  type="checkbox"
                  checked={expenseForm.recurring}
                  onChange={(event) => setExpenseForm((current) => ({ ...current, recurring: event.target.checked }))}
                />
              </label>
              {expenseForm.recurring && (
                <label>Frecuencia
                  <select
                    value={expenseForm.frequency}
                    onChange={(event) => setExpenseForm((current) => ({
                      ...current,
                      frequency: event.target.value as RecurrenceFrequency,
                    }))}
                  >
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensual</option>
                    <option value="yearly">Anual</option>
                  </select>
                </label>
              )}
              <AdminButton type="submit" disabled={savingExpense}>
                {savingExpense ? "Guardando..." : expenseForm.recurring ? "Crear recordatorio" : "Agregar gasto"}
              </AdminButton>
            </form>
            {expenseForm.recurring && (
              <p className="profile-notice">
                La fecha indicada será el primer vencimiento. Verás los próximos pagos aquí y el correo se enviará el día del vencimiento y cada día que siga pendiente.
              </p>
            )}
            {recurringExpenses.length > 0 && (
              <div className="recurring-expenses">
                <h3>Recordatorios de pagos recurrentes</h3>
                {recurringExpenses.map((expense) => {
                  const daysUntil = getDaysUntil(expense.next_due_date);
                  const dueLabel = daysUntil < 0
                    ? `Vencido hace ${Math.abs(daysUntil)} día(s)`
                    : daysUntil === 0
                      ? "Vence hoy"
                      : `Vence en ${daysUntil} día(s)`;
                  const frequencyLabel = expense.frequency === "weekly"
                    ? "Semanal"
                    : expense.frequency === "yearly" ? "Anual" : "Mensual";
                  return (
                    <div className="recurring-expense-row" key={expense.id}>
                      <div>
                        <strong>{expense.name} · {money(expense.amount)}</strong>
                        <span>{expense.category} · {frequencyLabel} · {formatBogotaDate(expense.next_due_date)}</span>
                        <small className={daysUntil <= 0 ? "expense-overdue" : ""}>{dueLabel}</small>
                      </div>
                      <div className="recurring-expense-actions">
                        <AdminButton
                          tone="secondary"
                          compact
                          type="button"
                          disabled={payingRecurringExpenseId === expense.id}
                          onClick={() => void payRecurringExpense(expense)}
                        >
                          {payingRecurringExpenseId === expense.id ? "Guardando..." : "Registrar pago"}
                        </AdminButton>
                        <AdminButton
                          tone="danger"
                          variant="outline"
                          compact
                          type="button"
                          aria-label={`Eliminar recordatorio ${expense.name}`}
                          disabled={deletingRecurringExpenseId === expense.id}
                          onClick={() => void removeRecurringExpense(expense.id)}
                        >
                          <Trash2 size={16} />
                        </AdminButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {expenses.length > 0 ? (
              <>
                <div className="admin-table">
                  <div className="table-row expense-row header"><span>Nombre</span><span>Categoría</span><span className="cell-center">Monto</span><span className="cell-center">Fecha</span><span></span></div>
                  {paginatedExpenses.map((expense) => (
                    <div className="table-row expense-row" key={expense.id}>
                      <strong>{expense.name}</strong>
                      <span>{expense.category}</span>
                      <span className="cell-center">{money(expense.amount)}</span>
                      <span className="cell-center">{expense.expense_date}</span>
                      <AdminButton
                        tone="danger"
                        variant="outline"
                        compact
                        type="button"
                        aria-label={`Eliminar gasto ${expense.name}`}
                        disabled={deletingExpenseId === expense.id}
                        onClick={() => {
                          onConfirm({
                            title: "Eliminar gasto",
                            message: `¿Eliminar el gasto "${expense.name}"? Esta acción no se puede deshacer.`,
                            onConfirm: () => void removeExpense(expense.id),
                          });
                        }}
                      >
                        <Trash2 size={16} />
                      </AdminButton>
                    </div>
                  ))}
                </div>
                <Pagination
                  page={currentExpensePage}
                  pageCount={expensePageCount}
                  total={expenses.length}
                  noun="gasto"
                  label="Paginación de gastos"
                  onPageChange={setExpensePage}
                />
              </>
            ) : (
              !sectionLoading && (
                <p className="empty-state">
                  <Wallet size={22} />
                  <strong>Todavía no registras gastos</strong>
                  <span>Usa el formulario de arriba para agregar tu primer gasto. También puedes marcarlo como recurrente para recibir recordatorios.</span>
                </p>
              )
            )}
          </section>
        )}

        {section === "advisors" && (
          <section className="admin-card">
            <div className="card-title">
              <div>
                <h2>Asesores de venta</h2>
                <span>Registra quién atendió cada pedido. Solo los asesores activos aparecen al crear o editar un pedido.</span>
              </div>
            </div>
            <form className="advisor-form" onSubmit={saveAdvisor}>
              <div className="advisor-form-grid">
                <label className="auth-label">
                  Nombre completo
                  <input
                    type="text"
                    required
                    placeholder="Nombre del asesor"
                    value={advisorForm.full_name}
                    disabled={savingAdvisor}
                    onChange={(event) => setAdvisorForm((current) => ({ ...current, full_name: event.target.value }))}
                  />
                </label>
                <label className="auth-label">
                  WhatsApp
                  <input
                    type="tel"
                    placeholder="Opcional"
                    value={advisorForm.phone}
                    disabled={savingAdvisor}
                    onChange={(event) => setAdvisorForm((current) => ({ ...current, phone: event.target.value }))}
                  />
                </label>
                <label className="auth-label">
                  Correo
                  <input
                    type="email"
                    placeholder="Opcional"
                    value={advisorForm.email}
                    disabled={savingAdvisor}
                    onChange={(event) => setAdvisorForm((current) => ({ ...current, email: event.target.value }))}
                  />
                </label>
              </div>
              <div className="advisor-form-actions">
                <AdminButton type="submit" disabled={savingAdvisor || !advisorForm.full_name.trim()}>
                  {editingAdvisor ? "Guardar cambios" : "Agregar asesor"}
                </AdminButton>
                {editingAdvisor && (
                  <AdminButton
                    tone="secondary"
                    compact
                    type="button"
                    disabled={savingAdvisor}
                    onClick={() => {
                      setEditingAdvisor(null);
                      setAdvisorForm({ full_name: "", phone: "", email: "" });
                    }}
                  >
                    Cancelar
                  </AdminButton>
                )}
              </div>
            </form>
            <div className="admin-table">
              <div className="table-row advisor-row header">
                <span>Asesor</span><span>WhatsApp</span><span>Correo</span><span className="cell-center">Estado</span><span></span>
              </div>
              {salesAdvisors.map((advisor) => (
                <div className="table-row advisor-row" key={advisor.id}>
                  <strong>{advisor.full_name}</strong>
                  <span>{advisor.phone || "—"}</span>
                  <span>{advisor.email || "—"}</span>
                  <span className={`cell-center ${advisor.active ? "advisor-active" : "advisor-inactive"}`}>
                    {advisor.active ? "Activo" : "Inactivo"}
                  </span>
                  <div className="order-actions">
                    <AdminButton
                      tone="secondary"
                      compact
                      type="button"
                      aria-label={`Editar ${advisor.full_name}`}
                      disabled={savingAdvisor}
                      onClick={() => {
                        setEditingAdvisor(advisor);
                        setAdvisorForm({
                          full_name: advisor.full_name,
                          phone: advisor.phone ?? "",
                          email: advisor.email ?? "",
                        });
                      }}
                    >
                      <Pencil size={15} /> Editar
                    </AdminButton>
                    <AdminButton
                      tone="danger"
                      variant="outline"
                      compact
                      type="button"
                      aria-label={`Eliminar ${advisor.full_name}`}
                      disabled={deletingAdvisorId === advisor.id}
                      onClick={() => {
                        onConfirm({
                          title: "Eliminar asesor",
                          message: `¿Eliminar al asesor "${advisor.full_name}"? Los pedidos existentes conservarán su nombre, pero no se podrá asignar a nuevos pedidos.`,
                          onConfirm: () => void removeAdvisor(advisor),
                        });
                      }}
                    >
                      <Trash2 size={16} />
                    </AdminButton>
                  </div>
                </div>
              ))}
              {!sectionLoading && salesAdvisors.length === 0 && (
                <EmptyState
                  icon={<UserCheck size={26} />}
                  title="No hay asesores registrados"
                  hint="Agrega el primero con el formulario de arriba."
                />
              )}
            </div>
          </section>
        )}

        {section === "settings" && (
          <Suspense fallback={<div className="loading-state" role="status"><span className="loading-spinner" aria-hidden="true" /><span>Cargando configuración…</span></div>}>
            <SettingsPage
              settings={storeSettings}
              loadError={storeSettingsError}
              onSaved={onStoreSettingsSaved}
            />
          </Suspense>
        )}

        {section === "products" && <section className="admin-card">
          <div className="card-title">
            <div>
              <h2>{showArchivedProducts ? "Productos archivados" : "Productos"}</h2>
              <span>Gestiona disponibilidad, costos y stock. Para importar, usa una fila por presentación y repite marca y nombre para agrupar variantes.</span>
            </div>
            <div className="product-list-tools">
              <button
                className="secondary archived-products-toggle"
                type="button"
                onClick={() => setShowArchivedProducts((current) => !current)}
                disabled={archivedProductsCount === 0 && !showArchivedProducts}
              >
                {showArchivedProducts ? "Volver a productos" : `Archivados (${archivedProductsCount})`}
              </button>
              {!showArchivedProducts && (
                <div className="product-stock-filters" aria-label="Filtrar productos por disponibilidad">
                  {([
                    ["all", "Todos"],
                    ["available", "Disponibles"],
                    ["sold-out", "Agotados"],
                  ] as const).map(([filter, label]) => (
                    <button
                      key={filter}
                      type="button"
                      className={productStockFilter === filter ? "selected" : ""}
                      aria-pressed={productStockFilter === filter}
                      onClick={() => setProductStockFilter(filter)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <label className="admin-search">
                <Search size={16} />
                <input
                  aria-label={showArchivedProducts ? "Buscar productos archivados" : "Buscar productos"}
                  placeholder="Buscar productos"
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                />
              </label>
            </div>
          </div>
          {showArchivedProducts && (
            <p className="customer-import-hint">
              Estos productos se quitaron de la tienda, pero se conservan porque tienen pedidos o movimientos de inventario asociados.
            </p>
          )}

          <div className="admin-table">
            <div className="table-row product-row header">
              <span>Producto</span><span>Categoría</span><span>Presentación y costo unitario</span><span className="cell-center">Stock</span><span className="cell-center">Estado</span><span className="cell-center">Acciones</span>
            </div>
            {visibleProducts.map((product) => {
              const stock = product.variants.reduce((s, v) => s + v.stock, 0);
              const available = !product.archived && product.active !== false && stock > 0;
              return (
                <div className="table-row product-row" key={product.id}>
                  <div className="product-cell">
                    <img src={product.image} alt="" />
                    <div><b>{product.brand}</b><span>{product.name}</span></div>
                  </div>
                  <div className="product-category-cell">
                    <span>{product.category}</span>
                    {product.promotion_id && (
                      <small>{promotions.find((promotion) => promotion.id === product.promotion_id)?.name ?? "Promoción no disponible"}</small>
                    )}
                  </div>
                  <div className="variant-cost-list">
                    {product.variants.map((variant) => (
                      <label key={variant.id}>
                        <span>
                          {variant.size} ml · precio {money(variant.price)}
                          {variant.active === false && <small className="variant-hidden-label">Oculta en tienda</small>}
                        </span>
                        <span className="cost-input-wrap">
                          <span>Costo</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            aria-label={`Costo unitario de ${product.name} ${variant.size} ml`}
                            value={costDrafts[variant.id] ?? (variant.cost == null ? "" : String(variant.cost))}
                            placeholder="Sin costo"
                            disabled={savingCostVariantId === variant.id}
                            onChange={(event) => setCostDrafts((current) => ({ ...current, [variant.id]: event.target.value }))}
                            onBlur={(event) => {
                              const rawCost = event.target.value.trim();
                              if (!rawCost) return;
                              const cost = Number(rawCost);
                              if (!Number.isFinite(cost) || cost < 0) return;
                              void onVariantCostChange(variant.id, cost)
                                .then(() => setCostDrafts((current) => {
                                  const next = { ...current };
                                  delete next[variant.id];
                                  return next;
                                }))
                                .catch(() => {});
                            }}
                          />
                        </span>
                        {savingCostVariantId === variant.id && <small>Guardando…</small>}
                      </label>
                    ))}
                    {product.variants.map((variant) => (
                      <label className="stock-control" key={`stock-${variant.id}`}>
                        <span>Stock disponible · {variant.size} ml</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          aria-label={`Stock de ${product.name} ${variant.size} ml`}
                          value={stockDrafts[variant.id] ?? String(variant.stock)}
                          disabled={savingStockVariantId === variant.id}
                          onChange={(event) => setStockDrafts((current) => ({ ...current, [variant.id]: event.target.value }))}
                          onBlur={(event) => {
                            const rawStock = event.target.value.trim();
                            if (!rawStock) {
                              setStockDrafts((current) => {
                                const next = { ...current };
                                delete next[variant.id];
                                return next;
                              });
                              return;
                            }
                            const stock = Number(rawStock);
                            if (stock === variant.stock) {
                              setStockDrafts((current) => {
                                const next = { ...current };
                                delete next[variant.id];
                                return next;
                              });
                              return;
                            }
                            void onVariantStockChange(variant.id, stock)
                              .then(() => setStockDrafts((current) => {
                                const next = { ...current };
                                delete next[variant.id];
                                return next;
                              }))
                              .catch(() => {});
                          }}
                        />
                        {savingStockVariantId === variant.id && <small>Guardando…</small>}
                      </label>
                    ))}
                  </div>
                  <span className="cell-center">{stock}</span>
                  {product.archived ? (
                    <span className="status sold archived-status">Archivado</span>
                  ) : (
                    <button
                      className={available ? "status available" : "status sold"}
                      disabled={updatingProductId === product.id}
                      onClick={() => onProductActiveChange(product)}
                    >
                      {updatingProductId === product.id
                        ? "Guardando..."
                        : product.active === false
                          ? <>Oculto · mostrar</>
                          : available ? <><Check size={13}/> Disponible · ocultar</> : <>Agotado · ocultar</>}
                    </button>
                  )}
                  {product.archived ? (
                    <span className="archived-history-note">Se conserva por su historial de ventas o inventario.</span>
                  ) : (
                    <div className="product-actions">
                      <AdminButton tone="secondary" compact type="button" onClick={() => {
                          setProductActionFeedback(null);
                          setProductActionError(null);
                          setEditingProduct(product);
                      }}>
                          <Pencil size={14}/> Editar
                      </AdminButton>
                      <AdminButton
                          tone="danger"
                          variant="outline"
                          compact
                          type="button"
                          disabled={deletingProductId === product.id}
                          onClick={() => {
                            const confirmed = window.confirm(
                              `¿Eliminar ${product.brand} ${product.name}? Si tiene pedidos o movimientos de inventario, se quitará de la tienda y se archivará para proteger ese historial.`
                            );
                            if (!confirmed) return;
                            setProductActionFeedback(null);
                            setProductActionError(null);
                            void onDeleteProduct(product)
                              .then((result) => setProductActionFeedback(
                                result === "archived"
                                  ? `${product.brand} ${product.name} se archivó y se quitó de los productos activos.`
                                  : `${product.brand} ${product.name} se eliminó.`
                              ))
                              .catch((deleteError: unknown) => {
                                setProductActionError(deleteError instanceof Error
                                  ? deleteError.message
                                  : "No se pudo eliminar el producto. Revisa los permisos de administrador y la conexión con Supabase.");
                              });
                          }}
                      >
                          <Trash2 size={14}/>{deletingProductId === product.id ? "Eliminando..." : "Eliminar"}
                      </AdminButton>
                    </div>
                  )}
                </div>
              );
            })}
            {visibleProducts.length === 0 && (
              <p className="insight">
                {showArchivedProducts
                  ? "No hay productos archivados que coincidan con la búsqueda."
                  : "No hay productos activos que coincidan con la búsqueda."}
              </p>
            )}
          </div>
          {productActionFeedback && <p className="import-feedback" role="status">{productActionFeedback}</p>}
          {productActionError && <p className="form-error" role="alert">{productActionError}</p>}
        </section>}
        {section === "promotions" && (
          <section className="admin-card">
            <div className="card-title">
              <div>
                <h2>Promociones y ofertas</h2>
                <span>Asocia los productos desde su formulario. La oferta se repite por cada paquete completo.</span>
              </div>
              <AdminButton type="button" onClick={() => setPromotionEditor("new")}><Plus size={17}/> Nueva promoción</AdminButton>
            </div>
            {promotions.length === 0 ? (
              <EmptyState
                icon={<Tag size={26} />}
                title="Todavía no hay promociones"
                hint="Crea una para ofrecer paquetes con precio especial."
                action={
                  <AdminButton tone="secondary" compact type="button" onClick={() => setPromotionEditor("new")}>
                    <Plus size={14} /> Nueva promoción
                  </AdminButton>
                }
              />
            ) : (
              <div className="admin-table promotion-table">
                <div className="table-row header"><span>Promoción</span><span>Paquete</span><span>Combinación</span><span className="cell-center">Estado</span><span className="cell-center">Acciones</span></div>
                {promotions.map((promotion) => (
                  <div className="table-row" key={promotion.id}>
                    <strong>{promotion.name}</strong>
                    <span>{promotion.required_quantity} por {money(promotion.bundle_price)}</span>
                    <span>{promotion.allow_mixed ? "Productos asociados combinables" : "Mismo perfume"}</span>
                    <button
                      type="button"
                      className={`status-pill ${promotion.active ? "status-paid" : ""} status-toggle`}
                      aria-pressed={promotion.active}
                      title={promotion.active ? "Activa · pausar" : "Pausada · activar"}
                      onClick={() => void togglePromotion(promotion)}
                    >
                      {promotion.active ? "Activa" : "Inactiva"}
                    </button>
                    <div className="product-actions">
                      <AdminButton tone="secondary" compact onClick={() => setPromotionEditor(promotion)}><Pencil size={15}/> Editar</AdminButton>
                      <AdminButton tone="danger" variant="outline" compact onClick={() => void removePromotion(promotion)}><Trash2 size={15}/> Eliminar</AdminButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {(section === "customers" || section === "profiles") && (
          <section className="admin-card">
            <div className="card-title">
              <div>
                <h2>{section === "customers" ? "Clientes y pedidos" : section === "profiles" ? "Cuentas y permisos" : "Pedidos y transacciones"}</h2>
                <span>{section === "customers"
                  ? "Consulta compras y actualiza los datos de contacto."
                  : section === "profiles"
                    ? "Asigna acceso administrativo únicamente a cuentas registradas."
                    : "Al marcar un pedido como pagado, se completa la venta y se actualiza el inventario."}</span>
              </div>
              <label className="admin-search">
                <Search size={16} />
                <input aria-label={`Buscar ${pageTitle.toLowerCase()}`} placeholder="Buscar" value={search} onChange={(event) => setSearch(event.target.value)} />
              </label>
            </div>
            {section === "customers" && (
              <>
              {customerImportFeedback && <p className="import-feedback" role="status">{customerImportFeedback}</p>}
              {customerImportError && <p className="form-error" role="alert">{customerImportError}</p>}
              <p className="customer-import-hint">Importa CSV o Excel (.xlsx) con las columnas <code>full_name</code> y, opcionalmente, <code>phone</code>, <code>email</code> y <code>city</code>. Se omiten coincidencias por correo o teléfono.</p>
              <div className="admin-table">
                <div className="table-row customer-row header"><span>Cliente</span><span>WhatsApp</span><span>Correo</span><span>Ciudad</span><span className="cell-center">Pedidos</span><span></span></div>
                {paginatedCustomers.map((customer) => (
                  <div className="table-row customer-row" key={customer.id}>
                    <strong>{customer.full_name}</strong><span>{customer.phone || "—"}</span><span>{customer.email || "—"}</span><span>{customer.city || "—"}</span><span className="cell-center">{customer.orders?.length ?? 0}</span>
                    <AdminButton tone="secondary" compact type="button" aria-label={`Editar ${customer.full_name}`} onClick={() => setEditingCustomer(customer)}><Pencil size={16}/></AdminButton>
                  </div>
                ))}
                {!sectionLoading && visibleCustomers.length === 0 && (
                  <EmptyState
                    icon={<Users size={26} />}
                    title="No hay clientes que coincidan con la búsqueda."
                    hint="Prueba con otro nombre o teléfono."
                  />
                )}
              </div>
              <Pagination
                page={currentCustomerPage}
                pageCount={customerPageCount}
                total={visibleCustomers.length}
                noun="cliente"
                label="Paginación de clientes"
                onPageChange={setCustomerPage}
              />
              </>
            )}
            {section === "profiles" && (
              <>
                <div className="profile-notice"><ShieldCheck size={17}/> Los usuarios se registran desde la tienda como clientes. Puedes promover una cuenta a administrador; no puedes cambiar tu propio rol.</div>
                <div className="admin-table">
                  <div className="table-row profile-row header"><span>Perfil</span><span>WhatsApp</span><span className="cell-center">Alta</span><span className="cell-center">Permiso</span></div>
                  {paginatedProfiles.map((profile) => (
                    <div className="table-row profile-row" key={profile.id}>
                      <div className="profile-cell"><strong>{profile.full_name || "Sin nombre"}</strong><span>{profile.email || "Sin correo"}</span></div>
                      <span>{profile.phone || "—"}</span>
                      <span className="cell-center">{new Date(profile.created_at).toLocaleDateString("es-CO")}</span>
                      <label className="mobile-select-cell">
                        <select aria-label={`Permiso de ${profile.email ?? profile.id}`} value={profile.role} disabled={profile.id === currentUserId || savingProfileId === profile.id} onChange={(event) => void saveProfileRole(profile, event.target.value as AdminProfile["role"])}>
                          <option value="customer">Cliente</option><option value="admin">Administrador</option>
                        </select>
                      </label>
                    </div>
                  ))}
                  {!sectionLoading && visibleProfiles.length === 0 && (
                  <EmptyState
                    icon={<ShieldCheck size={26} />}
                    title="No hay perfiles que coincidan con la búsqueda."
                    hint="Prueba con otro nombre o correo."
                  />
                )}
                </div>
                <Pagination
                  page={currentProfilePage}
                  pageCount={profilePageCount}
                  total={visibleProfiles.length}
                  noun="perfil"
                  label="Paginación de perfiles"
                  onPageChange={setProfilePage}
                />
              </>
            )}
          </section>
        )}
        {section === "transactions" && (
          <Suspense fallback={<div className="loading-state" role="status"><span className="loading-spinner" aria-hidden="true" /><span>Cargando pedidos…</span></div>}>
          <OrdersPage
            orders={orders}
            loading={sectionLoading}
            search={search}
            showPendingOnly={showPendingOrdersOnly}
            onSearchChange={setSearch}
            savingOrderId={savingOrderId}
            deletingOrderId={deletingOrderId}
            onEditOrder={(order) => setOrderEditor({ order })}
            onDeleteOrder={(order) => {
              onConfirm({
                title: "Eliminar pedido",
                message: `¿Eliminar el pedido #${order.id.slice(0, 8).toUpperCase()}? Esta acción no se puede deshacer.`,
                onConfirm: () => void removePendingOrder(order),
              });
            }}
            onStatusChange={(order, status, paymentStatus) => void saveOrderStatus(order, status, paymentStatus)}
          />
          </Suspense>
        )}
      </main>
      {dashboardDetail && (
        <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setDashboardDetail(null); }}>
          <section className="admin-card dashboard-detail-modal" role="dialog" aria-modal="true" aria-labelledby="dashboard-detail-title">
            <button className="close" type="button" onClick={() => setDashboardDetail(null)} aria-label="Cerrar"><X /></button>
            <p className="eyebrow">DETALLE DEL DASHBOARD</p>
            <h2 id="dashboard-detail-title">
              {dashboardDetail === "sold-out" ? "Productos agotados" : dashboardDetail === "low-stock" ? "Presentaciones con stock bajo" : "Pedidos pendientes"}
            </h2>
            <div className="dashboard-detail-list">
              {dashboardDetail === "sold-out" && stockTrackedProducts.flatMap((product) =>
                product.variants.filter((variant) => variant.active !== false && variant.stock <= 0).map((variant) => (
                  <div className="dashboard-detail-row" key={variant.id}>
                    <strong>{product.brand} · {product.name}</strong><span>{variant.size} ml · agotado</span>
                  </div>
                ))
              )}
              {dashboardDetail === "low-stock" && stockTrackedProducts.flatMap((product) =>
                product.variants.filter((variant) =>
                  variant.active !== false &&
                  variant.stock > 0 &&
                  variant.stock <= (variant.minStock ?? 2)
                ).map((variant) => (
                  <div className="dashboard-detail-row" key={variant.id}>
                    <strong>{product.brand} · {product.name}</strong><span>{variant.size} ml · quedan {variant.stock} (mínimo {variant.minStock ?? 2})</span>
                  </div>
                ))
              )}
              {dashboardDetail === "pending" && orders.filter((order) =>
                order.payment_status === "pending" && order.status === "confirmed"
              ).map((order) => (
                <div className="dashboard-detail-row" key={order.id}>
                  <strong>#{order.id.slice(0, 8).toUpperCase()} · {order.customers?.full_name ?? "Cliente"}</strong>
                  <span>{money(Number(order.total))} · {new Date(order.created_at).toLocaleDateString("es-CO")}</span>
                </div>
              ))}
              {((dashboardDetail === "sold-out" && soldOut === 0) ||
                (dashboardDetail === "low-stock" && lowStock === 0) ||
                (dashboardDetail === "pending" && orders.every((order) =>
                  order.payment_status !== "pending" || order.status !== "confirmed"
                ))) && (
                <EmptyState title="No hay elementos para mostrar." />
              )}
            </div>
            <button className="primary full" type="button" onClick={() => {
              if (dashboardDetail === "pending") {
                setSection("transactions");
                setShowPendingOrdersOnly(true);
              } else {
                setSection("products");
              }
              setSearch("");
              setDashboardDetail(null);
            }}>
              {dashboardDetail === "pending" ? "Ir a pedidos" : "Ir a productos"}
            </button>
          </section>
        </div>
      )}
      {orderEditor && (
        <Suspense fallback={null}>
        <OrderEditorModal
          order={orderEditor.order}
          customers={customers}
          products={products}
          promotions={promotions}
          salesAdvisors={salesAdvisors}
          saving={orderSaving}
          error={sectionError}
          onClose={() => { if (!orderSaving) setOrderEditor(null); }}
          onSave={(customerId, customer, items, orderDate, deliveryCost, salesAdvisorId, orderStatus, paymentStatus) =>
            void savePendingOrder(customerId, customer, items, orderEditor.order?.id ?? null, orderDate, deliveryCost, salesAdvisorId, orderStatus, paymentStatus)
          }
        />
        </Suspense>
      )}
      {editingProduct && (
        <EditProductModal
          product={editingProduct}
          promotions={promotions}
          saving={savingProductEdit}
          error={error}
          onClose={() => { if (!savingProductEdit) setEditingProduct(null); }}
          onSave={async (product, imageFiles) => {
            await onEditProduct(product, imageFiles);
            setEditingProduct(null);
            setProductActionFeedback(`${product.brand} ${product.name} se actualizó correctamente.`);
          }}
        />
      )}
      {promotionEditor && (
        <PromotionEditorModal
          promotion={promotionEditor === "new" ? null : promotionEditor}
          saving={promotionSaving}
          onClose={() => { if (!promotionSaving) setPromotionEditor(null); }}
          onSave={(input) => void submitPromotion(input, promotionEditor === "new" ? undefined : promotionEditor.id)}
        />
      )}
      {editingCustomer && (
        <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !customerSaving) setEditingCustomer(null); }}>
          <form className="add-modal admin-customer-modal" onSubmit={(event) => void saveCustomer(event)}>
            <button className="close" type="button" onClick={() => setEditingCustomer(null)} aria-label="Cerrar"><X/></button>
            <p className="eyebrow">GESTIÓN DE CLIENTES</p>
            <h2>Editar cliente</h2>
            <label className="auth-label">Nombre completo<input name="full_name" defaultValue={editingCustomer.full_name} required/></label>
            <label className="auth-label">WhatsApp<input name="phone" type="tel" defaultValue={editingCustomer.phone ?? ""}/></label>
            <label className="auth-label">Correo<input name="email" type="email" defaultValue={editingCustomer.email ?? ""}/></label>
            <label className="auth-label">Ciudad<input name="city" defaultValue={editingCustomer.city ?? ""}/></label>
            <hr style={{margin: "16px 0", borderColor: "var(--border)"}} />
            <h3 style={{marginBottom: "12px", fontSize: "14px", color: "var(--muted)"}}>Configuración de crédito</h3>
            <label className="auth-label credit-checkbox">
              <input
                type="checkbox"
                name="credit_enabled"
                defaultChecked={editingCustomer.credit_enabled}
                onChange={(e) => setEditingCustomer({...editingCustomer, credit_enabled: e.target.checked})}
              />
              <span>Habilitar crédito para este cliente</span>
            </label>
            <label className="auth-label">
              Límite de crédito
              <input type="number" min="0" step="1000" name="credit_limit" defaultValue={editingCustomer.credit_limit} placeholder="0" />
            </label>
            <label className="auth-label">
              Plazo
              <select name="credit_terms" defaultValue={editingCustomer.credit_terms}>
                <option value="quincenal">Quincenal (15 días)</option>
                <option value="mensual">Mensual (30 días)</option>
              </select>
            </label>
            <label className="auth-label credit-checkbox">
              <input
                type="checkbox"
                name="credit_blocked"
                defaultChecked={editingCustomer.credit_blocked}
                onChange={(e) => setEditingCustomer({...editingCustomer, credit_blocked: e.target.checked})}
              />
              <span>Bloquear crédito (no puede hacer pedidos nuevos)</span>
            </label>
            {sectionError && <p className="form-error" role="alert">{sectionError}</p>}
            <button className="primary full" type="submit" disabled={customerSaving}>{customerSaving ? "Guardando..." : "Guardar cliente"}</button>
          </form>
        </div>
      )}
      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function PromotionEditorModal({
  promotion,
  saving,
  onClose,
  onSave,
}: {
  promotion: Promotion | null;
  saving: boolean;
  onClose: () => void;
  onSave: (input: PromotionInput) => void;
}) {
  const [name, setName] = useState(promotion?.name ?? "");
  const [requiredQuantity, setRequiredQuantity] = useState(String(promotion?.required_quantity ?? 2));
  const [bundlePrice, setBundlePrice] = useState(String(promotion?.bundle_price ?? ""));
  const [allowMixed, setAllowMixed] = useState(promotion?.allow_mixed ?? true);
  const [active, setActive] = useState(promotion?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const quantity = Number(requiredQuantity);
    const price = Number(bundlePrice);
    if (!name.trim()) {
      setError("Escribe un nombre para la promoción.");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 2 || !Number.isFinite(price) || price < 0) {
      setError("La cantidad mínima es 2 y el precio debe ser un número igual o mayor a cero.");
      return;
    }
    setError(null);
    onSave({
      name: name.trim(),
      required_quantity: quantity,
      bundle_price: price,
      allow_mixed: allowMixed,
      active,
    });
  };

  return (
    <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <form className="add-modal promotion-editor-modal" role="dialog" aria-modal="true" aria-labelledby="promotion-editor-title" onSubmit={submit}>
        <button className="close" type="button" onClick={onClose} aria-label="Cerrar"><X /></button>
        <p className="eyebrow">ADMINISTRACIÓN</p>
        <h2 id="promotion-editor-title">{promotion ? "Editar promoción" : "Nueva promoción"}</h2>
        <label className="auth-label">Nombre<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Oferta de dos perfumes" maxLength={100} required /></label>
        <div className="form-grid">
          <label>Cantidad del paquete<input type="number" min="2" step="1" value={requiredQuantity} onChange={(event) => setRequiredQuantity(event.target.value)} required /></label>
          <label>Precio del paquete<input type="number" min="0" step="1" value={bundlePrice} onChange={(event) => setBundlePrice(event.target.value)} placeholder="300000" required /></label>
        </div>
        <label className="promotion-checkbox">
          <input type="checkbox" checked={allowMixed} onChange={(event) => setAllowMixed(event.target.checked)} />
          <span>Permitir combinar diferentes productos asociados a esta promoción</span>
        </label>
        <label className="promotion-checkbox">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          <span>Promoción activa y visible en la tienda</span>
        </label>
        <p className="order-editor-note">Cada paquete completo obtiene el precio promocional. Las unidades que sobren se cobran a su precio normal.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="edit-product-actions">
          <AdminButton tone="secondary" compact type="button" onClick={onClose} disabled={saving}>Cancelar</AdminButton>
          <AdminButton type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar promoción"}</AdminButton>
        </div>
      </form>
    </div>
  );
}

function EditProductModal({
  product,
  promotions,
  saving,
  error: saveError,
  onClose,
  onSave,
}: {
  product: Product;
  promotions: Promotion[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (product: Product, imageFiles: File[]) => Promise<void>;
}) {
  const [images, setImages] = useState(product.images ?? (product.image ? [product.image] : []));
  const [brand, setBrand] = useState(product.brand);
  const [name, setName] = useState(product.name);
  const [gender, setGender] = useState<Product["gender"]>(product.gender);
  const [category, setCategory] = useState<Product["category"]>(product.category);
  const [description, setDescription] = useState(product.description);
  const [family, setFamily] = useState(product.family);
  const [climate, setClimate] = useState(product.climate.join(", "));
  const [promotionId, setPromotionId] = useState(product.promotion_id ?? "");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [variants, setVariants] = useState(product.variants
    .map((variant) => ({
    ...variant,
    sizeDraft: String(variant.size),
    priceDraft: String(variant.price),
    costDraft: variant.cost == null ? "" : String(variant.cost),
    stockDraft: String(variant.stock),
    })));
  const [error, setError] = useState<string | null>(null);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedVariants = variants.map((variant) => ({
      ...variant,
      size: Number(variant.sizeDraft),
      price: Number(variant.priceDraft),
      cost: variant.costDraft.trim() ? Number(variant.costDraft) : null,
      stock: Number(variant.stockDraft),
    }));
    if (images.length + imageFiles.length > 3) {
      setError("Cada perfume admite un máximo de tres imágenes.");
      return;
    }
    if (parsedVariants.some((variant) =>
      !Number.isInteger(variant.size) || variant.size <= 0 ||
      !Number.isFinite(variant.price) || variant.price <= 0 ||
      (variant.cost !== null && (!Number.isFinite(variant.cost) || variant.cost < 0)) ||
      !Number.isInteger(variant.stock) || variant.stock < 0
    )) {
      setError("Revisa los tamaños, precios, costos y cantidades de stock. El precio debe ser mayor que 0.");
      return;
    }
    if (new Set(parsedVariants.map((variant) => variant.size)).size !== parsedVariants.length) {
      setError("No puedes repetir el tamaño de una presentación.");
      return;
    }
    if (parsedVariants.length === 0) {
      setError("El producto debe tener al menos una presentación.");
      return;
    }
    if (!brand.trim() || !name.trim()) {
      setError("La marca y el nombre del producto son obligatorios.");
      return;
    }
    const updatedProduct: Product = {
      ...product,
      brand: brand.trim(),
      name: name.trim(),
      gender,
      category,
      description: description.trim(),
      family: family.trim(),
      climate: climate.split(",").map((item) => item.trim()).filter(Boolean),
      promotion_id: promotionId || null,
      image: images[0] ?? "",
      images,
      variants: parsedVariants.map(({ sizeDraft: _size, priceDraft: _price, costDraft: _cost, stockDraft: _stock, ...variant }) => variant),
    };
    setError(null);
    try {
      await onSave(updatedProduct, imageFiles);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el producto.");
    }
  };

  return (
    <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <form
        className="add-modal edit-product-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-product-title"
        onSubmit={(event) => void save(event)}
      >
        <button className="close" type="button" onClick={onClose} aria-label="Cerrar"><X /></button>
        <p className="eyebrow">ADMINISTRACIÓN</p>
        <h2 id="edit-product-title">Editar producto</h2>
        <div className="form-grid edit-product-fields">
          <label>Marca<input value={brand} disabled={saving} onChange={(event) => setBrand(event.target.value)} required /></label>
          <label>Nombre<input value={name} disabled={saving} onChange={(event) => setName(event.target.value)} required /></label>
          <label>Categoría
            <select value={category} disabled={saving} onChange={(event) => setCategory(event.target.value as Product["category"])}>
              <option value="Diseñador">Diseñador</option><option value="Árabes">Árabes</option><option value="Nicho">Nicho</option>
            </select>
          </label>
          <label>Género
            <select value={gender} disabled={saving} onChange={(event) => setGender(event.target.value as Product["gender"])}>
              <option value="Hombres">Hombres</option><option value="Mujeres">Mujeres</option><option value="Unisex">Unisex</option>
            </select>
          </label>
          <label>Familia olfativa<input value={family} disabled={saving} onChange={(event) => setFamily(event.target.value)} /></label>
          <label>Clima<input value={climate} disabled={saving} onChange={(event) => setClimate(event.target.value)} placeholder="Separar valores con coma" /></label>
          <label className="form-wide">Descripción
            <textarea value={description} disabled={saving} onChange={(event) => setDescription(event.target.value)} rows={3} />
          </label>
        </div>
        <label className="auth-label">
          Promoción
          <select value={promotionId} disabled={saving} onChange={(event) => setPromotionId(event.target.value)}>
            <option value="">Sin promoción</option>
            {promotionId && !promotions.some((promotion) => promotion.id === promotionId) && (
              <option value={promotionId}>Promoción actual (inactiva)</option>
            )}
            {promotions.map((promotion) => (
              <option key={promotion.id} value={promotion.id} disabled={!promotion.active}>
                {promotion.name}{promotion.active ? "" : " (inactiva)"}
              </option>
            ))}
          </select>
        </label>
        <section className="edit-product-images">
          <div>
            <strong>Imágenes</strong>
            <span>Hasta 3 imágenes; JPG, PNG, WebP o AVIF, máximo 5 MB cada una.</span>
          </div>
          <div className="edit-image-list">
            {images.map((image, index) => (
              <div className="edit-image-item" key={`${image}-${index}`}>
                <img src={image} alt={`Imagen ${index + 1} de ${product.name}`} />
                <AdminButton tone="danger" variant="outline" compact type="button" onClick={() => setImages((current) => current.filter((_, imageIndex) => imageIndex !== index))}>
                  <Trash2 size={14}/> Quitar
                </AdminButton>
              </div>
            ))}
            {imageFiles.map((file, index) => (
              <div className="edit-image-item" key={`${file.name}-${index}`}>
                <span className="edit-image-filename">{file.name}</span>
                <AdminButton tone="danger" variant="outline" compact type="button" onClick={() => setImageFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}>
                  <Trash2 size={14}/> Quitar
                </AdminButton>
              </div>
            ))}
          </div>
          {images.length + imageFiles.length < 3 && (
            <label className="image-file-button secondary">
              <Upload size={15}/> Agregar imágenes
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                multiple
                disabled={saving}
                onChange={(event) => {
                  const selected = Array.from(event.currentTarget.files ?? []);
                  event.currentTarget.value = "";
                  const allowed = selected.filter((file) =>
                    ["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type) &&
                    file.size <= 5 * 1024 * 1024
                  );
                  const hasInvalid = allowed.length !== selected.length;
                  const availableSlots = 3 - images.length - imageFiles.length;
                  setImageFiles((current) => [...current, ...allowed.slice(0, availableSlots)]);
                  setError(hasInvalid
                    ? "Usa archivos JPG, PNG, WebP o AVIF de máximo 5 MB."
                    : selected.length > availableSlots
                      ? "Solo puedes guardar hasta tres imágenes por perfume."
                      : null);
                }}
              />
            </label>
          )}
        </section>
        <section className="edit-variant-list">
          <div className="edit-variant-heading">
            <h3>Presentaciones, precios, costos y stock</h3>
            <AdminButton
              tone="secondary"
              compact
              type="button"
              disabled={saving}
              onClick={() => setVariants((current) => [
                ...current,
                {
                  id: `new-${crypto.randomUUID()}`,
                  size: 200,
                  price: 0,
                  cost: null,
                  stock: 1,
                  active: true,
                  sizeDraft: "200",
                  priceDraft: "",
                  costDraft: "",
                  stockDraft: "1",
                },
              ])}
            >
              <Plus size={15} /> Agregar presentación
            </AdminButton>
          </div>
          {variants.map((variant, index) => (
            <div className="edit-variant-row" key={variant.id}>
              <label>Tamaño (ml)
                <input type="number" min="1" step="1" value={variant.sizeDraft} disabled={saving} onChange={(event) => setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, sizeDraft: event.target.value } : item))} required />
                <span className="variant-active-control">
                  <input
                    type="checkbox"
                    checked={variant.active !== false}
                    disabled={saving}
                    onChange={(event) => setVariants((current) => current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, active: event.target.checked } : item
                    ))}
                  />
                  Visible en tienda
                </span>
              </label>
              <label>Precio
                <input type="number" min="0" step="1" value={variant.priceDraft} placeholder="Precio de venta" disabled={saving} onChange={(event) => setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, priceDraft: event.target.value } : item))} required />
              </label>
              <label>Costo
                <input type="number" min="0" step="1" value={variant.costDraft} disabled={saving} placeholder="Sin costo" onChange={(event) => setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, costDraft: event.target.value } : item))} />
              </label>
              <label>Stock
                <input type="number" min="0" step="1" value={variant.stockDraft} disabled={saving} onChange={(event) => setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, stockDraft: event.target.value } : item))} required />
              </label>
              <AdminButton
                tone="danger"
                variant="outline"
                compact
                className="edit-variant-remove"
                type="button"
                aria-label={`Eliminar presentación de ${variant.sizeDraft} ml`}
                title={`Eliminar presentación de ${variant.sizeDraft} ml`}
                disabled={saving || variants.length <= 1}
                onClick={() => {
                  if (variants.length <= 1) {
                    setError("El producto debe conservar al menos una presentación.");
                    return;
                  }
                  setVariants((current) => current.filter((_, itemIndex) => itemIndex !== index));
                  setError(null);
                }}
              >
                <Trash2 size={17} />
              </AdminButton>
            </div>
          ))}
        </section>
        <p className="order-editor-note">Los cambios de stock se guardan como movimientos de inventario para conservar el historial.</p>
        {(error || saveError) && <p className="form-error" role="alert">{error ?? saveError}</p>}
        <div className="edit-product-actions">
          <AdminButton tone="secondary" compact type="button" onClick={onClose} disabled={saving}>Cancelar</AdminButton>
          <AdminButton type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar cambios"}</AdminButton>
        </div>
      </form>
    </div>
  );
}

function AddProductModal({
  onClose,
  onSave,
  promotions,
  saving,
  error: saveError,
}: {
  onClose: () => void;
  onSave: (product: NewProductInput, variants: { size: number; price: number; cost: number; stock: number }[], images: File[]) => Promise<void>;
  promotions: Promotion[];
  saving: boolean;
  error: string | null;
}) {
  const [brand, setBrand] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Product["category"]>("Diseñador");
  const [gender, setGender] = useState<Product["gender"]>("Unisex");
  const [promotionId, setPromotionId] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [description, setDescription] = useState("");
  const [family, setFamily] = useState("");
  const [variants, setVariants] = useState([{ size: "100", price: "100000", cost: "", stock: "1" }]);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const parsedVariants = variants.map((variant) => ({
      size: Number(variant.size),
      price: Number(variant.price),
      cost: Number(variant.cost),
      stock: Number(variant.stock),
    }));
    if (!brand.trim() || !name.trim()) {
      setError("La marca y el nombre son obligatorios.");
      return;
    }
    if (images.some((file) => file.size > 5 * 1024 * 1024)) {
      setError("Cada imagen debe pesar máximo 5 MB.");
      return;
    }
    if (images.some((file) => !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type))) {
      setError("Selecciona imágenes JPG, PNG, WebP o AVIF.");
      return;
    }
    if (variants.some((variant) => !variant.cost.trim())) {
      setError("Ingresa el costo unitario de cada presentación para calcular la utilidad.");
      return;
    }
    if (parsedVariants.some((variant) =>
      !Number.isInteger(variant.size) || variant.size <= 0 ||
      !Number.isFinite(variant.price) || variant.price <= 0 ||
      !Number.isFinite(variant.cost) || variant.cost < 0 ||
      !Number.isInteger(variant.stock) || variant.stock < 0
    )) {
      setError("El precio debe ser mayor que cero; revisa también los tamaños, costos y cantidades de stock.");
      return;
    }
    if (new Set(parsedVariants.map((variant) => variant.size)).size !== parsedVariants.length) {
      setError("No puedes repetir el tamaño de una presentación.");
      return;
    }
    setError(null);
    await onSave({
      brand,
      name,
      category,
      gender,
      description,
      family,
      climate: ["Todo el año"],
      image_url: "",
      promotion_id: promotionId || null,
    }, parsedVariants, images);
  };

  return (
    <div className="overlay">
      <div className="add-modal">
        <button className="close" onClick={onClose}><X /></button>
        <p className="eyebrow">ADMINISTRACIÓN</p>
        <h2>Nuevo producto</h2>
        <div className="form-grid">
          <label>Marca<input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ej. Lattafa" /></label>
          <label>Nombre<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Qaed Al Fursan" /></label>
          <label>Categoría<select value={category} onChange={(e) => setCategory(e.target.value as Product["category"])}><option value="Diseñador">Diseñador</option><option value="Árabes">Árabes</option><option value="Nicho">Nicho</option></select></label>
          <label>Género<select value={gender} onChange={(e) => setGender(e.target.value as Product["gender"])}><option>Hombres</option><option>Mujeres</option><option>Unisex</option></select></label>
          <label>Promoción
            <select value={promotionId} onChange={(event) => setPromotionId(event.target.value)}>
              <option value="">Sin promoción</option>
              {promotions.map((promotion) => (
                <option key={promotion.id} value={promotion.id}>
                  {promotion.name} · {promotion.required_quantity} por {money(promotion.bundle_price)}
                </option>
              ))}
            </select>
          </label>
          <label>Familia olfativa<input value={family} onChange={(e) => setFamily(e.target.value)} placeholder="Ej. Amaderado" /></label>
          <label className="form-wide">Descripción<input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción del perfume" /></label>
        </div>
        <div className="image-upload-control">
          <label htmlFor="product-image-files">Imágenes del perfume <span>(hasta 3; JPG, PNG, WebP o AVIF · máximo 5 MB cada una)</span></label>
          <input
            id="product-image-files"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            onChange={(event) => {
              const selectedFiles = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              setImages((current) => {
                const next = [...current, ...selectedFiles];
                if (next.length > 3) setError("Puedes seleccionar hasta tres imágenes por perfume.");
                else setError(null);
                return next.slice(0, 3);
              });
            }}
            disabled={saving || images.length >= 3}
          />
          {images.length > 0 && (
            <ul className="selected-image-list">
              {images.map((file, index) => (
                <li key={`${file.name}-${index}`}>
                  <span>{index + 1}. {file.name}</span>
                  <button type="button" className="text-button" onClick={() => setImages((current) => current.filter((_, fileIndex) => fileIndex !== index))}>
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="variant-editor">
          <div className="variant-editor-head">
            <strong>Presentaciones y stock</strong>
            <button className="text-button" type="button" onClick={() => setVariants((current) => [...current, { size: "", price: "", cost: "", stock: "0" }])}>
              + Agregar presentación
            </button>
          </div>
          {variants.map((variant, index) => (
            <div className="variant-form-row" key={index}>
              <label>ML<input type="number" min="1" value={variant.size} onChange={(event) => setVariants((current) => current.map((item, i) => i === index ? { ...item, size: event.target.value } : item))} /></label>
              <label>Precio<input type="number" min="0" value={variant.price} onChange={(event) => setVariants((current) => current.map((item, i) => i === index ? { ...item, price: event.target.value } : item))} /></label>
              <label>Costo<input type="number" min="0" value={variant.cost} onChange={(event) => setVariants((current) => current.map((item, i) => i === index ? { ...item, cost: event.target.value } : item))} required /></label>
              <label>Stock<input type="number" min="0" value={variant.stock} onChange={(event) => setVariants((current) => current.map((item, i) => i === index ? { ...item, stock: event.target.value } : item))} /></label>
              <AdminButton tone="danger" variant="outline" compact type="button" aria-label="Quitar presentación" disabled={variants.length === 1} onClick={() => setVariants((current) => current.filter((_, i) => i !== index))}>
                <Trash2 size={16} />
              </AdminButton>
            </div>
          ))}
        </div>
        {(error || saveError) && <p className="form-error" role="alert">{error ?? saveError}</p>}
        <button className="primary full" disabled={saving} onClick={() => void save()}>{saving ? "Guardando..." : "Guardar producto"}</button>
      </div>
    </div>
  );
}

export default App;
