import { useEffect, useState } from "react";
import { Admin } from "./components/admin/Admin";
import { Storefront } from "./components/storefront/Storefront";
import { AuthScreen } from "./components/account/AuthScreen";
import { api, type Account, type StoreSummary } from "./lib/api";
import "./index.css";

type StoreView = "home" | "shop" | "orders";

export function App() {
  const [store, setStore] = useState<StoreSummary | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [view, setView] = useState<StoreView>("home");
  const [mode, setMode] = useState<"store" | "admin">(() =>
    typeof location !== "undefined" && /(^|[?&])admin(=|&|$)/.test(location.search) ? "admin" : "store",
  );
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<StoreSummary>("/api/store").then(setStore).catch((err) => setError(err instanceof Error ? err.message : "Failed to load store."));
    api.get<Account | null>("/api/account/me").then(setAccount).catch(() => {});
  }, []);

  // If the admin panel was requested directly (?admin) and nobody is signed in,
  // prompt for credentials through the shared account screen.
  useEffect(() => {
    if (mode === "admin" && !account) setAuthOpen(true);
  }, [mode, account]);

  if (error) {
    return <div className="grid min-h-screen place-items-center p-8 text-center text-sm text-red-600">{error}</div>;
  }
  if (!store) {
    return <div className="grid min-h-screen place-items-center p-8 text-sm text-muted-foreground">Loading store…</div>;
  }

  const handleAuthed = (user: Account | null) => {
    setAccount(user);
    if (!user?.isAdmin && mode === "admin") setMode("store");
  };

  const handleSignOut = async () => {
    await api.post("/api/account/logout").catch(() => {});
    setAccount(null);
    setMode("store");
  };

  return (
    <>
      {mode === "admin" && account?.isAdmin ? (
        <Admin account={account} onExit={() => setMode("store")} onSignOut={handleSignOut} />
      ) : (
        <Storefront
          store={store}
          account={account}
          view={view}
          setView={setView}
          onOpenAuth={() => setAuthOpen(true)}
          onAdmin={account?.isAdmin ? () => setMode("admin") : undefined}
        />
      )}

      {authOpen && (
        <AuthScreen
          account={account}
          onClose={() => setAuthOpen(false)}
          onAuthed={handleAuthed}
          onOrders={() => { setMode("store"); setView("orders"); }}
        />
      )}
    </>
  );
}

export default App;
