import axios from 'axios';
import { AuthResult, FeatureFlags, IntegrationConfig, ModuleToggles, OrderPayload, Product, SendResult, UserRole } from '../../core/types/models';
import { defaultIntegrationConfig, listAdminTenantConfigs } from '../../data/storage/localDb';
import { PdvAdapter } from '../contracts/pdvAdapter';
import { addScannedItemsToCart, lookupProductByAnyCode } from '../http/varejaoBridge';

type TenantProfile = {
  tenantId: string;
  tenantName: string;
  licenseKey: string;
  expiresAt: string;
  features: FeatureFlags;
  moduleCaps: ModuleToggles;
  integrationConfig: IntegrationConfig;
  catalog: Record<string, Product>;
};

const ADMIN_TENANT_ID = 'admin_hub';
const ADMIN_LICENSE = 'ADM-ROOT-2026';

const baseCatalog: Record<string, Product> = {
  '7891000000011': { barcode: '7891000000011', productId: 'p1', sku: 'BEB-001', name: 'Cerveja Lata 350ml', unitPrice: 9, stock: 120 },
  '7891000000028': { barcode: '7891000000028', productId: 'p2', sku: 'POR-001', name: 'Porcao Batata Media', unitPrice: 29.9, stock: 35 },
  '7891000000035': { barcode: '7891000000035', productId: 'p3', sku: 'POR-002', name: 'Porcao Torresmo', unitPrice: 24.9, stock: 24 },
  '7891000000042': { barcode: '7891000000042', productId: 'p4', sku: 'BEB-002', name: 'Refrigerante Lata', unitPrice: 7, stock: 90 },
  '7898632473278': { barcode: '7898632473278', productId: 'p001', sku: 'TEST-001', name: 'Produto Teste Leitura', unitPrice: 12.9, stock: 99 },
};

const hortFruitCatalog: Record<string, Product> = {
  '7892000000001': { barcode: '7892000000001', productId: 'hf1', sku: 'FRU-001', name: 'Banana Nanica Kg', unitPrice: 8.99, stock: 280 },
  '7892000000002': { barcode: '7892000000002', productId: 'hf2', sku: 'LEG-001', name: 'Cenoura Kg', unitPrice: 6.99, stock: 145 },
  '7892000000003': { barcode: '7892000000003', productId: 'hf3', sku: 'FOL-001', name: 'Alface Crespa Un', unitPrice: 7.99, stock: 110 },
  '7892000000004': { barcode: '7892000000004', productId: 'hf4', sku: 'LEG-002', name: 'Cebola Nacional Kg', unitPrice: 4.99, stock: 170 },
  '7898632473278': { barcode: '7898632473278', productId: 'p001', sku: 'TEST-001', name: 'Produto Teste Leitura', unitPrice: 12.9, stock: 99 },
};

const tenantAliases: Record<string, string> = {
  lanchonete: 'lanchonete_demo',
  lanchonetedemo: 'lanchonete_demo',
  hamburgueria: 'lanchonete_demo',
  hamburgueriademo: 'lanchonete_demo',
  hortfruit: 'hortfruit_demo',
  hortfruitdemo: 'hortfruit_demo',
  hortifruit: 'hortfruit_demo',
  hortifruti: 'hortfruit_demo',
  hortifrut: 'hortfruit_demo',
  varejao: 'hortfruit_demo',
  varejaodopovo: 'hortfruit_demo',
  admin: ADMIN_TENANT_ID,
  admsaashub: ADMIN_TENANT_ID,
};

const processedActions: Record<string, Record<string, string>> = {};

function fullCaps(): ModuleToggles {
  return {
    scanner: true,
    stockFlow: true,
    serviceFlow: true,
    tableField: true,
    kitchenRouting: true,
    tableClose: true,
    favorites: true,
    topSelling: true,
    history: true,
    manualCode: true,
  };
}

function deriveFeatureFlagsFromCaps(caps: ModuleToggles): FeatureFlags {
  return {
    scannerMode: caps.scanner || caps.stockFlow,
    waiterMode: caps.serviceFlow,
    historyMode: caps.history,
    manualCode: caps.manualCode,
  };
}

function mergeIntegration(input?: Partial<IntegrationConfig> | null): IntegrationConfig {
  const base = defaultIntegrationConfig();
  if (!input) return base;

  return {
    ...base,
    ...input,
    endpoints: {
      ...base.endpoints,
      ...(input.endpoints || {}),
    },
  };
}

