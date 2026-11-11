import { useCallback, useEffect, useRef, useState } from "react";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { AuthScreen, SetupScreen } from "./auth/AuthScreen";
import { Icon } from "./components/Icon";
import { Header } from "./components/Header";
import { Home, Tab } from "./screens/Home";
import { Community } from "./screens/Community";
import { Market } from "./screens/Market";
import { Learn } from "./screens/Learn";
import { Profile, SubView } from "./screens/Profile";
import { ProductDetail } from "./screens/ProductDetail";
import { SellModal } from "./screens/SellModal";
import { Orders } from "./screens/Orders";
import { MyListings } from "./screens/MyListings";
import { SavedProducts } from "./screens/SavedProducts";
import { EditProfileModal } from "./screens/EditProfileModal";
import { Privacy } from "./screens/Privacy";
import { fetchListings, fetchOrders, fetchSavedIds, setSaved } from "./lib/api";
import { initials } from "./lib/format";
import { isConfigured } from "./lib/supabase";
import type { Order, Product } from "./lib/types";

function TemoApp() {
  const { profile, signOut } = useAuth();
  const uid = profile!.id;
  const [tab, setTab] = useState<Tab>("home");
  const [history, setHistory] = useState<Tab[]>([]);
  const [sub, setSub] = useState<SubView>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [sell, setSell] = useState(false);
  const [editing, setEditing] = useState(false);
  const [statsVersion, setStatsVersion] = useState(0);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | undefined>(undefined);

  const flash = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3200);
  }, []);

  const loadProducts = useCallback(async () => {
    try { setProducts(await fetchListings()); }
    catch (e) { flash(e instanceof Error ? e.message : "Could not load the marketplace"); }
  }, [flash]);

  const loadOrders = useCallback(async () => {
    try { setOrders(await fetchOrders()); } catch { /* orders are non-critical on first paint */ }
  }, []);

  useEffect(() => {
    loadProducts();
    loadOrders();
    fetchSavedIds(uid).then(setSavedIds).catch(() => undefined);
  }, [uid, loadProducts, loadOrders]);

  const go = (next: Tab) => {
    if (next !== tab || sub) setHistory((previous) => [...previous, tab]);
    setSelectedProduct(null);
    setSub(null);
    setTab(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const back = () => {
    if (selectedProduct) setSelectedProduct(null);
    else if (sub) setSub(null);
    else {
      const previous = history.at(-1) || "home";
      setHistory((items) => items.slice(0, -1));
      setTab(previous);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const selectProduct = (product: Product) => {
    setSelectedProduct(product);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleSave = async (product: Product) => {
    const isSaved = savedIds.includes(product.id);
    setSavedIds((ids) => (isSaved ? ids.filter((id) => id !== product.id) : [...ids, product.id]));
    try { await setSaved(uid, product.id, !isSaved); }
    catch (e) {
      setSavedIds((ids) => (isSaved ? [...ids, product.id] : ids.filter((id) => id !== product.id)));
      flash(e instanceof Error ? e.message : "Could not update saved items");
    }
  };

  const pendingToReview = orders.filter((o) => o.seller_id === uid && o.status === "pending").length;
  const notify = () => {
    if (pendingToReview) {
      flash(`${pendingToReview} order request${pendingToReview > 1 ? "s" : ""} waiting for your review`);
      setSelectedProduct(null);
      setSub("orders");
      setTab("profile");
    } else flash("You’re all caught up");
  };

  if (profile!.status === "suspended") {
    return (
      <div className="app-shell auth-shell">
        <div className="auth-card">
          <h2>Account suspended</h2>
          <p className="auth-sub">Your account has been suspended by an administrator. Please contact Temo support.</p>
          <button className="auth-submit" onClick={() => signOut()}>Log out</button>
        </div>
      </div>
    );
  }

  const showBack = tab !== "home" || !!selectedProduct || !!sub;

  return (
    <div className="app-shell">
      <Header onNotify={notify} canGoBack={showBack} onBack={back}
        initials={initials(profile!.full_name)} hasAlerts={pendingToReview > 0} />
      {selectedProduct ? (
        <ProductDetail product={selectedProduct} onBack={back} flash={flash}
          onOrdered={() => { loadProducts(); loadOrders(); }} />
      ) : sub === "orders" ? (
        <Orders orders={orders} reload={async () => { await loadOrders(); await loadProducts(); }} flash={flash} />
      ) : sub === "listings" ? (
        <MyListings flash={flash} onChanged={() => { loadProducts(); setStatsVersion((v) => v + 1); }} />
      ) : sub === "privacy" ? (
        <Privacy flash={flash} />
      ) : sub === "saved" ? (
        <SavedProducts products={products} savedIds={savedIds} onToggleSave={toggleSave} onSelect={selectProduct} />
      ) : (
        <>
          {tab === "home" && (
            <Home go={go} products={products} savedIds={savedIds} onToggleSave={toggleSave} onSelectProduct={selectProduct} />
          )}
          {tab === "community" && <Community flash={flash} />}
          {tab === "market" && (
            <Market products={products} savedIds={savedIds} onToggleSave={toggleSave}
              onSell={() => setSell(true)} onSelectProduct={selectProduct} />
          )}
          {tab === "learn" && <Learn go={go} flash={flash} defaultDistrict={profile!.district} />}
          {tab === "profile" && (
            <Profile openSub={(v) => { setSub(v); window.scrollTo({ top: 0 }); }}
              onEdit={() => setEditing(true)} flash={flash} statsVersion={statsVersion} />
          )}
        </>
      )}
      <nav className={`bottom-nav ${selectedProduct ? "detail-nav" : ""}`}>
        {(
          [
            ["home", "home", "Home"],
            ["community", "users", "Community"],
            ["market", "store", "Market"],
            ["learn", "leaf", "Insights"],
            ["profile", "user", "Profile"],
          ] as [Tab, string, string][]
        ).map(([id, icon, label]) => (
          <button key={id} className={tab === id && !selectedProduct ? "active" : ""} onClick={() => go(id)}>
            <Icon name={icon} size={21} filled={tab === id && id === "home"} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {sell && (
        <SellModal close={() => setSell(false)}
          onCreated={() => { loadProducts(); setStatsVersion((v) => v + 1); flash("Your new listing is live"); }} />
      )}
      {editing && <EditProfileModal close={() => setEditing(false)} flash={flash} />}
      {toast && (
        <div className="toast" role="status"><Icon name="check" size={18} />{toast}</div>
      )}
    </div>
  );
}

function Gate() {
  const { session, profile, loading, signOut } = useAuth();
  if (loading) return <div className="app-shell splash"><div className="auth-mark">T</div></div>;
  if (!session) return <AuthScreen />;
  if (!profile) {
    return (
      <div className="app-shell auth-shell">
        <div className="auth-card">
          <h2>Profile not found</h2>
          <p className="auth-sub">
            Your login works but no profile exists. Did you run <code>supabase/001_schema.sql</code> before registering?
            Log out, then register again (or delete this user in Supabase → Authentication).
          </p>
          <button className="auth-submit" onClick={() => signOut()}>Log out</button>
        </div>
      </div>
    );
  }
  return <TemoApp />;
}

export default function App() {
  if (!isConfigured) return <SetupScreen />;
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
