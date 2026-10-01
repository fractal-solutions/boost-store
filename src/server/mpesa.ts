import type { CallbackResult, PaymentGateway, PaymentInitResult } from "./payments";

const DARAJA_BASES = {
  sandbox: "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke",
} as const;

const DARAJA_PATHS = {
  token: "/oauth/v1/generate",
  stkPush: "/mpesa/stkpush/v1/processrequest",
} as const;

export const MPESA_CALLBACK_PATH = "/api/payments/mpesa/callback";

type MpesaConfig = {
  environment?: string;
  consumerKey?: string;
  consumerSecret?: string;
  passkey?: string;
  shortcode?: string;
};

function baseUrl(config: MpesaConfig): string {
  return config.environment === "production" ? DARAJA_BASES.production : DARAJA_BASES.sandbox;
}

function darajaTimestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function normalizePhone(input: string): string {
  const digits = input.replace(/[^\d]/g, "");
  if (/^254\d{9}$/.test(digits)) return digits;
  if (/^0\d{9}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  throw new Error("Enter a valid M-PESA phone number (e.g. 0712 345 678).");
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAccessToken(config: MpesaConfig): Promise<string> {
  const base = baseUrl(config);
  const cacheKey = `${config.consumerKey}:${config.consumerSecret}:${base}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const auth = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64");
  const response = await fetch(`${base}${DARAJA_PATHS.token}?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {
    throw new Error("Could not reach Safaricom Daraja (network error).");
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: string };
  if (!response.ok || !body.access_token) throw new Error("M-PESA authentication failed. Check your consumer key and secret.");
  const expiresIn = Math.max(60, Number(body.expires_in ?? 3599));
  tokenCache.set(cacheKey, { token: body.access_token, expiresAt: Date.now() + (expiresIn - 60) * 1000 });
  return body.access_token;
}

function isConfigured(config: Record<string, unknown>): boolean {
  const c = config as MpesaConfig;
  return Boolean(c.consumerKey && c.consumerSecret && c.passkey && c.shortcode);
}

export const mpesaGateway: PaymentGateway = {
  key: "mpesa",
  label: "M-PESA (Daraja)",
  descriptor: () => ({
    key: "mpesa",
    label: "M-PESA (Daraja)",
    description:
      "Safaricom M-PESA STK Push. Leave the toggle on without credentials to run in placeholder mode for local testing.",
    credentialFields: [
      { key: "environment", label: "Environment", type: "text", required: false, placeholder: "sandbox | production" },
      { key: "consumerKey", label: "Consumer key", type: "password", required: true },
      { key: "consumerSecret", label: "Consumer secret", type: "password", required: true },
      { key: "shortcode", label: "Paybill / shortcode", type: "text", required: true, placeholder: "174379" },
      { key: "passkey", label: "Lipa na M-PESA passkey", type: "password", required: true },
    ],
    requiresCredentials: true,
    supportsPlaceholder: true,
  }),
  isConfigured,
  initiate: async (config, input, ctx): Promise<PaymentInitResult> => {
    if (input.currency !== "KES") {
      return { status: "failed", message: "M-PESA only supports KES payments." };
    }
    const phoneInput = input.phone ?? "";
    let phone: string;
    try {
      phone = normalizePhone(phoneInput);
    } catch (error) {
      return { status: "failed", message: error instanceof Error ? error.message : "Invalid phone number." };
    }

    // Placeholder mode: no credentials yet, so emulate a pending STK push.
    if (!isConfigured(config)) {
      return {
        status: "pending",
        transactionId: `PLACEHOLDER-${crypto.randomUUID().slice(0, 8)}`,
        reference: input.reference,
        placeholder: true,
        message: `Placeholder M-PESA prompt sent to ${phone}. Confirm it from the order screen (no real request was made).`,
        raw: { placeholder: true, phone },
      };
    }

    const c = config as MpesaConfig;
    const amount = Math.round(input.amount);
    if (amount <= 0) return { status: "failed", message: "Amount must be greater than zero." };
    const timestamp = darajaTimestamp();
    const password = Buffer.from(`${c.shortcode}${c.passkey}${timestamp}`).toString("base64");
    const callbackUrl = `${ctx.baseUrl}${MPESA_CALLBACK_PATH}`;

    const token = await getAccessToken(c);
    const response = await fetch(`${baseUrl(c)}${DARAJA_PATHS.stkPush}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: c.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: phone,
        PartyB: c.shortcode,
        PhoneNumber: phone,
        CallBackURL: callbackUrl,
        AccountReference: input.reference.slice(0, 12),
        TransactionDesc: (input.description || `${ctx.storeName} order`).slice(0, 13),
      }),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => {
      throw new Error("Could not reach Safaricom Daraja (network error).");
    });

    const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (json && String(json.ResponseCode) === "0") {
      return {
        status: "pending",
        transactionId: String(json.CheckoutRequestID ?? ""),
        reference: String(json.MerchantRequestID ?? input.reference),
        message: String(json.CustomerMessage ?? "Enter your M-PESA PIN to complete payment."),
        raw: json,
      };
    }
    return { status: "failed", message: String(json?.ResponseDescription ?? "M-PESA request was rejected."), raw: json };
  },
  parseCallback: (_config, body): CallbackResult | null => {
    const stk = (body as { Body?: { stkCallback?: Record<string, unknown> } })?.Body?.stkCallback;
    if (!stk) return null;
    const metadata = stk.CallbackMetadata as { Item?: { Name: string; Value: unknown }[] } | undefined;
    const receipt = metadata?.Item?.find((item) => item.Name === "MpesaReceiptNumber")?.Value;
    const success = Number(stk.ResultCode ?? -1) === 0;
    return {
      reference: String(stk.CheckoutRequestID ?? ""),
      status: success ? "paid" : "failed",
      transactionId: typeof receipt === "string" ? receipt : String(stk.CheckoutRequestID ?? ""),
      message: String(stk.ResultDesc ?? ""),
      raw: body,
    };
  },
};
