import type { PaymentStatus } from "./lib";
import { mpesaGateway } from "./mpesa";

export interface GatewayCredentialField {
  key: string;
  label: string;
  type: "text" | "password";
  required: boolean;
  placeholder?: string;
}

export interface GatewayDescriptor {
  key: string;
  label: string;
  description: string;
  credentialFields: GatewayCredentialField[];
  requiresCredentials: boolean;
  supportsPlaceholder: boolean;
}

export interface PaymentContext {
  baseUrl: string;
  storeId: string;
  storeName: string;
}

export interface PaymentInitInput {
  orderId: string;
  amount: number;
  currency: string;
  phone?: string;
  reference: string;
  description?: string;
}

export interface PaymentInitResult {
  status: PaymentStatus;
  transactionId?: string;
  reference?: string;
  message?: string;
  placeholder?: boolean;
  raw?: unknown;
}

export interface CallbackResult {
  reference: string;
  status: PaymentStatus;
  transactionId?: string;
  message?: string;
  raw?: unknown;
}

export interface PaymentGateway {
  key: string;
  label: string;
  descriptor(): GatewayDescriptor;
  isConfigured(config: Record<string, unknown>): boolean;
  initiate(config: Record<string, unknown>, input: PaymentInitInput, ctx: PaymentContext): Promise<PaymentInitResult>;
  parseCallback(config: Record<string, unknown>, body: unknown): CallbackResult | null;
}

// --- registry ---

const registry = new Map<string, PaymentGateway>();

export function registerGateway(gateway: PaymentGateway): void {
  registry.set(gateway.key, gateway);
}

export function getGateway(key: string): PaymentGateway | undefined {
  return registry.get(key);
}

export function listGateways(): PaymentGateway[] {
  return [...registry.values()];
}

// --- mock gateway (always available) ---

export const mockGateway: PaymentGateway = {
  key: "mock",
  label: "Demo / Mock",
  descriptor: () => ({
    key: "mock",
    label: "Demo / Mock",
    description: "No-friction simulated payment for development. Confirms instantly, no credentials.",
    credentialFields: [],
    requiresCredentials: false,
    supportsPlaceholder: false,
  }),
  isConfigured: () => true,
  initiate: async (_config, input) => ({
    status: "paid",
    transactionId: `MOCK${Math.floor(10000000 + Math.random() * 89999999)}`,
    reference: input.reference,
    message: `Demo payment of ${input.amount.toFixed(2)} ${input.currency} confirmed.`,
    raw: { mock: true },
  }),
  parseCallback: () => null,
};

registerGateway(mockGateway);
registerGateway(mpesaGateway);

export function gatewayView(gateway: PaymentGateway, config: Record<string, unknown>) {
  const descriptor = gateway.descriptor();
  const enabled = config.enabled === undefined ? gateway.key === "mock" : Boolean(config.enabled);
  const configured = gateway.isConfigured(config);
  const masked: Record<string, unknown> = { ...config };
  for (const field of descriptor.credentialFields) {
    if (field.type === "password" && typeof masked[field.key] === "string" && masked[field.key]) {
      masked[field.key] = "••••••••";
    }
  }
  return { ...descriptor, enabled, configured, config: masked };
}
