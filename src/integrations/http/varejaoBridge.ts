import axios from 'axios';
import { Product } from '../../core/types/models';

type AnyRecord = Record<string, any>;

export type CheckoutSummary = {
  itens: any[];
  subtotal: number;
  desconto: number;
  totalBase: number;
  frete: number;
  total: number;
  canal: string;
  cartId: string;
};

export type CartOrderItem = {
  barcode: string;
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
};

export type VarejaoBridgeParams = {
  baseUrl: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  productEndpoint?: string;
  cartEndpoint?: string;
  checkoutEndpoint?: string;
};

function normalizeBaseUrl(url: string) {
  const clean = String(url || '').trim();
  if (!clean) return '';
  return clean.endsWith('/') ? clean.slice(0, -1) : clean;
}

function resolveUrl(baseUrl: string, endpoint: string) {
  const base = normalizeBaseUrl(baseUrl);
  const path = String(endpoint || '').trim();

  if (!base) return '';
  if (!path) return base;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
}

function applyTokens(path: string, values: Record<string, string>) {
  let result = String(path || '');
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), encodeURIComponent(value));
  }
  return result;
}

function toNumber(value: any, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeLookup(value: any) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeText(value: any) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function extractPayload(data: any) {
  if (data && typeof data === 'object' && 'data' in data) {
    return (data as AnyRecord).data;
  }
  return data;
}

function extractList(data: any): AnyRecord[] {
  const payload = extractPayload(data);
  if (Array.isArray(payload)) return payload as AnyRecord[];
  if (payload && typeof payload === 'object') {
    const obj = payload as AnyRecord;
    if (Array.isArray(obj.items)) return obj.items as AnyRecord[];
    if (Array.isArray(obj.itens)) return obj.itens as AnyRecord[];
  }
  return [];
}

function mapToProduct(input: AnyRecord, fallbackCode: string): Product | null {
  if (!input || typeof input !== 'object') return null;

  const barcode = String(
    input.barcode
    || input.codigoBarras
    || input.codigo_barras
    || input.ean
    || input.qrCode
    || input.qr_code
    || input.codigoInterno
    || fallbackCode
    || ''
  ).trim();

  const productId = String(
    input.productId
    || input.product_id
    || input.id
    || input.codigoInterno
    || input.sku
    || barcode
    || ''
  ).trim();

  const name = String(input.name || input.nome || input.description || input.descricao || '').trim();
  const sku = String(input.sku || input.codigoInterno || input.codigo || input.code || productId || '').trim();

  if (!productId || !name) return null;

  return {
    barcode: barcode || productId,
    productId,
    sku,
    name,
    unitPrice: toNumber(input.unitPrice ?? input.unit_price ?? input.preco ?? input.price, 0),
    stock: toNumber(input.stock ?? input.estoque, 0),
    imageUrl: input.imageUrl || input.image_url || input.imagem || undefined,
  };
}

function candidateKeys(item: AnyRecord): string[] {
  return [
    item.barcode,
    item.codigoBarras,
    item.codigo_barras,
    item.ean,
    item.qrCode,
    item.qr_code,
    item.codigoInterno,
    item.productId,
    item.product_id,
    item.id,
    item.sku,
    item.codigo,
    item.code,
    item.name,
    item.nome,
  ]
    .map((value) => normalizeLookup(value))
    .filter(Boolean);
}

function pickCandidate(list: AnyRecord[], code: string): AnyRecord | null {
  if (!list.length) return null;
  const needle = normalizeLookup(code);
  if (!needle) return list[0] || null;

  const exact = list.find((item) => candidateKeys(item).includes(needle));
  if (exact) return exact;

  const includes = list.find((item) => candidateKeys(item).some((key) => key.includes(needle)));
  if (includes) return includes;

  return list[0] || null;
}

function withQuery(url: string, key: string, value: string) {
  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function buildLookupUrls(baseUrl: string, endpoint: string, code: string) {
  const pathWithToken = applyTokens(endpoint || '/produtos', { barcode: code, code });
  const primary = resolveUrl(baseUrl, pathWithToken || '/produtos');
  if (!primary) return [];

  const urls = new Set<string>();
  urls.add(primary);

  // Fallbacks para cenarios sem codigo de barras/QR (ID interno, SKU, busca geral)
  urls.add(withQuery(primary, 'barcode', code));
  urls.add(withQuery(primary, 'codigoBarras', code));
  urls.add(withQuery(primary, 'qr', code));
  urls.add(withQuery(primary, 'qrCode', code));
  urls.add(withQuery(primary, 'codigoInterno', code));
  urls.add(withQuery(primary, 'id', code));
  urls.add(withQuery(primary, 'q', code));

  return Array.from(urls);
}

function normalizeQty(value: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Number(n.toFixed(3));
}

function resolveCatalogProductId(item: CartOrderItem, catalog: AnyRecord[]) {
  const direct = [item.productId, item.barcode];
  for (const candidate of direct) {
    const normalized = String(candidate || '').trim();
    if (!normalized) continue;

    const found = catalog.find((prod) => {
      const keys = [
        prod.id,
        prod.productId,
        prod.product_id,
        prod.codigoInterno,
        prod.sku,
        prod.codigo,
        prod.code,
        prod.barcode,
        prod.codigoBarras,
        prod.codigo_barras,
        prod.qrCode,
      ];
      return keys.some((key) => normalizeLookup(key) === normalizeLookup(normalized));
    });

    if (found?.id) return String(found.id);
  }

  const byName = catalog.find((prod) => normalizeText(prod.nome || prod.name) === normalizeText(item.name));
  if (byName?.id) return String(byName.id);

  return '';
}

export async function lookupProductByAnyCode(
  code: string,
  params: VarejaoBridgeParams
): Promise<Product | null> {
  const rawCode = String(code || '').trim();
  if (!rawCode) return null;

  const baseUrl = normalizeBaseUrl(params.baseUrl);
  if (!baseUrl) return null;

  const timeout = Math.max(1000, params.timeoutMs || 10000);
  const endpoint = params.productEndpoint || '/produtos';
  const urls = buildLookupUrls(baseUrl, endpoint, rawCode);

  for (const url of urls) {
    try {
      const response = await axios.get(url, {
        timeout,
        headers: {
          Accept: 'application/json',
          ...(params.headers || {}),
        },
      });

      const payload = extractPayload(response.data);
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        const mappedSingle = mapToProduct(payload as AnyRecord, rawCode);
        if (mappedSingle) return mappedSingle;
      }

      const list = extractList(response.data);
      if (!list.length) continue;

      const candidate = pickCandidate(list, rawCode);
      const mapped = candidate ? mapToProduct(candidate, rawCode) : null;
      if (mapped) return mapped;
    } catch {
      continue;
    }
  }

  return null;
}

export async function addScannedItemsToCart(
  cartId: string,
  items: CartOrderItem[],
  params: VarejaoBridgeParams
): Promise<{ externalId: string; checkout: CheckoutSummary | null }> {
  const sessionId = String(cartId || '').trim();
  if (!sessionId) {
    throw new Error('cartId obrigatorio para envio ao carrinho.');
  }

  if (!items.length) {
    throw new Error('Sem itens para envio ao carrinho.');
  }

  const baseUrl = normalizeBaseUrl(params.baseUrl);
  if (!baseUrl) {
    throw new Error('Base URL da integracao nao configurada.');
  }

  const timeout = Math.max(1000, params.timeoutMs || 10000);
  const cartUrl = resolveUrl(baseUrl, params.cartEndpoint || '/carrinho');
  const catalogUrl = resolveUrl(baseUrl, params.productEndpoint || '/produtos');

  if (!cartUrl) {
    throw new Error('Endpoint de carrinho invalido.');
  }

  let catalog: AnyRecord[] = [];
  if (catalogUrl) {
    try {
      const catalogRes = await axios.get(catalogUrl, {
        timeout,
        headers: {
          Accept: 'application/json',
          ...(params.headers || {}),
        },
      });
      catalog = extractList(catalogRes.data);
    } catch {
      catalog = [];
    }
  }

  for (const item of items) {
    const produtoId = resolveCatalogProductId(item, catalog) || String(item.productId || '').trim();
    const quantidade = normalizeQty(item.quantity);

    if (!produtoId) {
      throw new Error('Produto sem mapeamento no backend: ' + (item.name || item.barcode || 'item'));
    }

    if (quantidade <= 0) {
      throw new Error('Quantidade invalida para o item: ' + (item.name || produtoId));
    }

    await axios.post(
      cartUrl,
      {
        produtoId,
        quantidade,
      },
      {
        timeout,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(params.headers || {}),
          'x-cart-id': sessionId,
        },
      }
    );
  }

  const checkout = await loadCheckoutSummary(sessionId, params).catch(() => null);
  return {
    externalId: `cart-${sessionId}`,
    checkout,
  };
}

