import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session, User as AuthUser } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { getBogotaDate, money } from "./lib/format";
import {
  getAdminSectionFromPath,
  pushAdminPath,
  pushStorePath,
  ADMIN_SECTIONS,
  ADMIN_SECTION_PATHS,
  ADMIN_SECTION_TITLES,
  type AdminSection,
} from "./lib/admin-routes";
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
  getPromotionMaxUnitCost,
  getPromotionNetBundle,
  getPromotions,
  isVariantPromotionEligible,
  productHasActivePromotion,
  savePromotion,
  togglePromotionActive,
  type Promotion,
  type PromotionInput,
} from "./services/promotions";
import {
  getAdminCustomers,
  getProductProfitability,
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
  getAdminSectionPermissions,
  getAllAdminSectionPermissions,
  setAdminSectionPermission,
  type AdminSectionPermission,
  type AdminCustomer,
  type AdminDashboardMetrics,
  type ProductProfitability,
  type AdminOrder,
  type AdminProfile,
  type SalesAdvisor,
} from "./services/admin";
import {
  getWasteSummary,
  type WasteRow,
} from "./services/credits";
import {
  getExpenses,
  getRecurringExpenses,
  createExpense,
  deleteRecurringExpense,
  deleteExpense,
  markRecurringExpensePaid,
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
import {
  PERIOD_PRESETS,
  customPeriod,
  resolvePeriod,
  toRpcArgs,
  validateRange,
  type PeriodPresetId,
} from "./services/report-periods";
import AdminButton from "./components/admin/AdminButton";
import EmptyState from "./components/admin/EmptyState";
import { Toaster, useToasts } from "./components/Toast";

// Solo el panel de administración necesita estos módulos: se cargan bajo demanda
// para que los visitantes de la tienda descarguen un bundle inicial más pequeño.
const CreditPage = lazy(() => import("./pages/admin/CreditPage"));
const CollectPage = lazy(() => import("./pages/admin/CollectPage"));
const DashboardPage = lazy(() => import("./pages/admin/DashboardPage"));
const ConfirmDialog = lazy(() => import("./components/admin/ConfirmDialog"));
const AdminDock = lazy(() => import("./components/admin/AdminDock"));
const MovementModal = lazy(() => import("./components/admin/MovementModal"));
const OrderEditorModal = lazy(() => import("./components/admin/OrderEditorModal"));
const OrdersPage = lazy(() => import("./pages/admin/OrdersPage"));
const SettingsPage = lazy(() => import("./pages/admin/SettingsPage"));
const PromotionsPage = lazy(() => import("./pages/admin/PromotionsPage"));
const PromotionVariantsModal = lazy(() => import("./components/admin/PromotionVariantsModal"));
const AdvisorsPage = lazy(() => import("./pages/admin/AdvisorsPage"));
const ExpensesPage = lazy(() => import("./pages/admin/ExpensesPage"));
const CustomersPage = lazy(() => import("./pages/admin/CustomersPage"));
const ProfilesPage = lazy(() => import("./pages/admin/ProfilesPage"));
const ReportsPage = lazy(() => import("./pages/admin/ReportsPage"));
const ProductsPage = lazy(() => import("./pages/admin/ProductsPage"));
import {
  DEFAULT_STORE_SETTINGS,
  getStoreSettings,
  type StoreSettings,
} from "./services/store-settings";
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Download,
  LayoutDashboard,
  Package,
  Plus,
  DollarSign,
  RefreshCw,
  Search,
  ReceiptText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  Wallet,
  Upload,
  User,
  UserCheck,
  Users,
  LogOut,
  X,
  MessageCircle,
  KanbanSquare,
} from "lucide-react";