function baseProfiles(): Record<string, TenantProfile> {
  const lanchoneteCaps = fullCaps();
  const hortCaps: ModuleToggles = {
    scanner: true,
    stockFlow: true,
    serviceFlow: false,
    tableField: false,
    kitchenRouting: false,
    tableClose: false,
    favorites: false,
    topSelling: false,
    history: true,
    manualCode: true,
  };

  return {
    lanchonete_demo: {
      tenantId: 'lanchonete_demo',
      tenantName: 'Lanchonete Demo',
      licenseKey: 'LANCH-2026',
      expiresAt: '2026-12-31T23:59:59Z',
      features: deriveFeatureFlagsFromCaps(lanchoneteCaps),
      moduleCaps: lanchoneteCaps,
      integrationConfig: defaultIntegrationConfig(),
      catalog: baseCatalog,
    },
    hortfruit_demo: {
      tenantId: 'hortfruit_demo',
      tenantName: 'Hort Fruit Demo',
      licenseKey: 'HORT-2026',
      expiresAt: '2026-12-31T23:59:59Z',
      features: deriveFeatureFlagsFromCaps(hortCaps),
      moduleCaps: hortCaps,
      integrationConfig: defaultIntegrationConfig(),
      catalog: hortFruitCatalog,
    },
  };
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function normalizeLicense(raw: string) {
  return raw
    .toUpperCase()
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9-]/g, '');
}

function isValidLicense(expected: string, provided: string) {
  const e = normalizeLicense(expected);
  const p = normalizeLicense(provided);
  return p === e || p === e.replace('-', '');
}

function buildTenantProfiles(): Record<string, TenantProfile> {
  const profiles = baseProfiles();

  for (const cfg of listAdminTenantConfigs()) {
    const caps = { ...fullCaps(), ...cfg.moduleCaps };
    const existing = profiles[cfg.tenantId];
    profiles[cfg.tenantId] = {
      tenantId: cfg.tenantId,
      tenantName: cfg.tenantName,
      licenseKey: cfg.licenseKey,
      expiresAt: cfg.expiresAt,
      features: deriveFeatureFlagsFromCaps(caps),
      moduleCaps: caps,
      integrationConfig: mergeIntegration(cfg.integrationConfig),
      catalog: existing?.catalog || baseCatalog,
    };
  }

  return profiles;
}

function resolveTenantId(rawTenantId: string, profiles: Record<string, TenantProfile>): string | null {
  const direct = rawTenantId.trim().toLowerCase();
  if (direct in profiles) return direct;

  const normalized = normalizeKey(rawTenantId);
  const aliased = tenantAliases[normalized];
  if (aliased && aliased in profiles) return aliased;

  for (const tenantId of Object.keys(profiles)) {
    if (normalizeKey(tenantId) === normalized) return tenantId;
  }

  return null;
}

function normalizeBaseUrl(url: string) {
  const clean = url.trim();
  if (!clean) return '';
  return clean.endsWith('/') ? clean.slice(0, -1) : clean;
}

function getActiveBaseUrl(cfg: IntegrationConfig) {
  const preferred = cfg.environment === 'sandbox' ? cfg.sandboxBaseUrl : cfg.productionBaseUrl;
  return normalizeBaseUrl(preferred || cfg.baseUrl);
}

function resolveUrl(baseUrl: string, endpoint: string) {
  const base = normalizeBaseUrl(baseUrl);
  const path = (endpoint || '').trim();

  if (!base) return '';
  if (!path) return base;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
}

function applyTokens(path: string, values: Record<string, string>) {
  let result = path;
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), encodeURIComponent(value));
  }
  return result;
}

function buildHeaders(cfg: IntegrationConfig) {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (cfg.authType === 'bearer' && cfg.bearerToken?.trim()) {
    headers.Authorization = `Bearer ${cfg.bearerToken.trim()}`;
  }

  if (cfg.authType === 'api_key' && cfg.apiKey?.trim()) {
    headers[(cfg.apiKeyHeader || 'x-api-key').trim() || 'x-api-key'] = cfg.apiKey.trim();
  }

  return headers;
}

function extractPayload(data: any) {
  if (data && typeof data === 'object' && 'data' in data) {
    return (data as any).data;
  }
  return data;
}