export async function loadCheckoutSummary(
  cartId: string,
  params: VarejaoBridgeParams
): Promise<CheckoutSummary> {
  const sessionId = String(cartId || '').trim();
  if (!sessionId) {
    throw new Error('cartId obrigatorio para checkout.');
  }

  const baseUrl = normalizeBaseUrl(params.baseUrl);
  if (!baseUrl) {
    throw new Error('Base URL da integracao nao configurada.');
  }

  const timeout = Math.max(1000, params.timeoutMs || 10000);
  const checkoutUrl = resolveUrl(baseUrl, params.checkoutEndpoint || '/checkout');

  if (!checkoutUrl) {
    throw new Error('Endpoint de checkout invalido.');
  }

  const response = await axios.get(checkoutUrl, {
    timeout,
    headers: {
      Accept: 'application/json',
      ...(params.headers || {}),
      'x-cart-id': sessionId,
    },
  });

  const payload = extractPayload(response.data) || {};
  const rawItems = Array.isArray(payload.itens) ? payload.itens : Array.isArray(payload.items) ? payload.items : [];

  return {
    itens: rawItems,
    subtotal: toNumber(payload.subtotal, 0),
    desconto: toNumber(payload.desconto, 0),
    totalBase: toNumber(payload.totalBase, toNumber(payload.total, 0)),
    frete: toNumber(payload.frete, 0),
    total: toNumber(payload.total, 0),
    canal: String(payload.canal || ''),
    cartId: String(payload.cartId || sessionId),
  };
}