type CartItem = {
  product: Product;
  variant: ProductVariant;
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

const productNameCollator = new Intl.Collator("es", { sensitivity: "base" });

function App() {
  const [view, setView] = useState<"store" | "admin">(
    () => getAdminSectionFromPath(window.location.pathname) ? "admin" : "store"
  );
  const [adminSection, setAdminSection] = useState<AdminSection>(
    () => getAdminSectionFromPath(window.location.pathname) ?? "overview"
  );
  const enterAdmin = useCallback((next?: AdminSection) => {
    const target = next ?? getAdminSectionFromPath(window.location.pathname) ?? "overview";
    setAdminSection(target);
    setView("admin");
    pushAdminPath(target);
  }, []);
  const goToStore = useCallback(() => {
    setView("store");
    pushStorePath();
  }, []);
  const navigateAdminSection = useCallback((next: AdminSection) => {
    setAdminSection(next);
    pushAdminPath(next);
  }, []);

  useEffect(() => {
    const handleRouteChange = () => {
      const nextSection = getAdminSectionFromPath(window.location.pathname);
      if (nextSection) {
        setAdminSection(nextSection);
        setView("admin");
      } else {
        setView("store");
      }
    };
    window.addEventListener("popstate", handleRouteChange);
    return () => window.removeEventListener("popstate", handleRouteChange);
  }, []);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userRole, setUserRole] = useState<"customer" | "admin" | "asesor" | null>(null);
  // `admin` y `asesor` pueden entrar al panel. Lo que puede VER dentro
  // lo decide la tabla de permisos por seccion, no el rol.
  const isStaff = userRole === "admin" || userRole === "asesor";
  const [authLoading, setAuthLoading] = useState(true);
  const [adminAccessPending, setAdminAccessPending] = useState(false);
  const [loginFeedback, setLoginFeedback] = useState<string | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [adminInventoryLoading, setAdminInventoryLoading] = useState(false);
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
  // La tienda necesita las promociones activas aunque el visitante no haya
  // abierto el panel: la sección de ofertas del catálogo se alimenta de aquí.
  useEffect(() => {
    if (!supabase || view !== "store") return;
    let active = true;
    void getPromotions()
      .then((loaded) => {
        if (active) setPromotions(loaded);
      })
      .catch((promotionsError: unknown) => {
        console.error("No se pudieron cargar las ofertas de la tienda:", promotionsError);
      });
    return () => {
      active = false;
    };
  }, [view]);
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
    document.title = view === "admin"
      ? `${ADMIN_SECTION_TITLES[adminSection]} · ${storeSettings.store_name}`
      : storeSettings.store_name;
  }, [view, adminSection, storeSettings.store_name]);

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
  const productModalRef = useRef<HTMLDivElement>(null);
  const cartDrawerRef = useRef<HTMLElement>(null);
  const storefrontDialogOpen = Boolean(selectedProduct) || cartOpen;

  useEffect(() => {
    if (!selectedProduct && !cartOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (cartOpen) {
          setCartOpen(false);
          return;
        }
        setSelectedProduct(null);
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = cartOpen ? cartDrawerRef.current : productModalRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedProduct, cartOpen]);

  useEffect(() => {
    if (!storefrontDialogOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [storefrontDialogOpen]);

  const [receiptOpen, setReceiptOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("Todas");
  const [category, setCategory] = useState("Todos");
  const [genderFilter, setGenderFilter] = useState("Todos");
  // "none" = sin filtro, "all" = cualquier producto en oferta y cualquier
  // otro valor es el id de una promoción concreta.
  const [offerFilter, setOfferFilter] = useState("none");
  const [catalogFiltersOpen, setCatalogFiltersOpen] = useState(false);
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
  // Secciones del panel que puede ver esta cuenta. `null` = todavia no
  // se consulto; un arreglo vacio = la cuenta no tiene ninguna seccion
  // asignada y el panel le muestra un aviso, no una pantalla en blanco.
  const [allowedSections, setAllowedSections] = useState<string[] | null>(null);
  // `allowedSections === null` significa dos cosas distintas: que
  // todavia no se consulto, o que el sistema de permisos no esta
  // disponible. El panel carga datos en el segundo caso, asi que hace
  // falta saber cual de los dos es.
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
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
        setUserRole(
          data?.role === "admin" ? "admin" : data?.role === "asesor" ? "asesor" : "customer"
        );
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
    if (isStaff) {
      enterAdmin();
      setShowLogin(false);
      setLoginFeedback(null);
    } else {
      setLoginFeedback("Esta cuenta es de cliente y no tiene permisos de administración.");
      setShowLogin(true);
    }
  }, [adminAccessPending, authLoading, user, userRole, isStaff, enterAdmin]);

  useEffect(() => {
    if (view !== "admin" || !isStaff) return;
    // Se espera a saber que secciones puede ver la cuenta antes de pedir
    // nada: pedir de mas hace que la base responda con un error.
    if (!permissionsLoaded) return;
    let active = true;
    setAdminError(null);
    const puedeVerProductos = allowedSections === null || allowedSections.includes("products");
    const puedeVerPromociones = allowedSections === null || allowedSections.includes("promotions");
    const pendientes: Promise<unknown>[] = [];
    if (puedeVerProductos) pendientes.push(getAdminProducts().then((data) => { if (active) setProducts(data); }));
    if (puedeVerPromociones) pendientes.push(getPromotions(true).then((loaded) => { if (active) setPromotions(loaded); }));

    if (pendientes.length === 0) {
      setAdminInventoryLoading(false);
      return;
    }

    setAdminInventoryLoading(true);
    void Promise.all(pendientes)
      .catch((loadError: unknown) => {
        console.error("No se pudo cargar el inventario administrativo:", loadError);
        if (active) setAdminError("No se pudieron cargar los datos del panel. Revisa la conexión.");
      })
      .finally(() => {
        if (active) setAdminInventoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [view, userRole, allowedSections, permissionsLoaded]);

  // Los permisos se cargan una vez que sabemos quien esta conectado.
  // Se vuelven a leer cuando el panel se abre, para que un cambio hecho
  // en Configuracion > Permisos se vea al volver a entrar.
  useEffect(() => {
    if (!isStaff || !user) {
      setAllowedSections(null);
      setPermissionsLoaded(false);
      return;
    }
    let active = true;
    void getAdminSectionPermissions(user.id)
      .then((rows) => {
        if (!active) return;
        setAllowedSections(rows.filter((row) => row.allowed).map((row) => row.section_id));
        setPermissionsLoaded(true);
      })
      .catch((loadError: unknown) => {
        console.error("No se pudieron cargar los permisos de la cuenta:", loadError);
        if (!active) return;
        // Si la tabla de permisos todavia no existe (la migracion no se ha
        // corrido), se deja entrar a todo el que tenga rol, como antes de
        // que existiera el sistema de permisos. Fallar cerrado ahi
        // dejaria al dueno fuera de su propio panel.
        //
        // Cualquier otro error si falla cerrado: es preferible que alguien
        // no vea de mas a que vea datos que no le tocan.
        const code = (loadError as { code?: string } | null)?.code;
        const mensaje = loadError instanceof Error ? loadError.message : "";
        const faltaLaTabla = code === "42P01" || code === "PGRST205"
          || /does not exist|schema cache/i.test(mensaje);
        setAllowedSections(faltaLaTabla ? null : []);
        setPermissionsLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [isStaff, user?.id]);

  const requestAdminAccess = () => {
    setAdminAccessPending(true);
    setLoginFeedback(null);
    if (!supabase) {
      setLoginFeedback("Configura Supabase para habilitar el acceso administrativo.");
      setAdminAccessPending(false);
      setShowLogin(true);
      return;
    }
    if (user && isStaff) {
      setAdminAccessPending(false);
      enterAdmin();
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
      const matchesCategory = category === "Todos" || p.category === category;
      const matchesGender = genderFilter === "Todos" || p.gender === genderFilter;
      const matchesOffer = offerFilter === "none"
        || (offerFilter === "all"
          ? productHasActivePromotion(p)
          : productHasActivePromotion(p) && p.promotion?.id === offerFilter);
      return matchesSearch && matchesBrand && matchesCategory && matchesGender && matchesOffer;
    });
  }, [products, search, brandFilter, category, genderFilter, offerFilter]);
  const heroProduct = useMemo(() => {
    const candidates = products.filter((product) =>
      product.active !== false
      && product.variants.some((variant) => variant.stock > 0)
      && Boolean(product.images?.[0] ?? product.image)
    );
    return candidates.find((product) => product.featured) ?? candidates[0] ?? null;
  }, [products]);
  const heroProductPrice = heroProduct
    ? Math.min(...heroProduct.variants.filter((variant) => variant.stock > 0).map((variant) => variant.price))
    : 0;
  const availableBrands = useMemo(
    () => [...new Set(products.filter((product) => product.active !== false).map((product) => product.brand))]
      .sort((a, b) => a.localeCompare(b, "es")),
    [products]
  );
  // Se combinan las promociones cargadas y las que ya vienen incluidas en
  // cada producto para que una oferta no desaparezca si la consulta pública
  // de promociones falla o llega después que el catálogo.
  const activePromotions = useMemo(() => {
    const seen = new Set<string>();
    const result: Promotion[] = [];
    for (const promotion of [...promotions, ...products.map((product) => product.promotion)]) {
      if (!promotion?.active || seen.has(promotion.id)) continue;
      seen.add(promotion.id);
      result.push(promotion);
    }
    return result;
  }, [promotions, products]);
  const promotionProductCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const product of products) {
      if (product.active === false || product.variants.length === 0) continue;
      if (!product.promotion?.active || !productHasActivePromotion(product)) continue;
      counts[product.promotion.id] = (counts[product.promotion.id] ?? 0) + 1;
    }
    return counts;
  }, [products]);
  const offerProductCount = useMemo(
    () => Object.values(promotionProductCounts).reduce((sum, count) => sum + count, 0),
    [promotionProductCounts]
  );
  const activeFilterCount = [
    brandFilter !== "Todas",
    category !== "Todos",
    genderFilter !== "Todos",
    offerFilter !== "none",
  ].filter(Boolean).length;
  const selectedPromotion = offerFilter !== "none" && offerFilter !== "all"
    ? activePromotions.find((promotion) => promotion.id === offerFilter)
    : null;
  const clearCatalogFilters = () => {
    setBrandFilter("Todas");
    setCategory("Todos");
    setGenderFilter("Todos");
    setOfferFilter("none");
  };
  const cartPrice = useMemo(() => calculatePromotionPrice(cart.map((item) => ({
    productId: item.product.id,
    promotionId: item.product.promotion_id ?? null,
    promotion: item.product.promotion,
    promotionEligible: isVariantPromotionEligible(item.product, item.variant),
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
  const selectedVariantHasPromotion = selectedProduct && selectedVariant
    ? isVariantPromotionEligible(selectedProduct, selectedVariant)
    : false;
  const selectedProductHasPromotion = selectedProduct
    ? productHasActivePromotion(selectedProduct)
    : false;

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
    setSelectedProduct(null);
  };

  const total = cartPrice.total;

  return (
    <div className="app">
      {view === "store" ? (
        <>
          <header className="topbar">
            <button
              className="mobile-menu"
              type="button"
              aria-label="Ir a los filtros del catálogo"
              onClick={() => {
                setCatalogFiltersOpen(true);
                requestAnimationFrame(() => {
                  document.getElementById("catalogo")?.scrollIntoView({
                    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
                    block: "start",
                  });
                });
              }}
            >
              <SlidersHorizontal size={19} aria-hidden="true" />
            </button>
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
                <Search size={17} aria-hidden="true" />
                <input
                  type="search"
                  name="buscar"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar"
                  aria-label="Buscar perfumes"
                  enterKeyHint="search"
                  autoComplete="off"
                />
              </div>
              <button
                type="button"
                title="Cuenta"
                aria-label={user ? "Mi cuenta" : "Iniciar sesión"}
                onClick={() => user ? setShowAccount(true) : setShowLogin(true)}
              >
                <User size={19} aria-hidden="true" />
              </button>
              <button
                type="button"
                title="Carrito"
                aria-label={`Carrito${cart.length > 0 ? `, ${cart.length} producto${cart.length === 1 ? "" : "s"}` : ""}`}
                aria-haspopup="dialog"
                onClick={() => setCartOpen(true)}
                className="cart-button"
              >
                <ShoppingBag size={19} aria-hidden="true" />
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
              <div className="hero-visual">
                {heroProduct ? (
                  <button
                    type="button"
                    className="hero-product"
                    onClick={() => openProduct(heroProduct)}
                    aria-label={`Ver ${heroProduct.brand} ${heroProduct.name}, desde ${money(heroProductPrice)}`}
                  >
                    <img
                      src={heroProduct.image || heroProduct.images?.[0]}
                      alt={`${heroProduct.brand} ${heroProduct.name}`}
                      fetchPriority="high"
                      decoding="async"
                    />
                    {heroProduct.featured && (
                      <span className="hero-product-badge">Destacado</span>
                    )}
                    <span className="hero-product-caption">
                      <span className="hero-product-copy">
                        <small>{heroProduct.brand}</small>
                        <strong>{heroProduct.name}</strong>
                        <span className="hero-product-price">Desde {money(heroProductPrice)}</span>
                      </span>
                      <ArrowUpRight className="hero-product-arrow" size={18} aria-hidden="true" />
                    </span>
                  </button>
                ) : (
                  <div className="hero-card">
                    <Sparkles size={24} aria-hidden="true" />
                    <strong>Compra sencilla</strong>
                    <span>Elige tu perfume, presentación y recibimos tu pedido por WhatsApp.</span>
                  </div>
                )}
              </div>
            </section>

            <section id="catalogo" className="catalog-section">
              <div className="section-head">
                <div>
                  <p className="eyebrow">CATÁLOGO</p>
                  <h2>Perfumes destacados</h2>
                </div>
                <span>
                  {filteredProducts.length} producto{filteredProducts.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="catalog-layout">
                <aside className="catalog-sidebar" aria-label="Filtros del catálogo">
                  <div className={catalogFiltersOpen ? "catalog-filter-panel open" : "catalog-filter-panel"}>
                    <button
                      type="button"
                      className="catalog-filter-toggle"
                      aria-expanded={catalogFiltersOpen}
                      aria-controls="catalog-filter-body"
                      onClick={() => setCatalogFiltersOpen((open) => !open)}
                    >
                      <span><SlidersHorizontal size={16} /> Filtros</span>
                      <span className="catalog-filter-toggle-state">
                        {activeFilterCount > 0
                          ? `${activeFilterCount} activo${activeFilterCount === 1 ? "" : "s"}`
                          : "Ver filtros"}
                        <ChevronDown size={16} />
                      </span>
                    </button>

                    <div className="catalog-filter-body" id="catalog-filter-body">
                      <div className="catalog-filter-heading">
                        <strong>Refinar búsqueda</strong>
                        {activeFilterCount > 0 && (
                          <button type="button" onClick={clearCatalogFilters}>Limpiar</button>
                        )}
                      </div>

                      <div className="filter-group">
                        <span className="filter-label" id="filtro-categoria">Categoría</span>
                        <div className="filter-choice-list" role="group" aria-labelledby="filtro-categoria">
                          {["Todos", "Diseñador", "Árabes", "Nicho"].map((item) => (
                            <button
                              key={item}
                              type="button"
                              className={category === item ? "filter-choice active" : "filter-choice"}
                              aria-pressed={category === item}
                              onClick={() => setCategory(item)}
                            >
                              {item}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="filter-group">
                        <span className="filter-label" id="filtro-marca">Marca</span>
                        <select
                          className="catalog-brand-select"
                          name="marca"
                          value={brandFilter}
                          aria-labelledby="filtro-marca"
                          onChange={(event) => setBrandFilter(event.target.value)}
                        >
                          <option value="Todas">Todas las marcas</option>
                          {availableBrands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
                        </select>
                      </div>

                      <div className="filter-group">
                        <span className="filter-label" id="filtro-para">Para</span>
                        <div className="filter-choice-list" role="group" aria-labelledby="filtro-para">
                          {["Todos", "Hombres", "Mujeres", "Unisex"].map((item) => (
                            <button
                              key={item}
                              type="button"
                              className={genderFilter === item ? "filter-choice active" : "filter-choice"}
                              aria-pressed={genderFilter === item}
                              onClick={() => setGenderFilter(item)}
                            >
                              {item}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="filter-group filter-offers">
                        <div className="filter-offers-heading">
                          <span className="filter-label" id="filtro-ofertas">Ofertas</span>
                          <span className="filter-offers-count">{activePromotions.length}</span>
                        </div>
                        <div className="filter-offer-list" role="group" aria-labelledby="filtro-ofertas">
                          {activePromotions.length === 0 ? (
                            <p className="filter-offers-empty">No hay ofertas activas por ahora.</p>
                          ) : (
                            <>
                              <button
                                type="button"
                                className={offerFilter === "all" ? "offer-option active" : "offer-option"}
                                aria-pressed={offerFilter === "all"}
                                onClick={() => setOfferFilter(offerFilter === "all" ? "none" : "all")}
                              >
                                <span className="offer-option-name">Todas las ofertas</span>
                                <span className="offer-option-meta">
                                  {offerProductCount} producto{offerProductCount === 1 ? "" : "s"} en promoción
                                </span>
                              </button>
                              {activePromotions.map((promotion) => {
                                const productCount = promotionProductCounts[promotion.id] ?? 0;
                                return (
                                  <button
                                    key={promotion.id}
                                    type="button"
                                    className={offerFilter === promotion.id ? "offer-option active" : "offer-option"}
                                    aria-pressed={offerFilter === promotion.id}
                                    onClick={() => setOfferFilter(
                                      offerFilter === promotion.id ? "none" : promotion.id
                                    )}
                                  >
                                    <span className="offer-option-name">{promotion.name}</span>
                                    <span className="offer-option-deal">
                                      {promotion.required_quantity} por {money(promotion.bundle_price)}
                                    </span>
                                    <span className="offer-option-meta">
                                      {productCount > 0
                                        ? `${productCount} producto${productCount === 1 ? "" : "s"}`
                                        : "Sin productos asociados"}
                                      {promotion.allow_mixed ? " · Combinable" : ""}
                                    </span>
                                  </button>
                                );
                              })}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </aside>

                <div className="catalog-results">
                  {activeFilterCount > 0 && (
                    <div className="catalog-active-filters" aria-label="Filtros activos">
                      {brandFilter !== "Todas" && (
                        <button type="button" onClick={() => setBrandFilter("Todas")}>
                          Marca: {brandFilter} <X size={12} />
                        </button>
                      )}
                      {category !== "Todos" && (
                        <button type="button" onClick={() => setCategory("Todos")}>
                          {category} <X size={12} />
                        </button>
                      )}
                      {genderFilter !== "Todos" && (
                        <button type="button" onClick={() => setGenderFilter("Todos")}>
                          Para: {genderFilter} <X size={12} />
                        </button>
                      )}
                      {offerFilter !== "none" && (
                        <button type="button" onClick={() => setOfferFilter("none")}>
                          {offerFilter === "all"
                            ? "Todas las ofertas"
                            : selectedPromotion?.name ?? "Oferta"} <X size={12} />
                        </button>
                      )}
                      <button type="button" className="active-filter-clear" onClick={clearCatalogFilters}>
                        Limpiar filtros
                      </button>
                    </div>
                  )}

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
                      const hasPromotion = productHasActivePromotion(product);
                      const cardVariantHasPromotion = isVariantPromotionEligible(product, cardVariant);
                      return (
                        <article className="product-card" key={product.id}>
                          <button
                            type="button"
                            className="product-image"
                            onClick={() => openProduct(product)}
                            aria-label={`Ver ${product.brand} ${product.name}`}
                          >
                            <img src={product.image} alt={product.name} loading="lazy" decoding="async" />
                            {firstAvailable.stock <= 0 && (
                              <span className="sold-out">Agotado</span>
                            )}
                            {hasPromotion && <span className="promotion-badge">Oferta</span>}
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
                            {hasPromotion && (
                              <span className="promotion-card-copy">
                                {cardVariantHasPromotion && product.promotion
                                  ? `${product.promotion.required_quantity} por ${money(product.promotion.bundle_price)}${product.promotion.allow_mixed ? " · combinables" : " · mismo perfume"}`
                                  : "Oferta disponible en otra presentación"}
                              </span>
                            )}
                            <div className="product-card-actions">
                              <button
                                type="button"
                                className="text-button"
                                onClick={() => openProduct(product)}
                                aria-label={`Ver detalles de ${product.name}`}
                              >
                                Ver producto →
                              </button>
                              <button
                                type="button"
                                className="quick-add-button"
                                disabled={cardVariant.stock <= 0}
                                onClick={() => addVariantToCart(product, cardVariant)}
                                aria-label={`Agregar ${product.name} ${cardVariant.size} ml al pedido`}
                              >
                                <Plus size={15} aria-hidden="true" /> Agregar
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          </main>

          {selectedProduct && (
            <div
              className="overlay storefront-overlay"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setSelectedProduct(null);
              }}
            >
              <div
                ref={productModalRef}
                className="product-modal"
                role="dialog"
                aria-modal="true"
                aria-label={`${selectedProduct.brand} ${selectedProduct.name}`}
              >
                <button
                  type="button"
                  className="close"
                  onClick={() => setSelectedProduct(null)}
                  aria-label="Cerrar ficha del producto"
                  autoFocus
                >
                  <X aria-hidden="true" />
                </button>
                <div className="product-detail-image">
                  <img
                    src={selectedProduct.images?.[selectedImageIndex] ?? selectedProduct.image}
                    alt={`${selectedProduct.name}, imagen ${selectedImageIndex + 1}`}
                    decoding="async"
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
                          <img src={image} alt="" loading="lazy" decoding="async" />
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
                  {selectedVariantHasPromotion && selectedProduct.promotion && (
                    <p className="promotion-detail-copy">
                      Oferta: {selectedProduct.promotion.required_quantity} por{" "}
                      {money(selectedProduct.promotion.bundle_price)}
                      {selectedProduct.promotion.allow_mixed ? " · puedes combinar referencias" : " · mismo perfume"}
                    </p>
                  )}
                  {selectedProductHasPromotion && !selectedVariantHasPromotion && (
                    <p className="promotion-detail-copy muted">
                      La oferta aplica solo a las presentaciones participantes de este perfume.
                    </p>
                  )}
                  <p className="description">{selectedProduct.description}</p>
                  <div className="product-rating">
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
                  </div>

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

                  {/* En movil esta barra queda fija al pie del modal: el precio y el
                      boton conviven y se compra sin scrollear hasta el
                      final de una ficha larga. */}
                  <div className="buy-bar">
                    <div className="buy-bar-price">
                      <span>Total</span>
                      <strong>{selectedVariant ? money(selectedVariant.price) : "—"}</strong>
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
            </div>
          )}

          {cartOpen && (
            <div
              className="overlay storefront-overlay"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setCartOpen(false);
              }}
            >
              <aside
                ref={cartDrawerRef}
                className="cart-drawer"
                role="dialog"
                aria-modal="true"
                aria-label="Tu pedido"
              >
                <div className="drawer-head">
                  <div>
                    <p className="eyebrow">PEDIDO</p>
                    <h2>Tu selección</h2>
                  </div>
                  <button
                    type="button"
                    className="close-small"
                    onClick={() => setCartOpen(false)}
                    aria-label="Cerrar pedido"
                    autoFocus
                  >
                    <X aria-hidden="true" />
                  </button>
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
                          <img src={item.product.image} alt="" loading="lazy" decoding="async" />
                          <div>
                            <strong>{item.product.name}</strong>
                            <span>{item.variant.size} ml</span>
                            <label className="cart-quantity-control">
                              <span>Unidades</span>
                              <input
                                type="number"
                                name={`unidades-${item.variant.id}`}
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
            {isStaff && (
              <a href="#" onClick={(e) => { e.preventDefault(); requestAdminAccess(); }}>
                Administración
              </a>
            )}
          </footer>
        </>
      ) : isStaff ? (
        <Admin
          section={adminSection}
          onSectionChange={navigateAdminSection}
          products={products}
          adminInventoryLoading={adminInventoryLoading}
          storeSettings={storeSettings}
          storeSettingsError={storeSettingsError}
          onStoreSettingsSaved={(settings) => {
            setStoreSettings(settings);
            setStoreSettingsError(null);
          }}
          promotions={promotions}
          onPromotionsChange={setPromotions}
          currentUserId={user?.id ?? ""}
          allowedSections={allowedSections}
          permissionsLoaded={permissionsLoaded}
          onImportProducts={handleProductImport}
          onEditProduct={handleProductEdit}
          onDeleteProduct={handleProductDelete}
          savingProductEdit={savingProductEdit}
          deletingProductId={deletingProductId}
          onVariantCostChange={handleVariantCostChange}
          savingCostVariantId={savingCostVariantId}
          onVariantStockChange={handleVariantStockChange}
          savingStockVariantId={savingStockVariantId}
            onDeletingProductIdChange={setDeletingProductId}
          onBack={() => {
            goToStore();
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
            goToStore();
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
          <button className="secondary full" onClick={goToStore}>Volver a la tienda</button>
        </main>
      )}

      {showAddProduct && (
        <AddProductModal
          onClose={() => setShowAddProduct(false)}
          onSave={handleProductSave}
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
          isAdmin={isStaff}
          canOpenCrm={userRole === "admin" && (allowedSections === null || allowedSections.includes("crm"))}
          onClose={() => setShowAccount(false)}
          onOpenAdmin={() => {
            setShowAccount(false);
            enterAdmin();
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
            goToStore();
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
  section: requestedSection,
  onSectionChange,
  products,
  adminInventoryLoading,
  storeSettings,
  storeSettingsError,
  onStoreSettingsSaved,
  promotions,
  onPromotionsChange,
  onProductsRefresh,
  currentUserId,
  allowedSections,
  permissionsLoaded,
  onImportProducts,
  onEditProduct,
  onDeleteProduct,
  savingProductEdit,
  deletingProductId,
  onVariantCostChange,
  savingCostVariantId,
  onVariantStockChange,
  savingStockVariantId,
  onDeletingProductIdChange,
  onBack,
  onAdd,
  onProductActiveChange,
  updatingProductId,
  onConfirm,
  error,
  onSignOut,
}: {
  section: AdminSection;
  onSectionChange: (section: AdminSection) => void;
  products: Product[];
  adminInventoryLoading: boolean;
  storeSettings: StoreSettings;
  storeSettingsError: string | null;
  onStoreSettingsSaved: (settings: StoreSettings) => void;
  promotions: Promotion[];
  onPromotionsChange: (promotions: Promotion[]) => void;
  onProductsRefresh: () => Promise<void>;
  currentUserId: string;
  /**
   * Secciones del panel que esta cuenta puede ver. `null` = todavia no
   * se consulto. Un arreglo vacio = la cuenta no tiene ninguna.
   */
  allowedSections: string[] | null;
  /** `true` cuando ya se consultaron los permisos (o cuando no hay sistema). */
  permissionsLoaded: boolean;
  onImportProducts: (items: ImportedProduct[]) => Promise<{ imported: number; failures: string[] }>;
  onEditProduct: (product: Product, imageFiles: File[]) => Promise<void>;
  onDeleteProduct: (product: Product) => Promise<"deleted" | "archived">;
  savingProductEdit: boolean;
  deletingProductId: string | null;
  onVariantCostChange: (variantId: string, cost: number) => Promise<void>;
  savingCostVariantId: string | null;
  onVariantStockChange: (variantId: string, stock: number) => Promise<void>;
  savingStockVariantId: string | null;
  onDeletingProductIdChange: (id: string | null) => void;
  onBack: () => void;
  onAdd: () => void;
  onProductActiveChange: (product: Product) => void;
  updatingProductId: string | null;
  onConfirm: (config: { title: string; message: string; onConfirm: () => void }) => void;
  error: string | null;
  onSignOut: () => void;
}) {
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
  /** Periodo del reporte semanal/mensual. Por defecto, la semana pasada. */
  // "custom" aparece cuando el usuario escribe las fechas a mano.
  const [reportPeriodId, setReportPeriodId] = useState<PeriodPresetId | "custom">("last-week");
  const [reportRangeError, setReportRangeError] = useState<string | null>(null);
  const [reportCustomFrom, setReportCustomFrom] = useState(() => {
    const p = resolvePeriod("last-week");
    return p.from;
  });
  const [reportCustomTo, setReportCustomTo] = useState(() => {
    const p = resolvePeriod("last-week");
    return p.to;
  });
  // Se valida mientras se escribe, para no obligar a generar un reporte
  // entero para enterarse de que el rango estaba al revés.
  useEffect(() => {
    setReportRangeError(validateRange(reportCustomFrom, reportCustomTo));
  }, [reportCustomFrom, reportCustomTo]);
  const [reportResult, setReportResult] = useState<{
    whatsappUrl: string;
    emailSent: boolean;
    emailError: string | null;
    label: string;
  } | null>(null);
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  /** Rango del dashboard: null = acumulado historico. */
  const [metricsPeriod, setMetricsPeriod] = useState<7 | 30 | 90 | null>(30);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [sectionPermissions, setSectionPermissions] = useState<AdminSectionPermission[]>([]);
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
  const [productPriceFilter, setProductPriceFilter] = useState({
    costMin: "",
    costMax: "",
    priceMin: "",
    priceMax: "",
  });
  const [importingProducts, setImportingProducts] = useState(false);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const productImportInput = useRef<HTMLInputElement>(null);
  const [importingCustomers, setImportingCustomers] = useState(false);
  const [customerImportFeedback, setCustomerImportFeedback] = useState<string | null>(null);
  const [customerImportError, setCustomerImportError] = useState<string | null>(null);
  const customerImportInput = useRef<HTMLInputElement>(null);
  const [dashboardDetail, setDashboardDetail] = useState<"sold-out" | "low-stock" | "pending" | "profitability" | null>(null);
  // Rentabilidad por producto. Se pide solo si el usuario abre el detalle:
  // es una consulta pesada y el dashboard no siempre la necesita.
  const [profitability, setProfitability] = useState<ProductProfitability | null>(null);
  const [profitabilityLoading, setProfitabilityLoading] = useState(false);
  const [profitabilityError, setProfitabilityError] = useState<string | null>(null);
  // Merma: cuanto se perdio, no solo cuantas unidades faltaron. Se carga
  // junto con el resto del dashboard porque son pocas filas.
  const [wasteDays] = useState(30);
  const [waste, setWaste] = useState<WasteRow[] | null>(null);
  const [wasteLoading, setWasteLoading] = useState(true);
  const [wasteError, setWasteError] = useState<string | null>(null);
  const [showPendingOrdersOnly, setShowPendingOrdersOnly] = useState(false);
  const [orderEditor, setOrderEditor] = useState<{ order: AdminOrder | null } | null>(null);
  const [orderSaving, setOrderSaving] = useState(false);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [movementEditor, setMovementEditor] = useState<{ productId: string; variant: { id: string; size: number; stock: number } } | null>(null);
  /**
   * Acción pendiente de confirmar. Reemplaza a `window.confirm()`, que
   * está prohibido en .agents/ux-experience.agents.md: sus botones son
   * nativos del sistema, no se pueden estilizar y en móvil tapan la
   * pantalla sin poder cerrarse con Escape.
   */
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    run: () => Promise<void>;
  } | null>(null);

  /** Borra el producto. Se ejecuta desde el diálogo de confirmación. */
  const deleteProductConfirmed = async (product: Product) => {
    setProductActionFeedback(null);
    setProductActionError(null);
    onDeletingProductIdChange(product.id);
    try {
      const result = await onDeleteProduct(product);
      setProductActionFeedback(
        result === "archived"
          ? `${product.brand} ${product.name} se archivó y se quitó de los productos activos.`
          : `${product.brand} ${product.name} se eliminó.`
      );
    } catch (deleteError) {
      setProductActionError(deleteError instanceof Error
        ? deleteError.message
        : "No se pudo eliminar el producto. Revisa los permisos de administrador y la conexión con Supabase.");
    } finally {
      onDeletingProductIdChange(null);
    }
  };
  const [promotionEditor, setPromotionEditor] = useState<Promotion | null | "new">(null);
  const [promotionVariantsEditor, setPromotionVariantsEditor] = useState<Promotion | null>(null);
  const [promotionSaving, setPromotionSaving] = useState(false);
  const [promotionFeedback, setPromotionFeedback] = useState<string | null>(null);
  const [productActionFeedback, setProductActionFeedback] = useState<string | null>(null);
  const [productActionError, setProductActionError] = useState<string | null>(null);
  const [showArchivedProducts, setShowArchivedProducts] = useState(false);
  const archivedProductsCount = products.filter((product) => product.archived).length;
  const parseProductFilterAmount = (value: string): number | null => {
    const normalized = value.trim();
    if (!normalized) return null;
    const amount = Number(normalized);
    return Number.isFinite(amount) ? amount : null;
  };
  const costMinFilter = parseProductFilterAmount(productPriceFilter.costMin);
  const costMaxFilter = parseProductFilterAmount(productPriceFilter.costMax);
  const priceMinFilter = parseProductFilterAmount(productPriceFilter.priceMin);
  const priceMaxFilter = parseProductFilterAmount(productPriceFilter.priceMax);
  const hasCostFilter = costMinFilter !== null || costMaxFilter !== null;
  const hasPriceFilter = priceMinFilter !== null || priceMaxFilter !== null;
  const hasProductPriceFilter = hasCostFilter || hasPriceFilter;
  const clearProductPriceFilter = () => setProductPriceFilter({
    costMin: "",
    costMax: "",
    priceMin: "",
    priceMax: "",
  });
  const updateProductPriceFilter = (field: keyof typeof productPriceFilter, value: string) => {
    setProductPriceFilter((current) => ({ ...current, [field]: value }));
  };
  const visibleProducts = products.filter((product) => {
    if (Boolean(product.archived) !== showArchivedProducts) return false;
    if (!`${product.brand} ${product.name} ${product.sku ?? ""}`.toLowerCase().includes(productSearch.toLowerCase())) return false;
    if (!showArchivedProducts && productStockFilter !== "all") {
      const matchesStock = productStockFilter === "available"
        ? product.variants.some((variant) => variant.stock > 0)
        : product.variants.length > 0 && product.variants.every((variant) => variant.stock <= 0);
      if (!matchesStock) return false;
    }
    if (!showArchivedProducts && hasCostFilter) {
      const matchesCost = product.variants.some((variant) =>
        variant.cost != null &&
        (costMinFilter === null || variant.cost >= costMinFilter) &&
        (costMaxFilter === null || variant.cost <= costMaxFilter)
      );
      if (!matchesCost) return false;
    }
    if (!showArchivedProducts && hasPriceFilter) {
      const matchesPrice = product.variants.some((variant) =>
        (priceMinFilter === null || variant.price >= priceMinFilter) &&
        (priceMaxFilter === null || variant.price <= priceMaxFilter)
      );
      if (!matchesPrice) return false;
    }
    return true;
  }).sort((left, right) =>
    productNameCollator.compare(left.name, right.name) ||
    productNameCollator.compare(left.brand, right.brand)
  );
  const totalStock = products.reduce(
    (sum, p) => sum + (p.archived ? 0 : p.variants.reduce((s, v) => s + v.stock, 0)),
    0
  );
  // Ticket promedio: cuanto entra por venta cobrada.
  const avgTicket = metrics && metrics.completed_sales > 0
    ? Number(metrics.sales_revenue) / metrics.completed_sales
    : 0;
  const stockTrackedProducts = products.filter((product) => !product.archived && product.active !== false);
  const lowStock = stockTrackedProducts.flatMap((product) =>
    product.variants.filter((variant) =>
      variant.active !== false &&
      variant.stock > 0 &&
      variant.stock <= (variant.minStock ?? 2)
    )
  ).length;
  // La merma se carga una vez al entrar al dashboard: son pocas filas y es el
  // dato que responde "por que el stock no cuadra".
  useEffect(() => {
    let cancelled = false;
    void getWasteSummary(wasteDays)
      .then((rows) => {
        if (!cancelled) setWaste(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setWasteError(err instanceof Error ? err.message : "No se pudo calcular la merma.");
        }
      })
      .finally(() => {
        if (!cancelled) setWasteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wasteDays]);

  // La rentabilidad se pide al abrir el detalle, no siempre: es una consulta
// que cruza todos los pedidos del periodo y el dashboard no la necesita para
// pintar las metricas.
  useEffect(() => {
    if (dashboardDetail !== "profitability" || profitability) return;
    let cancelled = false;
    setProfitabilityLoading(true);
    setProfitabilityError(null);
    void getProductProfitability(metricsPeriod)
      .then((data) => {
        if (!cancelled) setProfitability(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setProfitabilityError(err instanceof Error ? err.message : "No se pudo cargar la rentabilidad.");
        }
      })
      .finally(() => {
        if (!cancelled) setProfitabilityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dashboardDetail, metricsPeriod, profitability]);

  const soldOut = stockTrackedProducts.filter((product) => {
    const activeVariants = product.variants.filter((variant) => variant.active !== false);
    return activeVariants.length > 0 && activeVariants.every((variant) => variant.stock <= 0);
  }).length;
  const sections = [
    { id: "overview", title: "Dashboard", icon: <LayoutDashboard size={17} /> },
    { id: "products", title: "Productos", icon: <Package size={17} /> },
    { id: "promotions", title: "Promociones", icon: <Tag size={17} /> },
    { id: "transactions", title: "Pedidos", icon: <ReceiptText size={17} /> },
    { id: "collect", title: "Cobrar", icon: <MessageCircle size={17} /> },
    { id: "credit", title: "Cartera", icon: <DollarSign size={17} /> },
    { id: "customers", title: "Clientes", icon: <Users size={17} /> },
    // El CRM es una app aparte servida en `/crm`, no una sección de este panel:
    // se abre en otra pestaña en vez de renderizarse dentro del admin.
    { id: "crm", title: "CRM", icon: <KanbanSquare size={17} />, external: true },
    { id: "expenses", title: "Gastos", icon: <Wallet size={17} /> },
    { id: "advisors", title: "Asesores", icon: <UserCheck size={17} /> },
    { id: "reports", title: "Reportes", icon: <BarChart3 size={17} /> },
    { id: "profiles", title: "Perfiles", icon: <ShieldCheck size={17} /> },
    { id: "settings", title: "Configuración", icon: <Settings size={17} /> },
  ] as const;

  // OJO: esta lista tiene que coincidir con la tabla `admin_sections` de
  // la migracion 20261019100000_admin_section_permissions.sql. Si
  // agregas una seccion aqui, agregala tambien alla o esa seccion no se
  // podra repartir entre los usuarios.

  // Secciones que esta cuenta puede ver. Mientras los permisos cargan
  // (`null`) se muestran todas, para que el panel no aparezca vacio un
  // instante y luego se llene.
  const visibleSections = allowedSections === null
    ? sections
    : sections.filter((item) => allowedSections.includes(item.id));

  // La seccion activa nunca puede ser una que la cuenta no puede ver.
  // Si le quitan el permiso mientras la tiene abierta, cae a la primera
  // que si puede ver.
  const section: AdminSection = visibleSections.some((item) => item.id === requestedSection)
    ? requestedSection
    : (visibleSections.find((item) => item.id !== "crm")?.id as AdminSection | undefined) ?? "overview";

  // Si alguien entra por una URL que no puede ver, se reemplaza por la
  // primera seccion permitida. Asi la barra de direcciones nunca queda
  // mostrando una pagina que la cuenta tiene bloqueada.
  useEffect(() => {
    if (!permissionsLoaded || allowedSections === null) return;
    if (allowedSections.includes(requestedSection)) return;
    const fallback = ADMIN_SECTIONS.find((id) => allowedSections.includes(id));
    if (fallback) onSectionChange(fallback);
  }, [permissionsLoaded, allowedSections, requestedSection, onSectionChange]);

  const setSection = (next: AdminSection) => {
    if (allowedSections !== null && !allowedSections.includes(next)) return;
    onSectionChange(next);
  };

  useEffect(() => {
    setSearch("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [section]);

  // Booleano y no el arreglo: el efecto de carga depende de este valor,
  // y si dependiera del arreglo se re-dispararia solo, porque cada
  // consulta devuelve un arreglo nuevo y eso cambia la identidad.
  const hasNoSections = allowedSections !== null && allowedSections.length === 0;

  useEffect(() => {
    let active = true;
    const loadSection = async () => {
      // Una cuenta sin secciones no carga datos: no hay nada que
      // mostrar y no tiene sentido pedir el dashboard entero.
      if (hasNoSections) {
        setSectionLoading(false);
        setSectionError(null);
        return;
      }
      // Antes de los permisos no se pide nada: la base todavia no sabe
      // que puede ver esta cuenta y responderia con un error.
      if (!permissionsLoaded) {
        setSectionLoading(false);
        setSectionError(null);
        return;
      }
      if (section === "products") {
        setSectionLoading(false);
        setSectionError(null);
        return;
      }
      if (section === "settings") {
        // Configuracion carga tambien la seccion de Permisos, que
        // necesita el listado de cuentas y sus permisos por seccion.
        try {
          const [profilesResult, permissionsResult] = await Promise.all([
            getAdminProfiles(),
            getAllAdminSectionPermissions(),
          ]);
          if (active) {
            setProfiles(profilesResult);
            setSectionPermissions(permissionsResult);
          }
        } catch (loadError) {
          console.error("No se pudieron cargar los permisos:", loadError);
          if (active) setSectionError("No se pudieron cargar los permisos de las cuentas.");
        }
        setSectionLoading(false);
        setSectionError(null);
        return;
      }
      setSectionLoading(true);
      setSectionError(null);
      try {
        if (section === "overview") {
          const [metricsResult, ordersResult, advisorsResult] = await Promise.all([
            getAdminDashboardMetrics(metricsPeriod),
            getAdminOrders(),
            getSalesAdvisors(),
          ]);
          if (active) {
            setMetrics(metricsResult);
            const advisorMap = new Map(advisorsResult.map((a) => [a.id, a.full_name]));
            const enrichedOrders = ordersResult.map((order) => ({
              ...order,
              sales_advisor_name: order.sales_advisor_name || (order.sales_advisor_id ? advisorMap.get(order.sales_advisor_id) ?? null : null),
            }));
            setOrders(enrichedOrders);
          }
        } else if (section === "transactions") {
          const [ordersResult, customersResult, advisorsResult] = await Promise.all([
            getAdminOrders(),
            getAdminCustomers(),
            getSalesAdvisors(),
          ]);
          if (active) {
            const advisorMap = new Map(advisorsResult.map((a) => [a.id, a.full_name]));
            const enrichedOrders = ordersResult.map((order) => ({
              ...order,
              sales_advisor_name: order.sales_advisor_name || (order.sales_advisor_id ? advisorMap.get(order.sales_advisor_id) ?? null : null),
            }));
            setOrders(enrichedOrders);
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
  }, [section, sectionRevision, metricsPeriod, hasNoSections, permissionsLoaded]);

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

    // El diario es un solo dia. El resto usa el periodo elegido.
    let requestBody: Record<string, unknown> = {};
    let periodLabel = "semanal";
    if (dailyReportDate) {
      requestBody = { report_date: dailyReportDate };
      periodLabel = `diario del ${dailyReportDate}`;
    } else {
      const rangeError = validateRange(reportCustomFrom, reportCustomTo);
      if (rangeError) {
        setReportError(rangeError);
        setReportLoading(false);
        return;
      }
      const period = customPeriod(reportCustomFrom, reportCustomTo);
      const args = toRpcArgs(period);
      requestBody = { period_from: args.p_from, period_to: args.p_to };
      periodLabel = period.label.toLowerCase();
    }

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error("Tu sesión no está activa. Cierra sesión, vuelve a entrar como administrador e inténtalo nuevamente.");
      }
      const { data, error: functionError } = await supabase.functions.invoke("weekly-report", {
        body: requestBody,
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (functionError) {
        // supabase-js solo dice "returned a non-2xx status code": el motivo
        // real viene en el cuerpo de la respuesta, que es lo que dice si
        // falta correr la migracion o si hay otro problema.
        const context = (functionError as { context?: Response }).context;
        let detail = "";
        if (context) {
          try {
            const raw = await context.clone().text();
            if (raw) {
              try {
                const parsed = JSON.parse(raw) as { error?: unknown };
                detail = typeof parsed.error === "string" ? parsed.error : raw;
              } catch {
                detail = raw;
              }
            }
          } catch {
            detail = "";
          }
        }
        console.error("Fallo al invocar weekly-report:", functionError, detail);
        throw new Error(detail
          ? `El servidor rechazó el reporte: ${detail}`
          : `El servidor rechazó el reporte (${functionError.message}). Revisa que hayas corrido la migracion 20261012110000 y redesplegado la funcion.`);
      }
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
        label: periodLabel,
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
    setConfirmAction({
      title: "Eliminar pedido",
      message: `Se eliminará el pedido #${order.id.slice(0, 8).toUpperCase()}. Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar pedido",
      run: () => deletePendingOrderConfirmed(order),
    });
  };

  const deletePendingOrderConfirmed = async (order: AdminOrder) => {
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
      let productsRefreshed = true;
      try {
        await onProductsRefresh();
      } catch (refreshError) {
        productsRefreshed = false;
        console.error("La promoción se guardó, pero no se pudieron recargar los productos:", refreshError);
        setSectionError("La promoción se guardó, pero no se pudo actualizar la lista de productos. Recarga el panel.");
      }
      if (productsRefreshed) {
        setPromotionFeedback("La promoción se guardó correctamente.");
        notifySuccess("La promoción se guardó correctamente.");
      }
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

  const handlePromotionVariantsSaved = async (count: number) => {
    const promotion = promotionVariantsEditor;
    setPromotionVariantsEditor(null);
    setSectionError(null);
    if (!promotion) return;
    setPromotionFeedback(
      `${count} presentación${count === 1 ? "" : "es"} participan en «${promotion.name}».`
    );
    notifySuccess("Las presentaciones de la promoción se actualizaron.");
    try {
      await onProductsRefresh();
    } catch (refreshError) {
      console.error("Se guardaron las presentaciones, pero no se pudieron recargar los productos:", refreshError);
      setSectionError("Se guardaron las presentaciones, pero no se pudo actualizar la lista de productos. Recarga el panel.");
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
    setConfirmAction({
      title: "Eliminar promoción",
      message: `Se eliminará la promoción «${promotion.name}». Los productos asociados quedarán sin promoción.`,
      confirmLabel: "Eliminar promoción",
      run: () => deletePromotionConfirmed(promotion),
    });
  };

  const deletePromotionConfirmed = async (promotion: Promotion) => {
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
      setImportFeedback(null);
      setImportError(null);
      setConfirmAction({
        title: "Importar productos",
        message: `Se importarán ${parsedProducts.length} productos y ${variantCount} presentaciones.`,
        confirmLabel: "Importar",
        run: () => importProductsConfirmed(parsedProducts),
      });
      return;
    } catch (importError) {
      console.error("No se pudo leer el archivo de productos:", importError);
      setImportError(importError instanceof Error ? importError.message : "No se pudo leer el archivo.");
    }
  };

  const importProductsConfirmed = async (parsedProducts: ImportedProduct[]) => {
      setImportingProducts(true);
      try {
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
      setConfirmAction({
        title: "Importar clientes",
        message: `Se importarán ${importedCustomers.length} clientes. Los ya registrados por correo o teléfono se omitirán.`,
        confirmLabel: "Importar",
        run: () => importCustomersConfirmed(importedCustomers),
      });
      return;
    } catch (customerImportError) {
      console.error("No se pudo leer el archivo de clientes:", customerImportError);
      setCustomerImportError(
        customerImportError instanceof Error
          ? customerImportError.message
          : "No se pudo leer el archivo de clientes."
      );
    }
  };

  /** Se ejecuta desde el diálogo de confirmación, no al elegir el archivo. */
  const importCustomersConfirmed = async (importedCustomers: ImportedCustomer[]) => {
    setImportingCustomers(true);
    setCustomerImportFeedback(null);
    setCustomerImportError(null);
    try {
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
  const pageTitle = visibleSections.find((item) => item.id === section)?.title ?? "Dashboard";
  const canOpenOrders = visibleSections.some((item) => item.id === "transactions");

  // Una cuenta sin secciones asignadas no ve un panel vacio: ve un aviso
  // que le dice que hacer. Un panel en blanco parece un error de la app y
  // la persona no sabe si algo se rompió o si le falta permiso.
  if (hasNoSections) {
    return (
      <div className="admin-no-access">
        <EmptyState
          icon={<ShieldCheck size={26} />}
          title="Todavía no tenés secciones asignadas"
          hint="Tu cuenta puede entrar al panel, pero aún no le han dado acceso a ninguna sección. Pídele al administrador que te asigne las que necesites."
          action={
            <AdminButton tone="secondary" type="button" onClick={onBack}>
              Volver a la tienda
            </AdminButton>
          }
        />
      </div>
    );
  }

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
          {visibleSections.map((item) =>
            "external" in item ? (
              <a
                key={item.id}
                className="admin-nav-item"
                href="/crm/"
                target="_blank"
                rel="noopener noreferrer"
                data-tooltip={item.title}
                title={sidebarCollapsed ? item.title : undefined}
              >
                {item.icon}
                <span className="admin-nav-item-label">{item.title}</span>
              </a>
            ) : (
              <a
                key={item.id}
                className={`admin-nav-item${section === item.id ? " active" : ""}`}
                href={ADMIN_SECTION_PATHS[item.id]}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  setSection(item.id);
                  setSearch("");
                }}
                data-tooltip={item.title}
                title={sidebarCollapsed ? item.title : undefined}
                aria-current={section === item.id ? "page" : undefined}
              >
                {item.icon}
                <span className="admin-nav-item-label">{item.title}</span>
              </a>
            )
          )}
        </nav>
        <div className="admin-sidebar-footer">
          <button className="admin-store-button" onClick={onBack} title="Volver a la tienda">
            <ArrowLeft size={18} />
            <span className="admin-nav-item-label">Volver a la tienda</span>
          </button>
          <button className="admin-store-button admin-signout-button" onClick={onSignOut} title="Cerrar sesión">
            <LogOut size={18} />
            <span className="admin-nav-item-label">Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <div className={`admin-top${section === "overview" ? " admin-top--overview" : ""}`}>
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
                  className="product-import-action"
                  tone="secondary"
                  compact
                  type="button"
                  onClick={() => productImportInput.current?.click()}
                  disabled={importingProducts}
                  aria-label={importingProducts ? "Importando productos" : "Importar archivo"}
                  title="Importar archivo"
                >
                  <Upload size={16} /> {importingProducts ? "Importando..." : "Importar archivo"}
                </AdminButton>
                <a
                  className="secondary template-download product-template-action"
                  href="/plantilla-importacion-productos.csv"
                  download="plantilla-importacion-productos.csv"
                  aria-label="Descargar plantilla CSV para importar productos"
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
            {section !== "products" && (
              <AdminButton
                className="admin-utility-action"
                tone="secondary"
                compact
                type="button"
                onClick={() => setSectionRevision((current) => current + 1)}
                disabled={sectionLoading}
                aria-label="Actualizar datos"
                title="Actualizar datos"
              >
                <RefreshCw size={16}/> <span className="admin-utility-label">Actualizar</span>
              </AdminButton>
            )}
          </div>
        </div>
        {/* En movil la navegación vive en el dock fijo al pie. Los tabs
            de aqui son la version de escritorio, que se esconden por CSS. */}
        <AdminDock
          sections={visibleSections}
          current={section}
          onSelect={(id) => {
            setSection(id as typeof section);
            setSearch("");
            if (id === "transactions") setShowPendingOrdersOnly(false);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onGoToStore={onBack}
          onSignOut={onSignOut}
        />

        <nav className="admin-section-tabs" aria-label="Secciones de administración">
          {visibleSections.map((item) =>
            "external" in item ? (
              <a
                key={item.id}
                className="crm-admin-link"
                href="/crm/"
                target="_blank"
                rel="noopener noreferrer"
              >
                {item.icon}{item.title}
              </a>
            ) : (
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
            )
          )}
        </nav>

        {section === "overview" && !metrics && (
          <div className="dashboard-loading" role="status" aria-live="polite">
            <span className="loading-spinner" aria-hidden="true" />
            <div>
              <strong>Cargando tu dashboard…</strong>
              <span>Estamos reuniendo ventas, cartera e inventario.</span>
            </div>
          </div>
        )}

        {section === "overview" && metrics && (
          <Suspense fallback={<div className="loading-state" role="status"><span className="loading-spinner" aria-hidden="true" /><span>Cargando dashboard…</span></div>}>
            <DashboardPage
              metrics={metrics}
              orders={orders}
              products={products}
              soldOut={soldOut}
              lowStock={lowStock}
              totalStock={totalStock}
              avgTicket={avgTicket}
              metricsPeriod={metricsPeriod}
              onMetricsPeriodChange={setMetricsPeriod}
              profitability={profitability}
              profitabilityLoading={profitabilityLoading}
              profitabilityError={profitabilityError}
              dashboardDetail={dashboardDetail}
              onDashboardDetailChange={setDashboardDetail}
              waste={waste}
              wasteDays={wasteDays}
              wasteLoading={wasteLoading}
              wasteError={wasteError}
              canOpenOrders={canOpenOrders}
              onSectionChange={setSection}
              reportLoading={reportLoading}
              reportError={reportError}
              reportResult={reportResult}
              onGenerateReport={() => void generateReport()}
            />
          </Suspense>
        )}

        {section === "collect" && (
          <Suspense fallback={<div className="loading-state" role="status"><span className="loading-spinner" aria-hidden="true" /><span>Cargando quién debe…</span></div>}>
            <CollectPage sectionRevision={sectionRevision} />
          </Suspense>
        )}

        {section === "credit" && (
          <Suspense fallback={<div className="loading-state" role="status"><span className="loading-spinner" aria-hidden="true" /><span>Cargando cartera…</span></div>}>
            <CreditPage sectionRevision={sectionRevision} />
          </Suspense>
        )}

        {section === "expenses" && (
          <Suspense fallback={<div className="loading-state" role="status"><span className="loading-spinner" aria-hidden="true" /><span>Cargando gastos…</span></div>}>
            <ExpensesPage
              form={expenseForm}
              onFormChange={setExpenseForm}
              onSubmit={saveExpense}
              saving={savingExpense}
              recurringExpenses={recurringExpenses}
              payingRecurringExpenseId={payingRecurringExpenseId}
              deletingRecurringExpenseId={deletingRecurringExpenseId}
              onPayRecurring={(expense) => void payRecurringExpense(expense)}
              onDeleteRecurring={(id) => void removeRecurringExpense(id)}
              expenses={expenses}
              paginatedExpenses={paginatedExpenses}
              currentPage={currentExpensePage}
              pageCount={expensePageCount}
              onPageChange={setExpensePage}
              deletingExpenseId={deletingExpenseId}
              onDeleteExpense={(expense) => {
                onConfirm({
                  title: "Eliminar gasto",
                  message: `¿Eliminar el gasto "${expense.name}"? Esta acción no se puede deshacer.`,
                  onConfirm: () => void removeExpense(expense.id),
                });
              }}
              loading={sectionLoading}
            />
          </Suspense>
        )}

        {section === "advisors" && (
          <Suspense fallback={<div className="loading-state" role="status"><span className="loading-spinner" aria-hidden="true" /><span>Cargando asesores…</span></div>}>
            <AdvisorsPage
              advisors={salesAdvisors}
              form={advisorForm}
              editingAdvisor={editingAdvisor}
              saving={savingAdvisor}
              deletingAdvisorId={deletingAdvisorId}
              loading={sectionLoading}
              onSubmit={saveAdvisor}
              onFormChange={setAdvisorForm}
              onEdit={(advisor) => {
                setEditingAdvisor(advisor);
                setAdvisorForm({
                  full_name: advisor.full_name,
                  phone: advisor.phone ?? "",
                  email: advisor.email ?? "",
                });
              }}
              onCancelEdit={() => {
                setEditingAdvisor(null);
                setAdvisorForm({ full_name: "", phone: "", email: "" });
              }}
              onDelete={(advisor) => {
                onConfirm({
                  title: "Eliminar asesor",
                  message: `¿Eliminar al asesor "${advisor.full_name}"? Los pedidos existentes conservarán su nombre, pero no se podrá asignar a nuevos pedidos.`,
                  onConfirm: () => void removeAdvisor(advisor),
                });
              }}
            />
          </Suspense>
        )}

        {section === "settings" && (
          <Suspense fallback={<div className="loading-state" role="status"><span className="loading-spinner" aria-hidden="true" /><span>Cargando configuración…</span></div>}>
            <SettingsPage
              settings={storeSettings}
              loadError={storeSettingsError}
              onSaved={onStoreSettingsSaved}
              profiles={profiles}
              permissions={sectionPermissions}
              sections={sections.map((item) => ({ id: item.id, title: item.title }))}
              currentUserId={currentUserId}
              onPermissionsChanged={() => setSectionRevision((current) => current + 1)}
            />
          </Suspense>
        )}

        {section === "reports" && (
          <Suspense fallback={<div className="loading-state" role="status"><span className="loading-spinner" aria-hidden="true" /><span>Cargando reportes…</span></div>}>
            <ReportsPage
              reportPeriodId={reportPeriodId}
              reportCustomFrom={reportCustomFrom}
              reportCustomTo={reportCustomTo}
              reportDate={reportDate}
              reportLoading={reportLoading}
              reportError={reportError}
              reportRangeError={reportRangeError}
              reportResult={reportResult}
              onPeriodPresetChange={(presetId, from, to) => {
                setReportPeriodId(presetId);
                setReportCustomFrom(from);
                setReportCustomTo(to);
              }}
              onCustomFromChange={(value) => {
                setReportPeriodId("custom");
                setReportCustomFrom(value);
              }}
              onCustomToChange={(value) => {
                setReportPeriodId("custom");
                setReportCustomTo(value);
              }}
              onReportDateChange={setReportDate}
              onGenerateReport={(dailyReportDate) => void generateReport(dailyReportDate)}
            />
          </Suspense>
        )}
        {section === "products" && (
          <Suspense fallback={<div className="loading-state" role="status"><span className="loading-spinner" aria-hidden="true" /><span>Cargando productos…</span></div>}>
            <ProductsPage
              visibleProducts={visibleProducts}
              loading={adminInventoryLoading}
              promotions={promotions}
              archivedProductsCount={archivedProductsCount}
              showArchivedProducts={showArchivedProducts}
              onToggleArchived={() => setShowArchivedProducts((current) => !current)}
              productSearch={productSearch}
              onProductSearchChange={setProductSearch}
              productStockFilter={productStockFilter}
              onProductStockFilterChange={setProductStockFilter}
              productPriceFilter={productPriceFilter}
              onProductPriceFilterChange={updateProductPriceFilter}
              hasProductPriceFilter={hasProductPriceFilter}
              onClearProductPriceFilter={clearProductPriceFilter}
              costDrafts={costDrafts}
              onCostDraftChange={(variantId, value) => setCostDrafts((current) => ({ ...current, [variantId]: value }))}
              onCostDraftClear={(variantId) => setCostDrafts((current) => {
                const next = { ...current };
                delete next[variantId];
                return next;
              })}
              stockDrafts={stockDrafts}
              onStockDraftChange={(variantId, value) => setStockDrafts((current) => ({ ...current, [variantId]: value }))}
              onStockDraftClear={(variantId) => setStockDrafts((current) => {
                const next = { ...current };
                delete next[variantId];
                return next;
              })}
              onVariantCostChange={onVariantCostChange}
              savingCostVariantId={savingCostVariantId}
              onVariantStockChange={onVariantStockChange}
              savingStockVariantId={savingStockVariantId}
              onOpenMovement={(productId, variant) => setMovementEditor({ productId, variant })}
              onProductActiveChange={onProductActiveChange}
              updatingProductId={updatingProductId}
              onEdit={(product) => {
                setProductActionFeedback(null);
                setProductActionError(null);
                setEditingProduct(product);
              }}
              onDelete={(product) => {
                setConfirmAction({
                  title: "Eliminar producto",
                  message: `¿Eliminar ${product.brand} ${product.name}? Si tiene pedidos o movimientos de inventario, se quita de la tienda y se archiva para proteger ese historial.`,
                  confirmLabel: "Eliminar producto",
                  run: () => deleteProductConfirmed(product),
                });
              }}
              deletingProductId={deletingProductId}
              error={error}
              importFeedback={importFeedback}
              importError={importError}
              productActionFeedback={productActionFeedback}
              productActionError={productActionError}
            />
          </Suspense>
        )}

        {section === "promotions" && (
          <Suspense fallback={<div className="loading-state" role="status"><span className="loading-spinner" aria-hidden="true" /><span>Cargando promociones…</span></div>}>
            <PromotionsPage
              promotions={promotions}
              feedback={promotionFeedback}
              onNew={() => setPromotionEditor("new")}
              onEdit={setPromotionEditor}
              onManageVariants={(promotion) => {
                setPromotionFeedback(null);
                setPromotionVariantsEditor(promotion);
              }}
              onToggle={(promotion) => void togglePromotion(promotion)}
              onDelete={(promotion) => void removePromotion(promotion)}
            />
          </Suspense>
        )}

        {section === "customers" && (
          <Suspense fallback={<div className="loading-state" role="status"><span className="loading-spinner" aria-hidden="true" /><span>Cargando clientes…</span></div>}>
            <CustomersPage
              customers={paginatedCustomers}
              visibleCount={visibleCustomers.length}
              loading={sectionLoading}
              search={search}
              onSearchChange={setSearch}
              importFeedback={customerImportFeedback}
              importError={customerImportError}
              onEdit={setEditingCustomer}
              page={currentCustomerPage}
              pageCount={customerPageCount}
              onPageChange={setCustomerPage}
            />
          </Suspense>
        )}

        {section === "profiles" && (
          <Suspense fallback={<div className="loading-state" role="status"><span className="loading-spinner" aria-hidden="true" /><span>Cargando perfiles…</span></div>}>
            <ProfilesPage
              profiles={paginatedProfiles}
              visibleCount={visibleProfiles.length}
              loading={sectionLoading}
              search={search}
              onSearchChange={setSearch}
              currentUserId={currentUserId}
              savingProfileId={savingProfileId}
              onRoleChange={(profile, role) => void saveProfileRole(profile, role)}
              page={currentProfilePage}
              pageCount={profilePageCount}
              onPageChange={setProfilePage}
            />
          </Suspense>
        )}

        {section === "transactions" && (
          <Suspense fallback={<div className="loading-state" role="status"><span className="loading-spinner" aria-hidden="true" /><span>Cargando pedidos…</span></div>}>
          <OrdersPage
            orders={orders}
            salesAdvisors={salesAdvisors}
            loading={sectionLoading || !permissionsLoaded}
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
      {dashboardDetail && dashboardDetail !== "profitability" && (
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
      {confirmAction && (
        <Suspense fallback={null}>
          <ConfirmDialog
            title={confirmAction.title}
            message={confirmAction.message}
            confirmLabel={confirmAction.confirmLabel}
            busy={deletingOrderId !== null || deletingProductId !== null || importingProducts || importingCustomers}
            onCancel={() => setConfirmAction(null)}
            onConfirm={() => {
              const { run } = confirmAction;
              void run().finally(() => setConfirmAction(null));
            }}
          />
        </Suspense>
      )}

      {movementEditor && ((
        <Suspense fallback={null}>
          <MovementModal
            variantId={movementEditor.variant.id}
            productName={products.find((p) => p.id === movementEditor.productId)?.name ?? "Producto"}
            sizeMl={movementEditor.variant.size}
            currentStock={movementEditor.variant.stock}
            onClose={() => setMovementEditor(null)}
            onSaved={() => void onProductsRefresh()}
          />
        </Suspense>
      ))}

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
      {promotionVariantsEditor && (
        <Suspense fallback={null}>
          <PromotionVariantsModal
            promotion={promotionVariantsEditor}
            onClose={() => setPromotionVariantsEditor(null)}
            onSaved={(count) => void handlePromotionVariantsSaved(count)}
          />
        </Suspense>
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
  const [minimumProfit, setMinimumProfit] = useState(
    promotion?.minimum_profit == null ? "60000" : String(promotion.minimum_profit)
  );
  const [taxRate, setTaxRate] = useState(
    promotion?.tax_rate == null ? "19" : String(promotion.tax_rate * 100)
  );
  const [priceIncludesTax, setPriceIncludesTax] = useState(promotion?.price_includes_tax ?? true);
  const [costIncludesTax, setCostIncludesTax] = useState(promotion?.cost_includes_tax ?? true);
  const [allowMixed, setAllowMixed] = useState(promotion?.allow_mixed ?? true);
  const [active, setActive] = useState(promotion?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  const quantity = Number(requiredQuantity);
  const price = Number(bundlePrice);
  const minimumProfitValue = Number(minimumProfit);
  const taxPercent = Number(taxRate);
  const previewReady =
    Number.isInteger(quantity) && quantity >= 2 &&
    Number.isFinite(price) && price >= 0 &&
    Number.isFinite(minimumProfitValue) && minimumProfitValue >= 0 &&
    Number.isFinite(taxPercent) && taxPercent >= 0 && taxPercent < 100;
  const preview = {
    required_quantity: quantity,
    bundle_price: price,
    minimum_profit: minimumProfitValue,
    tax_rate: taxPercent / 100,
    price_includes_tax: priceIncludesTax,
    cost_includes_tax: costIncludesTax,
  };
  const previewNetBundle = previewReady ? getPromotionNetBundle(preview) : null;
  const previewMaxUnitCost = previewReady ? getPromotionMaxUnitCost(preview) : null;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Escribe un nombre para la promoción.");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 2 || !Number.isFinite(price) || price < 0) {
      setError("La cantidad mínima es 2 y el precio debe ser un número igual o mayor a cero.");
      return;
    }
    if (!Number.isFinite(minimumProfitValue) || minimumProfitValue < 0) {
      setError("El margen mínimo debe ser un número igual o mayor a cero.");
      return;
    }
    if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent >= 100) {
      setError("El IVA debe ser un porcentaje entre 0 y 99,99.");
      return;
    }
    setError(null);
    onSave({
      name: name.trim(),
      required_quantity: quantity,
      bundle_price: price,
      allow_mixed: allowMixed,
      active,
      minimum_profit: minimumProfitValue,
      tax_rate: taxPercent / 100,
      price_includes_tax: priceIncludesTax,
      cost_includes_tax: costIncludesTax,
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
        <div className="form-grid">
          <label>Margen mínimo del paquete (COP)<input type="number" min="0" step="1" value={minimumProfit} onChange={(event) => setMinimumProfit(event.target.value)} required /></label>
          <label>IVA (%)<input type="number" min="0" max="99.99" step="0.01" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} required /></label>
        </div>
        <label className="promotion-checkbox">
          <input type="checkbox" checked={priceIncludesTax} onChange={(event) => setPriceIncludesTax(event.target.checked)} />
          <span>El precio del paquete ya incluye IVA</span>
        </label>
        <label className="promotion-checkbox">
          <input type="checkbox" checked={costIncludesTax} onChange={(event) => setCostIncludesTax(event.target.checked)} />
          <span>El costo registrado de las presentaciones ya incluye IVA</span>
        </label>
        <div className="promotion-margin-preview" aria-live="polite">
          <div>
            <span>Ingreso neto del paquete</span>
            <strong>{previewNetBundle == null ? "—" : money(previewNetBundle)}</strong>
          </div>
          <div>
            <span>Costo máximo por presentación</span>
            <strong>{previewMaxUnitCost == null ? "Sin tope" : money(previewMaxUnitCost)}</strong>
          </div>
        </div>
        <p className="order-editor-note">El margen mínimo se mide sin IVA y antes de domicilio y envío. Las presentaciones que superen el costo máximo no podrán participar en la promoción.</p>
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
  saving,
  error: saveError,
  onClose,
  onSave,
}: {
  product: Product;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (product: Product, imageFiles: File[]) => Promise<void>;
}) {
  const [images, setImages] = useState(product.images ?? (product.image ? [product.image] : []));
  const [brand, setBrand] = useState(product.brand);
  const [name, setName] = useState(product.name);
  const [sku, setSku] = useState(product.sku ?? "");
  const [gender, setGender] = useState<Product["gender"]>(product.gender);
  const [category, setCategory] = useState<Product["category"]>(product.category);
  const [description, setDescription] = useState(product.description);
  const [family, setFamily] = useState(product.family);
  const [climate, setClimate] = useState(product.climate.join(", "));
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
      sku: sku.trim() || null,
      gender,
      category,
      description: description.trim(),
      family: family.trim(),
      climate: climate.split(",").map((item) => item.trim()).filter(Boolean),
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
          <label>SKU (opcional)<input value={sku} disabled={saving} onChange={(event) => setSku(event.target.value)} placeholder="Ej. LAT-QAF-100" maxLength={64} autoComplete="off" spellCheck={false} /></label>
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
        <p className="order-editor-note">Las promociones se asignan por presentación desde Administración → Promociones → Presentaciones.</p>
        <section className="edit-product-images">
          <div>
            <strong>Imágenes</strong>
            <span>Hasta 3 imágenes; JPG, PNG, WebP o AVIF, máximo 5 MB cada una.</span>
          </div>
          <div className="edit-image-list">
            {images.map((image, index) => (
              <div className="edit-image-item" key={`${image}-${index}`}>
                <img src={image} alt={`Imagen ${index + 1} de ${product.name}`} loading="lazy" decoding="async" />
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
  saving,
  error: saveError,
}: {
  onClose: () => void;
  onSave: (product: NewProductInput, variants: { size: number; price: number; cost: number; stock: number }[], images: File[]) => Promise<void>;
  saving: boolean;
  error: string | null;
}) {
  const [brand, setBrand] = useState("");
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState<Product["category"]>("Diseñador");
  const [gender, setGender] = useState<Product["gender"]>("Unisex");
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
      sku: sku.trim() || null,
      category,
      gender,
      description,
      family,
      climate: ["Todo el año"],
      image_url: "",
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
          <label>SKU (opcional)<input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Ej. LAT-QAF-100" maxLength={64} autoComplete="off" spellCheck={false} /></label>
          <label>Categoría<select value={category} onChange={(e) => setCategory(e.target.value as Product["category"])}><option value="Diseñador">Diseñador</option><option value="Árabes">Árabes</option><option value="Nicho">Nicho</option></select></label>
          <label>Género<select value={gender} onChange={(e) => setGender(e.target.value as Product["gender"])}><option>Hombres</option><option>Mujeres</option><option>Unisex</option></select></label>
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