function toNumber(value: any, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeLookup(value: any) {
  return String(value ?? '').trim().toLowerCase();
}

function pickProductCandidate(payload: any, lookup: string) {
  if (Array.isArray(payload)) {
    const target = normalizeLookup(lookup);
    if (!target) return payload[0] || null;

    return (
      payload.find((item: any) => {
        if (!item || typeof item !== 'object') return false;
        const keys = [
          item.barcode,
          item.ean,
          item.codigo_barras,
          item.productId,
          item.product_id,
          item.id,
          item.sku,
          item.codigo,
          item.code,
          item.name,
          item.nome,
        ];
        return keys.some((value) => normalizeLookup(value) === target);
      }) || null
    );
  }

  if (payload && typeof payload === 'object' && Array.isArray((payload as any).items)) {
    return pickProductCandidate((payload as any).items, lookup);
  }

  return payload?.product || payload;
}

function mapIntegrationProduct(data: any, fallbackBarcode: string): Product | null {
  const payload = extractPayload(data);
  const obj = pickProductCandidate(payload, fallbackBarcode);
  if (!obj || typeof obj !== 'object') return null;

  const barcode = String(obj.barcode || obj.ean || obj.codigo_barras || fallbackBarcode || '').trim();
  const productId = String(obj.productId || obj.product_id || obj.id || obj.sku || barcode || '').trim();
  const name = String(obj.name || obj.nome || obj.description || obj.descricao || '').trim();
  const sku = String(obj.sku || obj.codigo || obj.code || productId || '').trim();

  if (!barcode || !productId || !name) return null;

  return {
    barcode,
    productId,
    sku,
    name,
    unitPrice: toNumber(obj.unitPrice ?? obj.unit_price ?? obj.price ?? obj.preco, 0),
    stock: toNumber(obj.stock ?? obj.estoque, 0),
    imageUrl: obj.imageUrl || obj.image_url || obj.imagem || undefined,
  };
}

function parseStatusValue(data: any): 'pending' | 'sent' | 'error' {
  const payload = extractPayload(data);

  if (payload && typeof payload === 'object') {
    if ((payload as any).sucesso === true) {
      return 'sent';
    }

    if (Array.isArray((payload as any).itens) && Number.isFinite(Number((payload as any).total))) {
      return 'sent';
    }
  }

  const raw = String(payload?.status || payload?.state || payload?.situacao || '').toLowerCase();

  if (raw.includes('sent') || raw.includes('done') || raw.includes('success') || raw.includes('processed') || raw.includes('enviado')) {
    return 'sent';
  }

  if (raw.includes('pending') || raw.includes('processing') || raw.includes('fila') || raw.includes('pendente')) {
    return 'pending';
  }

  return 'error';
}

function extractProductList(data: any): any[] {
  const payload = extractPayload(data);
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object' && Array.isArray((payload as any).items)) {
    return (payload as any).items;
  }
  return [];
}

function normalizeText(value: any) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function looksLikeCatalogProductId(value: any) {
  return /^p\d+$/i.test(String(value ?? '').trim());
}

function resolveCatalogProductId(item: any, catalog: any[]) {
  const directCandidates = [item?.productId, item?.barcode, item?.sku];
  for (const candidate of directCandidates) {
    if (looksLikeCatalogProductId(candidate)) {
      return String(candidate).trim();
    }
  }

  const itemName = normalizeText(item?.name);
  const itemBarcode = normalizeLookup(item?.barcode);

  const matched = (catalog || []).find((product: any) => {
    if (!product || typeof product !== 'object') return false;

    const productId = String(product.id || '').trim();
    if (!productId) return false;

    const nameMatch = itemName && normalizeText(product.nome || product.name) === itemName;
    const barcodeLikeMatch = itemBarcode && normalizeLookup(product.id || product.codigo || product.sku) === itemBarcode;

    return Boolean(nameMatch || barcodeLikeMatch);
  });

  return matched?.id ? String(matched.id).trim() : '';
}

function extractExternalId(data: any, fallback: string) {
  const payload = extractPayload(data);
  return String(payload?.externalId || payload?.external_id || payload?.orderId || payload?.order_id || payload?.id || fallback);
}

function getProcessedBucket(tenantId: string) {
  if (!processedActions[tenantId]) {
    processedActions[tenantId] = {};
  }
  return processedActions[tenantId];
}

function integrationEnabled(profile: TenantProfile) {
  const cfg = profile.integrationConfig;
  return cfg.enabled && !!getActiveBaseUrl(cfg);
}

export class MockPdvAdapter implements PdvAdapter {
  constructor(private forceOffline = false) {}

