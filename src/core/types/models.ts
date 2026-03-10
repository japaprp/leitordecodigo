export type UserRole = 'cashier' | 'waiter' | 'manager' | 'admin';
export type DispatchTarget = 'system' | 'cashier' | 'kitchen';
export type PaymentMethod = 'dinheiro' | 'pix' | 'cartao_debito' | 'cartao_credito' | 'misto';
export type IntegrationAuthType = 'none' | 'bearer' | 'api_key';
export type IntegrationEnvironment = 'production' | 'sandbox';

export interface FeatureFlags {
  scannerMode: boolean;
  waiterMode: boolean;
  historyMode: boolean;
  manualCode: boolean;
}

export interface ModuleToggles {
  scanner: boolean;
  stockFlow: boolean;
  serviceFlow: boolean;
  tableField: boolean;
  kitchenRouting: boolean;
  tableClose: boolean;
  favorites: boolean;
  topSelling: boolean;
  history: boolean;
  manualCode: boolean;
}

export interface IntegrationEndpoints {
  health: string;
  fetchProduct: string;
  sendOrder: string;
  orderStatus: string;
  authenticate: string;
}

export interface IntegrationConfig {
  enabled: boolean;
  providerName: string;
  environment: IntegrationEnvironment;
  productionBaseUrl: string;
  sandboxBaseUrl: string;
  // Legacy field kept for backward compatibility with older saved configs.
  baseUrl: string;
  timeoutMs: number;
  authType: IntegrationAuthType;
  bearerToken?: string;
  apiKey?: string;
  apiKeyHeader?: string;
  endpoints: IntegrationEndpoints;
}

export interface TenantContext {
  tenantId: string;
  tenantName: string;
  licenseKey: string;
  licenseStatus: 'active' | 'expired';
  expiresAt: string;
  features: FeatureFlags;
  moduleCaps?: ModuleToggles;
  integrationConfig?: IntegrationConfig;
}

export interface AdminTenantConfig {
  tenantId: string;
  tenantName: string;
  licenseKey: string;
  expiresAt: string;
  moduleCaps: ModuleToggles;
  integrationConfig: IntegrationConfig;
}

export interface UiProfile {
  scannerModeLabel: string;
  stockModeLabel: string;
  tableModeLabel: string;
  serviceRoleLabel: string;
  tableLabel: string;
}

export interface Operator {
  id: string;
  name: string;
  role: UserRole;
  token: string;
  tenantId: string;
}

export interface SessionContext {
  storeId: string;
  sessionId: string;
  tableId?: string;
  enableKitchenProduction?: boolean;
}

export interface Product {
  barcode: string;
  productId: string;
  sku: string;
  name: string;
  unitPrice: number;
  stock: number;
  imageUrl?: string;
}

export interface ScannedItem extends Product {
  quantity: number;
  subtotal: number;
  scannedAt: string;
}

export interface PaymentSummary {
  method: PaymentMethod;
  subtotal: number;
  discount: number;
  serviceFee: number;
  total: number;
  paidAt: string;
}

export interface OrderPayload {
  tenantId: string;
  clientOrderId: string;
  operatorId: string;
  storeId: string;
  sessionId: string;
  orderType: 'scanner' | 'stock' | 'table';
  eventType?: 'order' | 'table_close' | 'stock_count';
  tableId?: string;
  dispatchTarget?: DispatchTarget;
  payment?: PaymentSummary;
  items: Array<{
    barcode: string;
    productId: string;
    name: string;
    unitPrice: number;
    quantity: number;
    subtotal: number;
  }>;
  total: number;
  createdAt: string;
}

export interface SendResult {
  success: boolean;
  externalId?: string;
  duplicate?: boolean;
  message?: string;
}

export interface AuthResult {
  token: string;
  operatorId: string;
  name: string;
  tenant: TenantContext;
}
