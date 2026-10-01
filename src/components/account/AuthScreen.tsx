import { useEffect, useState } from "react";
import { ArrowLeft, Check, KeyRound, Loader2, Lock, LogOut, Mail, Package, Phone, ShieldCheck, User, X } from "lucide-react";
import { api, type Customer } from "@/lib/api";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup" | "otp" | "forgot" | "reset" | "account";

export function AuthScreen({
  initialMode = "signin",
  customer: initialCustomer,
  onClose,
  onAuthed,
  onOrders,
}: {
  initialMode?: Mode;
  customer?: Customer | null;
  onClose: () => void;
  onAuthed: (customer: Customer | null) => void;
  onOrders?: () => void;
}) {
  const [customer, setCustomer] = useState<Customer | null>(initialCustomer ?? null);
  const [mode, setMode] = useState<Mode>(initialCustomer ? "account" : initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [demoCode, setDemoCode] = useState("");
  const [termsOpen, setTermsOpen] = useState(false);

  const [name, setName] = useState(initialCustomer?.name ?? "");
  const [email, setEmail] = useState(initialCustomer?.email ?? "");
  const [phone, setPhone] = useState(initialCustomer?.phone ?? "");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);

  useEffect(() => {
    if (initialCustomer) return;
    void api.get<Customer | null>("/api/customer/me").then((found) => {
      if (found) {
        setCustomer(found);
        setName(found.name);
        setEmail(found.email);
        setPhone(found.phone);
        setMode("account");
      }
    }).catch(() => {});
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("boost-store-email") : "";
    if (saved && !email) setEmail(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = (user: Customer) => {
    setCustomer(user);
    setName(user.name);
    setEmail(user.email);
    setPhone(user.phone);
    if (typeof localStorage !== "undefined") localStorage.setItem("boost-store-email", user.email);
    onAuthed(user);
    setMode("account");
    setPassword("");
    setCode("");
    setDemoCode("");
    setNotice("");
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      if (/verify your account/i.test(message)) {
        const match = message.match(/demo code:\s*(\d{6})/i);
        if (match) setDemoCode(match[1]!);
        setNotice("Enter the code to verify your account.");
        setMode("otp");
      }
    } finally {
      setBusy(false);
    }
  };

  const doRegister = () =>
    run(async () => {
      if (!acceptTerms) throw new Error("Please accept the terms and conditions to continue.");
      const res = await api.post<{ email: string; delivered: boolean; demoCode?: string }>("/api/customer/register", { name, email, phone, password });
      setDemoCode(res.demoCode ?? "");
      setNotice(res.delivered ? "We sent a 6-digit code to your email and WhatsApp." : "No OTP service configured — use the demo code below.");
      setMode("otp");
    });

  const doVerify = () => run(async () => finish(await api.post<Customer>("/api/customer/verify", { email, code })));
  const doLogin = () => run(async () => finish(await api.post<Customer>("/api/customer/login", { email, password })));

  const doForgot = () =>
    run(async () => {
      const res = await api.post<{ email: string; delivered: boolean; demoCode?: string }>("/api/customer/forgot", { email });
      setDemoCode(res.demoCode ?? "");
      setNotice(res.delivered ? "If that email is registered, we sent a reset code." : "No OTP service configured — use the demo code below.");
      setMode("reset");
    });

  const doReset = () => run(async () => finish(await api.post<Customer>("/api/customer/reset", { email, code, password })));

  const doLogout = () =>
    run(async () => {
      await api.post("/api/customer/logout");
      setCustomer(null);
      onAuthed(null);
      setMode("signin");
    });

  const title = {
    signin: "Welcome back",
    signup: "Create your account",
    otp: "Verify your account",
    forgot: "Reset your password",
    reset: "Set a new password",
    account: "Your account",
  }[mode];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
        {mode !== "signin" && mode !== "account" && (
          <button onClick={() => setMode(mode === "otp" || mode === "reset" ? "signup" : "signin")} className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="flex-1">
          <h1 className="font-display text-base font-bold">{title}</h1>
          <p className="text-xs text-muted-foreground">Email + phone, OTP verified</p>
        </div>
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted" aria-label="Close"><X className="h-5 w-5" /></button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        {notice && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{notice}</div>}
        {demoCode && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-amber-300 bg-white p-3">
            <span className="text-sm text-muted-foreground">Demo code</span>
            <span className="font-mono text-lg font-bold tracking-[0.3em] text-amber-800">{demoCode}</span>
          </div>
        )}

        {mode === "signin" && (
          <div className="space-y-4">
            <Field label="Email" Icon={Mail} value={email} onChange={setEmail} type="email" placeholder="you@example.com" autoComplete="email" />
            <Field label="Password" Icon={Lock} value={password} onChange={setPassword} type="password" placeholder="••••••••" autoComplete="current-password" />
            <button onClick={() => setMode("forgot")} className="text-sm font-medium text-amber-800 hover:underline">Forgot password?</button>
          </div>
        )}

        {mode === "signup" && (
          <div className="space-y-4">
            <Field label="Full name" Icon={User} value={name} onChange={setName} placeholder="Jane Doe" autoComplete="name" />
            <Field label="Email" Icon={Mail} value={email} onChange={setEmail} type="email" placeholder="you@example.com" autoComplete="email" />
            <Field label="Phone" Icon={Phone} value={phone} onChange={setPhone} type="tel" placeholder="0712 345 678" autoComplete="tel" helper="Used for delivery updates and WhatsApp OTP." />
            <Field label="Password" Icon={Lock} value={password} onChange={setPassword} type="password" placeholder="At least 6 characters" autoComplete="new-password" />
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-700" />
              <span className="text-muted-foreground">
                I agree to the{" "}
                <button onClick={() => setTermsOpen(true)} className="font-medium text-amber-800 underline">terms &amp; conditions</button>.
              </span>
            </label>
          </div>
        )}

        {mode === "otp" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/40 p-3 text-sm">
              <ShieldCheck className="h-5 w-5 shrink-0 text-amber-700" />
              <span>Enter the 6-digit code sent to <strong>{email}</strong> and your WhatsApp.</span>
            </div>
            <CodeField value={code} onChange={setCode} />
            <button onClick={() => setMode("signup")} className="text-sm font-medium text-amber-800 hover:underline">Didn't get it? Try again</button>
          </div>
        )}

        {mode === "forgot" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Enter your email and we'll send a reset code.</p>
            <Field label="Email" Icon={Mail} value={email} onChange={setEmail} type="email" placeholder="you@example.com" autoComplete="email" />
          </div>
        )}

        {mode === "reset" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/40 p-3 text-sm">
              <KeyRound className="h-5 w-5 shrink-0 text-amber-700" />
              <span>Enter the code sent to <strong>{email}</strong> and choose a new password.</span>
            </div>
            <CodeField value={code} onChange={setCode} />
            <Field label="New password" Icon={Lock} value={password} onChange={setPassword} type="password" placeholder="At least 6 characters" autoComplete="new-password" />
          </div>
        )}

        {mode === "account" && customer && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-4">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-700 text-lg font-bold text-white">{customer.name.charAt(0).toUpperCase()}</span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{customer.name}</p>
                <p className="truncate text-sm text-muted-foreground">{customer.email}</p>
                <p className="truncate text-xs text-muted-foreground">{customer.phone}</p>
              </div>
              {customer.verified && <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700"><Check className="h-3 w-3" /> Verified</span>}
            </div>
            {onOrders && (
              <button onClick={() => { onClose(); onOrders(); }} className="flex w-full items-center gap-3 rounded-xl border border-border/60 p-3.5 text-sm font-medium transition hover:bg-muted">
                <Package className="h-4 w-4 text-amber-700" /> My orders
              </button>
            )}
            <button onClick={doLogout} disabled={busy} className="flex w-full items-center gap-3 rounded-xl border border-border/60 p-3.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>

      <footer className="border-t border-border/60 p-4">
        {mode === "signin" && (
          <>
            <button onClick={doLogin} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-700 py-3 font-semibold text-white transition hover:bg-amber-800 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
            </button>
            <p className="mt-3 text-center text-sm text-muted-foreground">
              New here?{" "}
              <button onClick={() => setMode("signup")} className="font-semibold text-amber-800 hover:underline">Create an account</button>
            </p>
          </>
        )}
        {mode === "signup" && (
          <button onClick={doRegister} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-700 py-3 font-semibold text-white transition hover:bg-amber-800 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send verification code
          </button>
        )}
        {mode === "otp" && (
          <button onClick={doVerify} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-700 py-3 font-semibold text-white transition hover:bg-amber-800 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Verify &amp; continue
          </button>
        )}
        {mode === "forgot" && (
          <button onClick={doForgot} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-700 py-3 font-semibold text-white transition hover:bg-amber-800 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send reset code
          </button>
        )}
        {mode === "reset" && (
          <button onClick={doReset} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-700 py-3 font-semibold text-white transition hover:bg-amber-800 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Reset password
          </button>
        )}
      </footer>

      {termsOpen && <TermsModal onClose={() => setTermsOpen(false)} />}
    </div>
  );
}

function Field({ label, Icon, value, onChange, type = "text", placeholder, autoComplete, helper }: {
  label: string;
  Icon: typeof Mail;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  helper?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-background px-3.5 py-3 transition focus-within:ring-2 focus-within:ring-amber-500/30">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete={autoComplete} className="w-full bg-transparent text-sm outline-none" />
      </div>
      {helper && <span className="mt-1.5 block text-xs text-muted-foreground">{helper}</span>}
    </label>
  );
}

function CodeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">Verification code</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        placeholder="000000"
        className="w-full rounded-xl border border-border/70 bg-background px-3.5 py-3 text-center font-mono text-2xl tracking-[0.4em] outline-none focus:ring-2 focus:ring-amber-500/30"
      />
    </label>
  );
}

export function TermsModal({ onClose }: { onClose: () => void }) {
  const [terms, setTerms] = useState<string>("Loading…");
  useEffect(() => {
    void api.get<{ terms: string }>("/api/terms").then((res) => setTerms(res.terms)).catch(() => setTerms("Terms are unavailable right now."));
  }, []);
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative max-h-[85vh] w-full max-w-lg overflow-hidden rounded-t-3xl bg-background shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <h2 className="font-display font-bold">Terms &amp; Conditions</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap px-5 py-4 font-sans text-sm text-muted-foreground">{terms}</pre>
      </div>
    </div>
  );
}