  async authenticate(params: {
    tenantId: string;
    licenseKey: string;
    username: string;
    password: string;
    role: UserRole;
  }): Promise<AuthResult> {
    if (!params.username.trim() || !params.password.trim()) throw new Error('Credenciais invalidas.');

    if (params.role === 'admin') {
      if (!isValidLicense(ADMIN_LICENSE, params.licenseKey)) {
        throw new Error('Licenca ADM invalida. Use ADM-ROOT-2026.');
      }

      return {
        token: 'mock-token-admin-' + Date.now(),
        operatorId: params.username.toLowerCase().replace(/\s+/g, '-'),
        name: params.username,
        tenant: {
          tenantId: ADMIN_TENANT_ID,
          tenantName: 'Painel ADM SaaS',
          licenseKey: ADMIN_LICENSE,
          licenseStatus: 'active',
          expiresAt: '2099-12-31T23:59:59Z',
          features: { scannerMode: true, waiterMode: true, historyMode: true, manualCode: true },
          moduleCaps: fullCaps(),
          integrationConfig: defaultIntegrationConfig(),
        },
      };
    }

    const profiles = buildTenantProfiles();
    const resolvedTenantId = resolveTenantId(params.tenantId, profiles);
    if (!resolvedTenantId) throw new Error('Tenant nao encontrado. Cadastre no painel ADM ou use lanchonete_demo/hortfruit_demo.');

    const profile = profiles[resolvedTenantId];
    if (!isValidLicense(profile.licenseKey, params.licenseKey)) throw new Error('Licenca invalida para este cliente.');

    const now = new Date();
    const expires = new Date(profile.expiresAt);
    const isActive = expires.getTime() > now.getTime();

    return {
      token: 'mock-token-' + profile.tenantId + '-' + Date.now(),
      operatorId: params.username.toLowerCase().replace(/\s+/g, '-'),
      name: params.username,
      tenant: {
        tenantId: profile.tenantId,
        tenantName: profile.tenantName,
        licenseKey: profile.licenseKey,
        licenseStatus: isActive ? 'active' : 'expired',
        expiresAt: profile.expiresAt,
        features: profile.features,
        moduleCaps: profile.moduleCaps,
        integrationConfig: profile.integrationConfig,
      },
    };
  }

  async fetchProductByBarcode(tenantId: string, barcode: string): Promise<Product | null> {
    await this.delay(120);
    const profiles = buildTenantProfiles();
    const resolvedTenantId = resolveTenantId(tenantId, profiles) || tenantId;
    const profile = profiles[resolvedTenantId];
    if (!profile) return null;

    if (integrationEnabled(profile)) {
      const cfg = profile.integrationConfig;
      const mapped = await lookupProductByAnyCode(barcode, {
        baseUrl: getActiveBaseUrl(cfg),
        timeoutMs: Math.max(1000, cfg.timeoutMs || 10000),
        headers: buildHeaders(cfg),
        productEndpoint: cfg.endpoints.fetchProduct,
      });
      if (mapped) return mapped;
    }

    return profile.catalog[barcode] || null;
  }

  async findProcessedAction(tenantId: string, clientOrderId: string): Promise<{ externalId: string } | null> {
    await this.delay(60);
    const profiles = buildTenantProfiles();
    const resolvedTenantId = resolveTenantId(tenantId, profiles) || tenantId;
    const profile = profiles[resolvedTenantId];

    if (profile && integrationEnabled(profile)) {
      const cfg = profile.integrationConfig;
      const endpoint = applyTokens(cfg.endpoints.orderStatus, {
        clientOrderId,
        externalId: clientOrderId,
      });
      const url = resolveUrl(getActiveBaseUrl(cfg), endpoint);

      if (url) {
        try {
          const response = await axios.get(url, {
            timeout: Math.max(1000, cfg.timeoutMs || 10000),
            headers: buildHeaders(cfg),
          });
          const status = parseStatusValue(response.data);
          if (status === 'sent') {
            return { externalId: extractExternalId(response.data, clientOrderId) };
          }
        } catch {
          // se falhar, segue com cache local
        }
      }
    }

    const bucket = getProcessedBucket(resolvedTenantId);
    const externalId = bucket[clientOrderId];
    return externalId ? { externalId } : null;
  }

