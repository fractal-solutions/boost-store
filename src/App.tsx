import { useEffect, useState } from "react";
import { Admin } from "./components/admin/Admin";
import { Storefront } from "./components/storefront/Storefront";
import { api, type SessionUser, type StoreSummary } from "./lib/api";
import "./index.css";

export function App() {
  const [store, setStore] = useState<StoreSummary | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [mode, setMode] = useState<"store" | "admin">("store");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<StoreSummary>("/api/store").then(setStore).catch((err) => setError(err instanceof Error ? err.message : "Failed to load store."));
    api.get<SessionUser | null>("/api/auth/me").then(setUser).catch(() => {});
  }, []);

  if (error) {
    return <div className="grid min-h-screen place-items-center p-8 text-center text-sm text-red-600">{error}</div>;
  }
  if (!store) {
    return <div className="grid min-h-screen place-items-center p-8 text-sm text-muted-foreground">Loading store…</div>;
  }

  if (mode === "admin") {
    return (
      <Admin
        user={user}
        onExit={() => setMode("store")}
        onSignedIn={async () => setUser(await api.get<SessionUser>("/api/auth/me"))}
      />
    );
  }

  return <Storefront store={store} onAdmin={() => setMode("admin")} />;
}

export default App;
