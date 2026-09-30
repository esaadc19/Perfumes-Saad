import { useEffect, useMemo, useRef, useState } from "react";
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
  type Promotion,
  type PromotionInput,
} from "./services/promotions";
import {
  getAdminCustomers,
  getAdminDashboardMetrics,
  getAdminOrders,
  getAdminProfiles,
  importAdminCustomers,
  deleteAdminPendingOrder,
  saveAdminPendingOrder,
  updateAdminCustomer,
  updateAdminOrderStatus,
  updateAdminProfileRole,
  type AdminCustomer,
  type AdminDashboardMetrics,
  type AdminOrder,
  type AdminProfile,
} from "./services/admin";
import AuthDialog from "./components/AuthDialog";
import AccountDialog from "./components/AccountDialog";
import ReceiptDialog from "./components/ReceiptDialog";
import PeekRating from "./components/PeekRating";
import Dock from "./components/Dock";
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
  RefreshCw,
  Search,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Tag,
  Trash2,
  TrendingUp,
  Upload,
  User,
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

const whatsappNumber = "573181749436";

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
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("Todas");
  const [category, setCategory] = useState("Todos");
  const [showLogin, setShowLogin] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [savingProductEdit, setSavingProductEdit] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
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
      product.variants.find((v) => v.stock > 0)?.id ?? product.variants[0].id
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

            <button className="brand" onClick={() => setCategory("Todos")}>
              Perfumes <span>SAAD</span>
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
                <p className="eyebrow">PERFUMES SAAD</p>
                <h1>Encuentra una fragancia que vaya contigo.</h1>
                <p>
                  Catálogo de perfumería con recomendaciones, diferentes
                  presentaciones y atención personalizada por WhatsApp.
                </p>
                <a
                  className="primary hero-whatsapp"
                  href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent("Hola, quiero hacer una consulta sobre sus perfumes.")}`}
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
                        <strong>{money(firstAvailable.price)}</strong>
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
                            disabled={firstAvailable.stock <= 0}
                            onClick={() => addVariantToCart(product, firstAvailable)}
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
                              setCart((current) =>
                                current.filter((x) => x.variant.id !== item.variant.id)
                              )
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
                      envía el pedido a Perfumes SAAD por WhatsApp.
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
            <div className="footer-brand">Perfumes SAAD</div>
            <span>Perfumería · Barranquilla · Colombia</span>
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
    </div>
  );
}

function Admin({
  products,
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
  error,
  onSignOut,
}: {
  products: Product[];
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
  error: string | null;
  onSignOut: () => void;
}) {
  const [section, setSection] = useState<"overview" | "products" | "promotions" | "transactions" | "customers" | "profiles">("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sectionRevision, setSectionRevision] = useState(0);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
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
  const [transactionFilter, setTransactionFilter] = useState<"all" | "paid" | "pending" | "refunded">("all");
  const [dashboardDetail, setDashboardDetail] = useState<"sold-out" | "low-stock" | "pending" | null>(null);
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
    { id: "customers", title: "Clientes", icon: <Users size={17} /> },
    { id: "profiles", title: "Perfiles", icon: <ShieldCheck size={17} /> },
  ] as const;

  useEffect(() => {
    let active = true;
    const loadSection = async () => {
      if (section === "products") {
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
          const [ordersResult, customersResult] = await Promise.all([
            getAdminOrders(),
            getAdminCustomers(),
          ]);
          if (active) {
            setOrders(ordersResult);
            setCustomers(customersResult);
          }
        } else if (section === "customers") {
          const result = await getAdminCustomers();
          if (active) setCustomers(result);
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
    setCustomerSaving(true);
    setSectionError(null);
    const form = new FormData(event.currentTarget);
    try {
      await updateAdminCustomer({
        customerId: editingCustomer.id,
        fullName: String(form.get("full_name") ?? "").trim(),
        phone: String(form.get("phone") ?? "").trim(),
        email: String(form.get("email") ?? "").trim(),
        city: String(form.get("city") ?? "").trim(),
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

  const saveOrderStatus = async (
    order: AdminOrder,
    status: "pending_confirmation" | "confirmed" | "cancelled",
    paymentStatus: "pending" | "paid" | "refunded"
  ) => {
    setSavingOrderId(order.id);
    setSectionError(null);
    try {
      await updateAdminOrderStatus(order.id, status, paymentStatus);
      const finalStatus = paymentStatus === "paid" ? "confirmed" : status;
      setOrders((current) => current.map((item) => item.id === order.id
        ? {
            ...item,
            status: finalStatus,
            payment_status: paymentStatus,
            paid_at: paymentStatus === "paid" ? item.paid_at ?? new Date().toISOString() : item.paid_at,
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
    customerId: string,
    items: { variant_id: string; quantity: number }[],
    orderId: string | null
  ) => {
    setOrderSaving(true);
    setSectionError(null);
    try {
      await saveAdminPendingOrder({ orderId, customerId, items });
      setOrderEditor(null);
      setSectionRevision((current) => current + 1);
    } catch (saveError) {
      console.error("No se pudo guardar el pedido administrativo:", saveError);
      setSectionError(saveError instanceof Error ? saveError.message : "No se pudo guardar el pedido.");
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
    } catch (deleteError) {
      console.error("No se pudo eliminar el pedido:", deleteError);
      setSectionError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el pedido.");
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

  const submitPromotion = async (input: PromotionInput, promotionId?: string) => {
    setPromotionSaving(true);
    setSectionError(null);
    setPromotionFeedback(null);
    try {
      await savePromotion(input, promotionId);
      onPromotionsChange(await getPromotions(true));
      setPromotionEditor(null);
      setPromotionFeedback("La promoción se guardó correctamente.");
    } catch (saveError) {
      console.error("No se pudo guardar la promoción:", saveError);
      setSectionError(saveError instanceof Error
        ? saveError.message
        : "No se pudo guardar la promoción. Verifica tus permisos.");
    } finally {
      setPromotionSaving(false);
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
      if (productsRefreshed) setPromotionFeedback("La promoción se eliminó correctamente.");
    } catch (deleteError) {
      console.error("No se pudo eliminar la promoción:", deleteError);
      setSectionError(deleteError instanceof Error
        ? deleteError.message
        : "No se pudo eliminar la promoción.");
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
  const visibleOrders = orders.filter((order) =>
    `${order.customers?.full_name ?? ""} ${order.customers?.email ?? ""} ${order.id}`.toLowerCase().includes(query)
      && (
        transactionFilter === "all" ||
        (transactionFilter === "pending"
          ? order.payment_status === "pending" && order.status !== "cancelled"
          : order.payment_status === transactionFilter)
      )
  );
  const completedOrders = orders.filter((order) => order.payment_status === "paid");
  const transactionRevenue = completedOrders.reduce((sum, order) => sum + Number(order.total), 0);
  const transactionMissingCostItems = completedOrders.reduce(
    (sum, order) => sum + order.order_items.reduce(
      (itemSum, item) => itemSum + (item.unit_cost_snapshot === null ? item.quantity : 0),
      0
    ),
    0
  );
  const transactionCost = completedOrders.reduce(
    (sum, order) => sum + order.order_items.reduce(
      (itemSum, item) => itemSum + (item.unit_cost_snapshot === null
        ? 0
        : Number(item.unit_cost_snapshot) * item.quantity),
      0
    ),
    0
  );
  const transactionProfit = transactionMissingCostItems > 0
    ? null
    : transactionRevenue - transactionCost;
  const normalizeOrderStatus = (status: string): "pending_confirmation" | "confirmed" | "cancelled" =>
    status === "confirmed" || status === "cancelled" ? status : "pending_confirmation";
  const normalizePaymentStatus = (status: string): "pending" | "paid" | "refunded" =>
    status === "paid" || status === "refunded" ? status : "pending";
  const pageTitle = sections.find((item) => item.id === section)?.title ?? "Dashboard";

  return (
    <div className={`admin-layout${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-heading">
          <button className="admin-logo" onClick={onBack}>SAAD<span>.</span></button>
          <button
            type="button"
            className="sidebar-collapse"
            aria-label={sidebarCollapsed ? "Expandir menú" : "Contraer menú"}
            aria-expanded={!sidebarCollapsed}
            title={sidebarCollapsed ? "Expandir menú" : "Contraer menú"}
            onClick={() => setSidebarCollapsed((current) => !current)}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <Dock
          className="admin-dock"
          collapsed={sidebarCollapsed}
          items={sections.map((item) => ({
            icon: item.icon,
            label: item.title,
            selected: section === item.id,
            onClick: () => { setSection(item.id); setSearch(""); },
          }))}
        />
        <button className="back-store" onClick={onBack}><ArrowLeft size={20}/><span>Ver tienda</span></button>
      </aside>

      <main className="admin-main">
        <div className="admin-top">
          <div>
            <p className="eyebrow">PERFUMES SAAD</p>
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
                <button
                  className="secondary"
                  type="button"
                  onClick={() => productImportInput.current?.click()}
                  disabled={importingProducts}
                >
                  <Upload size={16} /> {importingProducts ? "Importando..." : "Importar archivo"}
                </button>
                <a
                  className="secondary template-download"
                  href="/plantilla-importacion-productos.csv"
                  download="plantilla-importacion-productos.csv"
                  title="Descargar plantilla CSV para importar productos"
                >
                  <Download size={16} /> Plantilla CSV
                </a>
                <button className="primary" onClick={onAdd}><Plus size={17}/> Nuevo producto</button>
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
                <button
                  className="secondary"
                  type="button"
                  onClick={() => customerImportInput.current?.click()}
                  disabled={importingCustomers}
                >
                  <Upload size={16} /> {importingCustomers ? "Importando..." : "Importar archivo"}
                </button>
              </>
            )}
            {section === "transactions" && <button className="primary" onClick={() => setOrderEditor({ order: null })}><Plus size={17}/> Nuevo pedido</button>}
            <button className="secondary" onClick={onSignOut}>Cerrar sesión</button>
            {section !== "products" && (
              <button className="secondary" onClick={() => setSectionRevision((current) => current + 1)} disabled={sectionLoading} aria-label="Actualizar datos">
                <RefreshCw size={16}/> Actualizar
              </button>
            )}
          </div>
        </div>
        <nav className="admin-section-tabs" aria-label="Secciones de administración">
          {sections.map((item) => (
            <button
              key={item.id}
              className={section === item.id ? "selected" : ""}
              onClick={() => { setSection(item.id); setSearch(""); }}
            >
              {item.icon}{item.title}
            </button>
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
        {sectionLoading && <p className="catalog-message" role="status">Cargando {pageTitle.toLowerCase()}...</p>}

        {section === "overview" && metrics && (
          <>
            <div className="metrics">
              <Metric title="Ventas completas" value={String(metrics.completed_sales)} icon={<ShoppingBag />} />
              <Metric title="Total vendido" value={money(Number(metrics.sales_revenue))} icon={<BarChart3 />} />
              <Metric title="Clientes registrados" value={String(metrics.customer_count)} icon={<Users />} />
              <Metric title="Presentaciones con stock bajo" value={String(lowStock)} icon={<AlertTriangle />} warning onClick={() => setDashboardDetail("low-stock")} />
            </div>
            <div className="metrics">
              <Metric title="Productos" value={products.filter((product) => !product.archived).length.toString()} icon={<Package />} />
              <Metric title="Unidades en stock" value={totalStock.toString()} icon={<ShoppingBag />} />
              <Metric title="Pedidos pendientes" value={String(metrics.pending_orders)} icon={<AlertTriangle />} warning onClick={() => setDashboardDetail("pending")} />
              <Metric title="Agotados" value={soldOut.toString()} icon={<X />} onClick={() => setDashboardDetail("sold-out")} />
            </div>
            <div className="metrics">
              <Metric title="Costo de ventas registrado" value={money(Number(metrics.sales_cost))} icon={<ReceiptText />} />
              <Metric title="Utilidad bruta" value={metrics.missing_cost_items > 0 ? "Incompleta" : money(Number(metrics.sales_profit))} icon={<TrendingUp />} warning={metrics.sales_profit < 0} />
              <Metric title="Costos pendientes" value={String(metrics.missing_cost_items)} icon={<AlertTriangle />} warning={metrics.missing_cost_items > 0} />
              <Metric title="Pedidos registrados" value={String(metrics.total_orders)} icon={<ShoppingBag />} />
            </div>
            <section className="admin-card">
              <div className="card-title">
                <div><h2>Más solicitados</h2><span>Unidades incluidas en pedidos guardados, ordenadas por cantidad.</span></div>
              </div>
              {metrics.top_products.length ? (
                <div className="admin-table">
                  <div className="table-row top-product-row header"><span>Perfume</span><span>Presentación</span><span>Unidades</span><span>Vendido</span><span>Costo</span><span>Utilidad</span></div>
                  {metrics.top_products.map((product) => (
                    <div className="table-row top-product-row" key={`${product.name}-${product.size_ml}`}>
                      <strong>{product.name}</strong><span>{product.size_ml} ml</span><span>{product.units}</span><span>{money(Number(product.revenue))}</span><span>{product.cost === null ? "Falta costo" : money(Number(product.cost))}</span><span>{product.profit === null ? "Incompleta" : money(Number(product.profit))}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="insight">Aún no hay pedidos registrados para generar métricas de productos.</p>}
            </section>
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
                    <span>Pedidos pendientes</span><strong>{metrics.pending_orders}</strong>
                  </button>
                  {soldOut === 0 && lowStock === 0 && metrics.pending_orders === 0 && (
                    <p className="insight">No hay productos agotados, stock bajo ni pedidos pendientes.</p>
                  )}
                </div>
              </div>
            </section>
          </>
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
            <div className="table-row header">
              <span>Producto</span><span>Categoría</span><span>Presentación y costo unitario</span><span>Stock</span><span>Estado</span><span>Acciones</span>
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
                        <span>{variant.size} ml · precio {money(variant.price)}</span>
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
                  <span>{stock}</span>
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
                      <button className="secondary" type="button" onClick={() => {
                          setProductActionFeedback(null);
                          setProductActionError(null);
                          setEditingProduct(product);
                      }}>
                          <Pencil size={14}/> Editar
                      </button>
                      <button
                          className="secondary danger-button"
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
                      </button>
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
              <button className="primary" onClick={() => setPromotionEditor("new")}><Plus size={17}/> Nueva promoción</button>
            </div>
            {promotions.length === 0 ? (
              <p className="insight">Todavía no hay promociones. Crea una para comenzar a ofrecer paquetes.</p>
            ) : (
              <div className="admin-table promotion-table">
                <div className="table-row header"><span>Promoción</span><span>Paquete</span><span>Combinación</span><span>Estado</span><span>Acciones</span></div>
                {promotions.map((promotion) => (
                  <div className="table-row" key={promotion.id}>
                    <strong>{promotion.name}</strong>
                    <span>{promotion.required_quantity} por {money(promotion.bundle_price)}</span>
                    <span>{promotion.allow_mixed ? "Productos asociados combinables" : "Mismo perfume"}</span>
                    <span className={promotion.active ? "status-pill status-paid" : "status-pill"}>{promotion.active ? "Activa" : "Inactiva"}</span>
                    <div className="product-actions">
                      <button className="secondary" onClick={() => setPromotionEditor(promotion)}><Pencil size={15}/> Editar</button>
                      <button className="secondary danger-button" onClick={() => void removePromotion(promotion)}><Trash2 size={15}/> Eliminar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {(section === "customers" || section === "profiles" || section === "transactions") && (
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
                <div className="table-row customer-row header"><span>Cliente</span><span>WhatsApp</span><span>Correo</span><span>Ciudad</span><span>Pedidos</span><span></span></div>
                {visibleCustomers.map((customer) => (
                  <div className="table-row customer-row" key={customer.id}>
                    <strong>{customer.full_name}</strong><span>{customer.phone || "—"}</span><span>{customer.email || "—"}</span><span>{customer.city || "—"}</span><span>{customer.orders?.length ?? 0}</span>
                    <button className="icon-button" aria-label={`Editar ${customer.full_name}`} onClick={() => setEditingCustomer(customer)}><Pencil size={16}/></button>
                  </div>
                ))}
                {!sectionLoading && visibleCustomers.length === 0 && <p className="insight">No hay clientes que coincidan con la búsqueda.</p>}
              </div>
              </>
            )}
            {section === "profiles" && (
              <>
                <div className="profile-notice"><ShieldCheck size={17}/> Los usuarios se registran desde la tienda como clientes. Puedes promover una cuenta a administrador; no puedes cambiar tu propio rol.</div>
                <div className="admin-table">
                  <div className="table-row profile-row header"><span>Perfil</span><span>WhatsApp</span><span>Alta</span><span>Permiso</span></div>
                  {visibleProfiles.map((profile) => (
                    <div className="table-row profile-row" key={profile.id}>
                      <div className="profile-cell"><strong>{profile.full_name || "Sin nombre"}</strong><span>{profile.email || "Sin correo"}</span></div>
                      <span>{profile.phone || "—"}</span>
                      <span>{new Date(profile.created_at).toLocaleDateString("es-CO")}</span>
                      <label className="mobile-select-cell">
                        <select aria-label={`Permiso de ${profile.email ?? profile.id}`} value={profile.role} disabled={profile.id === currentUserId || savingProfileId === profile.id} onChange={(event) => void saveProfileRole(profile, event.target.value as AdminProfile["role"])}>
                          <option value="customer">Cliente</option><option value="admin">Administrador</option>
                        </select>
                      </label>
                    </div>
                  ))}
                  {!sectionLoading && visibleProfiles.length === 0 && <p className="insight">No hay perfiles que coincidan con la búsqueda.</p>}
                </div>
              </>
            )}
            {section === "transactions" && (
              <>
                <div className="metrics transaction-metrics">
                  <Metric title="Total vendido" value={money(transactionRevenue)} icon={<TrendingUp />} />
                  <Metric title="Costo de ventas" value={money(transactionCost)} icon={<ReceiptText />} />
                  <Metric title="Utilidad bruta" value={transactionProfit === null ? "Incompleta" : money(transactionProfit)} icon={<BarChart3 />} warning={transactionProfit !== null && transactionProfit < 0} />
                  <Metric title="Ventas completas" value={String(completedOrders.length)} icon={<Check />} />
                </div>
                <div className="transaction-filters" aria-label="Filtrar transacciones">
                  {([
                    ["all", "Todos"],
                    ["paid", "Ventas completas"],
                    ["pending", "Pendientes"],
                    ["refunded", "Reembolsados"],
                  ] as const).map(([filter, label]) => (
                    <button
                      key={filter}
                      className={transactionFilter === filter ? "selected" : ""}
                      onClick={() => setTransactionFilter(filter)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {transactionMissingCostItems > 0 && (
                  <p className="profile-notice" role="status">
                    <AlertTriangle size={17} />
                    Faltan costos para {transactionMissingCostItems} unidad(es) vendida(s). Completa el costo unitario desde Productos para obtener la utilidad real.
                  </p>
                )}
                <div className="admin-table">
                <div className="table-row transaction-row header"><span>Pedido / Cliente</span><span>Fecha de venta</span><span>Vendido</span><span>Costo</span><span>Utilidad</span><span>Estado del pedido</span><span>Pago</span><span>Acciones</span></div>
                {visibleOrders.map((order) => (
                  <div className="table-row transaction-row" key={order.id}>
                    <div className="profile-cell" aria-readonly="true"><strong>#{order.id.slice(0, 8).toUpperCase()} · {order.customers?.full_name || "Cliente"}</strong><span>{order.order_items?.map((item) => `${item.product_name_snapshot} ${item.size_ml} ml ×${item.quantity}`).join(" · ") || order.customers?.phone || "Sin detalle"}</span></div>
                    <span>{order.paid_at ? new Date(order.paid_at).toLocaleDateString("es-CO") : "—"}</span>
                    <strong>{order.payment_status === "paid" ? money(Number(order.total)) : "—"}</strong>
                    <span>{order.payment_status !== "paid" ? "—" : order.order_items.some((item) => item.unit_cost_snapshot === null)
                      ? "Falta costo"
                      : money(order.order_items.reduce((sum, item) => sum + Number(item.unit_cost_snapshot) * item.quantity, 0))}</span>
                    <span>{order.payment_status !== "paid" ? "—" : order.order_items.some((item) => item.unit_cost_snapshot === null)
                      ? "Incompleta"
                      : money(Number(order.total) - order.order_items.reduce((sum, item) => sum + Number(item.unit_cost_snapshot) * item.quantity, 0))}</span>
                    <label className="mobile-select-cell">
                      <select aria-label={`Estado del pedido ${order.id.slice(0, 8)}`} value={normalizeOrderStatus(order.status)} disabled={savingOrderId === order.id || order.payment_status === "paid"} title={order.payment_status === "paid" ? "Reembolsa el pedido antes de cambiar su estado." : "El estado del pedido sigue editable aunque esté confirmado."} onChange={(event) => void saveOrderStatus(order, event.target.value as "pending_confirmation" | "confirmed" | "cancelled", normalizePaymentStatus(order.payment_status))}>
                        <option value="pending_confirmation">Por confirmar</option><option value="confirmed">Confirmado</option><option value="cancelled">Cancelado</option>
                      </select>
                    </label>
                    <label className="mobile-select-cell">
                      <select aria-label={`Pago del pedido ${order.id.slice(0, 8)}`} value={normalizePaymentStatus(order.payment_status)} disabled={savingOrderId === order.id} onChange={(event) => void saveOrderStatus(order, normalizeOrderStatus(order.status), event.target.value as "pending" | "paid" | "refunded")}>
                        {order.payment_status !== "paid" && order.payment_status !== "refunded" && <option value="pending">Pendiente</option>}
                        {order.payment_status !== "refunded" && <option value="paid" disabled={order.status === "cancelled"}>Pagado · completar venta</option>}
                        {(order.payment_status === "paid" || order.payment_status === "refunded") && <option value="refunded">Reembolsado</option>}
                      </select>
                    </label>
                    <div className="order-actions">
                      {order.payment_status === "pending" && order.status !== "cancelled" ? (
                        <>
                          <button className="secondary" type="button" onClick={() => setOrderEditor({ order })}><Pencil size={15}/> Editar</button>
                          <button className="secondary" type="button" disabled={deletingOrderId === order.id} onClick={() => void removePendingOrder(order)}>
                            <Trash2 size={15}/>{deletingOrderId === order.id ? "Eliminando…" : "Eliminar"}
                          </button>
                        </>
                      ) : <span>Disponible antes del pago</span>}
                    </div>
                  </div>
                ))}
                {!sectionLoading && visibleOrders.length === 0 && <p className="insight">No hay pedidos que coincidan con la búsqueda.</p>}
              </div>
              </>
            )}
          </section>
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
                order.payment_status === "pending" && order.status !== "cancelled"
              ).map((order) => (
                <div className="dashboard-detail-row" key={order.id}>
                  <strong>#{order.id.slice(0, 8).toUpperCase()} · {order.customers?.full_name ?? "Cliente"}</strong>
                  <span>{money(Number(order.total))} · {new Date(order.created_at).toLocaleDateString("es-CO")}</span>
                </div>
              ))}
              {((dashboardDetail === "sold-out" && soldOut === 0) ||
                (dashboardDetail === "low-stock" && lowStock === 0) ||
                (dashboardDetail === "pending" && orders.every((order) =>
                  order.payment_status !== "pending" || order.status === "cancelled"
                ))) && (
                <p className="insight">No hay elementos para mostrar.</p>
              )}
            </div>
            <button className="primary full" type="button" onClick={() => {
              if (dashboardDetail === "pending") {
                setSection("transactions");
                setTransactionFilter("pending");
              } else {
                setSection("products");
              }
              setDashboardDetail(null);
            }}>
              {dashboardDetail === "pending" ? "Ir a pedidos" : "Ir a productos"}
            </button>
          </section>
        </div>
      )}
      {orderEditor && (
        <OrderEditorModal
          order={orderEditor.order}
          customers={customers}
          products={products}
          promotions={promotions}
          saving={orderSaving}
          error={sectionError}
          onClose={() => { if (!orderSaving) setOrderEditor(null); }}
          onSave={(customerId, items) => void savePendingOrder(customerId, items, orderEditor.order?.id ?? null)}
        />
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
            {sectionError && <p className="form-error" role="alert">{sectionError}</p>}
            <button className="primary full" type="submit" disabled={customerSaving}>{customerSaving ? "Guardando..." : "Guardar cliente"}</button>
          </form>
        </div>
      )}
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
          <button className="secondary" type="button" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="primary" type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar promoción"}</button>
        </div>
      </form>
    </div>
  );
}

function OrderEditorModal({
  order,
  customers,
  products,
  promotions,
  saving,
  error,
  onClose,
  onSave,
}: {
  order: AdminOrder | null;
  customers: AdminCustomer[];
  products: Product[];
  promotions: Promotion[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (customerId: string, items: { variant_id: string; quantity: number }[]) => void;
}) {
  const [customerId, setCustomerId] = useState(order?.customer_id ?? "");
  const [items, setItems] = useState(
    order?.order_items.map((item) => ({ variantId: item.variant_id, quantity: String(item.quantity) })) ?? []
  );
  const selectableVariants = products
    .filter((product) => product.active !== false)
    .flatMap((product) => product.variants.filter((variant) => variant.active !== false).map((variant) => ({
      ...variant,
      productName: `${product.brand} ${product.name}`,
      productId: product.id,
      promotionId: product.promotion_id ?? null,
      promotion: promotions.find((promotion) => promotion.id === product.promotion_id) ?? null,
    })));
  const orderPrice = calculatePromotionPrice(items.flatMap((item) => {
    const variant = selectableVariants.find((candidate) => candidate.id === item.variantId);
    const quantity = Number(item.quantity);
    return variant && Number.isInteger(quantity) && quantity > 0
      ? [{
          productId: variant.productId,
          promotionId: variant.promotionId,
          promotion: variant.promotion,
          variantId: variant.id,
          unitPrice: variant.price,
          quantity,
        }]
      : [];
  }));
  const validItems = items.length > 0 && items.every((item, index) => {
    const variant = selectableVariants.find((candidate) => candidate.id === item.variantId);
    const quantity = Number(item.quantity);
    return Boolean(
      variant &&
      Number.isInteger(quantity) &&
      quantity > 0 &&
      quantity <= variant.stock &&
      items.findIndex((other) => other.variantId === item.variantId) === index
    );
  });
  const canAddItem = selectableVariants.some((variant) =>
    variant.stock > 0 && !items.some((item) => item.variantId === variant.id)
  );
  const addItem = () => {
    const variant = selectableVariants.find((candidate) =>
      candidate.stock > 0 && !items.some((item) => item.variantId === candidate.id)
    );
    if (!variant) return;
    setItems((current) => [...current, { variantId: variant.id, quantity: "1" }]);
  };

  return (
    <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <form
        className="add-modal order-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-editor-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (!customerId || !validItems) return;
          onSave(customerId, items.map((item) => ({
            variant_id: item.variantId,
            quantity: Number(item.quantity),
          })));
        }}
      >
        <button className="close" type="button" onClick={onClose} aria-label="Cerrar"><X /></button>
        <p className="eyebrow">GESTIÓN DE PEDIDOS</p>
        <h2 id="order-editor-title">{order ? "Editar pedido pendiente" : "Crear pedido"}</h2>
        <label className="auth-label">
          Cliente
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} required>
            <option value="">Selecciona un cliente</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.full_name}{customer.phone ? ` · ${customer.phone}` : ""}
              </option>
            ))}
          </select>
        </label>
        {customers.length === 0 && <p className="form-error">No hay clientes registrados. Crea primero un pedido desde la tienda para registrar un cliente.</p>}
        <div className="order-editor-lines">
          <div className="order-editor-heading"><strong>Productos del pedido</strong><button type="button" className="text-button" onClick={addItem} disabled={!canAddItem}>+ Añadir producto</button></div>
          {items.map((item, index) => (
            <div className="order-editor-line" key={`${index}-${item.variantId}`}>
              <label>
                Producto y presentación
                <select
                  value={item.variantId}
                  onChange={(event) => setItems((current) => current.map((line, lineIndex) =>
                    lineIndex === index ? { ...line, variantId: event.target.value } : line
                  ))}
                  required
                >
                  <option value="">Selecciona una presentación</option>
                  {selectableVariants.map((variant) => (
                    <option
                      key={variant.id}
                      value={variant.id}
                      disabled={
                        (variant.stock <= 0 && variant.id !== item.variantId) ||
                        items.some((other, otherIndex) => otherIndex !== index && other.variantId === variant.id)
                      }
                    >
                      {variant.productName} · {variant.size} ml · {money(variant.price)} · stock {variant.stock}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cantidad
                <input
                  type="number"
                  min="1"
                  max={selectableVariants.find((variant) => variant.id === item.variantId)?.stock}
                  step="1"
                  inputMode="numeric"
                  value={item.quantity}
                  onChange={(event) => setItems((current) => current.map((line, lineIndex) =>
                    lineIndex === index ? { ...line, quantity: event.target.value } : line
                  ))}
                  required
                />
              </label>
              <button type="button" className="icon-button" aria-label="Quitar producto" onClick={() => setItems((current) => current.filter((_, lineIndex) => lineIndex !== index))}>
                <Trash2 size={17} />
              </button>
            </div>
          ))}
          {items.length === 0 && <p className="insight">{canAddItem ? "Añade al menos un producto con stock disponible." : "No hay presentaciones disponibles con stock para añadir."}</p>}
        </div>
        <p className="order-editor-note">El total se recalcula con los precios y promociones actuales. El stock se descuenta cuando marques el pedido como pagado.</p>
        {orderPrice.discount > 0 && <p className="cart-discount">Ahorro en promociones: -{money(orderPrice.discount)}</p>}
        <div className="order-editor-total"><span>Total del pedido</span><strong>{money(orderPrice.total)}</strong></div>
        {items.length > 0 && !validItems && <p className="form-error">Revisa productos, cantidades disponibles y evita repetir presentaciones.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary full" type="submit" disabled={saving || !customerId || !validItems}>
          {saving ? "Guardando…" : order ? "Guardar cambios" : "Crear pedido"}
        </button>
      </form>
    </div>
  );
}

function Metric({
  title,
  value,
  icon,
  warning,
  onClick,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  warning?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className={warning ? "metric-icon warning" : "metric-icon"}>{icon}</div>
      <span>{title}</span>
      <strong>{value}</strong>
      {onClick && <span className="metric-hint">Ver detalle</span>}
    </>
  );
  if (onClick) {
    return <button type="button" className="metric metric-action" onClick={onClick}>{content}</button>;
  }
  return (
    <div className="metric">{content}</div>
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
    .filter((variant) => variant.active !== false)
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
      !Number.isFinite(variant.price) || variant.price < 0 ||
      (variant.cost !== null && (!Number.isFinite(variant.cost) || variant.cost < 0)) ||
      !Number.isInteger(variant.stock) || variant.stock < 0
    )) {
      setError("Revisa los tamaños, precios, costos y cantidades de stock.");
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
                <button type="button" className="secondary danger-button" onClick={() => setImages((current) => current.filter((_, imageIndex) => imageIndex !== index))}>
                  <Trash2 size={14}/> Quitar
                </button>
              </div>
            ))}
            {imageFiles.map((file, index) => (
              <div className="edit-image-item" key={`${file.name}-${index}`}>
                <span className="edit-image-filename">{file.name}</span>
                <button type="button" className="secondary danger-button" onClick={() => setImageFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}>
                  <Trash2 size={14}/> Quitar
                </button>
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
            <button
              className="secondary"
              type="button"
              disabled={saving}
              onClick={() => setVariants((current) => [
                ...current,
                {
                  id: `new-${crypto.randomUUID()}`,
                  size: 200,
                  price: 0,
                  cost: null,
                  stock: 0,
                  active: true,
                  sizeDraft: "200",
                  priceDraft: "",
                  costDraft: "",
                  stockDraft: "0",
                },
              ])}
            >
              <Plus size={15} /> Agregar presentación
            </button>
          </div>
          {variants.map((variant, index) => (
            <div className="edit-variant-row" key={variant.id}>
              <label>Tamaño (ml)
                <input type="number" min="1" step="1" value={variant.sizeDraft} disabled={saving} onChange={(event) => setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, sizeDraft: event.target.value } : item))} required />
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
              <button
                type="button"
                className="icon-button edit-variant-remove"
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
              </button>
            </div>
          ))}
        </section>
        <p className="order-editor-note">Los cambios de stock se guardan como movimientos de inventario para conservar el historial.</p>
        {(error || saveError) && <p className="form-error" role="alert">{error ?? saveError}</p>}
        <div className="edit-product-actions">
          <button className="secondary" type="button" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="primary" type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar cambios"}</button>
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
      !Number.isFinite(variant.price) || variant.price < 0 ||
      !Number.isFinite(variant.cost) || variant.cost < 0 ||
      !Number.isInteger(variant.stock) || variant.stock < 0
    )) {
      setError("Revisa los tamaños, precios, costos y cantidades de stock.");
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
              <button className="icon-button" type="button" aria-label="Quitar presentación" disabled={variants.length === 1} onClick={() => setVariants((current) => current.filter((_, i) => i !== index))}>
                <Trash2 size={16} />
              </button>
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