  async sendOrder(payload: OrderPayload): Promise<SendResult> {
    await this.delay(180);

    if (this.forceOffline) {
      return { success: false, message: 'API offline simulada' };
    }

    const profiles = buildTenantProfiles();
    const resolvedTenantId = resolveTenantId(payload.tenantId, profiles) || payload.tenantId;
    const profile = profiles[resolvedTenantId];
    if (!profile) return { success: false, message: 'Tenant invalido para envio.' };

    if (payload.orderType === 'table' && !profile.features.waiterMode) {
      return { success: false, message: 'Modulo de comanda nao habilitado para este cliente.' };
    }

    if ((payload.orderType === 'scanner' || payload.orderType === 'stock') && !profile.features.scannerMode) {
      return { success: false, message: 'Modulo scanner nao habilitado para este cliente.' };
    }

    if (!payload.items.length) {
      return { success: false, message: 'Sem itens para envio.' };
    }

    const bucket = getProcessedBucket(profile.tenantId);
    const existingExternalId = bucket[payload.clientOrderId];
    if (existingExternalId) {
      return {
        success: true,
        duplicate: true,
        externalId: existingExternalId,
        message: 'already_processed',
      };
    }

    if (integrationEnabled(profile)) {
      const cfg = profile.integrationConfig;
      const endpoint = applyTokens(cfg.endpoints.sendOrder, {
        clientOrderId: payload.clientOrderId,
      });
      const url = resolveUrl(getActiveBaseUrl(cfg), endpoint);

      if (!url) {
        return { success: false, message: 'Integracao ativa sem endpoint de envio configurado.' };
      }

      const normalizedEndpoint = endpoint.toLowerCase();
      const isVarejaoCartEndpoint = normalizedEndpoint.includes('/carrinho');

      try {
        if (isVarejaoCartEndpoint) {
          const cartId = String(payload.sessionId || payload.clientOrderId || '').trim() || payload.clientOrderId;

          const sent = await addScannedItemsToCart(cartId, payload.items, {
            baseUrl: getActiveBaseUrl(cfg),
            timeoutMs: Math.max(1000, cfg.timeoutMs || 10000),
            headers: buildHeaders(cfg),
            productEndpoint: cfg.endpoints.fetchProduct || '/produtos',
            cartEndpoint: cfg.endpoints.sendOrder || '/carrinho',
            checkoutEndpoint: cfg.endpoints.orderStatus || '/checkout',
          });

          bucket[payload.clientOrderId] = sent.externalId;

          return {
            success: true,
            externalId: sent.externalId,
          };
        }

        const response = await axios.post(url, payload, {
          timeout: Math.max(1000, cfg.timeoutMs || 10000),
          headers: {
            ...buildHeaders(cfg),
            'Content-Type': 'application/json',
          },
        });

        const externalId = extractExternalId(response.data, payload.clientOrderId);
        const duplicate = !!extractPayload(response.data)?.duplicate;
        bucket[payload.clientOrderId] = externalId;

        return {
          success: true,
          externalId,
          duplicate,
          message: duplicate ? 'already_processed' : undefined,
        };
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          const payloadData = error.response?.data;

          if (status === 409) {
            const externalId = extractExternalId(payloadData, payload.clientOrderId);
            bucket[payload.clientOrderId] = externalId;
            return {
              success: true,
              duplicate: true,
              externalId,
              message: 'already_processed',
            };
          }

          const msg =
            (typeof payloadData === 'object' && payloadData && (payloadData.message || payloadData.error || payloadData.erro)) ||
            error.message ||
            'Falha na integracao SaaS.';

          return { success: false, message: String(msg) };
        }

        return { success: false, message: 'Falha inesperada na integracao SaaS.' };
      }
    }
    const externalId = `${profile.tenantId.toUpperCase()}-${Date.now()}`;
    bucket[payload.clientOrderId] = externalId;

    return {
      success: true,
      externalId,
    };
  }

  async getOrderStatus(tenantId: string, externalId: string): Promise<'pending' | 'sent' | 'error'> {
    const profiles = buildTenantProfiles();
    const resolvedTenantId = resolveTenantId(tenantId, profiles) || tenantId;
    const profile = profiles[resolvedTenantId];
    if (!profile) return 'error';

    if (integrationEnabled(profile)) {
      const cfg = profile.integrationConfig;
      const endpoint = applyTokens(cfg.endpoints.orderStatus, {
        externalId,
        clientOrderId: externalId,
      });
      const url = resolveUrl(getActiveBaseUrl(cfg), endpoint);

      if (url) {
        try {
          const response = await axios.get(url, {
            timeout: Math.max(1000, cfg.timeoutMs || 10000),
            headers: buildHeaders(cfg),
          });
          return parseStatusValue(response.data);
        } catch {
          return 'error';
        }
      }
    }

    return 'sent';
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}




